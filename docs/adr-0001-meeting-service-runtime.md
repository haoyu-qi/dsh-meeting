# ADR-0001：Meeting Host 服务的运行时载体

> 状态：已接受（2024，M0 集成前）｜ 关联：[mvp-plan.md](mvp-plan.md) §1/§6、[dev-plan-v0.1.md](dev-plan-v0.1.md) T1.2/T1.3、[t0.2-media.md](spikes/t0.2-media.md) §2

## 背景

M0 的三件服务（RoomService、ws 信令、UDP 组播发现）运行在哪里？开发期计划用 DSH 动态插件迭代（mvp-plan §6 原表述），但 T0.2 Spike 的 v1→v8 迭代暴露了动态插件 Host 半边的真实约束：

1. **内建极窄**：Host 半边可用内建仅 `ctx / harness / console / btoa / atob / TextEncoder / TextDecoder`（`Builtin.listBuiltins` 实测）——**没有 `dgram`、`net`、`ws`、`os`、`process`**，且代码体不允许 import/require。socket 类服务根本无法在动态插件体内表达；
2. **`fs.writeText` 静默失效**（t0.2-media.md 教训 3）：即使走 `fs` 服务，动态插件内的写入也不落盘；
3. Client 半边无此限制：浏览器全局（`navigator.mediaDevices` 等）实测可达，媒体采集与 Slot UI 是动态插件的舒适区。

组合配置侧（`editing-cordis-compositions` 技能 + 随部署发行的 `cordis` preset 实证）：

- 一切能力 = `cordis.yml` 里的插件行；**组合行引用可解析的包名**；config 支持 `!!js` 表达式（存在 `baseUrl` 相对路径解析的先例）；
- **发布服务的行必须藏在 isolate realm 后面**（preset 自有服务），或放 host 组合（进程共享）；
- 会议服务（信令/发现/房间）的消费者只有本会话的 Meeting UI 与 Agent Tools——符合"preset 自有服务"画像，应作为一个 **isolate 组**挂进本地创作的 preset。

## 决策

1. **服务端（src/host 全部）的运行载体 = agent preset 组合行**：
   - dsh-meeting 仓库补一个可解析的插件包入口（`package.json` name + `main`/export），开发机用 npm `file:` 依赖或 link 挂进部署可解析的位置；
   - 本地创作 preset（复制 `standard`）内加一个 `meeting` 组：`group: true` + `isolate: { meeting: true }`，行内加载 dsh-meeting 包，provide `meeting` 服务（createRoom/joinRoom/getContext 等，PRD §33）；
   - `standingKeyFor(id)` 做 mount-validation 后交付真实会话验证。
2. **开发期的联调主战场 = 真实 Node 进程**：`node:test`（22 例已绿）+ 真实 socket 烟测（`scripts/smoke-lan.mjs` 已 PASS）不需要任何组合就能跑；组合行只在"接入 DSH 会话"最后一步引入。
3. **客户端（src/client）继续用动态插件快速迭代**：媒体采集、Slot UI、RPC handler 全部验证可行（T0.2 v8 即模板）；Client↔Host 经 Package 私有 RPC 对接组合行提供的 `meeting` 服务。
4. **产品化路径不变**：确认稳定后，把该行从 preset 提升进 host 组合（若服务需要跨会话共享，如 V1.0 的协议目标），preset 只留工具行。

## 后果

- ✅ 绕开动态插件沙箱限制，协议栈（dgram/ws）原生可用；服务生命周期与 Fiber 绑定，组合卸载即回收；
- ⚠️ preset 行是信任边界：加载的是本仓库代码，版本漂移需自查（建议组合行固定 `file:` 版本）；
- ⚠️ `mvp-plan.md` §6 原表述"开发期用动态插件迭代 Host 服务"不成立，已修订为"客户端与纯 JS Host 逻辑用动态插件；socket 服务用真实进程 + 组合行"。

## 验证记录

- T0.2 Spike v1→v8（本仓库 docs/spikes/t0.2-media.md §3）：动态插件内建清单与 fs 失效的实证；
- `cordis` preset 组合文件（随部署发行）：`isolate` 组、`!!js` baseUrl 相对解析、行语法范本。
