/**
 * MeetingClient 集成测试 —— Node 环境（注入 ws 包）对接真实 createSignalingServer。
 * 浏览器侧同一份逻辑：仅 wsFactory 默认实现不同（全局 WebSocket）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { WebSocket } from 'ws'
import { MeetingClient } from '../src/client/room-client.js'
import { createSignalingServer } from '../src/host/signaling.js'

const HOST_ID = '00000000-0000-4000-8000-000000000001'
const B_ID = '00000000-0000-4000-8000-000000000002'
const C_ID = '00000000-0000-4000-8000-000000000003'

const wsFactory = (url) => new WebSocket(url)

async function startServer(t, overrides = {}) {
  const server = createSignalingServer({
    port: 0, host: '127.0.0.1',
    roomName: '客户端联调', hostName: '浩宇', hostId: HOST_ID,
    log: () => {},
    ...overrides,
  })
  t.after(() => server.close())
  await server.ready
  return server
}

function makeClient(t, identity, displayName, extra = {}) {
  const events = []
  const client = new MeetingClient({
    identity, displayName, wsFactory,
    onEvent: (env) => events.push(env),
    ...extra,
  })
  t.after(() => client.close())
  return { client, events }
}

const until = (events, predicate, label, timeoutMs = 3000) =>
  new Promise((resolve, reject) => {
    const hit = events.find(predicate)
    if (hit) return resolve(hit)
    const timer = setTimeout(() => reject(new Error(`等待超时: ${label}`)), timeoutMs)
    const orig = events.push.bind(events)
    events.push = (env) => { orig(env); if (predicate(env)) { clearTimeout(timer); resolve(env) } return orig.length }
  })

test('connect 成功：connState/room/members 就绪，member.list 透传 onEvent', async (t) => {
  const server = await startServer(t)
  const { client, events } = makeClient(t, B_ID, '张伟')

  const joined = await client.connect('127.0.0.1', server.port)
  assert.equal(client.connState, 'joined')
  assert.equal(joined.room.hostId, HOST_ID)
  assert.deepEqual(joined.members.map((m) => m.id), [HOST_ID, B_ID])
  assert.deepEqual(client.members.map((m) => m.id), [HOST_ID, B_ID])
  assert.equal(client.room.roomName, '客户端联调')
  assert.equal(events.some((e) => e.type === 'member.list'), true)
})

test('connect 被拒：BAD_SECRET 抛出带 code 的错误，connState=closed', async (t) => {
  const server = await startServer(t, { secret: 'abc123' })
  const { client } = makeClient(t, B_ID, '张伟')

  await assert.rejects(
    () => client.connect('127.0.0.1', server.port, { secret: 'wrong' }),
    (err) => err.code === 'BAD_SECRET',
  )
  assert.equal(client.connState, 'closed')
})

test('双客户端：member.join 增员 / sendChat 收发 / sendVoiceLevel', async (t) => {
  const server = await startServer(t)
  const b = makeClient(t, B_ID, '张伟')
  const c = makeClient(t, C_ID, '王芳')

  await b.client.connect('127.0.0.1', server.port)
  await c.client.connect('127.0.0.1', server.port)

  await until(b.events, (e) => e.type === 'member.join' && e.payload.member.id === C_ID, 'B 见 C 入房')
  assert.deepEqual(b.client.members.map((m) => m.id), [HOST_ID, B_ID, C_ID])

  assert.equal(b.client.sendChat('把报错栈贴这里'), true)
  const chat = await until(c.events, (e) => e.type === 'chat.message', 'C 收到聊天')
  assert.equal(chat.payload.text, '把报错栈贴这里')
  assert.equal(chat.sender, B_ID)

  assert.equal(c.client.sendVoiceLevel(0.66), true)
  const voice = await until(b.events, (e) => e.type === 'voice.level', 'B 收到音量')
  assert.equal(voice.payload.level, 0.66)

  // 非法入参被拒发
  assert.equal(b.client.sendChat('   '), false)
  assert.equal(b.client.sendVoiceLevel(1.5), false)
  assert.equal(b.client.sendToMember('chat.message', C_ID, {}), false)
})

test('rtc.offer 经 sendToMember 定向送达（envelope 原样）', async (t) => {
  const server = await startServer(t)
  const b = makeClient(t, B_ID, '张伟')
  const c = makeClient(t, C_ID, '王芳')
  await b.client.connect('127.0.0.1', server.port)
  await c.client.connect('127.0.0.1', server.port)

  assert.equal(b.client.sendToMember('rtc.offer', C_ID, { sdp: 'client-offer' }), true)
  const offer = await until(c.events, (e) => e.type === 'rtc.offer', 'C 收到 offer')
  assert.equal(offer.payload.sdp, 'client-offer')
  assert.equal(offer.payload.target, C_ID)
  assert.equal(offer.sender, B_ID)
})

test('leave：对端收到 member.leave，成员表减员', async (t) => {
  const server = await startServer(t)
  const b = makeClient(t, B_ID, '张伟')
  const c = makeClient(t, C_ID, '王芳')
  await b.client.connect('127.0.0.1', server.port)
  await c.client.connect('127.0.0.1', server.port)

  assert.equal(b.client.leave(), true)
  assert.equal(b.client.connState, 'closed')

  await until(c.events, (e) => e.type === 'member.leave' && e.payload.memberId === B_ID, 'C 见 B 退房')
  assert.deepEqual(c.client.members.map((m) => m.id), [HOST_ID, C_ID])
})

test('Host 散会：客户端收到 room.ended 且 connState=closed', async (t) => {
  const server = await startServer(t)
  const b = makeClient(t, B_ID, '张伟')
  await b.client.connect('127.0.0.1', server.port)

  assert.equal(server.room.leave(HOST_ID).ended, true)
  server.dispatchOutbox()

  await until(b.events, (e) => e.type === 'room.ended', 'B 收到 room.ended')
  assert.equal(b.client.connState, 'closed')
})

test('重复 connect 拒绝；close 幂等', async (t) => {
  const server = await startServer(t)
  const { client } = makeClient(t, B_ID, '张伟')
  await client.connect('127.0.0.1', server.port)

  await assert.rejects(() => client.connect('127.0.0.1', server.port), /已在会话中/)
  client.close()
  client.close() // 幂等
  assert.equal(client.connState, 'closed')
})
