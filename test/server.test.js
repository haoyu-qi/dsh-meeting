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
