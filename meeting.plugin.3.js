/**
 * dsh-meeting-plugin 组合行入口 v2（ADR-0001）
 *
 * 用户 preset（%DSH_HOME%\.agent-presets\meeting\，DSH_HOME 默认被部署指向
 * AppData\Roaming\dsh-desktop\harness）的 meeting isolate 组内，行 name 指向
 * 本文件的绝对路径；loader 取 default 导出应用为插件。
 *
 * 缓存备注：宿主进程按模块 URL 缓存 ESM——改了 src/host 后需把本文件与
 * preset 行名一起升版本号（meeting.plugin.N.js），否则 mount 仍用旧代码。
 *
 * 行为：只 provide 'meeting' 服务，不自动开房；房间由 UI/Agent 显式
 * meeting.createRoom() 创建（信令与组播随房间启停）。
 */
import { createMeetingHostPlugin } from './src/host/index.js?v=3'

const meeting = createMeetingHostPlugin({
  roomName: '协作讨论',
  hostName: 'Host',
  secret: null,
})

export default meeting
