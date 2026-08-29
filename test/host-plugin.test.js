import test from 'node:test'
import assert from 'node:assert/strict'
import { createMeetingHostPlugin } from '../src/host/index.js'

/** 假 ctx：捕获 provide 的服务与 effect 清理器 */
function makeMockCtx() {
  const provided = new Map()
  const effects = []
  return {
    ctx: {
      provide(name, value) { provided.set(name, value) },
      effect(fn) { effects.push(fn) },
    },
    provided,
    effects,
  }
}

test('meeting 服务：createRoom 后快照正确（不广播——真实网络行为由 smoke-lan 覆盖）', async () => {
  const { ctx, provided } = makeMockCtx()
  const plugin = createMeetingHostPlugin({ hostName: '浩宇', lanAddress: '192.168.31.38' })
  const meeting = plugin.apply(ctx)

  assert.equal(provided.get('meeting'), meeting)
  assert.equal(meeting.inRoom, false)
  assert.equal(meeting.getRoomSnapshot(), null)

  const created = await meeting.createRoom({ name: '登录模块讨论', announce: false })
  assert.equal(created.roomName, '登录模块讨论')
  assert.equal(meeting.inRoom, true)

  const snap = meeting.getRoomSnapshot()
  assert.equal(snap.roomId, created.roomId)
  assert.equal(snap.members.length, 1)
  assert.equal(snap.members[0].role, 'host')
  assert.equal(snap.members[0].name, '浩宇')
})

test('meeting 服务：重复 createRoom 抛错', async () => {
  const { ctx } = makeMockCtx()
  const meeting = createMeetingHostPlugin({ lanAddress: '127.0.0.1' }).apply(ctx)
  await meeting.createRoom({ announce: false })
  await assert.rejects(() => meeting.createRoom({ announce: false }), /已在一个房间中/)
})

test('meeting 服务：leaveRoom 结束房间并可再次开房', async () => {
  const { ctx } = makeMockCtx()
  const meeting = createMeetingHostPlugin({ lanAddress: '127.0.0.1' }).apply(ctx)
  await meeting.createRoom({ announce: false })
  const r = await meeting.leaveRoom()
  assert.equal(r.ended, true)
  assert.equal(meeting.inRoom, false)
  await meeting.createRoom({ announce: false })
  assert.equal(meeting.inRoom, true)
})

test('meeting 服务：effect 清理器已注册（组合行卸载即回收）', () => {
  const { ctx, effects } = makeMockCtx()
  createMeetingHostPlugin({ lanAddress: '127.0.0.1' }).apply(ctx)
  assert.equal(effects.length, 1)
})
