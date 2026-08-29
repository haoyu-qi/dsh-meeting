# dsh-meeting MVP 开发计划与技术选型建议

> 配套文档：[prd-v0.1.md](prd-v0.1.md)、[interaction-v0.1.md](interaction-v0.1.md)、[prototype-v0.1.md](prototype-v0.1.md)。

## 0. 结论（TL;DR）

1. **代码载体：直接以 DSH 插件（Cordis Plugin）形态启动**——Host 半边提供 Room / 信令 / 局域网发现 / Meeting Context / Agent Tools 服务，Client 半边在 Slot 里做 UI、媒体采集与 WebRTC。不另起独立会议服务端工程。
2. **开源策略：组合微小开源库，不 fork 会议系统，不把会议平台当底座。** 产品的差异化价值 100% 在 Meeting Context 与 Harness/Agent 集成——这部分没有任何现成开源可用；而 WebRTC / 发现 / 信令是成熟技术，用小库消除样板代码即可。整体引入 Jitsi / LiveKit 这类平台会直接打破 PRD §5 "不建媒体服务器" 的边界。
3. **里程碑 M0~M4**：M0+M1+M2 即构成可演示 MVP（发现 → 加入 → 语音 → 共享 → 上下文 → Agent 接手）；ASR 放 M3、VLM 放 M4。

## 1. 分层选型建议

| 层 | 建议 | 备选 | 理由 |
|---|---|---|---|
| 插件框架 | **DSH Cordis 插件**（host + client 双半边） | 独立 Electron/Node 工程 | 复用 DSH 的 Slot 布局、主题 token、Tool 注册、RPC、权限体系；「协作」入口就是 Slot UI，Agent 联动是 Tool + Service，零胶水 |
| 局域网发现 | **Node `dgram` UDP 组播**（自研约 200 行，报文协议 PRD §8.2 已定） | bonjour-service（mDNS/DNS-SD） | PRD 指定 UDP Multicast；mDNS 可作企业网组播被禁时的兜底或并行方案 |
| Host 信令 | **`ws`（原生 WebSocket）自研**，事件协议用 PRD §10.4 | socket.io | 协议已自定义，原生 ws 完全够；socket.io 引入私有帧格式，收益小 |
| WebRTC | **浏览器原生 `RTCPeerConnection` + 自研薄 Mesh 管理器**（N≤8 全连接） | Trystero / PeerJS / simple-peer | 拓扑是"Host 权威成员表 + 全连接"，offer/answer/ice 走自家信令；Trystero 的 serverless 配对信道与 Host 权威模型冲突，PeerJS 需要自带 broker 与自研信令重复 |
| 媒体采集 | **`getUserMedia`（麦克风）/ `getDisplayMedia`（屏幕）**，浏览器原生 | Electron desktopCapturer | DSH 页面运行在 localhost 安全上下文，两个 API 直接可用（M0 需在真实页面验证，见风险 1） |
| 发言指示 | **WebAudio `AnalyserNode` 本地音量检测 → DataChannel 广播** | — | 不依赖 ASR，M1 就能有"🎤 谁在说" |
| 实时转写（M3，P1） | **各端本地流式 ASR**：sherpa-onnx（流式、中文模型全）或 Vosk（轻量、集成快） | faster-whisper / whisper.cpp（批处理，延迟高，适合会后总结） | 定案开放问题 #3：各端转写自己的音频 → 文本经 DataChannel 广播（`meeting.transcript`），Host 不汇聚音频、省带宽 |
| Screen Context（M4，P1） | 抽帧 `canvas.toDataURL` → DSH 模型路由的 VLM | — | 0.2~1 FPS，"Agent 看这里"时抬频（PRD §10.3） |
| UI | **React + DSH Slot，主题全走 token** | 独立 WebView | 原型有浅/深两套主题（见 prototype §0），必须跟随 Harness 主题 |

## 2. 是否基于别的开源项目启动？——评估

**结论：不 fork、不当底座；按"库"粒度取用 + 读代码借鉴。** 判断标准：凡是承载"Host 权威成员模型 + 自定义事件协议 + Meeting Context"核心设计的层都自研（量很小）；凡是标准件（ws、mDNS、ASR 模型）直接用库。

| 项目 | 协议 | 状态 | 用法建议 |
|---|---|---|---|
| LiveKit | Apache-2.0 | 活跃 | **不引入**（SFU 架构与"无媒体服务器"冲突）。房间/成员/元数据模型值得借鉴；留作 V0.2+ Mesh 质量不达标时的升级路径 |
| Jitsi Meet | Apache-2.0 | 活跃 | **读代码借鉴**：active speaker 检测、audio level、1:1 P2P 模式；不整体引入（重、且绑定自己生态） |
| Trystero | MIT | 活跃 | **可选原型验证**：serverless WebRTC 配对（nostr/mqtt 等信道），适合一天内验证媒体链路；正式版建议自研薄层以保持 Host 权威模型 |
| PeerJS | MIT | 维护缓慢 | 不建议：需自配 broker，与自研信令重复 |
| simple-peer | MIT | 原仓库近年维护停滞（社区有 fork） | 不建议新项目采用；其 API 设计可作自研薄封装参考 |
| bonjour-service | MIT | 维护中 | **可直接用**：mDNS 发现兜底（对应开放问题 #6） |
| ws | MIT | 活跃 | **直接用**：Host 信令服务器 |
| Vosk | Apache-2.0 | 可用、偏老 | **M3 候选**：小模型、流式、Node 绑定，集成最快 |
| sherpa-onnx (k2-fsa) | Apache-2.0 | 活跃 | **M3 首选**：流式中文 ASR，模型选择多 |
| faster-whisper | MIT | 活跃 | **M3 辅助/会后总结**：非流式但更准 |

> 各项目维护状态随时间变化，选型落定时以仓库最近提交为准再确认一次。

**代价对比**：自研 Mesh 管理器 + 信令约 1~2 千行（协议已定义）；引入 Jitsi/LiveKit 立即带来几十万行第三方代码、运维面和架构冲突——与 PRD §16 原则 1"不重复建设、保持轻"相悖。

## 3. 里程碑计划

### M0 — 房间骨架（约 1 周）
- Cordis 插件脚手架（host/client 双半边）；
- Host：Room service（create/join/leave、成员注册表）、`ws` 信令、UDP 组播 announce（§8.2 报文）；
- Client：协作大厅（附近房间列表 + 创建模态，按 prototype §2.1/2.2）、成员列表同步、Host 退出散会提示。
- **验收 = PRD §14 协作行**（3 实例互见、加入、退出广播）。→ 关键瞬间①成立。

### M1 — RTC（约 1~2 周）
- 全连接 Mesh 音频：麦克风开关、静音、音量发言指示（AnalyserNode）；
- `getDisplayMedia` 屏幕共享 + 停止共享；他人「协作视图」查看（中心区页面，非新窗口）；
- DataChannel 事件：`screen.start/stop`、发言状态；底部操作条（prototype §2.3）。
- **验收 = 3 人稳定语音 + 1 路共享查看**。

### M2 — Context & Agent（约 1~2 周）→ **MVP 达成**
- Meeting Context service：members / screen / recentMessages / topic（先手动置顶或规则抽取）；
- 4 个 Agent Tools：`meeting_get_context / get_members / get_transcript / get_screen`；
- `agent.status` 广播 + 侧栏人类可读状态（§11.4）；
- **无 ASR 时的转写降级**：文字聊天进入 `recentMessages`，"刚才讨论"先由聊天 + 屏幕状态承载。
- **验收 = "Agent，把刚才讨论的问题改一下" 以聊天+屏幕状态为上下文跑通**。→ 关键瞬间③成立；瞬间②部分成立（窗口标题 + Workspace 级）。

### M3 — 实时转写（P1）
- 各端本地流式 ASR → `meeting.transcript` 广播；转写区 UI（最近 2~3 条 / 查看全部）；
- `topic` 自动摘要（LLM + 节流，定开放问题 #12）。
- → 瞬间②前半成立（听懂讨论）。

### M4 — Screen Context & 建议卡（P1）
- 抽帧 + VLM；"Agent，看这里"抬频；
- 任务/决策建议卡（`[让 Agent 实现] [记录为决策]`、高优先级标签，仅建议不自动执行）；
- 协作总结卡（主题/决策/完成/待处理 + 继续让 Agent 处理）。
- → 瞬间②完全体。

**三大关键瞬间 ↔ 里程碑**：① = M0；② = M4（M2 部分成立）；③ = M2。**最小可演示 = M0+M1+M2。**

## 4. MVP 明确砍掉 / 降级

- 摄像头（PRD 已定不做）；
- 语音唤起词（"Agent，…"）→ 文字输入替代，M3+ 再评估（开放问题 #11 后置）；
- 决策/任务**自动**识别 → M4 仅建议卡；
- Room Secret → MVP 先"加入口令明文比对"（LAN 威胁模型下可接受，文档记录），协议升级后置（开放问题 #5 部分定案）；
- Host 迁移 / 公网 / 云录制（PRD §5 不变）。

## 5. 风险 Top5 与对策

| # | 风险 | 对策 |
|---|---|---|
| 1 | DSH 页面 getUserMedia/getDisplayMedia 权限与安全上下文问题 | **M0 第一天**就在真实页面验证（开放问题 #8），不成立则提前改 Electron 采集方案 |
| 2 | 企业网组播不可用（AP 隔离/防火墙） | M0 并行验证 UDP 组播与 mDNS；保留手动 IP 直连兜底（#6/#7） |
| 3 | 8 人 Mesh 上行/CPU | M1 以 3 人验收，M2 做到 5 人；Opus 限码率、共享流限分辨率（#10） |
| 4 | 「让 Agent 实现」多人并发冲突 | M2 定案：仅建议创建者可一键触发，执行状态经 DataChannel 广播全员（#13） |
| 5 | 浅/深双主题适配走样 | UI 全部走 DSH 主题 token，评审时两主题各过一遍（prototype §0） |

## 6. 仓库落地结构建议

Cordis 插件是单包双半边（`code.host` / `code.client`），先单包演进，目录对齐 PRD §12 的六个模块概念：

```
dsh-meeting/
├── docs/                    # 需求 / 交互 / 原型 / MVP 计划
└── src/
    ├── host/                # room / lan(发现) / signaling / context / tools
    └── client/              # panels(大厅/侧栏/协作视图) / webrtc / media / theme
```

开发期：**Client 半边与纯 JS Host 逻辑**用 DSH 动态插件在真实进程里快速迭代（改完即载、可回滚）；**socket 类服务（T1.2 信令、T1.3 发现）的联调主战场是真实 Node 进程**（node:test + smoke 脚本）——动态插件 Host 半边无 dgram/ws 内建（实证见 [adr-0001](adr-0001-meeting-service-runtime.md)）；接入 DSH 会话时经本地 preset 的 `isolate` 组合行挂载；产品化后再固化为 harness 组合配置里的常驻插件行。**建议第一步行动**：① 用一个临时插件验证 DSH 页面的媒体采集能力（风险 1，半天，已完成 ✅）；② 随后起 M0 脚手架（已完成 ✅）。
