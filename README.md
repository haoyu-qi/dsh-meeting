# DSH Meeting

DSH Meeting 是一个面向 Coding Agent 的局域网实时协作原型。它把多人音视频、屏幕共享、会议讨论和 Agent 任务放在同一个浏览器工作区中。

当前版本验证一条核心闭环：

```text
创建或加入协作
  -> 语音、摄像头或屏幕共享
  -> 记录讨论与决策
  -> Agent 读取最近会议上下文
  -> 生成可继续交给 Harness 的开发任务
```

## 安装到 DSH

要求 DSH `0.1.0-rc.6` 或更高版本。在本项目目录执行：

```bash
dsh plugin --profile web add .
dsh --profile web
```

启动后，DSH Web 右上角会出现“实时协作”入口。默认会议服务监听 `0.0.0.0:4173`。
打开后，Meeting 会作为原生 React 模块占据主工作区，DSH 原文字交互保留为右侧栏，不使用 iframe。

检查插件是否进入配置：

```bash
dsh --profile web --dump-config
```

卸载：

```bash
dsh plugin --profile web remove dsh-meeting
```

## 独立运行

要求 Node.js 20 或更高版本。

```bash
npm install
npm start
```

Host 会输出本机地址和局域网地址。发起人打开本机地址，其他成员在同一局域网中打开对应 IP 地址即可加入。

默认端口为 `4173`，可以通过环境变量修改：

```bash
PORT=5000 npm start
```

摄像头、麦克风和屏幕共享受浏览器安全上下文限制：Host 所在电脑请使用
`http://localhost:4173`；其他局域网设备需通过已受信任的 HTTPS 反向代理访问。普通
`http://<局域网 IP>:4173` 可用于会议上下文和信令，但浏览器不会开放上述媒体权限。

## 已实现

- 局域网可访问的 Node HTTP 与 WebSocket Host
- 创建、发现、加入和退出协作房间
- 多成员状态、房主迁移与断线清理
- WebSocket 同源校验、消息上限与浏览器安全响应头
- WebRTC P2P 信令与完美协商
- 麦克风、摄像头和屏幕共享
- 最近 60 条会议上下文
- 当前讨论主题自动更新
- Agent 任务状态与基于上下文的演示结果
- 明暗主题、移动端布局、键盘焦点和完整空状态

## 验证

```bash
npm run check
npm test
```

## 目录

```text
src/host/protocol.js    消息校验与文本清理
src/host/room-store.js  房间、成员与会议上下文状态
src/host/server.js      HTTP、WebSocket 和信令转发
src/plugin/index.js     Cordis Host 插件与生命周期
src/client/index.html   产品界面结构
src/client/styles.css   主题、响应式与组件样式
src/client/app.js       房间交互与 WebRTC 客户端
lib/client.js           DSH Web shell 入口 bundle
cordis.patch.yml        DSH bundle 配置补丁
test/                   协议、状态模型和双客户端集成测试
```

## 当前边界

- 房间与上下文保存在 Host 内存中，进程重启后清除。
- WebRTC 当前不配置 STUN/TURN，目标是同一局域网原型。
- Agent 处理目前是可验证的上下文闭环，不调用真实模型或 Harness API。
- 浏览器需要在安全上下文中使用摄像头和麦克风。本机 `localhost` 可直接使用；其他设备若被浏览器限制，需要为 Host 配置 HTTPS。
- 首版采用 Mesh，适合 2-6 人验证，不适合大型会议。

下一阶段应优先接入真实 ASR 和 Harness 上下文接口，再决定是否增加 mDNS 自动发现、持久化和 TURN 兜底。
