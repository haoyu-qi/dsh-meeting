# src/ — 插件源码

双半边结构（对应 DSH Cordis 插件模型）：

```
src/
├── host/     # Node 侧：Room / LAN 发现 / ws 信令 / Meeting Context / Agent Tools
└── client/   # 页面侧：协作大厅 / 协作侧边栏 / 协作视图 / WebRTC / 媒体采集
```

## 开发模式

1. **动态插件迭代**（当前阶段）：验证性代码通过 DSH 会话的 `cordis_define`（纯 JS 函数体，
   无 import/TS/JSX）直接在真实进程里载入、运行、回滚；每个 Spike / 里程碑验证通过后，
2. **回填沉淀**：把验证过的逻辑按模块整理回本目录（ESM plain JS），任务号对应
   `docs/dev-plan-v0.1.md`；
3. **产品化**（M4 后）：固化为 harness 组合配置中的常驻插件行。

## 约束

- 插件运行环境是受限沙箱：可用全局（timer/fetch/document 等）以对应平台
  `Builtin.listBuiltins` 查询结果为准，不得臆测；
- Client UI 一律注册进查询过的 Slot；颜色一律走主题 token；
- Host↔Client 通信只用 Package 私有 JSON RPC（`harness.handle` / `host.call`）。
