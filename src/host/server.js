import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFile, stat } from "node:fs/promises";
import { WebSocketServer, WebSocket } from "ws";
import { makeId, parseClientMessage, ProtocolError, requireText } from "./protocol.js";
import { RoomStore } from "./room-store.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const defaultPublicDir = path.resolve(moduleDir, "../client");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function securityHeaders(request) {
  const allowedFrameHosts = new Set(["127.0.0.1", "localhost"]);
  try {
    const hostname = new URL(`http://${request.headers.host}`).hostname;
    if (/^[a-z0-9.-]+$/i.test(hostname)) allowedFrameHosts.add(hostname);
  } catch {
    // Keep the conservative loopback allow-list when the Host header is invalid.
  }
  const frameAncestors = [...allowedFrameHosts].map((host) => `http://${host}:*`).join(" ");
  return {
    "content-security-policy": `default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'self' ${frameAncestors}`,
    "permissions-policy": "camera=(self), microphone=(self), display-capture=(self)",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  };
}

function send(socket, type, payload = {}) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type, ...payload }));
}

function networkAddresses(port) {
  const addresses = new Set([`http://localhost:${port}`]);
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) addresses.add(`http://${entry.address}:${port}`);
    }
  }
  return [...addresses];
}

function createStaticHandler(publicDir) {
  return async (request, response) => {
    const headers = { ...securityHeaders(request), "content-type": "text/plain; charset=utf-8" };
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405, { ...headers, allow: "GET, HEAD" }).end("Method not allowed");
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      if (pathname.includes("\0")) throw new Error("Invalid path");
    } catch {
      response.writeHead(400, headers).end("Bad request");
      return;
    }
    if (pathname === "/api/health") {
      response.writeHead(200, { ...headers, "content-type": "application/json; charset=utf-8" });
      response.end(request.method === "HEAD" ? undefined : JSON.stringify({ ok: true, service: "dsh-meeting" }));
      return;
    }

    const requested = pathname === "/" ? "index.html" : pathname.slice(1);
    const filePath = path.resolve(publicDir, requested);
    if (!filePath.startsWith(`${path.resolve(publicDir)}${path.sep}`)) {
      response.writeHead(403, headers).end("Forbidden");
      return;
    }

    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) throw new Error("not a file");
      const content = request.method === "HEAD" ? undefined : await readFile(filePath);
      response.writeHead(200, {
        ...securityHeaders(request),
        "content-type": MIME_TYPES[path.extname(filePath)] ?? "application/octet-stream",
        "cache-control": "no-store",
      });
      response.end(content);
    } catch {
      response.writeHead(404, { ...securityHeaders(request), "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  };
}

export function createMeetingServer({ publicDir = defaultPublicDir, idFactory } = {}) {
  const store = new RoomStore({ idFactory });
  const sockets = new Map();
  const agentTimers = new Map();
  let stopping = false;
  const httpServer = http.createServer(createStaticHandler(publicDir));
  const wsServer = new WebSocketServer({ server: httpServer, path: "/ws", maxPayload: 256 * 1024 });

  const broadcastRooms = () => {
    const rooms = store.listRooms();
    for (const { socket } of sockets.values()) send(socket, "rooms:snapshot", { rooms });
  };

  const broadcastRoom = (roomId, exceptId = null) => {
    if (!store.rooms.has(roomId)) return;
    const room = store.getRoom(roomId);
    for (const participant of room.participants) {
      if (participant.id !== exceptId) send(sockets.get(participant.id)?.socket, "room:state", { room });
    }
  };

  const cancelDeletedRoomTask = (roomId) => {
    if (!store.rooms.has(roomId)) {
      clearTimeout(agentTimers.get(roomId));
      agentTimers.delete(roomId);
    }
  };

  let heartbeat;
  httpServer.on("listening", () => {
    heartbeat = setInterval(() => {
      for (const socket of wsServer.clients) {
        if (socket.isAlive === false) {
          socket.terminate();
          continue;
        }
        socket.isAlive = false;
        if (socket.readyState === WebSocket.OPEN) socket.ping();
      }
    }, 30_000);
    heartbeat.unref();
  });
  httpServer.on("close", () => clearInterval(heartbeat));

  wsServer.on("connection", (socket, request) => {
    socket.on("error", () => socket.terminate());
    socket.isAlive = true;
    socket.on("pong", () => { socket.isAlive = true; });
    const origin = request.headers.origin;
    const requestHost = request.headers.host;
    let originAllowed = true;
    try {
      const requestHostname = requestHost ? new URL(`http://${requestHost}`).hostname : null;
      originAllowed = !origin || Boolean(requestHostname && new URL(origin).hostname === requestHostname);
    } catch {
      originAllowed = false;
    }
    if (!originAllowed) {
      socket.close(1008, "Origin not allowed");
      return;
    }

    const participantId = makeId("peer");
    const participant = store.addParticipant({ id: participantId, name: "" });
    sockets.set(participantId, { socket });
    send(socket, "session:ready", { self: participant, rooms: store.listRooms() });

    socket.on("message", (raw) => {
      if (stopping) return;
      try {
        const message = parseClientMessage(raw);
        const current = store.participants.get(participantId);

        if (message.type === "rooms:list") {
          send(socket, "rooms:snapshot", { rooms: store.listRooms() });
        }

        if (message.type === "room:create") {
          const name = requireText(message.name, "姓名", 32);
          const previousRoomId = current.roomId;
          requireText(message.roomName, "协作名称", 48);
          current.name = name;
          const room = store.createRoom(participantId, {
            name: message.roomName,
            project: message.project,
          });
          if (previousRoomId && previousRoomId !== room.id) {
            cancelDeletedRoomTask(previousRoomId);
            broadcastRoom(previousRoomId);
          }
          send(socket, "room:state", { room });
          broadcastRooms();
        }

        if (message.type === "room:join") {
          const name = requireText(message.name, "姓名", 32);
          const previousRoomId = current.roomId;
          store.getRoom(message.roomId);
          current.name = name;
          const room = store.joinRoom(participantId, message.roomId);
          if (previousRoomId && previousRoomId !== room.id) {
            cancelDeletedRoomTask(previousRoomId);
            broadcastRoom(previousRoomId);
          }
          send(socket, "room:state", { room });
          broadcastRoom(room.id, participantId);
          broadcastRooms();
        }

        if (message.type === "room:leave") {
          const result = store.leaveRoom(participantId);
          send(socket, "room:left");
          if (result) {
            cancelDeletedRoomTask(result.roomId);
            if (!result.deleted) broadcastRoom(result.roomId);
          }
          broadcastRooms();
        }

        if (message.type === "media:update") {
          if (!current.roomId) throw new ProtocolError("请先加入协作房间", "NOT_IN_ROOM");
          const updated = store.updateMedia(participantId, message.media);
          if (updated.roomId) broadcastRoom(updated.roomId);
        }

        if (message.type === "signal") {
          const target = sockets.get(message.targetId)?.socket;
          if (!current.roomId || message.targetId === participantId || store.participants.get(message.targetId)?.roomId !== current.roomId) {
            throw new ProtocolError("只能向同一房间成员发送信令", "FORBIDDEN");
          }
          send(target, "signal", { fromId: participantId, payload: message.payload });
        }

        if (message.type === "transcript:add") {
          if (!current.roomId) throw new ProtocolError("请先加入协作房间", "NOT_IN_ROOM");
          store.addContext(current.roomId, {
            kind: "transcript",
            author: current.name,
            text: message.text,
          });
          broadcastRoom(current.roomId);
        }

        if (message.type === "agent:request") {
          if (!current.roomId) throw new ProtocolError("请先加入协作房间", "NOT_IN_ROOM");
          const roomId = current.roomId;
          const prompt = requireText(message.prompt, "Agent 任务", 240);
          if (agentTimers.has(roomId)) throw new ProtocolError("Agent 正在处理当前任务，请稍后重试", "AGENT_BUSY");
          const snapshot = store.getRoom(roomId);
          store.addContext(roomId, { kind: "task", author: current.name, text: prompt });
          store.setAgentState(roomId, { status: "working", task: prompt });
          broadcastRoom(roomId);

          const timer = setTimeout(() => {
            agentTimers.delete(roomId);
            if (stopping || !store.rooms.has(roomId)) return;
            const recent = snapshot.context.filter((item) => item.kind === "transcript").slice(-3);
            const contextSummary = recent.length
              ? `已读取最近 ${recent.length} 条讨论，当前主题为：${snapshot.activeTopic}`
              : "当前还没有讨论记录，我会先依据任务本身处理。";
            const result = `${contextSummary} 已生成执行任务：${prompt}`;
            store.addContext(roomId, { kind: "agent", author: "Agent", text: result });
            store.setAgentState(roomId, { status: "done", task: prompt });
            broadcastRoom(roomId);
          }, 900);
          agentTimers.set(roomId, timer);
        }
      } catch (error) {
        const code = error instanceof ProtocolError ? error.code : "SERVER_ERROR";
        send(socket, "error", { code, message: error.message || "服务器处理失败" });
      }
    });

    socket.on("close", () => {
      const roomId = store.removeParticipant(participantId);
      sockets.delete(participantId);
      if (roomId) {
        cancelDeletedRoomTask(roomId);
        if (!stopping) broadcastRoom(roomId);
      }
      if (!stopping) broadcastRooms();
    });
  });

  return {
    store,
    httpServer,
    wsServer,
    async start(port = Number(process.env.PORT) || 4173, host = "0.0.0.0") {
      await new Promise((resolve, reject) => {
        const onError = (error) => reject(error);
        httpServer.once("error", onError);
        httpServer.listen(port, host, () => {
          httpServer.removeListener("error", onError);
          resolve();
        });
      });
      const address = httpServer.address();
      return { port: address.port, urls: networkAddresses(address.port) };
    },
    async stop() {
      stopping = true;
      clearInterval(heartbeat);
      for (const timer of agentTimers.values()) clearTimeout(timer);
      agentTimers.clear();
      // Include rejected connections and peers that do not answer the close handshake.
      for (const socket of wsServer.clients) socket.terminate();
      await new Promise((resolve) => wsServer.close(resolve));
      await new Promise((resolve) => httpServer.close(resolve));
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = createMeetingServer();
  app.start().then(({ urls }) => {
    console.log("DSH Meeting 已启动：");
    for (const url of urls) console.log(`  ${url}`);
  });
}
