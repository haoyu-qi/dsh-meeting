/**
 * Meeting Client Plugin（骨架占位）
 *
 * 运行于 DSH 浏览器页面（localhost 安全上下文）。UI 必须注册在查询过的 Slot 中
 * （协作大厅 / 协作侧边栏 / 协作视图，见 docs/prototype-v0.1.md）；React 代码使用
 * React.createElement，禁止 JSX。
 *
 * 模块规划（对应 docs/prd-v0.1.md §12）：
 *  - panels/     协作大厅（T1.4）/ 协作侧边栏（T1.5）/ 协作视图（T2.5）
 *  - webrtc/     RTCPeerConnection Mesh 管理器（T2.1）
 *  - media/      getUserMedia / getDisplayMedia 采集（T2.2/T2.4）
 *  - theme/      主题 token 适配，禁止硬编码色值
 */
export function createMeetingClientPlugin() {
  return {
    apply(ctx) {
      // TODO(T1.4): 协作大厅 UI —— 见 docs/dev-plan-v0.1.md §4
      void ctx
    },
  }
}
