/**
 * 三实例集成联调（T1.7 服务端预演）—— 同进程内 3 个逻辑实例：
 *   实例A = Host（RoomService + ws 信令 + 组播公告）
 *   实例B/C = 成员（组播发现 → ws 加入 → RTC/聊天协作）
 * 全链路：announce → discover → join → member.join 扇出 → rtc.offer 定向 →
 *         chat 广播 → Host 散会 room.ended → 房间从发现列表下线。
 * 真实 socket（UDP 组播 + TCP ws），单进程隔离模式运行（沙箱安全）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { WebSocket } from 'ws'
import { createSignalingServer } from '../src/host/signaling.js'
import { createAnnouncer, createDiscovery, pickLanAddress } from '../src/host/lan.js'
import { makeEnvelope, PROTOCOL_VERSION } from '../src/host/protocol.js'

const HOST_ID = '00000000-0000-4000-8000-000000000001'
const B_ID = '00000000-0000-4000-8000-000000000002'
const C_ID = '00000000-0000-4000-8000-000000000003'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 成员客户端：连接 → room.join → 等 join 应答；挂接消息缓冲与谓词等待 */
async function connectAndJoin(host, port, senderId, name) {
  const ws = new WebSocket(`ws://${host}:${port}`)
  const client = { ws, received: [], waiters: [], closed: new Promise((r) => ws.on('close', r)) }
  ws.on('error', () => {})
  ws.on('message', (data) => {
    let env
    try { env = JSON.parse(data.toString()) } catch { return }
    client.received.push(env)
    for (let i = client.waiters.length - 1; i >= 0; i--) {
      if (client.waiters[i].predicate(env)) {
        client.waiters[i].resolve(env)
        client.waiters.splice(i, 1)
      }
    }
  })
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject) })
  ws.send(JSON.stringify(makeEnvelope('room.join', senderId, { name, micState: 'on', kind: 'human' })))
  client.joinReply = await waitFor(client, (e) => e.type === 'member.list' || e.type === 'room.reject', 'join 应答')
  return client
}

function waitFor(client, predicate, label, timeoutMs = 3000) {
  const hit = client.received.find(predicate)
  if (hit) return Promise.resolve(hit)
  return new Promise((resolve, reject) => {
    const waiter = { predicate, resolve: null }
    const timer = setTimeout(() => {
      const idx = client.waiters.indexOf(waiter)
      if (idx >= 0) client.waiters.splice(idx, 1)
      reject(new Error(`waitFor 超时(${timeoutMs}ms): ${label}`))
    }, timeoutMs)
    waiter.resolve = (env) => { clearTimeout(timer); resolve(env) }
    client.waiters.push(waiter)
  })
}

test('三实例全链路：发现→加入→协作→散会→下线', { timeout: 25_000 }, async (t) => {
  const lan = pickLanAddress() ?? '127.0.0.1'

  // ── 实例 A：Host（信令 + 公告）───────────────────────────────
  const server = createSignalingServer({
    port: 0, host: '0.0.0.0',
    roomName: '三实例联调房间', hostName: '实例A', hostId: HOST_ID,
    log: () => {},
  })
  t.after(() => server.close())
  await server.ready

  const announcer = createAnnouncer({
    roomId: server.room.roomId, roomName: server.room.roomName, hostName: '实例A',
    host: lan, port: server.port, intervalMs: 300, log: () => {},
  })
  t.after(() => announcer.stop())
  await announcer.start()

  // ── 实例 B：发现 → 加入 ─────────────────────────────────────
  const discB = createDiscovery({ membershipInterface: lan, expiryMs: 1500 })
  t.after(() => discB.stop())
  await discB.start()

  let seen = null
  for (let i = 0; i < 50 && !seen; i++) {
    await sleep(100)
    seen = discB.listRooms().find((r) => r.roomId === server.room.roomId)
  }
  assert.ok(seen, 'B 应在 5s 内通过组播发现房间')
  assert.equal(seen.host, lan)
  assert.equal(seen.port, server.port)
  assert.equal(seen.roomName, '三实例联调房间')

  const b = await connectAndJoin(seen.host, seen.port, B_ID, '实例B')
  assert.equal(b.joinReply.type, 'member.list')
  assert.deepEqual(b.joinReply.payload.members.map((m) => m.id), [HOST_ID, B_ID])

  // ── 实例 C：发现（复用 B 的发现器语义，独立列表）→ 加入 ──────
  const discC = createDiscovery({ membershipInterface: lan, expiryMs: 1500 })
  t.after(() => discC.stop())
  await discC.start()
  let seenC = null
  for (let i = 0; i < 50 && !seenC; i++) {
    await sleep(100)
    seenC = discC.listRooms().find((r) => r.roomId === server.room.roomId)
  }
  assert.ok(seenC, 'C 应在 5s 内通过组播发现房间')

  const c = await connectAndJoin(seenC.host, seenC.port, C_ID, '实例C')
  assert.deepEqual(c.joinReply.payload.members.map((m) => m.id), [HOST_ID, B_ID, C_ID])
  await waitFor(b, (e) => e.type === 'member.join' && e.payload.member.id === C_ID, 'B 收到 C 的 member.join')

  // ── 协作平面：rtc.offer 定向 + chat 广播 ─────────────────────
  const offer = makeEnvelope('rtc.offer', B_ID, { target: C_ID, sdp: 'offer-sdp-integration' })
  b.ws.send(JSON.stringify(offer))
  const gotOffer = await waitFor(c, (e) => e.type === 'rtc.offer', 'C 收到 rtc.offer')
  assert.deepEqual(gotOffer, offer)

  const chat = makeEnvelope('chat.message', C_ID, { text: '联调消息：日志我贴出来了' })
  c.ws.send(JSON.stringify(chat))
  await waitFor(b, (e) => e.type === 'chat.message' && e.payload.text === chat.payload.text, 'B 收到 chat')

  // ── Host 散会：全员 room.ended，信令关闭，房间从发现列表下线 ──
  const roomEnded = new Promise((resolve) => server.once('room-ended', resolve))
  assert.equal(server.room.leave(HOST_ID).ended, true)
  server.dispatchOutbox()
  await Promise.all([
    waitFor(b, (e) => e.type === 'room.ended', 'B 收到 room.ended'),
    waitFor(c, (e) => e.type === 'room.ended', 'C 收到 room.ended'),
  ])
  await roomEnded
  await server.close()
  await announcer.stop() // Host 散会即停止公告（等价于 createMeetingHostPlugin.leaveRoom 的行为）

  // 实例 A 不再公告：B/C 的发现列表在失效窗口后应移除该房间
  await sleep(1700)
  assert.ok(!discB.listRooms().some((r) => r.roomId === server.room.roomId), '散会后房间应从 B 的发现列表下线')
  assert.ok(!discC.listRooms().some((r) => r.roomId === server.room.roomId), '散会后房间应从 C 的发现列表下线')
})
