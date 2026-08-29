/**
 * Meeting 协议 v1 常量与 envelope 工具
 *
 * 单点定义（docs/protocol.md §7.4-2：协议常量禁止散落魔法字符串）。
 * 冻结依据：docs/protocol.md v1.0-rc2。
 * 注意：本模块属 Node 侧仓库源码，可使用 node: 内建；动态插件体内联等价代码。
 */
import { randomUUID } from 'node:crypto'

/** 协议版本（major.minor），v1 冻结值（§7.1） */
export const PROTOCOL_VERSION = '1.0'
export const PROTOCOL_MAJOR = '1'

/** 信令 WebSocket 默认端口（TODO-8：冲突递增策略待定） */
export const SIGNALING_PORT = 18990

/** 发现平面组播参数（§2.4 建议值，T0.3 结论定稿） */
export const ANNOUNCE_ADDRESS = '239.189.90.90'
export const ANNOUNCE_PORT = 51900
export const ANNOUNCE_TTL = 1
export const ANNOUNCE_INTERVAL_MS = 2000
export const ANNOUNCE_EXPIRY_MS = 6000

/** DataChannel label（§4.8-5：每对连接由 id 较大一端创建） */
export const DATA_CHANNEL_LABEL = 'meeting'

/** 成员上限（§5.2 步骤3，V0.1 建议 ≤8） */
export const MAX_MEMBERS = 8

/** 心跳（§5.3：建议 10s 一跳，30s 超时剔除，TODO-3 联调校准） */
export const HEARTBEAT_INTERVAL_MS = 10000
export const HEARTBEAT_TIMEOUT_MS = 30000

/** 事件类型全集（§4.1 总表：11 核心 + 2 附加 + 3 信令控制） */
export const EVENT_TYPES = Object.freeze([
  'room.join', 'room.leave', 'member.join', 'member.leave',
  'rtc.offer', 'rtc.answer', 'rtc.ice',
  'screen.start', 'screen.stop', 'agent.status', 'meeting.transcript',
  'voice.level', 'chat.message',
  'member.list', 'room.reject', 'room.ended',
])

/** room.reject 拒绝码（§5.3，rc2 增补 BAD_REQUEST） */
export const REJECT_CODES = Object.freeze([
  'BAD_SECRET', 'ROOM_FULL', 'VERSION_MISMATCH', 'ROOM_CLOSED', 'BAD_REQUEST',
])

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export function isUuidV4(value) {
  return typeof value === 'string' && UUID_V4_RE.test(value)
}

/**
 * 构造 envelope（§3）。id/ts 可注入以便测试确定性。
 */
export function makeEnvelope(type, sender, payload = {}, overrides = {}) {
  if (!EVENT_TYPES.includes(type)) throw new TypeError(`unknown event type: ${String(type)}`)
  if (typeof sender !== 'string' || sender.length === 0) throw new TypeError('sender 必填')
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('payload 必须是普通对象')
  }
  return {
    protocolVersion: PROTOCOL_VERSION,
    id: overrides.id ?? randomUUID(),
    type,
    sender,
    ts: overrides.now ?? Date.now(),
    payload,
  }
}

/**
 * envelope 结构校验（§3.1）。返回 { ok, error? }；信令层入口必须先过此校验。
 */
export function validateEnvelope(msg) {
  if (msg === null || typeof msg !== 'object' || Array.isArray(msg)) {
    return { ok: false, error: 'envelope 必须是对象' }
  }
  if (typeof msg.protocolVersion !== 'string' || msg.protocolVersion.split('.')[0] !== PROTOCOL_MAJOR) {
    return { ok: false, error: 'protocolVersion major 不符' }
  }
  if (!isUuidV4(msg.id)) return { ok: false, error: 'id 必须是 uuid v4' }
  if (!EVENT_TYPES.includes(msg.type)) return { ok: false, error: `未知事件类型: ${String(msg.type)}` }
  if (!isUuidV4(msg.sender)) return { ok: false, error: 'sender 必须是 uuid v4' }
  if (!Number.isInteger(msg.ts) || msg.ts < 0) return { ok: false, error: 'ts 必须是非负整数（毫秒 epoch）' }
  if (msg.payload === null || typeof msg.payload !== 'object' || Array.isArray(msg.payload)) {
    return { ok: false, error: 'payload 必须是普通对象' }
  }
  return { ok: true }
}
