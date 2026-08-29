/**
 * LAN 发现服务 —— T1.3（发现平面）
 *
 * 依据：docs/protocol.md §2（room_announce 报文/去重/失效）；
 * T0.3 Spike 结论（docs/spikes/t0.3-lan-discovery.md）：
 *  - 默认组播接口可能被 TUN 虚拟网卡抢占 → 发送端必须 setMulticastInterface 显式选卡；
 *  - 接收端存在反射复制（收 > 发）→ 按 (roomId, host, port) 去重；
 *  - 失效窗口 = 3 个广播周期（默认 2s 间隔 → 6s）。
 *
 * 设计：socket 通过工厂注入（测试用假 socket），本模块零 dgram 硬依赖。
 */
import dgram from 'node:dgram'
import os from 'node:os'
import { ANNOUNCE_ADDRESS, ANNOUNCE_PORT, ANNOUNCE_TTL, ANNOUNCE_INTERVAL_MS, ANNOUNCE_EXPIRY_MS } from './protocol.js'

/**
 * 从本机网卡中挑选最可能的局域网 IPv4 地址（启发式，可显式覆盖）。
 * T0.3：TUN 虚拟网卡（常见 198.18.0.0/15 段、名称含 TUN/Meta/utun）优先级最低。
 */
export function pickLanAddress(exclude = [], ifaces = os.networkInterfaces()) {
  const excluded = new Set(exclude)
  const candidates = []
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const addr of addrs ?? []) {
      if (addr.family !== 'IPv4' || addr.internal) continue
      // T0.3/烟测：TUN(198.18.0.0/15)、CGNAT/VPN(100.64.0.0/10) 类虚拟网卡降级为兜底
      const suspicious =
        /tun|tap|meta|vpng|wintun/i.test(name) ||
        addr.address.startsWith('198.18.') ||
        addr.address.startsWith('100.') ||
        addr.address.startsWith('169.254.')
      candidates.push({ name, address: addr.address, suspicious })
    }
  }
  const normal = candidates.filter((c) => !suspiciousOf(c, excluded))
  const pool = normal.length > 0 ? normal : candidates
  return pool.length > 0 ? pool[0].address : null
}

function suspiciousOf(c, excluded) {
  return c.suspicious || excluded.has(c.address)
}

/**
 * 房间公告发送器（Host 侧）。
 * socketFactory: () => 类 dgram.Socket（默认真实 dgram），便于测试注入。
 */
export function createAnnouncer(options = {}) {
  const {
    roomId,
    roomName,
    hostName,
    host = pickLanAddress(),
    port,
    members = 1,
    secretRequired = false,
    protocolVersion = '1.0',
    address = ANNOUNCE_ADDRESS,
    announcePort = ANNOUNCE_PORT,
    ttl = ANNOUNCE_TTL,
    intervalMs = ANNOUNCE_INTERVAL_MS,
    socketFactory = () => dgram.createSocket('udp4'),
    log = () => {},
  } = options
  if (!roomId || !roomName || !host || !port) throw new TypeError('roomId/roomName/host/port 必填')

  let socket = null
  let timer = null
  let running = false

  function buildPacket() {
    return Buffer.from(JSON.stringify({
      type: 'room_announce',
      protocolVersion,
      roomId,
      roomName,
      hostName,
      host,
      port,
      members,
      secretRequired,
      ts: Date.now(),
    }))
  }

  async function announceOnce() {
    if (!running || !socket) return
    const packet = buildPacket()
    await new Promise((resolve, reject) => {
      socket.send(packet, 0, packet.length, announcePort, address, (err) => (err ? reject(err) : resolve()))
    })
  }

  return {
    get announcePort() { return announcePort },
    get address() { return address },
    async start() {
      if (running) return
      running = true
      socket = socketFactory()
      await new Promise((resolve, reject) => {
        socket.bind(undefined, undefined, (err) => (err ? reject(err) : resolve()))
      })
      try { socket.setMulticastTTL(ttl) } catch (err) { log(`setMulticastTTL 失败: ${err?.message ?? err}`) }
      try { socket.setMulticastInterface(host) } catch (err) { log(`setMulticastInterface(${host}) 失败: ${err?.message ?? err}——可能落到默认网卡(TUN)，请显式指定 host`) }
      timer = setInterval(() => { announceOnce().catch((err) => log(`announce 失败: ${err?.message ?? err}`)) }, intervalMs)
      timer.unref?.()
      await announceOnce()
    },
    async stop() {
      running = false
      if (timer) { clearInterval(timer); timer = null }
      if (socket) {
        const s = socket
        socket = null
        await new Promise((resolve) => s.close(() => resolve()))
      }
    },
  }
}

/**
 * 附近房间发现器（加入者侧）。onRoom(room) 在新房间出现或已存房间刷新时回调。
 * 去重键 = `${roomId}|${host}|${port}`（T0.3：TUN 反射复制会重复收到）。
 */
export function createDiscovery(options = {}) {
  const {
    onRoom = () => {},
    address = ANNOUNCE_ADDRESS,
    announcePort = ANNOUNCE_PORT,
    expiryMs = ANNOUNCE_EXPIRY_MS,
    /** 显式加入组播的网卡地址（T0.3：缺省可能加到 TUN 虚拟网卡上导致收不到真实 LAN 公告） */
    membershipInterface,
    socketFactory = () => dgram.createSocket({ type: 'udp4', reuseAddr: true }),
    now = Date.now,
    log = () => {},
  } = options

  let socket = null
  let sweepTimer = null
  let running = false
  /** @type {Map<string, {room:object, seenAt:number}>} */
  const rooms = new Map()

  function handlePacket(buffer, rinfo) {
    let msg
    try { msg = JSON.parse(buffer.toString('utf8')) } catch { log(`非 JSON 报文来自 ${rinfo?.address}`); return }
    if (msg === null || typeof msg !== 'object' || msg.type !== 'room_announce') return
    if (typeof msg.roomId !== 'string' || typeof msg.host !== 'string' || typeof msg.port !== 'number') return
    const key = `${msg.roomId}|${msg.host}|${msg.port}`
    const room = {
      roomId: msg.roomId,
      roomName: typeof msg.roomName === 'string' ? msg.roomName : '',
      hostName: typeof msg.hostName === 'string' ? msg.hostName : '',
      host: msg.host,
      port: msg.port,
      members: typeof msg.members === 'number' ? msg.members : 1,
      secretRequired: msg.secretRequired === true,
      protocolVersion: typeof msg.protocolVersion === 'string' ? msg.protocolVersion : '1.0',
      ts: typeof msg.ts === 'number' ? msg.ts : now(),
    }
    const existed = rooms.has(key)
    rooms.set(key, { room, seenAt: now() })
    onRoom(room, existed)
  }

  return {
    /** 当前有效房间列表（按最近刷新排序）；stale 条目先清扫 */
    listRooms() {
      const t = now()
      for (const [key, entry] of rooms) {
        if (t - entry.seenAt > expiryMs) rooms.delete(key)
      }
      return [...rooms.values()].sort((a, b) => b.seenAt - a.seenAt).map((e) => e.room)
    },
    /** 测试与内部共用：直接投喂一条报文 */
    _handlePacket(buffer, rinfo) { handlePacket(buffer, rinfo) },
    async start() {
      if (running) return
      running = true
      socket = socketFactory()
      socket.on('message', (buffer, rinfo) => handlePacket(buffer, rinfo))
      socket.on('error', (err) => log(`discovery socket 错误: ${err?.message ?? err}`))
      await new Promise((resolve, reject) => {
        socket.bind(announcePort, undefined, (err) => (err ? reject(err) : resolve()))
      })
      try { socket.addMembership(address, membershipInterface) } catch (err) { log(`addMembership 失败: ${err?.message ?? err}`) }
      sweepTimer = setInterval(() => this.listRooms(), Math.max(1000, Math.floor(expiryMs / 2)))
      sweepTimer.unref?.()
    },
    async stop() {
      running = false
      if (sweepTimer) { clearInterval(sweepTimer); sweepTimer = null }
      if (socket) {
        const s = socket
        socket = null
        await new Promise((resolve) => s.close(() => resolve()))
      }
    },
  }
}
