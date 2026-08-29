/**
 * Meeting Host Plugin（骨架占位）
 *
 * 开发模式：在 DSH 会话中通过动态插件（cordis_define）载入等价代码快速迭代，
 * 验证通过的逻辑回填到本目录模块化沉淀。禁止 import/require 之外的第三方依赖
 * 进入插件运行时（动态插件环境是受限沙箱，可用全局以 Builtin.listBuiltins 为准）。
 *
 * 模块规划（对应 docs/prd-v0.1.md §12）：
 *  - room/       RoomService：create/join/leave、成员注册表、Host 退出散会（T1.1）
 *  - lan/        UDP 组播 announce（T1.3，报文见 docs/protocol.md）
 *  - signaling/  ws 信令服务器：JOIN/LEAVE/MEMBER_LIST/RTC_*（T1.2）
 *  - context/    MeetingContextService：members/screen/messages/topic（T3.1）
 *  - tools/      meeting_get_context / get_members / get_transcript / get_screen（T3.3）
 */
export function createMeetingHostPlugin() {
  return {
    apply(ctx) {
      // TODO(T1.1): RoomService —— 见 docs/dev-plan-v0.1.md §4
      void ctx
    },
  }
}
