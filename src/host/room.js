/**
 * RoomService —— T1.1 房间协调纯逻辑
 *
 * 语义依据：docs/protocol.md §3.4（member）、§4.2~4.5（join/leave）、§5.2（握手）、
 * §5.3（控制消息）；PRD §7.2（Host 退出即散会）、§5.2 步骤5（创建者不经 room.join）。
 *
 * 设计：无任何 I/O —— 所有对外消息进入 outbox（{ to, memberId?, exceptId?, envelope }），
 * 由信令层（T1.2）负责真实投递；时间与 id 生成可注入，保证可测试性。
 */
import { randomUUID } from 'node:crypto'
import {
  PROTOCOL_VERSION,
  PROTOCOL_MAJOR,
  MAX_MEMBERS,
  HEARTBEAT_TIMEOUT_MS,
  makeEnvelope,
  isUuidV4,
} from './protocol.js'

const MIC_STATES = new Set(['on', 'off'])
const KINDS = new Set(['human', 'agent'])

export class RoomService {
  constructor(options = {}) {
    const {
      roomId = randomUUID(),
      roomName,
      hostId = randomUUID(),
      hostName,
      secret = null,
      maxMembers = MAX_MEMBERS,
      heartbeatTimeoutMs = HEARTBEAT_TIMEOUT_MS,
      now = Date.now,
      makeId = randomUUID,
    } = options
    if (typeof roomName !== 'string' || roomName.trim().length === 0) {
      throw new TypeError('roomName 必填（trim 后非空）')
    }
    if (typeof hostName !== 'string' || hostName.trim().length === 0) {
      throw new TypeError('hostName 必填')
    }
    this.roomId = roomId
    this.roomName = roomName
    this.hostId = hostId
    this.secret = secret === null || secret === undefined || secret === '' ? null : String(secret)
    this.maxMembers = maxMembers
    this.heartbeatTimeoutMs = heartbeatTimeoutMs
    this._now = now
    this._makeId = makeId
    /** @type {Map<string, {id,name,role,micState,kind,joinedAt}>} */
    this.members = new Map()
    /** @type {Map<string, number>} */
    this.lastSeen = new Map()
    /** @type {Array<{to:'single'|'broadcast', memberId?:string, exceptId?:string, envelope:object}>} */
    this.outbox = []
    this.closed = false
    // §5.2 步骤5：房间创建者不经 room.join，创建即直接注册（role=host 由 Host 权威填充）
    this._register({ id: hostId, name: hostName.trim(), micState: 'on', kind: 'human' }, 'host')
  }

  get memberCount() {
    return this.members.size
  }

  /** 全量成员快照（§5.3 member.list），按入房时间排序，不暴露内部字段 */
  listMembers() {
    return [...this.members.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((m) => ({ id: m.id, name: m.name, role: m.role, micState: m.micState, kind: m.kind }))
  }

  /** 取走全部待投递消息（信令层调用后按 to 分发） */
  takeOutbox() {
    return this.outbox.splice(0, this.outbox.length)
  }

  /**
   * 处理 room.join（§4.2 / §5.2 步骤3~5）。request.sender/payload 已由信令层从 envelope 解出。
   * @returns {{ok:true, member:object} | {ok:false, code:string, message?:string}}
   */
  join(request = {}) {
    const { sender, protocolVersion, name, secret, micState = 'on', kind = 'human' } = request
    const reject = (code, message) => {
      this._emitTo(sender, 'room.reject', this.hostId, { code, message })
      return { ok: false, code, message }
    }
    if (this.closed) return reject('ROOM_CLOSED', '房间已结束')
    if (typeof protocolVersion !== 'string' || protocolVersion.split('.')[0] !== PROTOCOL_MAJOR) {
      return reject('VERSION_MISMATCH', '协议版本不兼容，请升级客户端')
    }
    const cleanName = typeof name === 'string' ? name.trim() : ''
    if (cleanName.length === 0 || cleanName.length > 24) {
      return reject('BAD_REQUEST', '显示名需为 1~24 字符')
    }
    if (!MIC_STATES.has(micState)) return reject('BAD_REQUEST', 'micState 必须是 on|off')
    if (!KINDS.has(kind)) return reject('BAD_REQUEST', 'kind 必须是 human|agent')
    if (!isUuidV4(sender)) return reject('BAD_REQUEST', 'sender 必须是 uuid v4')
    if (this.secret !== null && secret !== this.secret) return reject('BAD_SECRET', '加入口令错误')
    if (this.members.size >= this.maxMembers) return reject('ROOM_FULL', '房间已满')
    if (this.members.has(sender)) return reject('BAD_REQUEST', '成员 id 冲突，请重新生成身份后加入')

    const member = this._register({ id: sender, name: cleanName, micState, kind }, 'member')
    // §4.4：member.join 广播给除新成员外的所有人（新成员从 member.list 获知）；
    // wire 格式不带内部字段（joinedAt 等，§3.4）
    const wireMember = { id: member.id, name: member.name, role: member.role, micState: member.micState, kind: member.kind }
    this._broadcast('member.join', this.hostId, { member: wireMember }, sender)
    this._emitTo(sender, 'member.list', this.hostId, {
      room: { roomId: this.roomId, roomName: this.roomName, protocolVersion: PROTOCOL_VERSION, hostId: this.hostId },
      members: this.listMembers(),
    })
    return { ok: true, member: { id: member.id, name: member.name, role: member.role, micState: member.micState, kind: member.kind } }
  }

  /**
   * 处理 room.leave（§4.3）。sender 为 Host → 广播 room.ended 并关闭房间（PRD §7.2）。
   */
  leave(sender, reason = 'user') {
    if (!this.members.has(sender)) return { ok: false, code: 'NOT_IN_ROOM' }
    if (sender === this.hostId) {
      this.closed = true
      this._broadcast('room.ended', this.hostId, { reason: 'host-left' })
      return { ok: true, ended: true }
    }
    this.members.delete(sender)
    this.lastSeen.delete(sender)
    this._broadcast('member.leave', this.hostId, { memberId: sender, reason })
    return { ok: true, ended: false }
  }

  /** 心跳触达（§5.3：ws 协议层 ping/pong，信令层收到即调此方法） */
  touch(memberId) {
    if (this.members.has(memberId)) this.lastSeen.set(memberId, this._now())
  }

  /** 剔除心跳超时的普通成员（Host 是本进程，永不超时），返回被剔除 id 列表 */
  checkTimeouts() {
    const evicted = []
    for (const [id, seen] of this.lastSeen) {
      if (id === this.hostId) continue
      if (this._now() - seen > this.heartbeatTimeoutMs) {
        this.members.delete(id)
        this.lastSeen.delete(id)
        evicted.push(id)
      }
    }
    for (const id of evicted) {
      this._broadcast('member.leave', this.hostId, { memberId: id, reason: 'timeout' })
    }
    return evicted
  }

  _register({ id, name, micState, kind }, role) {
    const member = { id, name, role, micState, kind, joinedAt: this._now() }
    this.members.set(id, member)
    this.lastSeen.set(id, this._now())
    return member
  }

  _emitTo(memberId, type, sender, payload) {
    this.outbox.push({
      to: 'single',
      memberId,
      envelope: makeEnvelope(type, sender, payload, { now: this._now(), id: this._makeId() }),
    })
  }

  _broadcast(type, sender, payload, exceptId = null) {
    this.outbox.push({
      to: 'broadcast',
      exceptId,
      envelope: makeEnvelope(type, sender, payload, { now: this._now(), id: this._makeId() }),
    })
  }
}
