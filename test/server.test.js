import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { createMeetingServer } from "../src/host/server.js";

function openClient(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const messages = [];
    const waiters = [];

    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      const waiterIndex = waiters.findIndex((waiter) => waiter.predicate(message));
      if (waiterIndex >= 0) {
        const [waiter] = waiters.splice(waiterIndex, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      } else {
        messages.push(message);
      }
    });

    socket.once("error", reject);
    socket.once("open", () => {
      resolve({
        socket,
        send(type, payload = {}) {
          socket.send(JSON.stringify({ type, ...payload }));
        },
        waitFor(type, predicate = () => true, timeout = 2500) {
          const bufferedIndex = messages.findIndex((message) => message.type === type && predicate(message));
          if (bufferedIndex >= 0) return Promise.resolve(messages.splice(bufferedIndex, 1)[0]);
          return new Promise((waitResolve, waitReject) => {
            const waiter = {
              predicate: (message) => message.type === type && predicate(message),
              resolve: waitResolve,
              timer: setTimeout(() => {
                const index = waiters.indexOf(waiter);
                if (index >= 0) waiters.splice(index, 1);
                waitReject(new Error(`等待 ${type} 超时`));
              }, timeout),
            };
            waiters.push(waiter);
          });
        },
      });
    });
  });
}

test("serves the client and synchronizes a two-person room", async (t) => {
  const app = createMeetingServer();
  const { port } = await app.start(0, "127.0.0.1");
  t.after(async () => app.stop());

  const health = await fetch(`http://127.0.0.1:${port}/api/health`).then((response) => response.json());
  assert.deepEqual(health, { ok: true, service: "dsh-meeting" });
  const pageResponse = await fetch(`http://127.0.0.1:${port}/`);
  assert.match(pageResponse.headers.get("content-security-policy"), /frame-ancestors 'self' http:\/\/127\.0\.0\.1:\*/);
  assert.equal(pageResponse.headers.get("x-frame-options"), null);
  assert.equal(pageResponse.headers.get("x-content-type-options"), "nosniff");
  const html = await pageResponse.text();
  assert.match(html, /DSH Meeting/);

  const rejectedSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin: "http://malicious.example" });
  const rejectedCode = await new Promise((resolve, reject) => {
    rejectedSocket.once("close", resolve);
    rejectedSocket.once("error", reject);
  });
  assert.equal(rejectedCode, 1008);

  const embeddedSocket = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin: "http://127.0.0.1:3080" });
  const embeddedOpened = await new Promise((resolve, reject) => {
    embeddedSocket.once("open", () => resolve(true));
    embeddedSocket.once("error", reject);
  });
  assert.equal(embeddedOpened, true);
  embeddedSocket.close();

  const first = await openClient(`ws://127.0.0.1:${port}/ws`);
  const second = await openClient(`ws://127.0.0.1:${port}/ws`);
  t.after(() => first.socket.close());
  t.after(() => second.socket.close());

  const firstSession = await first.waitFor("session:ready");
  const secondSession = await second.waitFor("session:ready");

  first.send("room:create", { name: "齐浩宇", roomName: "登录模块讨论", project: "DSH" });
  const created = await first.waitFor("room:state", (message) => message.room.name === "登录模块讨论");
  assert.equal(created.room.participants.length, 1);

  second.send("room:join", { name: "张伟", roomId: created.room.id });
  const joined = await second.waitFor("room:state", (message) => message.room.participants.length === 2);
  assert.deepEqual(joined.room.participants.map((participant) => participant.name).sort(), ["张伟", "齐浩宇"]);

  second.send("transcript:add", { text: "验证码先采用 Mock 接口" });
  const contextUpdate = await first.waitFor(
    "room:state",
    (message) => message.room.activeTopic === "验证码先采用 Mock 接口",
  );
  assert.equal(contextUpdate.room.context.at(-1).kind, "transcript");

  first.send("agent:request", { prompt: "生成验证码 Mock 开发任务" });
  const agentDone = await first.waitFor(
    "room:state",
    (message) => message.room.agent.status === "done",
  );
  assert.match(agentDone.room.context.at(-1).text, /当前主题为：验证码先采用 Mock 接口/);
  assert.match(agentDone.room.context.at(-1).text, /生成验证码 Mock 开发任务/);

  first.send("signal", { targetId: secondSession.self.id, payload: { candidate: { candidate: "sample" } } });
  const forwarded = await second.waitFor("signal");
  assert.equal(forwarded.fromId, firstSession.self.id);
  assert.equal(forwarded.payload.candidate.candidate, "sample");
});

async function setupRoom(t) {
  const app = createMeetingServer();
  const { port } = await app.start(0, "127.0.0.1");
  t.after(() => app.stop());
  const url = `http://127.0.0.1:${port}`;
  const first = await openClient(`${url.replace("http", "ws")}/ws`);
  const second = await openClient(`${url.replace("http", "ws")}/ws`);
  const a = (await first.waitFor("session:ready")).self;
  const b = (await second.waitFor("session:ready")).self;
  first.send("room:create", { name: "甲", roomName: "原房间" });
  const { room } = await first.waitFor("room:state");
  second.send("room:join", { name: "乙", roomId: room.id });
  await second.waitFor("room:state");
  await first.waitFor("room:state", (message) => message.room.participants.length === 2);
  return { app, url, first, second, a, b, room };
}

test("rejects malformed HTTP paths and supports HEAD without a body", async (t) => {
  const { url } = await setupRoom(t);
  for (const [path, status] of [["/%ZZ", 400], ["/%00", 400], ["/..%2fpackage.json", 403], ["/missing", 404]]) {
    const response = await fetch(`${url}${path}`);
    assert.equal(response.status, status);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  }
  const head = await fetch(`${url}/`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  const post = await fetch(`${url}/`, { method: "POST" });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET, HEAD");
  assert.equal((await fetch(`${url}/api/health?probe=1`)).status, 200);
});

test("notifies both rooms on create and join switches and preserves failed requests", async (t) => {
  const { app, url, first, second, a, b, room } = await setupRoom(t);
  first.send("room:create", { name: "不应更新", roomName: " " });
  await first.waitFor("error", (message) => message.code === "INVALID_FIELD");
  assert.equal(app.store.participants.get(a.id).name, "甲");
  assert.equal(app.store.getRoom(room.id).participants.length, 2);
  first.send("room:join", { name: "不应更新", roomId: "missing" });
  await first.waitFor("error", (message) => message.code === "ROOM_NOT_FOUND");
  assert.equal(app.store.participants.get(a.id).roomId, room.id);
  assert.equal(app.store.participants.get(a.id).name, "甲");

  first.send("room:create", { name: "甲", roomName: "新房间" });
  const next = await first.waitFor("room:state", (message) => message.room.name === "新房间");
  const remaining = await second.waitFor("room:state", (message) => message.room.participants.length === 1);
  assert.equal(remaining.room.hostId, b.id);
  first.send("signal", { targetId: b.id, payload: { candidate: { candidate: "sample" } } });
  await first.waitFor("error", (message) => message.code === "FORBIDDEN");
  first.send("room:join", { name: "甲", roomId: room.id });
  await second.waitFor("room:state", (message) => message.room.participants.length === 2);
  assert.equal(app.store.rooms.has(next.room.id), false);

  // Joining a different existing room must also update the old room's members.
  const third = await openClient(`${url.replace("http", "ws")}/ws`);
  await third.waitFor("session:ready");
  third.send("room:create", { name: "丙", roomName: "第三房间" });
  const destination = await third.waitFor("room:state");
  first.send("room:join", { name: "甲", roomId: destination.room.id });
  await second.waitFor("room:state", (message) => message.room.participants.length === 1);
  await third.waitFor("room:state", (message) => message.room.participants.length === 2);
});

test("serializes Agent tasks per room and uses the submitted context snapshot", async (t) => {
  const { first, second } = await setupRoom(t);
  first.send("transcript:add", { text: "提交时的主题" });
  await first.waitFor("room:state", (message) => message.room.activeTopic === "提交时的主题");
  first.send("agent:request", { prompt: "第一个任务" });
  await second.waitFor("room:state", (message) => message.room.agent.status === "working");
  second.send("agent:request", { prompt: "不能覆盖的任务" });
  await second.waitFor("error", (message) => message.code === "AGENT_BUSY");
  second.send("transcript:add", { text: "提交后的主题" });
  const done = await first.waitFor("room:state", (message) => message.room.agent.status === "done");
  assert.equal(done.room.agent.task, "第一个任务");
  assert.equal(done.room.context.filter((item) => item.kind === "task").length, 1);
  assert.match(done.room.context.at(-1).text, /提交时的主题/);
  assert.equal(done.room.activeTopic, "提交后的主题");
  first.send("agent:request", { prompt: "后续任务" });
  await first.waitFor("room:state", (message) => message.room.agent.status === "working" && message.room.agent.task === "后续任务");
});

test("oversized messages disconnect only the offending client", async (t) => {
  const { app, url, first, second, room } = await setupRoom(t);
  const closed = new Promise((resolve) => first.socket.once("close", resolve));
  first.socket.send("x".repeat(256 * 1024 + 1));
  await closed;
  await second.waitFor("room:state", (message) => message.room.participants.length === 1);
  assert.equal(app.store.getRoom(room.id).participants.length, 1);
  assert.equal((await fetch(`${url}/api/health`)).status, 200);
});

test("shutdown terminates an unresponsive connection and cancels pending Agent work", { timeout: 2000 }, async (t) => {
  const { app, first, room } = await setupRoom(t);
  first.send("agent:request", { prompt: "关闭前提交" });
  await first.waitFor("room:state", (message) => message.room.agent.status === "working");
  // Keep the transport open while preventing the peer from answering frames.
  first.socket._socket.pause();
  const closed = new Promise((resolve) => first.socket.once("close", resolve));
  await app.stop();
  first.socket._socket.resume();
  await closed;
  assert.equal(app.store.rooms.has(room.id), false);
  assert.equal(app.store.participants.size, 0);
});
