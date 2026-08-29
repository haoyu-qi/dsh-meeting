/**
 * SignalingServer —— T1.2 Host ws 信令服务器
 *
 * 语义依据：docs/protocol.md §5（握手时序 / 控制消息 / 心跳）、§6（信令通道分工）。
 * 职责：把 RoomService（T1.1 纯逻辑）的 outbox 投递到真实 ws 连接，并把客户端
 * envelope 按 §5 路由——room.* 交给 RoomService 裁决，rtc.* 按 payload.target 定向
 * 原样转发，协作状态类事件向其余成员扇出。信令只协调、不传媒体。
 *
 * 设计：
 * - 协议常量与 makeEnvelope/validateEnvelope 全部复用 ./protocol.js，不重定义；
 * - RoomService 可经 createRoom 注入（测试注入假时钟 / 短心跳超时）；
 * - 每个 ws 连接「先 join 后绑定」：首条消息必须是 room.join envelope（§5.2 步骤②③），
 *   失败回 room.reject 并关闭；成功后该连接才进入广播/转发的成员集合；
 * - Host 本体是本进程内的 RoomService，不经 ws join（§5.2 步骤5）；Host 应用层
 *   直接改房间状态后调用 server.dispatchOutbox() 完成投递。
 */
import { EventEmitter } from 'node:events'
import { WebSocket, WebSocketServer } from 'ws'
import { RoomService } from './room.js'
import {
  SIGNALING_PORT,
  MAX_MEMBERS,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  makeEnvelope,
  validateEnvelope,
} from './protocol.js'

/** 成员 ⇄ 成员定向转发类型（§4.6/§4.7：Host 按 payload.target 私发，envelope 原样） */
const RTC_TARGET_TYPES = new Set(['rtc.offer', 'rtc.answer', 'rtc.ice'])

/** 成员 → 其余全员扇出类型（§4.1 总表：DataChannel 语义事件在信令层的扇出通道） */
const MEMBER_BROADCAST_TYPES = new Set([
  'screen.start', 'screen.stop', 'agent.status', 'meeting.transcript', 'voice.level', 'chat.message',
])

/** room.ended 广播后留给投递窗口的延迟，随后关闭整个 server（§5.3 / PRD §7.2） */
const ROOM_END_CLOSE_DELAY_MS = 100

/**
 * @param {object} [options]
 * @param {number} [options.port=18990] 监听端口；测试传 0 由系统随机分配
 * @param {string} [options.host='0.0.0.0'] 监听地址
 * @param {string} [options.roomId] 房间 id（缺省 RoomService 自生成）
 * @param {string} options.roomName 房间名（RoomService 必填）
 * @param {string} [options.hostId] Host 成员 id（缺省自生成）
 * @param {string} options.hostName Host 显示名
 * @param {string|null} [options.secret=null] 加入口令；null 表示无需口令
 * @param {number} [options.maxMembers=8] 成员上限
 * @param {number} [options.heartbeatIntervalMs=10000] 心跳周期（§5.3 建议 10s）
 * @param {number} [options.heartbeatTimeoutMs=30000] 心跳超时（§5.3 建议 30s）
 * @param {() => RoomService} [options.createRoom] RoomService 工厂，默认按上述参数构造；测试可注入假时钟
 * @param {(line: string) => void} [options.log] 日志函数，默认静默
 * @returns {EventEmitter & { wss: WebSocketServer, port: number, actualPort: number, room: RoomService,
 *            ready: Promise<void>, dispatchOutbox(): void, close(): Promise<void> }}
 */
export function createSignalingServer(options = {}) {
  const {
    port = SIGNALING_PORT,
    host = '0.0.0.0',
    roomId,
    roomName,
    hostId,
    hostName,
    secret = null,
    maxMembers = MAX_MEMBERS,
    heartbeatIntervalMs = HEARTBEAT_INTERVAL_MS,
    heartbeatTimeoutMs = HEARTBEAT_TIMEOUT_MS,
    createRoom = () =>
      new RoomService({ roomId, roomName, hostId, hostName, secret, maxMembers, heartbeatTimeoutMs }),
    log = () => {},
  } = options

  const roomService = createRoom()
  const wss = new WebSocketServer({ port, host })

  /** @type {Map<string, WebSocket>} memberId → 已完成 join 的连接 */
  const socketsByMember = new Map()
  /** @type {WeakMap<WebSocket, string>} 连接 → memberId（仅已绑定连接） */
  const memberBySocket = new WeakMap()

  const isOpen = (ws) => ws.readyState === WebSocket.OPEN
  const sendEnvelope = (ws, envelope) => {
    if (isOpen(ws)) ws.send(JSON.stringify(envelope))
  }

  const bind = (ws, memberId) => {
    socketsByMember.set(memberId, ws)
    memberBySocket.set(ws, memberId)
  }

  /** 解绑并返回该连接曾绑定的 memberId（未绑定过返回 undefined） */
  const unbind = (ws) => {
    const memberId = memberBySocket.get(ws)
    memberBySocket.delete(ws)
    if (memberId !== undefined && socketsByMember.get(memberId) === ws) socketsByMember.delete(memberId)
    return memberId
  }

  /**
   * RoomService outbox → 真实连接（§3.4 设计：信令层负责投递）。
   * single → memberId 对应连接（无连接则丢弃并 log）；broadcast → 除 exceptId 外全部。
   * 投递过程中若出现 room.ended，触发散会收尾（延迟 100ms 关闭 server + 'room-ended' 事件）。
   */
  function dispatchOutbox() {
    for (const item of roomService.takeOutbox()) {
      const { to, memberId, exceptId, envelope } = item
      if (to === 'single') {
        const target = memberId !== undefined ? socketsByMember.get(memberId) : undefined
        if (target && isOpen(target)) {
          sendEnvelope(target, envelope)
        } else {
          log(`[signaling] single 投递无在线连接，丢弃: memberId=${memberId} type=${envelope.type}`)
        }
      } else if (to === 'broadcast') {
        for (const [id, sock] of socketsByMember) {
          if (id === exceptId) continue
          sendEnvelope(sock, envelope)
        }
      } else {
        log(`[signaling] outbox 未知 to=${String(to)}，丢弃`)
      }
      if (envelope.type === 'room.ended') scheduleRoomEnd()
    }
  }

  /** 直接拒绝：回 room.reject（BAD_REQUEST）并关闭该连接（§5.2 步骤3） */
  function rejectAndClose(ws, code, message) {
    sendEnvelope(ws, makeEnvelope('room.reject', roomService.hostId, { code, message }))
    ws.close()
    log(`[signaling] 拒绝连接: ${code} ${message}`)
  }

  /** 未绑定连接的首条消息：必须是合法 room.join envelope（§5.2 步骤②③） */
  function handleFirstMessage(ws, msg) {
    const verdict = validateEnvelope(msg)
    if (!verdict.ok) return rejectAndClose(ws, 'BAD_REQUEST', verdict.error)
    if (msg.type !== 'room.join') {
      return rejectAndClose(ws, 'BAD_REQUEST', `首条消息必须是 room.join，收到 ${msg.type}`)
    }
    if (socketsByMember.has(msg.sender)) {
      return rejectAndClose(ws, 'BAD_REQUEST', '成员 id 冲突，该身份已在线')
    }

    const payload = msg.payload ?? {}
    const result = roomService.join({
      sender: msg.sender,
      protocolVersion: msg.protocolVersion,
      name: payload.name,
      secret: payload.secret,
      micState: payload.micState,
      kind: payload.kind,
    })
    bind(ws, msg.sender) // 先绑定再分发：room.reject 也要送进这条连接
    dispatchOutbox()
    if (!result.ok) {
      unbind(ws)
      ws.close()
      log(`[signaling] join 被拒并断开: ${result.code}`)
    }
  }

  /** 已绑定成员的后续消息路由（§4.1 总表） */
  function handleMemberMessage(ws, memberId, msg) {
    if (!validateEnvelope(msg).ok) {
      log(`[signaling] envelope 校验失败，丢弃: type=${String(msg?.type)}`)
      return
    }

    if (msg.type === 'room.leave') {
      const reason = typeof msg.payload?.reason === 'string' ? msg.payload.reason : 'user'
      roomService.leave(memberId, reason)
      unbind(ws) // 先解绑，避免随后的 close 事件重复上报 disconnect
      dispatchOutbox()
      ws.close() // §4.3：注销后关闭该 ws
      return
    }

    if (RTC_TARGET_TYPES.has(msg.type)) {
      const target =
        typeof msg.payload?.target === 'string' ? socketsByMember.get(msg.payload.target) : undefined
      if (target && isOpen(target)) {
        sendEnvelope(target, msg) // envelope 原样转发
      } else {
        log(`[signaling] 定向转发丢弃: type=${msg.type} target=${String(msg.payload?.target)} 不在线`)
      }
      return
    }

    if (MEMBER_BROADCAST_TYPES.has(msg.type)) {
      for (const [id, sock] of socketsByMember) {
        if (id !== memberId) sendEnvelope(sock, msg)
      }
      return
    }

    // member.* / room.reject / room.ended 等是 Host 权威消息，成员不得伪造
    log(`[signaling] 未路由的消息类型，丢弃: type=${msg.type}`)
  }

  wss.on('connection', (ws) => {
    ws.on('error', (err) => log(`[signaling] 连接错误: ${err.message}`))

    // §5.3 心跳：ws 协议层 pong → 触达 RoomService（lastSeen 刷新）
    ws.on('pong', () => {
      const memberId = memberBySocket.get(ws)
      if (memberId !== undefined) roomService.touch(memberId)
    })

    ws.on('message', (data) => {
      let msg
      try {
        msg = JSON.parse(data.toString())
      } catch {
        if (memberBySocket.has(ws)) log('[signaling] 非 JSON 消息，丢弃')
        else rejectAndClose(ws, 'BAD_REQUEST', '消息必须是 JSON envelope')
        return
      }
      const memberId = memberBySocket.get(ws)
      if (memberId === undefined) handleFirstMessage(ws, msg)
      else handleMemberMessage(ws, memberId, msg)
    })

    ws.on('close', () => {
      const memberId = unbind(ws)
      if (memberId === undefined || !roomService.members.has(memberId)) return
      // Host 连接断开 → room.ended 散会；普通成员 → member.leave(disconnect)（§5.3 掉线补偿）
      roomService.leave(memberId, 'disconnect')
      dispatchOutbox()
    })
  })

  // §5.3 心跳：周期对已绑定成员连接 ping；checkTimeouts 剔除超时成员并主动关闭其连接
  const heartbeatTimer = setInterval(() => {
    for (const sock of socketsByMember.values()) {
      if (isOpen(sock)) sock.ping()
    }
    const evicted = roomService.checkTimeouts()
    for (const id of evicted) {
      const sock = socketsByMember.get(id)
      if (sock) {
        unbind(sock)
        sock.close()
      }
    }
    if (evicted.length > 0) dispatchOutbox()
  }, heartbeatIntervalMs)

  const server = new EventEmitter()

  let roomEndedFired = false
  let closePromise = null

  /** 关闭信令服务器（幂等）：停心跳 + 关 wss 及底层 http server */
  function close() {
    if (closePromise) return closePromise
    clearInterval(heartbeatTimer)
    closePromise = new Promise((resolve, reject) => {
      let settled = false
      const done = (err) => {
        if (settled) return
        settled = true
        if (err) reject(err)
        else resolve()
      }
      wss.close(done)
    })
    return closePromise
  }

  /** §5.3 room.ended：触发 'room-ended' 事件，留 100ms 投递窗口后关闭整个 server */
  function scheduleRoomEnd() {
    if (roomEndedFired) return
    roomEndedFired = true
    log('[signaling] 房间已结束，100ms 后关闭信令服务器')
    server.emit('room-ended')
    setTimeout(() => {
      close().catch((err) => log(`[signaling] 服务器关闭失败: ${err.message}`))
    }, ROOM_END_CLOSE_DELAY_MS)
  }

  server.wss = wss
  server.room = roomService
  server.dispatchOutbox = dispatchOutbox
  server.close = close

  // port=0 时监听完成后才有真实端口；getter 保证任何时刻读取都是当前值
  Object.defineProperty(server, 'port', {
    get() {
      const addr = wss.address()
      return addr !== null && typeof addr === 'object' ? addr.port : null
    },
  })
  Object.defineProperty(server, 'actualPort', {
    get() {
      return server.port
    },
  })

  /** listening 就绪 promise（port=0 时等待真实端口分配完成；绑定失败则 reject） */
  server.ready = new Promise((resolve, reject) => {
    wss.once('listening', resolve)
    wss.once('error', reject)
  })
  server.ready.catch(() => {}) // 未 await 时避免 unhandled rejection；await 方仍会拿到错误

  wss.on('error', (err) => log(`[signaling] 服务器错误: ${err.message}`))
  wss.on('listening', () => {
    log(`[signaling] ws://${host}:${server.port} ready — room="${roomService.roomName}" (${roomService.roomId})`)
  })

  return server
}
