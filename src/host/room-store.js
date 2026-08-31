import { cleanText, ProtocolError, requireText } from "./protocol.js";

const DEFAULT_MEDIA = Object.freeze({ audio: false, camera: false, screen: false });

export class RoomStore {
  constructor({ idFactory, now = () => new Date().toISOString() } = {}) {
    this.idFactory = idFactory ?? ((prefix) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`);
    this.now = now;
    this.rooms = new Map();
    this.participants = new Map();
  }

  addParticipant({ id, name }) {
    const participant = {
      id,
      name: cleanText(name, 32) || `访客 ${id.slice(-4)}`,
      roomId: null,
      media: { ...DEFAULT_MEDIA },
      joinedAt: this.now(),
    };
    this.participants.set(id, participant);
    return structuredClone(participant);
  }

  removeParticipant(participantId) {
    const participant = this.participants.get(participantId);
    if (!participant) return null;
    const roomId = participant.roomId;
    if (roomId) this.leaveRoom(participantId);
    this.participants.delete(participantId);
    return roomId;
  }

  createRoom(participantId, input = {}) {
    const participant = this.#participant(participantId);
    if (participant.roomId) this.leaveRoom(participantId);

    const room = {
      id: this.idFactory("room"),
      name: requireText(input.name, "协作名称", 48),
      project: cleanText(input.project, 48) || "未命名项目",
      hostId: participantId,
      createdAt: this.now(),
      participantIds: new Set([participantId]),
      context: [],
      activeTopic: "等待讨论开始",
      agent: { status: "idle", task: null },
    };

    participant.roomId = room.id;
    this.rooms.set(room.id, room);
    this.addContext(room.id, {
      kind: "system",
      author: "系统",
      text: `${participant.name} 创建了协作`,
    });
    return this.getRoom(room.id);
  }

  joinRoom(participantId, roomId) {
    const participant = this.#participant(participantId);
    const room = this.#room(roomId);
    if (participant.roomId === roomId) return this.getRoom(roomId);
    if (participant.roomId) this.leaveRoom(participantId);

    participant.roomId = roomId;
    room.participantIds.add(participantId);
    this.addContext(roomId, {
      kind: "system",
      author: "系统",
      text: `${participant.name} 加入了协作`,
    });
    return this.getRoom(roomId);
  }

  leaveRoom(participantId) {
    const participant = this.#participant(participantId);
    if (!participant.roomId) return null;

    const room = this.rooms.get(participant.roomId);
    participant.roomId = null;
    participant.media = { ...DEFAULT_MEDIA };
    if (!room) return null;

    room.participantIds.delete(participantId);
    if (room.participantIds.size === 0) {
      this.rooms.delete(room.id);
      return { roomId: room.id, deleted: true };
    }

    if (room.hostId === participantId) {
      room.hostId = room.participantIds.values().next().value;
    }
    this.addContext(room.id, {
      kind: "system",
      author: "系统",
      text: `${participant.name} 离开了协作`,
    });
    return { roomId: room.id, deleted: false, room: this.getRoom(room.id) };
  }

  updateMedia(participantId, media = {}) {
    const participant = this.#participant(participantId);
    participant.media = {
      audio: Boolean(media.audio),
      camera: Boolean(media.camera),
      screen: Boolean(media.screen),
    };
    return structuredClone(participant);
  }

  addContext(roomId, event) {
    const room = this.#room(roomId);
    const item = {
      id: this.idFactory("event"),
      at: this.now(),
      kind: event.kind ?? "transcript",
      author: cleanText(event.author, 32) || "未知成员",
      text: requireText(event.text, "上下文内容", 500),
    };
    room.context.push(item);
    room.context = room.context.slice(-60);
    if (item.kind === "transcript") room.activeTopic = item.text.slice(0, 80);
    return structuredClone(item);
  }

  setAgentState(roomId, state) {
    const room = this.#room(roomId);
    room.agent = {
      status: state.status,
      task: state.task ? cleanText(state.task, 240) : null,
    };
    return structuredClone(room.agent);
  }

  listRooms() {
    return [...this.rooms.values()].map((room) => ({
      id: room.id,
      name: room.name,
      project: room.project,
      participantCount: room.participantIds.size,
      createdAt: room.createdAt,
    }));
  }

  getRoom(roomId) {
    const room = this.#room(roomId);
    return {
      id: room.id,
      name: room.name,
      project: room.project,
      hostId: room.hostId,
      createdAt: room.createdAt,
      activeTopic: room.activeTopic,
      agent: structuredClone(room.agent),
      context: structuredClone(room.context),
      participants: [...room.participantIds]
        .map((id) => this.participants.get(id))
        .filter(Boolean)
        .map((participant) => structuredClone(participant)),
    };
  }

  #participant(id) {
    const participant = this.participants.get(id);
    if (!participant) throw new ProtocolError("参与者不存在", "NOT_FOUND");
    return participant;
  }

  #room(id) {
    const room = this.rooms.get(id);
    if (!room) throw new ProtocolError("协作房间不存在或已结束", "ROOM_NOT_FOUND");
    return room;
  }
}
