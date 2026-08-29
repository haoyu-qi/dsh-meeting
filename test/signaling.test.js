/**
 * T1.2 SignalingServer 集成测试 —— 真实起 ws 服务器（port 0 随机端口）+ 真实 ws 客户端。
 *
 * 心跳剔除的可测性说明（协议 §5.3 就是 ws 层 ping/pong）：
 * ws 客户端库默认对 ping 自动回 pong 且无 API 可关闭，因此用「僵尸客户端」方案：
 * join 成功后对底层 socket 执行 `client._socket.pause()`，客户端不再读取 ping 帧 →
 * 不会回 pong → 服务端 touch 不再触达 → heartbeatTimeoutMs 内被 checkTimeouts 剔除。
 * 手工验证方式（真实节奏 10s/30s）：起默认 server 后用任意 ws 客户端 join，然后对连接
 * 断网或挂起进程，约 30s 后其余成员应收到 member.leave(reason="timeout")。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { WebSocket } from 'ws'
import { createSignalingServer } from '../src/host/signaling.js'
import { makeEnvelope, PROTOCOL_VERSION } from '../src/host/protocol.js'

// 固定 uuid v4 形态的测试身份（与 test/room.test.js 同一套）
const HOST = '00000000-0000-4000-8000-000000000001'
const A = '00000000-0000-4000-8000-000000000002'
const B = '00000000-0000-4000-8000-000000000003'
const C = '00000000-0000-4000-8000-000000000004'

/** 起真实服务器（port 0），await ready 后返回；日志收集进 logs 便于断言 */
async function startServer(t, overrides = {}) {
  const logs = []
  const server = createSignalingServer({
    port: 0,
    host: '127.0.0.1',
    roomName: '登录模块讨论',
    hostName: '浩宇',
    hostId: HOST,
    log: (line) => logs.push(String(line)),
    ...overrides,
  })
  t.after(() => server.close())
  await server.ready
  return { server, logs }
}

/** 连接 + room.join + 等待 join 应答（member.list 或 room.reject），并挂接消息收集 */
async function connectAndJoin(port, senderId, name, extra = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`)
  /** @type {{ ws, senderId, received: object[], waiters: object[], closed: Promise, joinReply: object }} */
  const client = {
    ws,
    senderId,
    received: [],
    waiters: [],
    closed: new Promise((resolve) => ws.on('close', resolve)),
    joinReply: null,
  }
  ws.on('error', () => {}) // 关闭竞态下吞掉 error，避免 unhandled
  ws.on('ping', () => {}) // ws 库自动回 pong；此处显式表明协议知悉
  ws.on('message', (data) => {
    let env
    try {
      env = JSON.parse(data.toString())
    } catch {
      return
    }
    client.received.push(env)
    for (let i = client.waiters.length - 1; i >= 0; i--) {
      const waiter = client.waiters[i]
      if (waiter.predicate(env)) {
        client.waiters.splice(i, 1)
        waiter.resolve(env)
      }
    }
  })
  await new Promise((resolve, reject) => {
    ws.once('open', resolve)
    ws.once('error', reject)
  })
  ws.send(
    JSON.stringify(makeEnvelope('room.join', senderId, { name, micState: 'on', kind: 'human', ...extra })),
  )
  client.joinReply = await waitFor(client, (e) => e.type === 'member.list' || e.type === 'room.reject', {
    label: 'join 应答',
  })
  return client
}

/** 等待满足谓词的消息（先查已收缓冲，再挂 waiter），超时拒绝并指明等待目标 */
function waitFor(client, predicate, { timeoutMs = 2000, label = 'message' } = {}) {
  const hit = client.received.find(predicate)
  if (hit) return Promise.resolve(hit)
  return new Promise((resolve, reject) => {
    const waiter = { predicate, resolve: null }
    const timer = setTimeout(() => {
      const idx = client.waiters.indexOf(waiter)
      if (idx >= 0) client.waiters.splice(idx, 1)
      reject(new Error(`waitFor 超时(${timeoutMs}ms): ${label}`))
    }, timeoutMs)
    waiter.resolve = (env) => {
      clearTimeout(timer)
      resolve(env)
    }
    client.waiters.push(waiter)
  })
}

/** 等待 EventEmitter 事件（一次性） */
const onceEvent = (emitter, event) => new Promise((resolve) => emitter.once(event, resolve))

test('三人加入：member.list 全序正确，老成员收到新成员的 member.join', async (t) => {
  const { server } = await startServer(t)
  assert.ok(Number.isInteger(server.port) && server.port > 0, 'port 0 应分配到真实端口')

  const a = await connectAndJoin(server.port, A, '张伟')
  assert.equal(a.joinReply.type, 'member.list')
  assert.deepEqual(a.joinReply.payload.members.map((m) => m.id), [HOST, A])

  const b = await connectAndJoin(server.port, B, '李强')
  assert.deepEqual(b.joinReply.payload.members.map((m) => m.id), [HOST, A, B])
  const joinOfB = await waitFor(a, (e) => e.type === 'member.join' && e.payload.member.id === B)
  assert.equal(joinOfB.payload.member.name, '李强')

  const c = await connectAndJoin(server.port, C, '王芳')
  // 全量快照按入房时间排序（§5.3）：Host → A → B → C
  assert.deepEqual(c.joinReply.payload.members.map((m) => m.id), [HOST, A, B, C])
  assert.equal(c.joinReply.payload.room.hostId, HOST)
  assert.equal(c.joinReply.payload.room.protocolVersion, PROTOCOL_VERSION)
  await waitFor(a, (e) => e.type === 'member.join' && e.payload.member.id === C)
  await waitFor(b, (e) => e.type === 'member.join' && e.payload.member.id === C)
  assert.equal(server.room.memberCount, 4)
})

test('错误口令：room.reject(BAD_SECRET) 且连接被关闭', async (t) => {
  const { server } = await startServer(t, { secret: 'abc123' })

  const bad = await connectAndJoin(server.port, A, '张伟', { secret: 'wrong' })
  assert.equal(bad.joinReply.type, 'room.reject')
  assert.equal(bad.joinReply.payload.code, 'BAD_SECRET')
  await bad.closed // 被拒后服务端主动关闭
  assert.equal(server.room.memberCount, 1) // 只剩 Host

  const ok = await connectAndJoin(server.port, B, '李强', { secret: 'abc123' })
  assert.equal(ok.joinReply.type, 'member.list')
})

test('首条消息不是 room.join → room.reject(BAD_REQUEST) 并关闭', async (t) => {
  const { server } = await startServer(t)

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`)
  const closed = new Promise((resolve) => ws.on('close', resolve))
  ws.on('error', () => {})
  const first = new Promise((resolve) => ws.on('message', (d) => resolve(JSON.parse(d.toString()))))
  await new Promise((resolve) => ws.once('open', resolve))
  // 用结构合法但类型不对的 envelope 冒充首条消息
  ws.send(JSON.stringify(makeEnvelope('chat.message', A, { text: '先聊一句' })))

  const reply = await first
  assert.equal(reply.type, 'room.reject')
  assert.equal(reply.payload.code, 'BAD_REQUEST')
  await closed
  assert.equal(server.room.memberCount, 1)
})

test('rtc.offer / rtc.ice 定向转发：envelope 原样、不回显发送者、target 不在线仅丢弃', async (t) => {
  const { server } = await startServer(t)
  const a = await connectAndJoin(server.port, A, '张伟')
  const b = await connectAndJoin(server.port, B, '李强')

  const offer = makeEnvelope('rtc.offer', A, { target: B, sdp: 'fake-sdp-offer' })
  a.ws.send(JSON.stringify(offer))
  const gotOffer = await waitFor(b, (e) => e.type === 'rtc.offer')
  assert.deepEqual(gotOffer, offer) // 原样：id/sender/ts/payload 均不变
  assert.ok(!a.received.some((e) => e.id === offer.id), '不回显给发送者')

  const ice = makeEnvelope('rtc.ice', B, { target: A, candidate: 'candidate:1 udp …', sdpMid: '0' })
  b.ws.send(JSON.stringify(ice))
  const gotIce = await waitFor(a, (e) => e.type === 'rtc.ice')
  assert.deepEqual(gotIce, ice)

  // target=C 从未连接：仅丢弃并 log，连接与其他成员不受影响
  const before = b.received.length
  a.ws.send(JSON.stringify(makeEnvelope('rtc.offer', A, { target: C, sdp: 'to-nowhere' })))
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(b.received.length, before)
  assert.equal(server.wss.clients.size, 2)
})

test('chat.message 广播：其余成员收到，发送者自己不收到', async (t) => {
  const { server } = await startServer(t)
  const a = await connectAndJoin(server.port, A, '张伟')
  const b = await connectAndJoin(server.port, B, '李强')
  const c = await connectAndJoin(server.port, C, '王芳')
  await waitFor(a, (e) => e.type === 'member.join' && e.payload.member.id === C) // Mesh 就绪

  const msg = makeEnvelope('chat.message', A, { text: '我把报错栈贴这里了' })
  a.ws.send(JSON.stringify(msg))

  const gotB = await waitFor(b, (e) => e.type === 'chat.message')
  const gotC = await waitFor(c, (e) => e.type === 'chat.message')
  assert.deepEqual(gotB, msg)
  assert.deepEqual(gotC, msg)
  assert.ok(!a.received.some((e) => e.type === 'chat.message'), '发送者不收到自己的广播')

  // voice.level 同通道扇出，顺带覆盖第二种广播类型
  const voice = makeEnvelope('voice.level', B, { level: 0.73, micState: 'on' })
  b.ws.send(JSON.stringify(voice))
  await waitFor(a, (e) => e.type === 'voice.level' && e.sender === B)
  await waitFor(c, (e) => e.type === 'voice.level' && e.sender === B)
  assert.ok(!b.received.some((e) => e.type === 'voice.level'))
})

test('成员 room.leave：自身连接被关闭，其余成员收到 member.leave', async (t) => {
  const { server } = await startServer(t)
  const a = await connectAndJoin(server.port, A, '张伟')
  const b = await connectAndJoin(server.port, B, '李强')

  a.ws.send(JSON.stringify(makeEnvelope('room.leave', A, { reason: 'user' })))

  await a.closed // §4.3：注销后关闭该 ws
  const leave = await waitFor(b, (e) => e.type === 'member.leave' && e.payload.memberId === A)
  assert.equal(leave.payload.reason, 'user')
  assert.equal(server.room.memberCount, 2) // Host + B
})

test('成员断线：其余成员收到 member.leave(reason=disconnect)', async (t) => {
  const { server } = await startServer(t)
  const a = await connectAndJoin(server.port, A, '张伟')
  const b = await connectAndJoin(server.port, B, '李强')

  a.ws.terminate() // 模拟断网（不发 close 帧）

  const leave = await waitFor(b, (e) => e.type === 'member.leave' && e.payload.memberId === A)
  assert.equal(leave.payload.reason, 'disconnect')
  assert.equal(server.room.memberCount, 2)
})

test('Host 主动 leave：全员收到 room.ended，server 触发 room-ended 并自行关闭', async (t) => {
  const { server } = await startServer(t)
  const a = await connectAndJoin(server.port, A, '张伟')
  const b = await connectAndJoin(server.port, B, '李强')

  const roomEnded = onceEvent(server, 'room-ended')
  // Host 是本进程内 RoomService，不经 ws join：Host 应用层直接改状态后驱动投递
  assert.equal(server.room.leave(HOST).ended, true)
  server.dispatchOutbox()

  const [endedA, endedB] = await Promise.all([
    waitFor(a, (e) => e.type === 'room.ended'),
    waitFor(b, (e) => e.type === 'room.ended'),
  ])
  assert.equal(endedA.payload.reason, 'host-left')
  assert.equal(endedB.payload.reason, 'host-left')

  await roomEnded
  await server.close() // 散会后自动关闭，close 幂等
  assert.equal(server.wss.clients.size, 0)
})

test('心跳剔除：不回 pong 的僵尸成员在超时后被剔除并广播 member.leave(timeout)', async (t) => {
  const { server } = await startServer(t, { heartbeatIntervalMs: 100, heartbeatTimeoutMs: 300 })
  const b = await connectAndJoin(server.port, B, '李强')
  const a = await connectAndJoin(server.port, A, '张伟')

  // 僵尸化：pause 底层 socket → 读取不到 ping 帧 → ws 库无法自动回 pong
  a.ws._socket.pause()

  const leave = await waitFor(b, (e) => e.type === 'member.leave' && e.payload.memberId === A, {
    timeoutMs: 3000,
    label: 'member.leave(timeout)',
  })
  assert.equal(leave.payload.reason, 'timeout')
  assert.equal(server.room.memberCount, 2) // HOST + B，A 已被剔除

  a.ws.terminate() // 清理 paused 的僵尸 socket
  assert.ok(b.joinReply.type === 'member.list') // 正常成员不受影响
})
