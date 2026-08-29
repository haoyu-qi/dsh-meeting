/**
 * MeetingClient —— 成员侧会话客户端（T1.4 协作大厅「加入」/ T1.5 侧栏共用核心逻辑）
 *
 * 语义依据：docs/protocol.md §5（握手）、§3（envelope）、§4.1（事件总表）。
 * - connect(host, port)：ws 连接 → room.join → member.list（或 room.reject）；
 * - 心跳：§5.3 为 ws 层 ping/pong——浏览器与 ws 包均自动回 pong，客户端无需处理；
 * - 状态维护：member.list 全量替换 / member.join 增员 / member.leave 减员；
 * - rtc.offer/answer/ice 经 sendToMember 定向发送（§4.6/4.7）；
 * - 事件经 onEvent 回调上抛，UI 层只订阅自己关心的 type。
 *
 * 环境适配：wsFactory 可注入（浏览器用全局 WebSocket；Node 测试注入 ws 包），
 * 本模块不直接引用任何平台全局（除默认工厂内的 WebSocket）。
 */
import { makeEnvelope, validateEnvelope } from '../host/protocol.js'

export const CLIENT_CONN_STATES = Object.freeze(['idle', 'connecting', 'joined', 'closed'])

/** UI 层关心的全部下行事件（除 join 应答内部消费外全部透传） */
export const DOWNLINK_EVENTS = Object.freeze([
  'member.join', 'member.leave', 'room.ended',
  'rtc.offer', 'rtc.answer', 'rtc.ice',
  'screen.start', 'screen.stop', 'agent.status', 'meeting.transcript', 'voice.level', 'chat.message',
])

function defaultWsFactory(url) {
  // 浏览器与 Node(≥22) 均有全局 WebSocket；Node 测试可注入 ws 包实现
  return new WebSocket(url)
}

export class MeetingClient {
  /**
   * @param {object} options
   * @param {string} options.identity 本端成员 id（uuid v4；缺省 crypto.randomUUID）
   * @param {string} options.displayName 显示名（1~24 字符，§4.2）
   * @param {(env: object) => void} [options.onEvent] 下行事件回调（已过 validateEnvelope）
   * @param {(url: string) => WebSocket} [options.wsFactory] 连接工厂（可注入）
   * @param {number} [options.joinTimeoutMs=5000] join 应答超时
   */
  constructor({ identity, displayName, onEvent, wsFactory = defaultWsFactory, joinTimeoutMs = 5000 } = {}) {
    if (!identity || typeof identity !== 'string') {
      identity = globalThis.crypto.randomUUID()
    }
    if (typeof displayName !== 'string' || displayName.trim().length === 0) {
      throw new TypeError('displayName 必填（trim 后非空）')
    }
    this.identity = identity
    this.displayName = displayName.trim()
    this._onEvent = typeof onEvent === 'function' ? onEvent : () => {}
    this._wsFactory = wsFactory
    this._joinTimeoutMs = joinTimeoutMs

    /** @type {'idle'|'connecting'|'joined'|'closed'} */
    this.connState = 'idle'
    /** @type {{ roomId, roomName, protocolVersion, hostId } | null} */
    this.room = null
    /** @type {Array<{id,name,role,micState,kind}>} */
    this.members = []

    /** @type {WebSocket | null} */
    this._ws = null
    this._pendingJoin = null
  }

  /**
   * 连接并加入房间。成功后 connState='joined'，room/members 就绪。
   * @returns {Promise<{room: object, members: object[]}>} member.list 快照
   * @throws {{ code: string }} room.reject 时抛出带 code 的 Error
   */
  connect(host, port, { secret, micState = 'on' } = {}) {
    if (this.connState !== 'idle' && this.connState !== 'closed') {
      return Promise.reject(new Error('客户端已在会话中，请先 leave/close'))
    }
    this.connState = 'connecting'
    return new Promise((resolve, reject) => {
      const ws = this._wsFactory(`ws://${host}:${port}`)
      this._ws = ws
      let settled = false
      const fail = (err) => {
        if (settled) return
        settled = true
        this.connState = 'closed'
        try { ws.close() } catch {}
        reject(err)
      }
      const timer = setTimeout(() => fail(new Error('join 应答超时')), this._joinTimeoutMs)

      ws.addEventListener('open', () => {
        ws.send(JSON.stringify(makeEnvelope('room.join', this.identity, {
          name: this.displayName,
          secret: secret ?? undefined,
          micState,
          kind: 'human',
        })))
      })
      ws.addEventListener('error', () => {
        clearTimeout(timer)
        fail(new Error('连接失败'))
      })
      ws.addEventListener('close', () => {
        clearTimeout(timer)
        if (this.connState === 'joined') this._handleClosed()
      })
      ws.addEventListener('message', (event) => {
        let env
        try {
          const raw = event && typeof event === 'object' && 'data' in event ? event.data : event
          env = JSON.parse(typeof raw === 'string' ? raw : String(raw))
        } catch { return }
        if (!validateEnvelope(env).ok) return

        if (this.connState === 'connecting') {
          if (env.type === 'room.reject') {
            clearTimeout(timer)
            const err = new Error(`加入被拒: ${env.payload?.code ?? 'UNKNOWN'}`)
            err.code = env.payload?.code ?? 'UNKNOWN'
            fail(err)
            return
          }
          if (env.type === 'member.list') {
            clearTimeout(timer)
            settled = true
            this.room = env.payload.room
            this.members = env.payload.members
            this.connState = 'joined'
            resolve({ room: this.room, members: this.members })
            this._onEvent(env)
            return
          }
          // connecting 期间的其它消息（如 member.join 先到）按已入房处理缓存
        }
        this._dispatch(env)
      })
    })
  }

  /** 广播聊天消息（§4.11 chat.message，暂走信令通道，T3 接 DataChannel） */
  sendChat(text) {
    const clean = typeof text === 'string' ? text.trim().slice(0, 500) : ''
    if (!clean) return false
    return this._send(makeEnvelope('chat.message', this.identity, { text: clean }))
  }

  /** 发言音量（§4.10 voice.level，level 0~1） */
  sendVoiceLevel(level, micState = 'on') {
    const v = Number(level)
    if (!Number.isFinite(v) || v < 0 || v > 1) return false
    return this._send(makeEnvelope('voice.level', this.identity, { level: v, micState }))
  }

  /** RTC 定向消息：type ∈ rtc.offer | rtc.answer | rtc.ice（§4.6/4.7，payload.target 必填） */
  sendToMember(type, targetId, payload) {
    if (!['rtc.offer', 'rtc.answer', 'rtc.ice'].includes(type)) return false
    const extra = { ...payload, target: targetId }
    return this._send(makeEnvelope(type, this.identity, extra))
  }

  /** 主动退出（§4.3）：发 room.leave 后关连接 */
  leave() {
    if (this.connState !== 'joined') return false
    this._send(makeEnvelope('room.leave', this.identity, { reason: 'user' }))
    this.connState = 'closed'
    try { this._ws?.close() } catch {}
    return true
  }

  /** 强制关闭（断网模拟/异常兜底） */
  close() {
    if (this._ws) {
      try { this._ws.close() } catch {}
    }
    this._handleClosed()
  }

  _send(envelope) {
    if (this.connState !== 'joined' || !this._ws) return false
    try {
      this._ws.send(JSON.stringify(envelope))
      return true
    } catch {
      return false
    }
  }

  _dispatch(env) {
    switch (env.type) {
      case 'member.join':
        if (!this.members.some((m) => m.id === env.payload?.member?.id)) {
          this.members = [...this.members, env.payload.member]
        }
        break
      case 'member.leave':
        this.members = this.members.filter((m) => m.id !== env.payload?.memberId)
        break
      case 'room.ended':
        this.connState = 'closed'
        break
      default:
        break
    }
    this._onEvent(env)
  }

  _handleClosed() {
    if (this.connState !== 'closed') {
      this.connState = 'closed'
      this._onEvent({ type: 'client.closed', payload: {} })
    }
  }
}
