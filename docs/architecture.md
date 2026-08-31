# V0.1 技术架构

## 设计决策

媒体和业务状态分离：

```text
浏览器 A <- WebRTC 媒体流 -> 浏览器 B
    |                            |
    +------ WebSocket 信令 ------+
                  |
             Node Host
                  |
        房间状态与会议上下文
```

Node Host 不转发音视频，只负责：

- 提供静态客户端
- 维护房间和成员状态
- 转发 SDP 与 ICE 信令
- 聚合会议上下文
- 暴露 Agent 任务状态

这样可以控制首版复杂度，也避免发起人的上行带宽承担所有媒体流。

## 协议范围

客户端消息：

- `rooms:list`
- `room:create`
- `room:join`
- `room:leave`
- `signal`
- `media:update`
- `transcript:add`
- `agent:request`

服务端核心消息：

- `session:ready`
- `rooms:snapshot`
- `room:state`
- `room:left`
- `signal`
- `error`

所有文本在 Host 端进行控制字符清理和长度限制。信令只允许在同一房间成员之间转发。

## 后续接口边界

真实 Harness 集成建议保持一个窄接口：

```text
getMeetingContext(roomId)
submitAgentTask(roomId, prompt, context)
publishAgentState(roomId, state)
```

Meeting Plugin 只提供上下文，不重复实现文件编辑、Terminal、Git、权限确认和 Diff。

## DSH 插件封装

`dsh-meeting` 同时提供两个 face：

- Node face 通过 Cordis effect 启动/停止 HTTP 与 WebSocket Host。
- Browser face 注册 `shell.overlay`，直接渲染原生 React 会议工作区，并将 DSH 原文字交互收窄为右侧栏。

`cordis.patch.yml` 只插入一个配置行，因此安装和卸载都是原子的，不修改 DSH 源码。
