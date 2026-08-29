import test from 'node:test'
import assert from 'node:assert/strict'
import { createAnnouncer, createDiscovery, pickLanAddress } from '../src/host/lan.js'
import { ANNOUNCE_ADDRESS, ANNOUNCE_PORT } from '../src/host/protocol.js'

/** 假 dgram socket：记录 send/bind/TTL/接口调用，支持手动投递 message */
function makeFakeSocket() {
  const calls = { send: [], bound: false, ttl: null, iface: null, membership: null, closed: false }
  const handlers = new Map()
  const socket = {
    calls,
    on(event, fn) { handlers.set(event, fn) },
    bind(_addr, _iface, cb) { calls.bound = true; setImmediate(cb) },
    setMulticastTTL(ttl) { calls.ttl = ttl },
    setMulticastInterface(iface) { calls.iface = iface },
    addMembership(group) { calls.membership = group },
    send(packet, offset, length, port, address, cb) {
      calls.send.push({ text: packet.toString('utf8'), port, address })
      setImmediate(cb)
    },
    close(cb) { calls.closed = true; setImmediate(() => cb?.()) },
    __emitMessage(buffer, rinfo) { handlers.get('message')?.(buffer, rinfo) },
    __emitError(err) { handlers.get('error')?.(err) },
  }
  return socket
}

const BASE = { roomId: 'room-1', roomName: '登录模块讨论', hostName: '浩宇', host: '192.168.31.38', port: 18990 }

test('Announcer：start 即公告一次，TTL=1 且显式绑定出口网卡，报文字段完整', async () => {
  const fake = makeFakeSocket()
  const announcer = createAnnouncer({ ...BASE, secretRequired: true, members: 3, socketFactory: () => fake, log: () => {} })
  await announcer.start()
  assert.equal(fake.calls.bound, true)
  assert.equal(fake.calls.ttl, 1) // T0.3：TTL=1 限本子网
  assert.equal(fake.calls.iface, '192.168.31.38') // T0.3：显式选卡，防 TUN 抢占
  assert.equal(fake.calls.send.length, 1)

  const sent = fake.calls.send[0]
  assert.equal(sent.address, ANNOUNCE_ADDRESS)
  assert.equal(sent.port, ANNOUNCE_PORT)
  const parsed = JSON.parse(sent.text)
  assert.equal(parsed.type, 'room_announce')
  assert.equal(parsed.roomId, 'room-1')
  assert.equal(parsed.roomName, '登录模块讨论')
  assert.equal(parsed.hostName, '浩宇')
  assert.equal(parsed.host, '192.168.31.38')
  assert.equal(parsed.port, 18990)
  assert.equal(parsed.members, 3)
  assert.equal(parsed.secretRequired, true)
  assert.equal(parsed.protocolVersion, '1.0')
  assert.equal(typeof parsed.ts, 'number')

  await announcer.stop()
  assert.equal(fake.calls.closed, true)
})

test('Discovery：收公告入表、按 (roomId,host,port) 去重、刷新触发 onRoom(existed=true)', async () => {
  const events = []
  const fake = makeFakeSocket()
  let clock = 1_000_000
  const discovery = createDiscovery({ socketFactory: () => fake, now: () => clock, onRoom: (room, existed) => events.push({ room, existed }) })
  await discovery.start()
  assert.equal(fake.calls.membership, ANNOUNCE_ADDRESS)

  const packet = (roomId) => Buffer.from(JSON.stringify({ type: 'room_announce', protocolVersion: '1.0', roomId, roomName: '房间' + roomId, hostName: '浩宇', host: '192.168.31.38', port: 18990, members: 2, secretRequired: false, ts: clock }))

  discovery._handlePacket(packet('room-1'), { address: '192.168.31.2' })
  assert.equal(discovery.listRooms().length, 1)
  assert.equal(events[0].existed, false)

  // T0.3：TUN 反射复制 → 同一报文重复到达，去重不重复计房
  discovery._handlePacket(packet('room-1'), { address: '198.18.0.1' })
  assert.equal(discovery.listRooms().length, 1)
  assert.equal(events.length, 2)
  assert.equal(events[1].existed, true)

  // 成员数变化 → 刷新同一键
  clock += 1000
  const updated = JSON.parse(packet('room-1').toString('utf8'))
  updated.members = 4
  discovery._handlePacket(Buffer.from(JSON.stringify(updated)), { address: '192.168.31.2' })
  assert.equal(discovery.listRooms().length, 1)
  assert.equal(discovery.listRooms()[0].members, 4)

  discovery._handlePacket(packet('room-2'), { address: '192.168.31.9' })
  assert.equal(discovery.listRooms().length, 2)

  await discovery.stop()
})

test('Discovery：失效窗口（3 周期 = 6s）后房间自动下线', async () => {
  const fake = makeFakeSocket()
  let clock = 2_000_000
  const discovery = createDiscovery({ socketFactory: () => fake, now: () => clock })
  await discovery.start()
  discovery._handlePacket(Buffer.from(JSON.stringify({ type: 'room_announce', roomId: 'gone', roomName: 'x', hostName: 'y', host: '10.0.0.5', port: 18990, members: 1, secretRequired: false, ts: clock })), {})
  assert.equal(discovery.listRooms().length, 1)
  clock += 6_001 // 仅超过失效窗口；报文 ts 旧不影响（按接收时刻 seenAt 判定）
  assert.deepEqual(discovery.listRooms(), [])
  await discovery.stop()
})

test('Discovery：畸形报文（非 JSON / 非 room_announce / 缺字段）被忽略不抛', async () => {
  const fake = makeFakeSocket()
  const discovery = createDiscovery({ socketFactory: () => fake })
  await discovery.start()
  discovery._handlePacket(Buffer.from('not-json'), {})
  discovery._handlePacket(Buffer.from(JSON.stringify({ type: 'other' })), {})
  discovery._handlePacket(Buffer.from(JSON.stringify({ type: 'room_announce', roomId: 'x' })), {})
  assert.deepEqual(discovery.listRooms(), [])
  await discovery.stop()
})

test('pickLanAddress：优先正常网卡，TUN(198.18.*) 仅作兜底，全空返回 null', () => {
  const ifaces = {
    'Meta TUN': [{ family: 'IPv4', address: '198.18.0.1', internal: false }],
    '以太网': [{ family: 'IPv4', address: '192.168.31.38', internal: false }],
    'Loopback Pseudo-Interface 1': [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
  }
  assert.equal(pickLanAddress([], ifaces), '192.168.31.38')

  const onlyTun = { 'Meta TUN': ifaces['Meta TUN'] }
  assert.equal(pickLanAddress([], onlyTun), '198.18.0.1')

  assert.equal(pickLanAddress([], {}), null)
  // 显式排除后回退
  assert.equal(pickLanAddress(['192.168.31.38'], ifaces), '198.18.0.1')
})
