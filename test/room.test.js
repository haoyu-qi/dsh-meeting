import test from 'node:test'
import assert from 'node:assert/strict'
import { RoomService } from '../src/host/room.js'
import {
  makeEnvelope,
  validateEnvelope,
  EVENT_TYPES,
  PROTOCOL_VERSION,
  MAX_MEMBERS,
} from '../src/host/protocol.js'

// 固定 uuid v4 形态的测试身份（8/4/4/4/12，version 4，variant 8）
const HOST = '00000000-0000-4000-8000-000000000001'
const A = '00000000-0000-4000-8000-000000000002'
const B = '00000000-0000-4000-8000-000000000003'
const C = '00000000-0000-4000-8000-000000000004'

/** 可确定性推进时钟的 RoomService 工厂 */
function makeRoom(overrides = {}) {
  let clock = 1_000_000
  let seq = 0
  const room = new RoomService({
    roomName: '登录模块讨论',
    hostName: '浩宇',
    hostId: HOST,
    now: () => clock,
    makeId: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
    ...overrides,
  })
  return { room, advance: (ms) => { clock += ms }, now: () => clock }
}

function join(room, sender, name, extra = {}) {
  return room.join({ sender, protocolVersion: PROTOCOL_VERSION, name, micState: 'on', ...extra })
}

test('创建房间：Host 直接注册为 host，outbox 为空', () => {
  const { room } = makeRoom()
  assert.equal(room.memberCount, 1)
  assert.equal(room.listMembers()[0].role, 'host')
  assert.equal(room.listMembers()[0].name, '浩宇')
  assert.equal(room.takeOutbox().length, 0)
})

test('join 成功：广播 member.join 给除新成员外的所有人 + member.list 私发新成员', () => {
  const { room } = makeRoom()
  const r = join(room, A, '张伟')
  assert.equal(r.ok, true)
  assert.equal(r.member.role, 'member')
  const outbox = room.takeOutbox()
  assert.equal(outbox.length, 2)

  const bcast = outbox.find((o) => o.to === 'broadcast')
  assert.equal(bcast.envelope.type, 'member.join')
  assert.equal(bcast.exceptId, A)
  assert.deepEqual(bcast.envelope.payload.member, { id: A, name: '张伟', role: 'member', micState: 'on', kind: 'human' })

  const direct = outbox.find((o) => o.to === 'single')
  assert.equal(direct.memberId, A)
  assert.equal(direct.envelope.type, 'member.list')
  assert.equal(direct.envelope.payload.room.hostId, HOST)
  assert.equal(direct.envelope.payload.members.length, 2)
  assert.deepEqual(direct.envelope.payload.members.map((m) => m.id), [HOST, A]) // 按入房时间排序
})

test('member.list 幂等：再次快照不影响成员表', () => {
  const { room } = makeRoom()
  join(room, A, '张伟')
  join(room, B, '李强')
  assert.deepEqual(room.listMembers().map((m) => m.id), [HOST, A, B])
})

test('join 拒绝：版本 major 不符 → VERSION_MISMATCH', () => {
  const { room } = makeRoom()
  const r = room.join({ sender: A, protocolVersion: '2.0', name: '张伟', micState: 'on' })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'VERSION_MISMATCH')
  assert.equal(room.memberCount, 1)
})

test('join 拒绝：口令错误 → BAD_SECRET；口令正确 → 通过', () => {
  const { room } = makeRoom({ secret: 'abc123' })
  const bad = join(room, A, '张伟', { secret: 'wrong' })
  assert.equal(bad.code, 'BAD_SECRET')
  assert.equal(room.memberCount, 1)
  const ok = join(room, A, '张伟', { secret: 'abc123' })
  assert.equal(ok.ok, true)
  // 房间 secretRequired 场景下缺省口令同样拒绝
  const missing = join(room, B, '李强')
  assert.equal(missing.code, 'BAD_SECRET')
})

test('join 拒绝：房间满 → ROOM_FULL', () => {
  const { room } = makeRoom({ maxMembers: 2 })
  assert.equal(join(room, A, '张伟').ok, true)
  const r = join(room, B, '李强')
  assert.equal(r.code, 'ROOM_FULL')
  assert.equal(room.memberCount, 2)
})

test('join 拒绝：成员 id 冲突 → BAD_REQUEST', () => {
  const { room } = makeRoom()
  join(room, A, '张伟')
  const r = join(room, A, '张伟二号')
  assert.equal(r.code, 'BAD_REQUEST')
  assert.equal(room.memberCount, 2)
})

test('join 拒绝：畸形 payload → BAD_REQUEST（显示名 / micState / sender）', () => {
  const { room } = makeRoom()
  assert.equal(join(room, A, '   ').code, 'BAD_REQUEST')
  assert.equal(join(room, A, 'x'.repeat(25)).code, 'BAD_REQUEST')
  assert.equal(join(room, A, '张伟', { micState: 'loud' }).code, 'BAD_REQUEST')
  const r = room.join({ sender: 'not-a-uuid', protocolVersion: PROTOCOL_VERSION, name: '张伟', micState: 'on' })
  assert.equal(r.code, 'BAD_REQUEST')
})

test('join 拒绝：房间已结束 → ROOM_CLOSED', () => {
  const { room } = makeRoom()
  room.leave(HOST)
  const r = join(room, A, '张伟')
  assert.equal(r.code, 'ROOM_CLOSED')
})

test('member.leave：普通成员退出后广播并移除', () => {
  const { room } = makeRoom()
  join(room, A, '张伟')
  room.takeOutbox()
  const r = room.leave(A)
  assert.equal(r.ended, false)
  const outbox = room.takeOutbox()
  assert.equal(outbox.length, 1)
  assert.equal(outbox[0].envelope.type, 'member.leave')
  assert.deepEqual(outbox[0].envelope.payload, { memberId: A, reason: 'user' })
  assert.equal(room.memberCount, 1)
})

test('Host 退出：广播 room.ended 并关闭房间（PRD §7.2）', () => {
  const { room } = makeRoom()
  join(room, A, '张伟')
  room.takeOutbox()
  const r = room.leave(HOST)
  assert.equal(r.ended, true)
  const outbox = room.takeOutbox()
  assert.equal(outbox.length, 1)
  assert.equal(outbox[0].envelope.type, 'room.ended')
  assert.deepEqual(outbox[0].envelope.payload, { reason: 'host-left' })
  assert.equal(room.closed, true)
  assert.equal(join(room, B, '李强').code, 'ROOM_CLOSED')
})

test('心跳超时：普通成员被剔除并广播 timeout，Host 永不超时', () => {
  const { room, advance } = makeRoom({ heartbeatTimeoutMs: 30_000 })
  join(room, A, '张伟')
  room.takeOutbox()
  advance(31_000)
  const evicted = room.checkTimeouts()
  assert.deepEqual(evicted, [A])
  const outbox = room.takeOutbox()
  assert.equal(outbox[0].envelope.type, 'member.leave')
  assert.deepEqual(outbox[0].envelope.payload, { memberId: A, reason: 'timeout' })
  assert.equal(room.memberCount, 1)
})

test('心跳触达：touch 后不超时', () => {
  const { room, advance } = makeRoom({ heartbeatTimeoutMs: 30_000 })
  join(room, A, '张伟')
  room.takeOutbox()
  advance(20_000)
  room.touch(A)
  advance(20_000)
  assert.deepEqual(room.checkTimeouts(), [])
  assert.equal(room.memberCount, 2)
})

test('outbox 消费后清空（takeOutbox 幂等取出）', () => {
  const { room } = makeRoom()
  join(room, A, '张伟')
  assert.ok(room.takeOutbox().length > 0)
  assert.equal(room.takeOutbox().length, 0)
})

test('makeEnvelope：字段完整、未知类型抛错', () => {
  const env = makeEnvelope('chat.message', A, { text: 'hi' }, { now: 123, id: C })
  assert.deepEqual(
    { v: env.protocolVersion, id: env.id, type: env.type, sender: env.sender, ts: env.ts, payload: env.payload },
    { v: PROTOCOL_VERSION, id: C, type: 'chat.message', sender: A, ts: 123, payload: { text: 'hi' } },
  )
  assert.throws(() => makeEnvelope('no.such', A, {}), TypeError)
})

test('validateEnvelope：合法通过，结构/版本/类型/ts/payload 非法均拒绝', () => {
  const good = makeEnvelope('screen.start', A, { sourceName: 'VS Code', app: 'Code' })
  assert.equal(validateEnvelope(good).ok, true)

  const cases = [
    [null, '非对象'],
    [[], '数组'],
    [{ ...good, protocolVersion: '2.0' }, 'major 不符'],
    [{ ...good, id: 'xxx' }, 'id 非 uuid'],
    [{ ...good, type: 'unknown.event' }, '未知类型'],
    [{ ...good, sender: 'not-uuid' }, 'sender 非 uuid'],
    [{ ...good, ts: 1.5 }, 'ts 非整数'],
    [{ ...good, ts: -1 }, 'ts 负数'],
    [{ ...good, payload: [] }, 'payload 数组'],
  ]
  for (const [msg] of cases) {
    assert.equal(validateEnvelope(msg).ok, false, `应拒绝: ${JSON.stringify(msg)}`)
  }
})

test('协议常量：事件总数 16、默认成员上限 8', () => {
  assert.equal(EVENT_TYPES.length, 16)
  assert.equal(MAX_MEMBERS, 8)
})
