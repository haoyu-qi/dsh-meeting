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

所有文本在 Host 端进行控制字符清理和长度限制。`media:update` 要求 `audio`、`camera`、`screen` 都为布尔值；`signal` 要求有效目标与 SDP 或 ICE 对象，并且只允许向同一房间的其他成员转发。

## 状态与生命周期约束

- 创建或加入房间前先校验目标；失败不更改原房间成员关系和姓名。切换成功后同时通知新旧房间。
- 每个房间同一时间只接受一个 Agent 演示任务，重复请求返回 `AGENT_BUSY`。结果读取提交时的上下文快照，后续讨论不会改变正在处理的任务依据。
- 房间删除或 Host 停止时取消待执行任务；停止服务时终止所有 WebSocket，避免不响应关闭握手的客户端阻塞插件卸载。
- Host 在监听成功后启动 30 秒一次的 ping/pong 检测。连接未响应上一次 ping 时会在下一轮终止，并清理成员状态。
- 两套客户端在退出、切换房间、断线时清理媒体和 PeerConnection。媒体获取携带生命周期编号；权限弹窗晚于退出返回时立即停止返回的轨道。同一种设备的权限请求不重复发起。
- 连接失败的重试间隔为 1.2、2.4、4.8 秒逐步递增，上限 15 秒。重新连通后回到大厅，不自动恢复房间或设备权限。
- 静态资源只接受 GET/HEAD，非法 URL 编码返回 400，目录越界返回 403，不支持的方法返回 405。

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
