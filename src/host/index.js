/**
 * Meeting Host 插件入口 —— 组合行加载的包入口（ADR-0001）
 *
 * Cordis 插件形态：apply(ctx) 里 provide 'meeting' 服务（PRD §33 统一 Meeting Service）。
 * 服务实现委托给 RoomService（room.js）与 Announcer/Discovery（lan.js）；
 * 信令（signaling.js，T1.2）由该 facade 负责启停与接线。
 *
 * 组合行示例（本地 preset 的 meeting isolate 组内）：
 *   - id: meeting-host
 *     name: dsh-meeting-plugin
 *     config: { roomName, hostName, secret }
 */
import { RoomService } from './room.js'
import { createAnnouncer, createDiscovery, pickLanAddress } from './lan.js'
import { SIGNALING_PORT, ANNOUNCE_ADDRESS, ANNOUNCE_PORT, ANNOUNCE_TTL, ANNOUNCE_INTERVAL_MS } from './protocol.js'

export function createMeetingHostPlugin(options = {}) {
  const {
    roomName = '协作讨论',
    hostName = 'Host',
    secret = null,
    lanAddress = pickLanAddress(),
    signalingPort = SIGNALING_PORT,
  } = options

  return {
    /**
     * @param {object} ctx 受限 Cordis 上下文（provide/on/effect）
     */
    apply(ctx) {
      /** @type {RoomService | null} */
      let room = null
      /** @type {ReturnType<typeof createAnnouncer> | null} */
      let announcer = null
      /** @type {ReturnType<typeof createDiscovery> | null} */
      let discovery = null

      // 注意：apply() 的返回值会被 Cordis 当作 effect 校验（函数/disposer/可迭代），
      // 返回普通对象会抛 Invalid effect——provide() 已注册服务，这里不返回任何值。
      const api = {
        /** 当前是否已开房 */
        get inRoom() { return room !== null && !room.closed },

        /** 创建协作房间（Host 即本实例）；startAnnounce 控制是否对外广播 */
        async createRoom({ id, name, isSecret = false, announce = true } = {}) {
          if (room && !room.closed) throw new Error('已在一个房间中，请先退出')
          room = new RoomService({
            roomId: id,
            roomName: name ?? roomName,
            hostName,
            secret: isSecret ? secret : null,
          })
          if (announce) {
            announcer = createAnnouncer({
              roomId: room.roomId,
              roomName: room.roomName,
              hostName,
              host: lanAddress,
              port: signalingPort,
              members: room.memberCount,
              secretRequired: isSecret && secret !== null,
              address: ANNOUNCE_ADDRESS,
              announcePort: ANNOUNCE_PORT,
              ttl: ANNOUNCE_TTL,
              intervalMs: ANNOUNCE_INTERVAL_MS,
            })
            await announcer.start()
          }
          return { roomId: room.roomId, roomName: room.roomName }
        },

        /** 附近协作房间列表（发现平面） */
        async listNearbyRooms() {
          if (discovery === null) return []
          return discovery.listRooms()
        },

        /** 加入本地房间成员（真实跨机加入由信令层完成；此 API 供本机 Agent/UI 读写房间态） */
        getRoomSnapshot() {
          if (room === null) return null
          return { roomId: room.roomId, roomName: room.roomName, closed: room.closed, members: room.listMembers() }
        },

        /** 退出/结束协作（Host 调用即散会，PRD §7.2） */
        async leaveRoom() {
          if (room === null) return { ended: false }
          const result = room.leave(room.hostId)
          if (announcer) { await announcer.stop(); announcer = null }
          room = null
          return { ended: result.ended }
        },

        /** 暴露给信令层/测试的内部件（组合行内信令接线用） */
        __internals: {
          get room() { return room },
          get discovery() { return discovery },
          lanAddress,
          signalingPort,
        },
      }

      ctx.provide('meeting', api)

      // 生命周期：Fiber 卸载时停广播、停发现（组合行卸载即回收）。
      // effect 清理器必须是同步函数；异步停机 fire-and-forget 吞掉卸载竞态拒绝。
      ctx.effect(() => () => {
        if (announcer) announcer.stop().catch(() => {})
        if (discovery) discovery.stop().catch(() => {})
        room = null
        announcer = null
        discovery = null
      })

      // 注意：apply() 的返回值会被 Cordis 当作 effect 校验（须为函数/null/可迭代），
      // 返回普通对象会抛 Invalid effect——provide() 已注册服务，这里不返回任何值。
    },
  }
}
