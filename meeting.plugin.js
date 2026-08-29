/**
 * dsh-meeting-plugin 组合行入口（ADR-0001）
 *
 * 用户 preset（~/.dsh/.agent-presets/meeting/）的 meeting isolate 组内，
 * 行 name 指向本文件的绝对路径；loader 按 default 导出应用为插件。
 *
 * 行为：只 provide 'meeting' 服务，不自动开房；房间由 UI/Agent 显式
 * meeting.createRoom() 创建（信令与组播随房间启停）。
 */
import { createMeetingHostPlugin } from './src/host/index.js'

const meeting = createMeetingHostPlugin({
  roomName: '协作讨论',
  hostName: 'Host',
  secret: null,
})

export default meeting
