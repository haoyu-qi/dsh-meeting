# DSH Meeting

> DeepSeek Harness Meeting Plugin —— 面向企业内部研发团队的局域网多人实时协作插件。
>
> **会议不是独立应用，而是 Agent 的一种实时上下文来源。**

[![status](https://img.shields.io/badge/status-V0.1%20需求阶段-informational)]() [![DeepSeek Harness](https://img.shields.io/badge/platform-DeepSeek%20Harness-blue)]()

## 一句话定义

通过 DeepSeek Harness Meeting Plugin，为企业内部研发团队提供**无需独立会议服务器**的局域网 P2P 实时语音和屏幕协作能力，并将实时会议转写、共享屏幕和成员信息统一转换为 **Meeting Context** 注入 DeepSeek Harness，使 Coding Agent 能够直接理解多人讨论内容，并基于当前 Workspace 延续执行开发任务。

**交互主线**：`进入协作 → 看同一个问题 → Agent 理解上下文 → Agent 接手执行`。不做传统会议软件的"入会、摄像头、成员宫格"；首版只有 **3 个核心界面**（协作大厅 / 协作侧边栏 / 共享屏幕视图），其余全部复用 Harness。

## 解决什么问题

团队开发中大量需求和技术决策产生于多人沟通，而现有 Agent 不知道"刚才"讨论了什么：

- 谁提出了什么问题、形成了什么决策；
- 当前共享的是什么页面、讨论的是哪个文件。

用户被迫反复向 Agent 复制、转述上下文。本插件打通：

```
多人讨论 + 语音 + 共享屏幕 + Workspace + Coding Agent → 统一开发上下文
```

## V0.1 功能范围

| 优先级 | 模块 | 内容 |
|---|---|---|
| P0 | 基础协作 | 创建房间、LAN 自动发现（UDP Multicast）、一键加入、成员列表、Host 退出结束会议 |
| P0 | RTC | WebRTC P2P Mesh 多人语音、麦克风开关、屏幕共享与查看 |
| P0 | Agent | Meeting Context、Transcript、Agent 会议工具（get_context / get_members / get_transcript / get_screen）、Agent 状态显示 |
| P0 | Harness 联动 | `Meeting Context → Agent → Workspace → 执行` 闭环："Agent，把刚才讨论的问题改一下" 直接跑通 |
| P1 | 增强 | 实时 ASR、Speaker 区分、Screen VLM、决策/任务识别（仅建议）、会议总结、Transcript 持久化 |

明确不做（V0.1）：独立客户端、手机端、摄像头视频、公网会议、TURN/SFU/MCU、云录制、Host 迁移、多 Agent、白板、文件共享。

## 架构

```
DeepSeek Harness
├── 原生能力：Agent / Workspace / File / Terminal / Git / Session / Permission
└── Meeting Plugin
    ├── Room（房间 / 成员 / 状态）
    ├── LAN Discovery（UDP Multicast 自动发现）
    ├── WebRTC（Voice + Screen，P2P Mesh，媒体不经 Host 转发）
    ├── Transcript（实时会议转写）
    ├── Meeting Context（会议上下文 → 注入 Agent）
    └── Meeting UI（Harness 扩展区域）
```

- **Meeting Host**：发起人实例临时承担 Room Coordinator + Signaling + Member Registry + Meeting Context；不转发媒体。
- **Host 退出 = 会议结束**（V0.2 再考虑 Host Migration）。

## 仓库规划

对应 PRD 模块划分，后续按包拆分：

```
dsh-meeting/
├── docs/                  # 需求与技术文档
├── meeting-core           # Room / Member / State
├── meeting-lan            # Discovery
├── meeting-rtc            # WebRTC / Voice / Screen
├── meeting-context        # Transcript / Screen / Decision / Task
├── meeting-tools          # Agent Tools
└── meeting-ui             # Room / Members / Share / Controls
```

## 版本路线

| 版本 | 主题 |
|---|---|
| V0.1 | LAN Agent Meeting：LAN + Voice + Screen + Meeting Context + Harness Agent |
| V0.2 | Development Collaboration：摄像头、Host Migration、IDE Context、Task Board |
| V0.5 | Multi-Agent Collaboration：Coding / Review / Test Agent |
| V1.0 | Agent Collaboration Protocol：接入更多 Agent Runtime |

## 文档

- [V0.1 需求整理](docs/prd-v0.1.md) —— 含功能明细、数据协议、验收标准与开放问题清单
- [V0.1 交互设计](docs/interaction-v0.1.md) —— 一条核心闭环 + 两个辅助入口；3 个核心界面、Agent 三种介入方式与三大关键瞬间
- [V0.1 原型设计](docs/prototype-v0.1.md) —— 高保真原型逐屏规格（浅色流程板 + 深色 6 屏集成稿）与新增细节回填清单
- [MVP 开发计划](docs/mvp-plan.md) —— 里程碑 M0~M4、分层选型、开源基线评估与风险对策
- [V0.1 开发计划](docs/dev-plan-v0.1.md) —— 任务分解（WBS）、人日估算、Go/No-Go 检查点与联调节奏

## 开发

项目处于需求阶段，技术选型与工程骨架待定（见需求文档 §17 开放问题）。
