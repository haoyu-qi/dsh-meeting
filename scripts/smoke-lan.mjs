/**
 * T1.3 真实 socket 烟测：Announcer → 组播 → Discovery 全链路（同机环回/本机网卡）。
 * 用法：node scripts/smoke-lan.mjs ；成功输出 LAN SMOKE: PASS 并以 0 退出。
 */
import { createAnnouncer, createDiscovery, pickLanAddress } from '../src/host/lan.js'

const host = pickLanAddress() ?? '127.0.0.1'
const discovery = createDiscovery({
  membershipInterface: host,
  log: (m) => console.error('[discovery]', m),
})
const announcer = createAnnouncer({
  roomId: 'smoke-room',
  roomName: 'T1.3 烟测房间',
  hostName: '烟测',
  host,
  port: 18990,
  members: 3,
  intervalMs: 500,
  log: (m) => console.error('[announcer]', m),
})

const deadline = Date.now() + 8000
async function main() {
  await discovery.start()
  await announcer.start()
  let seen = null
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 300))
    seen = discovery.listRooms().find((r) => r.roomId === 'smoke-room')
    if (seen) break
  }
  await announcer.stop()
  await discovery.stop()
  if (!seen) {
    console.error('LAN SMOKE: FAIL —— 8s 内未收到 smoke-room 公告')
    process.exitCode = 1
    return
  }
  console.log('LAN SMOKE: PASS')
  console.log(JSON.stringify(seen, null, 2))
}

main().catch((err) => {
  console.error('LAN SMOKE: ERROR', err)
  process.exitCode = 1
})
