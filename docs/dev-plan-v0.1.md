# DSH Meeting V0.1 开发计划（初版）

> 上游文档：[mvp-plan.md](mvp-plan.md)（选型与里程碑依据）、[prd-v0.1.md](prd-v0.1.md)（验收标准 §14）、[prototype-v0.1.md](prototype-v0.1.md)（UI 规格）。
>
> 状态：**初版草案 v0.1**，估时为单人基准（人日），未含 buffer；建议整体预留 20%。

---

## 1. 前提假设

| 项 | 假设 |
|---|---|
| 团队 | 1~2 名全栈（前端向：WebRTC/媒体/React；Node 向：Room/信令/Context/Tools） |
| 载体 | DSH Cordis 插件（host + client 双半边），开发期用动态插件在真实进程迭代 |
| 工期 | MVP（准备+M0~M2）净工期 ≈ **31 人日**；全 V0.1（含 M3/M4）≈ **48 人日**（≈1 人 10 周 / 2 人 5~6 周） |
| 节奏 | 每里程碑结束做一次 3 实例局域网联调 + 演示 |

## 2. 时间线总览

```
W0.5      W1        W2────W3        W4        W5────W6        W7────W8
准备+验证  M0 房间    M1 RTC          M2 Agent   M3 转写(P1)     M4 Screen/P1 收尾
Gate A/B                             Gate C     Gate D          发 v0.1.0
───────────────────── MVP 可演示 ──────────────────┘
```

- **1 人**：按任务序号串行，总计约 10 周（含 buffer 约 12 周）；
- **2 人**：按 §6 分工并行，净工期约 5~6 周；关键路径在 `T2.1 Mesh 管理器 → T2.4/T2.5 共享与协作视图`。

## 3. 阶段 0 — 准备与技术验证（3 人日，GO/NO-GO 门）

| 任务 | 内容 | 产出 | 估时 | 依赖 |
|---|---|---|---|---|
| T0.1 工程化脚手架 | package.json / tsconfig / lint / 目录骨架（src/host、src/client）/ Cordis 插件壳（可加载、可回滚） | 可运行的空插件 | 1 | — |
| T0.2 媒体采集 Spike | 在真实 DSH 页面验证 `getUserMedia` / `getDisplayMedia`（授权、安全上下文、多显示器选择） | 结论文档（含截图） | 0.5 | T0.1 |
| T0.3 网络 Spike | 两台机器实测 dgram 组播 / mDNS / 防火墙端口占用与放行 | 结论文档（选定发现方案 + 兜底） | 0.5 | — |
| T0.4 协议冻结 v1 | §10.4 全部事件的 payload schema、announce 报文、信令握手时序图 | `docs/protocol.md` | 1 | T0.3 |

**Gate A**：媒体采集不可用 → 重估 Electron 采集方案（计划 +3~5 天）。
**Gate B**：组播不可用 → 切 mDNS（bonjour-service）或手动 IP 兜底。

### 3.1 阶段 0 结项报告（判定：GO）

> 全部四项交付并推送（HEAD 起 ffec2eb…7a82050），无需触发任一 Gate 兜底方案。

| 任务 | 结论 | 证据 |
|---|---|---|
| T0.1 脚手架 | ✅ 完成 | 仓库骨架 + Cordis 插件壳验证（可加载/可回滚，medspk-1 八版迭代实证） |
| T0.2 媒体 Spike | ✅ **Gate A = PASS**（环境侧） | [t0.2-media.md](spikes/t0.2-media.md)：navigator/mediaDevices/secureContext 全 true → 浏览器原生采集方案成立，Electron 兜底方案**不启用**。残余：动作侧两次点击（🎤/🖥）为人工验证，归用户；T2.2 真实用例会再次覆盖 |
| T0.3 网络 Spike | ✅ **Gate B = PASS**（本机） | [t0.3-lan-discovery.md](spikes/t0.3-lan-discovery.md)：组播环回 15 发 27 收、TUN 抢占/去重/防火墙三结论落成代码约束；mDNS 兜底**不启用**。残余：跨主机互测归用户（`npm run spike:lan` 工具就绪） |
| T0.4 协议冻结 | ✅ 完成 | [protocol.md](protocol.md) v1.0-rc2：16 事件 + envelope + 握手时序 + 完美协商，冻结范围明确 |

**阶段 0 结论**：GO——按计划进入 M0/M1，无计划外成本。

**超出计划的进度（同一工作流顺带完成）**：M0 服务端三件套（T1.1 Room / T1.2 信令 / T1.3 发现）已实现并通过 36 例单测+集成测试；T1.7 三实例联调已在服务端预演通过（发现→加入→RTC/聊天→散会→下线全链路）；T1.4 协作大厅 UI 骨架已在 DSH 界面运行（mock 数据）；[ADR-0001](adr-0001-meeting-service-runtime.md) 确定并**验证了**组合行挂载路线（meeting preset 可挂载，standingKey 实证）。M0 剩余：大厅接真实 Discovery 数据源、T1.5 侧栏、浏览器侧三实例实测。

## 4. M0 — 房间骨架（9 人日，第 1 周）

| 任务 | 内容 | 产出 | 估时 | 依赖 |
|---|---|---|---|---|
| T1.1 RoomService（Host） | create/join/leave、成员注册表（id/name/**role=host\|member**/micState）、Host 退出散会 | room 服务 + 单测 | 2 | T0.4 |
| T1.2 信令服务（Host） | `ws` 服务器、端口协商与冲突检测、JOIN/LEAVE/MEMBER_LIST、心跳超时剔除 | 信令服务 | 1.5 | T1.1 |
| T1.3 LAN 发现（Host） | dgram 组播 announce（去重 + TTL）、解析他房公告 | 发现服务 | 1.5 | T0.3/0.4 |
| T1.4 协作大厅（Client） | 附近房间列表（订阅发现）、创建模态（按 prototype §2.2）、一键加入 | 大厅 UI | 2 | T1.1~1.3 |
| T1.5 侧栏骨架（Client） | 房间头 / 成员列表（含 🎤/🔇、主持人徽标）/ 空状态 | 侧栏 UI | 1 | T1.4 |
| T1.6 退出与结束提示 | 成员退出确认、Host 退出全员提示、断线即退房策略 v0 | 交互闭环 | 0.5 | T1.5 |
| T1.7 M0 联调 | 3 实例创建/发现/加入/退出全流程 | 联调记录 | 1 | 全部 |

**M0 验收 = PRD §14「协作」行**（3 实例互见、加入、Host 退出散会）→ **关键瞬间①成立**。

## 5. M1 — RTC（11 人日，第 2~3 周）

| 任务 | 内容 | 产出 | 估时 | 依赖 |
|---|---|---|---|---|
| T2.1 Mesh 管理器（Client） | RTCPeerConnection 池、offer/answer/ice 走 T1.2 信令、**完美协商**处理并发、断连重试 | webrtc 模块 | 3 | T0.4/1.2 |
| T2.2 音频链路 | getUserMedia 采集、静音开关、Opus 码率限制 | 语音可用 | 1 | T2.1 |
| T2.3 发言指示 | AnalyserNode 本地音量 → DataChannel 广播 → 成员 🎤 | 谁在说 | 1 | T2.2 |
| T2.4 屏幕共享 | getDisplayMedia（标签页/窗口/整屏）、screen.start/stop、停止共享 | 共享出去 | 1.5 | T2.1 |
| T2.5 协作视图 | 中心区页面接收远端 stream、`[退出查看]`、共享者信息条 | 看别人屏幕 | 1.5 | T2.4 |
| T2.6 DataChannel 事件通道 | meeting.event 封包/分发、可靠与有序策略 | 事件总线 | 1 | T2.1 |
| T2.7 M1 联调与压测 | 3 人语音 + 1 路共享；5 人 CPU/上行观测（回声→提示戴耳机） | 联调记录 + 压测数据 | 2 | 全部 |

**M1 验收 = PRD §14「RTC」行**。

## 6. M2 — Context & Agent（8 人日，第 4 周）→ **MVP**

| 任务 | 内容 | 产出 | 估时 | 依赖 |
|---|---|---|---|---|
| T3.1 MeetingContextService | members / screen / recentMessages / topic（先手动置顶）；只读快照接口 | context 服务 | 1.5 | T1.1/2.6 |
| T3.2 文字聊天（转写降级） | 侧栏极简聊天输入+列表，DataChannel 同步 → recentMessages | 上下文有"刚才讨论" | 1.5 | T3.1 |
| T3.3 Agent Tools | 注册 `meeting_get_context / get_members / get_transcript / get_screen` | 4 个 Tool | 1.5 | T3.1 |
| T3.4 agent.status | Tool 调用前后埋点 → 广播；侧栏人类可读短语映射（§11.4） | 全员可见状态 | 1 | T2.6/3.3 |
| T3.5 「让 Agent 实现」手动入口 | 任务卡占位 → 向本机 Harness Agent 发 prompt（§11.6 模板）；执行状态广播 | 接手闭环 | 1.5 | T3.4 |
| T3.6 MVP 端到端彩排 | Demo 脚本："把刚才讨论的问题改一下"全链路 | 彩排记录 | 0.5 | 全部 |

**M2 验收 = PRD §14 Context/Agent/Coding 行 + 瞬间③成立、瞬间①②部分成立 → Gate C：MVP 演示评审（对照 §14 全表）。**

## 7. M3 — 实时转写（7 人日，第 5~6 周，P1）

| 任务 | 内容 | 产出 | 估时 | 依赖 |
|---|---|---|---|---|
| T4.1 ASR 选型 Spike | sherpa-onnx vs Vosk：中文流式延迟/准确率/内存实测 | 选型结论 | 1.5 | — |
| T4.2 本地转写管线 | mic → VAD → ASR → `meeting.transcript` 广播（各端转自己的） | 实时字幕数据 | 2.5 | T4.1 |
| T4.3 转写 UI | 最近 2~3 条 / 查看全部 / `● 转写中` 指示（prototype §1.7） | 转写区 | 1 | T4.2 |
| T4.4 topic 自动摘要 | LLM 摘要 + 节流（无新内容不更新，防跳变） | 当前讨论自动更新 | 1.5 | T4.2 |
| T4.5 接入 Context | `get_transcript` 返回真实转写；recentTranscript 滚动窗口 | 上下文升级 | 0.5 | T4.2 |

**Gate D**：转写延迟/准确率不达标 → 重估云端 ASR 前置过滤方案。

## 8. M4 — Screen Context 与建议卡（10 人日，第 7~8 周，P1）

| 任务 | 内容 | 产出 | 估时 | 依赖 |
|---|---|---|---|---|
| T5.1 抽帧 | 共享流 → canvas 0.2~1 FPS → base64 | 帧源 | 1 | M1 |
| T5.2 VLM 接入 | 经 DSH 模型路由；Screen Context 更新（共享人/应用/截图/时间戳） | 屏幕理解 | 1.5 | T5.1 |
| T5.3 "看这里"抬频 | 转写唤起词或手动按钮 → 短时提高抽帧 | 瞬间②触发器 | 1 | T5.2/4.2 |
| T5.4 建议/决策卡 | 触发词 + LLM 判断 → `[让 Agent 实现] [记录为决策]`、高优先级标签（仅建议） | 卡片系统 | 2.5 | T4.4 |
| T5.5 协作总结卡 | 结束时生成：主题/决策/完成/待处理 + `[继续让 Agent 处理]` | 总结卡 | 1.5 | T5.4 |
| T5.6 V0.1 收尾 | 双主题过查、8 人上限压测、用户指南、版本 tag `v0.1.0` | 发布 | 2.5 | 全部 |

**M4 验收 = PRD §14 全量 + 三大关键瞬间全部成立。**

## 9. 并行分工（2 人场景）

| 周 | 前端向 | Node 向 |
|---|---|---|
| W0.5 | T0.1/T0.2 | T0.3/T0.4 |
| W1 | T1.4/T1.5/T1.6 | T1.1/T1.2/T1.3 |
| W2~3 | T2.1/T2.2/T2.4/T2.5 | T2.6 + 提前做 T3.1 |
| W4 | T3.2/T3.3 | T3.4/T3.5 + T3.6 |
| W5~6 | T4.3/T4.4 | T4.1/T4.2/T4.5 |
| W7~8 | T5.1/T5.3/T5.4 | T5.2/T5.5/T5.6 |

## 10. 测试与联调节奏

- **每里程碑末**：3 实例联调（两台物理机 + 本机多开），跑对应 §14 条目并记录；
- **音频**：回声/降噪场景固定用例（戴耳机为默认建议，写入用户指南）；
- **主题**：每 UI 任务完成按浅/深双主题检查单过一遍（prototype §0）；
- **压测点**：M2 后 5 人、T5.6 时 8 人。

## 11. 工程约定

- 分支：`main` 保护 + `feat/<模块>` 短分支；提交信息沿用 `docs:` / `chore:` / `feat:` 前缀；
- 里程碑与任务同步到 GitHub Milestones/Issues（任务标题 = 本文任务号 + 名称）；
- 每个 Spike（T0.2/T0.3/T4.1）必须产出结论文档再进入开发；
- 协议变更走 `docs/protocol.md` 版本号（v1 起）。

## 12. 立即可开始的三件事

1. **T0.1** 脚手架（半天~1 天）；
2. **T0.2** 媒体采集 Spike —— 这是全计划最大不确定性（Gate A）；
3. **T0.3** 局域网组播 Spike（Gate B）。

> 三个都通过，M0 即可全速开工；任一失败，先触发对应 Gate 重估，不要带病进入 M1。
