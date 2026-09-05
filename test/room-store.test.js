import test from "node:test";
import assert from "node:assert/strict";
import { RoomStore } from "../src/host/room-store.js";

function createStore() {
  let sequence = 0;
  return new RoomStore({
    idFactory: (prefix) => `${prefix}-${++sequence}`,
    now: () => "2026-08-29T12:00:00.000Z",
  });
}

test("creates, joins and deletes a room when its last participant leaves", () => {
  const store = createStore();
  store.addParticipant({ id: "peer-a", name: "齐浩宇" });
  store.addParticipant({ id: "peer-b", name: "张伟" });

  const room = store.createRoom("peer-a", { name: "登录模块讨论", project: "DSH" });
  assert.equal(room.participants.length, 1);
  assert.equal(store.listRooms()[0].participantCount, 1);

  const joined = store.joinRoom("peer-b", room.id);
  assert.equal(joined.participants.length, 2);
  assert.equal(joined.hostId, "peer-a");

  const hostLeave = store.leaveRoom("peer-a");
  assert.equal(hostLeave.deleted, false);
  assert.equal(store.getRoom(room.id).hostId, "peer-b");

  const lastLeave = store.leaveRoom("peer-b");
  assert.equal(lastLeave.deleted, true);
  assert.equal(store.listRooms().length, 0);
});

test("keeps bounded context and updates the active topic", () => {
  const store = createStore();
  store.addParticipant({ id: "peer-a", name: "齐浩宇" });
  const room = store.createRoom("peer-a", { name: "接口讨论", project: "DSH" });

  for (let index = 0; index < 65; index += 1) {
    store.addContext(room.id, { kind: "transcript", author: "齐浩宇", text: `讨论内容 ${index}` });
  }

  const snapshot = store.getRoom(room.id);
  assert.equal(snapshot.context.length, 60);
  assert.equal(snapshot.activeTopic, "讨论内容 64");
});

test("updates media state without accepting arbitrary fields", () => {
  const store = createStore();
  store.addParticipant({ id: "peer-a", name: "齐浩宇" });
  store.createRoom("peer-a", { name: "媒体测试", project: "DSH" });

  const participant = store.updateMedia("peer-a", { audio: 1, camera: false, screen: "yes", admin: true });
  assert.deepEqual(participant.media, { audio: true, camera: false, screen: true });
});

test("failed room creation preserves the current room and media", () => {
  const store = createStore();
  store.addParticipant({ id: "peer-a", name: "成员" });
  const room = store.createRoom("peer-a", { name: "原房间" });
  store.updateMedia("peer-a", { audio: true });
  const before = store.getRoom(room.id);
  assert.throws(() => store.createRoom("peer-a", { name: "  " }), /不能为空/);
  assert.deepEqual(store.getRoom(room.id), before);
  assert.equal(store.participants.get("peer-a").roomId, room.id);
});
