# DeepSeek Harness Meeting Plugin V0.1 — 需求整理

> 本文档由 44 节原始 PRD 整理而来：去重、按"定位 → 边界 → 架构 → 流程 → 需求明细 → 数据与协议 → 安全 → 验收 → 路线"重组，原始信息全部保留；文末补充了原 PRD 未定的开放问题清单。

---

## 1. 一句话需求定义

> 通过 DeepSeek Harness Meeting Plugin，为企业内部研发团队提供无需独立会议服务器的局域网 P2P 实时语音和屏幕协作能力，并将实时会议转写、共享屏幕和成员信息统一转换为 Meeting Context 注入 DeepSeek Harness，使 Coding Agent 能够直接理解多人讨论内容，并基于当前 Workspace 延续执行开发任务。

## 2. 产品定位

- **名称**：DeepSeek Harness Meeting Plugin（中文名暂定：Agent 实时协作插件）
- **形态**：DSH 上的一个插件（`DeepSeek Harness + Meeting Plugin`），不是独立会议软件
- **核心理念**：**会议不是独立应用，而是 Agent 的一种实时上下文来源**
- **不重复建设**：不重新开发会议客户端，不重新实现 Coding Agent、文件操作、Terminal、Git 等能力，全部复用 Harness 现有环境

## 3. 要解决的问题

团队开发中大量需求和技术决策产生于多人沟通（例：产品说"验证码先做前端"→ 前端说"接口没完成"→ 产品说"那先 Mock"），而现有 Agent 不知道：

- "刚才"讨论了什么、谁提出了什么问题；
- 当前共享的是什么页面、讨论的是哪个文件；
- 会议形成了什么决策。

用户被迫把需求、代码、日志重新复制给 Agent。本产品要打通：

```
多人讨论 + 语音 + 共享屏幕 + Workspace + Coding Agent → 统一开发上下文
```

## 4. 目标用户与环境

| 项 | 内容 |
|---|---|
| 用户 | 产品经理、前端、后端、测试、技术负责人、AI 开发人员 |
| 环境 | 企业内部同一办公局域网 |
| 规模 | 首版 2~6 人，最大建议 8 人以内 |

## 5. 产品边界（V0.1 明确不做什么）

**产品形态**：不做 Windows/macOS 客户端、移动 APP、独立 Web 会议系统。

**媒体架构**：不建 MCU / SFU / TURN / 中心音视频服务器，参会人之间用 **WebRTC P2P Mesh** 直传音视频和屏幕。

**能力复用**（不在插件内重复实现）：Repository 读取、文件搜索/编辑、Patch、Terminal、Git、Agent Loop、模型调用、权限确认——Meeting Plugin 只提供**实时会议上下文**。

**暂不实现清单**：独立客户端 / 手机端 / 摄像头多人视频 / 公网会议 / TURN / SFU / MCU / 云录制 / 企业通讯录 / 会议预约 / 大型会议 / 远程桌面 / Host 迁移 / 多 Agent / 白板 / 文件共享。

## 6. V0.1 产品目标（三个核心价值）

1. **快速进房**：无需部署会议服务器，`创建房间 → 自动发现 → 一键加入`；
2. **Agent 理解会议**：能获取参会人员、实时转写、最近讨论、当前共享屏幕、当前讨论问题；
3. **Agent 延续开发**：Meeting Context + Workspace Context 组合，用户说"把刚才讨论的方案实现一下"即可继续执行，无需重新描述上下文。

## 7. 总体架构

```
DeepSeek Harness
├── 原生能力：Agent / Workspace / File / Terminal / Git / Session / Permission
└── Meeting Plugin
    ├── Room（房间 / 成员 / 状态）
    ├── LAN Discovery（局域网自动发现）
    ├── WebRTC（Voice + Screen，P2P Mesh）
    ├── Transcript（实时会议转写）
    ├── Meeting Context（会议上下文）
    └── Meeting UI（右侧/顶部扩展区域）
```

### 7.1 Meeting Host 角色

会议发起人的 Harness 实例临时承担：**Room Coordinator + Signaling + Member Registry + Meeting Context**；不承担音频/视频/屏幕转发（媒体 P2P 直连）。

### 7.2 Host 退出策略

- V0.1：**Host 退出 → 会议结束**，其他成员提示"会议发起人已退出，本次协作会议已结束"；
- V0.2 再考虑 Host Migration。

### 7.3 媒体与数据通道

| 通道 | 技术 | 用途 |
|---|---|---|
| 媒体 | WebRTC MediaStream | Audio、Screen（N 人 Mesh，媒体不经 Host 转发） |
| 协作状态 | RTCDataChannel | Meeting Event、Agent Status、Chat、Screen State、Task |

## 8. 核心业务流程

### 8.1 发起会议
`创建协作房间 → 生成 Room ID → 启动本地房间协调（含 Signaling）→ 局域网广播 → 进入会议`

### 8.2 局域网自动发现（UDP Multicast）
Host 定期广播：

```json
{"type":"room_announce","roomId":"abc123","roomName":"登录模块讨论","host":"192.168.1.36","port":18990,"members":3}
```

其他客户端自动展示"附近协作房间"（名称 · 发起人 · 人数 · [加入]），无需输入 IP / 服务器 / 配置会议平台。

### 8.3 加入会议
`连接 Host → 获取成员列表 → 经 Host 信令交换 offer/answer/ice 建立 WebRTC → 同步房间状态 → 进入会议`（成员列表含 👤成员 + 🤖Agent）

### 8.4 Local Signaling（Host 本地轻量信令）
只负责：`JOIN / LEAVE / MEMBER_LIST / RTC_OFFER / RTC_ANSWER / ICE_CANDIDATE`，不负责媒体。

### 8.5 会议中核心闭环（V0.1 必须完整跑通的 Demo）

```
A 打开 Harness → 创建房间 → B、C 自动发现并加入 → 多人语音
→ B 共享 VS Code → 团队讨论 Bug → 实时转写 → Agent 获得会议上下文
→ 用户："Agent，看看刚才的问题" → Agent 结合 Workspace 分析、定位代码
→ 用户："直接改掉" → Agent 修改代码 → 执行测试 → 展示结果
```

### 8.6 会议结束
Host 退出即结束；会议结束后自动生成：会议摘要、技术决策、开发任务、Agent 执行记录（总结生成为 P1）。

## 9. 功能需求明细

### P0-1 基础协作

| 功能 | 说明 |
|---|---|
| 插件安装 | 以 Harness 插件形态安装运行 |
| Meeting UI | Harness 右侧/顶部扩展区域：成员列表、麦克风/屏幕共享控制、Agent 状态 |
| 创建房间 | 一键创建，生成 Room ID |
| LAN 自动发现 | Multicast 广播 + 附近房间列表 |
| 加入房间 | 一键加入，同步成员与房间状态 |
| 成员列表 | 实时显示 👤成员 + 🤖Agent |
| Host 退出结束 | Host 离开 → 全员收到结束提示 |

UI 布局参考：Workspace（左）｜Agent（中）｜Meeting 成员/麦克风/屏幕共享/Agent 状态（右），底部 Terminal / Tool Calls / Diff 不变。

### P0-2 RTC

- WebRTC P2P Mesh 多人连接；
- 多人语音、麦克风开/关、当前发言状态；
- 屏幕共享：可共享浏览器标签页 / IDE / Terminal / 应用窗口 / 整个屏幕；
- 共享屏幕查看（远端渲染）；
- 优先级：**共享屏幕 > 语音 > 摄像头**（摄像头 V0.1 不做；研发协作核心是"看代码 + 讨论问题"）。

### P0-3 Agent 上下文

- Meeting Context 数据结构（见 §10.1）；
- Transcript（speaker + timestamp + text）；
- Agent 可获取：会议上下文 / 成员 / 转写 / 共享屏幕；
- Agent 状态显示（见 §11.4）。

### P0-4 Harness 联动闭环

`Meeting Context → Harness Agent → Workspace → Agent 执行`（文件、搜索、Terminal、Diff、权限全部沿用 Harness 原有体系）。验收句：**"Agent，把刚才讨论的问题改一下。"** 必须能跑通。

### P1（第二优先级）

实时 ASR ｜ Speaker 区分 ｜ Screen VLM ｜ 决策识别 ｜ Task 识别 ｜ 会议总结 ｜ Transcript 保存。
（任务/决策识别首版**只生成建议，不自动执行**。）

## 10. 核心数据结构

### 10.1 Meeting Context（最核心）

统一包含：Room、Members、Transcript、Shared Screen、Messages、Decisions、Tasks。

```json
{
  "room": {"name": "登录模块讨论"},
  "members": ["浩宇", "张伟", "李强"],
  "recentTranscript": [
    {"speaker": "浩宇", "text": "验证码先做前端。"},
    {"speaker": "张伟", "text": "接口还没有完成。"}
  ],
  "screen": {"owner": "张伟", "source": "VS Code"}
}
```

### 10.2 Transcript 条目

```json
{"speaker": "浩宇", "timestamp": 1787991601, "text": "验证码接口暂时先 Mock。"}
```

转写链路：`Mic → VAD → ASR → Speaker → Transcript`。

### 10.3 Screen Context

- 链路：`屏幕共享 → 定时抽帧 → 图片 → VLM → Screen Context`；
- 普通状态 **0.2~1 FPS**；用户说"Agent，看这里"时短时提高抽帧频率；
- 内容：共享人 / 共享窗口 / 当前应用 / 截图 / 时间戳；后续识别：当前文件、代码区域、错误信息、Terminal 输出；
- 首版不要求 Agent 实时理解完整视频流。

### 10.4 统一事件协议（Signaling + DataChannel）

```json
{"id": "uuid", "type": "meeting.event", "sender": "user01", "timestamp": 1787991601, "payload": {}}
```

首版事件：`room.join` / `room.leave` / `member.join` / `member.leave` / `rtc.offer` / `rtc.answer` / `rtc.ice` / `screen.start` / `screen.stop` / `agent.status` / `meeting.transcript`。

## 11. Agent 集成

### 11.1 统一 Meeting Service

暴露 `ctx.meeting`：`createRoom()` / `joinRoom()` / `leaveRoom()` / `getMembers()` / `getContext()` / `getTranscript()` / `getSharedScreen()`。

### 11.2 Agent Tools

V0.1：`meeting_get_context` / `meeting_get_members` / `meeting_get_transcript` / `meeting_get_screen`。
后续：`meeting_send_message` / `meeting_create_task` / `meeting_get_decisions`。

### 11.3 Context 注入格式

Agent 执行任务时组合 Meeting Context + Workspace Context：

```
Current Meeting
Participants: 浩宇、张伟、李强
Recent Discussion: （最近转写）
Current Screen: VS Code
Current Project: login-system
```

### 11.4 Agent 状态机（会议区域展示）

`IDLE / LISTENING / THINKING / READING_SCREEN / READING_CODE / EXECUTING / WAITING_CONFIRM / COMPLETED / ERROR`（默认展示"● 正在听取会议"）。

### 11.5 任务与决策识别（P1，仅建议不自动执行）

- 任务示例：讨论"那前端先把验证码 UI 做了""可以" → 生成"检测到开发任务：实现验证码 UI ［让 Agent 实现］"；
- 决策触发词：确定 / 就这么做 / 第一版先这样 / 暂时采用 / 后续再处理 → 形成 Decision（如"验证码接口第一版使用 Mock"）。

## 12. 模块划分

```
meeting-plugin
├── meeting-core      # Room / Member / State
├── meeting-lan       # Discovery
├── meeting-rtc       # WebRTC / Voice / Screen
├── meeting-context   # Transcript / Screen / Decision / Task
├── meeting-tools     # Agent Tools
└── meeting-ui        # Room / Members / Share / Controls
```

## 13. 安全原则

- **房间安全**：至少提供 `Room ID + Room Secret`；
- **Agent 权限**：完全沿用 Harness 原有权限体系，插件不绕过文件权限、Shell 权限、Agent 操作确认；
- **数据边界**：默认只向 Agent 提供当前会议、当前共享屏幕、当前 Harness Workspace；不得访问其他项目目录、用户私人目录、系统 Credential、SSH Key、非项目 Secret。

## 14. 验收标准（V0.1）

| 维度 | 标准 |
|---|---|
| 协作 | 同一 LAN 内至少 **3 个 Harness 实例**能创建、发现、加入同一个房间 |
| RTC | 至少 **3 人稳定语音 + 1 路屏幕共享** |
| Context | Agent 能正确获得：成员、最近会议内容、当前共享屏幕状态 |
| Agent | 用户说"按照刚才讨论的方案修改"，Agent 无需再次完整描述需求即可理解任务 |
| Coding | Agent 继续使用 Harness 原有 文件 / 搜索 / Terminal / Diff / 权限 完成开发 |

## 15. 版本路线

| 版本 | 主题 | 内容 |
|---|---|---|
| V0.1 | LAN Agent Meeting | LAN + Voice + Screen + Meeting Context + Harness Agent |
| V0.2 | Development Collaboration | 摄像头、Host Migration、IDE Context（Cursor / Selected Code / Terminal Context）、Task Board |
| V0.5 | Multi-Agent Collaboration | Coding Agent + Review Agent + Test Agent |
| V1.0 | Agent Collaboration Protocol | 从单一插件抽象为协议，接入 DeepSeek Harness / Claude Code / Codex / OpenCode 等 Agent Runtime |

## 16. 产品核心原则

1. **不重复建设 Harness 已有能力**——插件只解决多人实时协作和会议上下文；
2. **不做传统会议软件**——重点是"人正在讨论什么 + 人正在看什么 + Agent 正在处理什么"，不是高清视频、虚拟背景、大型会议；
3. **Agent 必须能延续会议上下文**——用户不需要再次解释"刚才发生了什么"；
4. **首版优先跑通开发闭环**——局域网协作 → 语音 → 屏幕共享 → Meeting Context → Agent 理解 → Agent 执行。

## 17. 开放问题（整理时补充，原 PRD 未定）

1. **ASR 选型**：本地（whisper 类）还是云端 API？延迟、成本、离线要求需定；
2. **Speaker 区分方式**：Mesh 架构下每路音频流天然可按来源区分，是否还需要声纹；
3. **转写位置**：Host 汇聚转写 vs 各端本地转写后广播文本（后者省带宽但要求本地 ASR）；
4. **VLM 选型**与抽帧图片送入模型的方式（文件 / base64 / Tool card）；
5. **Room Secret 分发机制**：PRD 只要求"ID + Secret"，未定加入时如何安全交换（口令 / 二维码？）；
6. **UDP Multicast 可行性**：Windows/macOS 防火墙、企业 AP 隔离、组播被禁时的兜底（如手动 IP 直连）；
7. **Host 信令端口**（如 18990）冲突检测与防火墙放行策略；
8. **DSH 客户端环境**对 getUserMedia / getDisplayMedia 的可用性与权限确认；
9. **Transcript / 会议总结持久化位置**（Workspace 内文件 / Session 记录）；
10. **8 人 Mesh 上限评估**：每端 7 条连接的上行带宽与 CPU。
