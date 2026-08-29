# Meeting 协议 v1（冻结候选）

> 上游依据：[prd-v0.1.md](prd-v0.1.md)（§7.3 媒体与数据通道、§8 核心业务流程、§10.4 统一事件协议）、[interaction-v0.1.md](interaction-v0.1.md)（§9 Agent 三种介入方式、§11 Agent 状态与结果联动）。
>
> 任务出处：[dev-plan-v0.1.md](dev-plan-v0.1.md) T0.4（依赖 T0.3 网络 Spike 结论）。
>
> 状态：**冻结候选（v1.0-rc1）**——事件清单、payload schema、握手时序自本文起冻结；§2.4 组播参数与 §8 遗留 TODO 待 Spike / 联调确认后定稿。
>
> 全局约定：时间统一 **毫秒 epoch（UTC）**；所有 id 统一 **小写 uuid v4**；本文示例中的成员、地址与数值均为虚构。

---

## 1. 概述

协议分为两个平面（plane）：

| 平面 | 载体 | 职责 | 特征 |
|---|---|---|---|
| **发现平面**（Discovery） | UDP 组播 `room_announce` | 让局域网内的 Harness 实例看到"附近有哪些协作房间" | 单向、无连接、周期广播；不携带任何会话状态 |
| **会话平面**（Session） | WebSocket 信令 + RTCDataChannel（统一事件封包 envelope） | 房间生命周期、成员一致性、RTC 协调、协作状态与会议上下文 | 有连接、有状态；信令只管协调，**不传媒体** |

媒体（语音、屏幕）走 WebRTC MediaStream P2P Mesh 直连，不经 Host 转发（PRD §7.3）。Host 只承担 Room Coordinator + Signaling + Member Registry + Meeting Context（PRD §7.1）。

```
┌────────────────────────────────────────────────────────────┐
│                应用层（Meeting UI / Context / Agent Tools）  │
├─────────────────────────┬──────────────────────────────────┤
│      发现平面             │            会话平面                │
│  UDP 组播                │  envelope 统一事件封包（§3）        │
│  room_announce（§2）     │  ├─ 信令 WebSocket（经 Host，§5/§6）│
│  单向广播，无会话         │  ├─ DataChannel（P2P，§6）         │
│                         │  └─ MediaStream（P2P 媒体，§6）    │
└─────────────────────────┴──────────────────────────────────┘
```

事件路由原则：

- 需要**全员一致的权威状态**（成员表、房间生命周期）→ 信令 WebSocket，由 Host 裁决；
- 需要**点对点、高频、低延迟**的协作状态（屏幕共享态、发言音量、Agent 状态、转写、聊天）→ RTCDataChannel，P2P 直达；
- **大流量媒体** → MediaStream，P2P Mesh。

---

## 2. 发现平面：room_announce 报文

### 2.1 报文定义

Host 定期组播的 JSON 报文，在 PRD §8.2 原型基础上补全为 v1 完整结构：

```json
{
  "type": "room_announce",
  "protocolVersion": "1.0",
  "roomId": "5f0c9a2e-7b1d-4c3a-9e2f-8a7b6c5d4e3f",
  "roomName": "登录模块讨论",
  "hostName": "浩宇",
  "host": "192.168.1.36",
  "port": 18990,
  "members": 3,
  "secretRequired": false,
  "ts": 1787991601000
}
```

### 2.2 字段表

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| type | string | 是 | 固定 `"room_announce"` |
| protocolVersion | string | 是 | 协议版本，v1 固定 `"1.0"`；版本协商见 §7 |
| roomId | string | 是 | 房间唯一 id，创建房间时生成（uuid v4）；同一房间的所有 announce 恒定 |
| roomName | string | 是 | 房间名称，默认 `{项目名} · 协作讨论`（交互稿 §4） |
| hostName | string | 是 | 发起人显示名（大厅展示 `● 名称 · 发起人 · 人数`） |
| host | string | 是 | Host 局域网 IPv4 地址（信令 ws 监听地址） |
| port | number | 是 | Host 信令 WebSocket 端口（默认 18990，冲突处理见 TODO-8） |
| members | number | 是 | 当前成员数（👤成员 + 🤖Agent 都计入） |
| secretRequired | boolean | 是 | 是否需要加入口令（Room Secret）；**不含口令本身** |
| ts | number | 是 | 本条公告生成时间，毫秒 epoch（接收端用于失效判断） |

### 2.3 发送、去重与失效

- Host 的发现服务周期性组播（建议间隔见 §2.4），单报文 ≤ 512 字节，无分片、无 ACK（UDP 单向）；
- 接收端以 `roomId` 为键维护"附近房间"表：收到即刷新 `roomName / hostName / members / ts`；`now - ts` 超过失效窗口（建议 3 个广播周期）未刷新 → 从列表移除（Host 散会或掉线后房间自然消失）；
- 加入失败不靠发现平面反馈，由会话平面 `room.reject` 表达（§5.3）。

### 2.4 建议组播参数（⚠️ 以 T0.3 Spike 结论为准）

| 参数 | 建议值 | 说明 |
|---|---|---|
| 组播地址 | `239.189.90.90` | IPv4 管理本地范围（239.0.0.0/8），不会跨互联网路由 |
| UDP 端口 | `51900` | 与信令 TCP 端口 18990 区分开，避免端口语义混淆 |
| TTL | `1` | 限制在本子网内，不跨路由器；跨子网场景走兜底（TODO-9） |
| 广播间隔 | `2s` | 列表刷新足够快，流量可忽略（约 125 B/s） |
| 失效窗口 | `6s` | 3 个周期未刷新即下线 |
| loopback | 开启 | 本机多开实例互相可见（联调依赖，§10 测试节奏） |

> ⚠️ 本表全部为**建议值**，最终以 [dev-plan-v0.1.md](dev-plan-v0.1.md) T0.3 Spike 结论为准（Gate B：组播不可用 → 切 mDNS（bonjour-service）或手动 IP 兜底；`room_announce` 字段语义在两种兜底下保持不变）。

---

## 3. 会话平面：统一事件封包 envelope

会话平面上**所有消息**（成员请求、Host 响应、RTC 协调、DataChannel 协作事件）共用同一个封包结构，实现侧只需一个解析/分发器。

### 3.1 结构定义（JSON Schema 风格）

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "meeting.envelope",
  "type": "object",
  "additionalProperties": false,
  "required": ["protocolVersion", "id", "type", "sender", "ts", "payload"],
  "properties": {
    "protocolVersion": {
      "type": "string",
      "const": "1.0",
      "description": "协议版本，v1 冻结值；协商规则见 §7"
    },
    "id": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
      "description": "uuid v4，消息唯一 id，用于日志追踪与（未来）去重"
    },
    "type": {
      "type": "string",
      "enum": [
        "room.join", "room.leave", "member.join", "member.leave",
        "rtc.offer", "rtc.answer", "rtc.ice",
        "screen.start", "screen.stop",
        "agent.status", "meeting.transcript",
        "voice.level", "chat.message",
        "member.list", "room.reject", "room.ended"
      ],
      "description": "事件类型；前 11 个为 PRD §10.4 首版清单，voice.level/chat.message 为 v1 附加（§4.12），后 3 个为信令控制消息（§5.3）"
    },
    "sender": {
      "type": "string",
      "description": "发送方成员 id；Host 发出的控制消息 sender 为 hostId"
    },
    "ts": {
      "type": "integer",
      "minimum": 0,
      "description": "发送时间，毫秒 epoch（UTC）"
    },
    "payload": {
      "type": "object",
      "description": "事件负载，逐类型定义见 §4 / §5.3"
    }
  }
}
```

### 3.2 字段表

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| protocolVersion | string | 是 | 常量 `"1.0"`（PRD §10.4 原型无此字段，v1 冻结补充，见 §7） |
| id | string(uuid v4) | 是 | 消息 id，发送端生成 |
| type | string | 是 | 事件类型，见 §4.1 总表 |
| sender | string(uuid v4) | 是 | 发送方成员 id（成员 id 即信令身份，见 §3.3） |
| ts | number | 是 | 毫秒 epoch |
| payload | object | 是 | 各事件独立定义；允许空对象 `{}` |

> **对 PRD §10.4 的两处有意修正**：① 字段 `timestamp`（秒）在 v1 冻结为 `ts`（毫秒），与 JS `Date.now()` 对齐，避免秒/毫秒混用，PRD 该处以本文为准；② 补充 `protocolVersion` 顶层字段（§7）。

### 3.3 生成规则

| 字段 | 规则 |
|---|---|
| id | uuid v4（如 `crypto.randomUUID()`），发送端生成；接收端不依赖其有序性 |
| ts | `Date.now()` 毫秒 epoch；仅用于排序与展示，**不做跨机时钟同步假设**（局域网时钟偏差可达秒级，事件先后以信令到达序为准） |
| sender | 成员 id，由客户端**入房前本地生成**（uuid v4）；Host 不发号，仅在注册表内查重（冲突即拒绝） |
| protocolVersion | 常量 `"1.0"`，从共享协议常量单点读取（§7） |

### 3.4 公共对象：member

成员对象在 `member.list` / `member.join` 中承载，字段与 dev-plan T1.1 成员注册表一致：

```json
{
  "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "name": "浩宇",
  "role": "host",
  "micState": "on",
  "kind": "human"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| id | string(uuid v4) | 是 | 成员唯一 id，客户端入房前本地生成（= 该成员 envelope 的 sender） |
| name | string | 是 | 显示名，1~24 字符 |
| role | `"host"` \| `"member"` | 是 | `host` = 房间发起人；由 Host **权威填充**，客户端自报一律忽略 |
| micState | `"on"` \| `"off"` | 是 | 麦克风状态；初始值随 `room.join` 上报，此后变更经 `voice.level` 同步（§4.12），不新增 member 事件 |
| kind | `"human"` \| `"agent"` | 否 | 默认 `"human"`；为 PRD「成员列表含 👤成员 + 🤖Agent」预留，V0.1 Agent 以 Agent 成员身份入房时置 `"agent"` |

---

## 4. 事件清单与 payload 定义

### 4.1 事件总表

| type | 方向 | 通道 | 语义 | 冻结来源 |
|---|---|---|---|---|
| room.join | 成员 → Host | 信令 ws | 请求加入房间（带 name、可选口令） | PRD §10.4 |
| room.leave | 成员 → Host | 信令 ws | 请求退出房间 | PRD §10.4 |
| member.join | Host → 全员 | 信令 ws | 广播新成员 | PRD §10.4 |
| member.leave | Host → 全员 | 信令 ws | 广播成员退出/超时剔除 | PRD §10.4 |
| rtc.offer | 成员 ⇄ 成员 | 信令 ws（Host 定向路由） | SDP Offer | PRD §10.4 |
| rtc.answer | 成员 ⇄ 成员 | 信令 ws（Host 定向路由） | SDP Answer | PRD §10.4 |
| rtc.ice | 成员 ⇄ 成员 | 信令 ws（Host 定向路由） | ICE candidate（trickle） | PRD §10.4 |
| screen.start | 共享者 → 各对端 | DataChannel | 屏幕共享开始 | PRD §10.4 |
| screen.stop | 共享者 → 各对端 | DataChannel | 屏幕共享停止 | PRD §10.4 |
| agent.status | Agent 成员 → 各对端 | DataChannel | Agent 工作状态变更 | PRD §10.4 |
| meeting.transcript | 发言者端 → 各对端 | DataChannel | 实时转写片段 | PRD §10.4 |
| voice.level | 成员 → 各对端 | DataChannel | 发言音量等级 + 麦克风状态 | v1 附加（T2.3） |
| chat.message | 成员 → 各对端 | DataChannel | 文字聊天 | v1 附加（T3.2） |
| member.list | Host → 加入者 | 信令 ws | JOIN 成功的全量成员快照 | 信令控制（§5.3） |
| room.reject | Host → 加入者 | 信令 ws | JOIN 被拒 | 信令控制（§5.3） |
| room.ended | Host → 全员 | 信令 ws | Host 退出，会议结束 | 信令控制（§5.3） |

以下逐个给出 payload 字段表与完整 envelope 示例（示例成员沿用 §3.4/§5：浩宇 hostId `7c9e…ae7`、张伟 `0b9e…a7b`）。

### 4.2 room.join（加入房间）

| 项 | 说明 |
|---|---|
| 方向 | 成员 → Host（请求） |
| 通道 | 信令 WebSocket |
| 成功应答 | `member.list`（§5.3） |
| 失败应答 | `room.reject`（§5.3），随后 Host 关闭该连接 |

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| name | string | 是 | 显示名，1~24 字符，trim 后非空 |
| secret | string | 否 | 加入口令；房间 `secretRequired=true` 时必填，校验见 §5.4 |
| micState | `"on"` \| `"off"` | 是 | 初始麦克风状态（此后变更经 `voice.level` 同步） |

```json
{
  "protocolVersion": "1.0",
  "id": "e6a1d2c3-4b5a-4c8d-9e2f-1a2b3c4d5e6f",
  "type": "room.join",
  "sender": "0b9e6b7e-8f2a-4c3d-9a1b-2c3d4e5f6a7b",
  "ts": 1787991601050,
  "payload": { "name": "张伟", "micState": "on" }
}
```

### 4.3 room.leave（退出房间）

| 项 | 说明 |
|---|---|
| 方向 | 成员 → Host（请求） |
| 通道 | 信令 WebSocket |
| 应答 | 无显式应答：Host 注销后关闭该 ws，其余成员收到 `member.leave` |

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| reason | string | 否 | `"user"`（默认，用户主动退出）\| `"disconnect"`（断线补偿上报；V0.1 掉线主要由心跳判定，可不发送） |

```json
{
  "protocolVersion": "1.0",
  "id": "b7c2e3d4-5a6b-4c9d-8e1f-2b3c4d5e6f7a",
  "type": "room.leave",
  "sender": "0b9e6b7e-8f2a-4c3d-9a1b-2c3d4e5f6a7b",
  "ts": 1787991900200,
  "payload": { "reason": "user" }
}
```

处理规则：sender 为普通成员 → 注销并广播 `member.leave`；sender 为 Host 本人 → 广播 `room.ended` 并关闭信令服务（PRD §7.2：Host 退出即散会）。

### 4.4 member.join（新成员广播）

| 项 | 说明 |
|---|---|
| 方向 | Host → 全员（不含新成员本人，其已从 `member.list` 获知） |
| 通道 | 信令 WebSocket |

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| member | member 对象 | 是 | 新成员完整对象（§3.4），role/kind 由 Host 填充 |

```json
{
  "protocolVersion": "1.0",
  "id": "c8d3f4e5-6b7c-4d0e-9f2a-3c4d5e6f7a8b",
  "type": "member.join",
  "sender": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "ts": 1787991601120,
  "payload": {
    "member": {
      "id": "0b9e6b7e-8f2a-4c3d-9a1b-2c3d4e5f6a7b",
      "name": "张伟",
      "role": "member",
      "micState": "on",
      "kind": "human"
    }
  }
}
```

### 4.5 member.leave（成员离开广播）

| 项 | 说明 |
|---|---|
| 方向 | Host → 全员 |
| 通道 | 信令 WebSocket |

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| memberId | string(uuid v4) | 是 | 离开成员 id |
| reason | string | 否 | `"left"`（默认，主动退出）\| `"timeout"`（心跳超时剔除） |

```json
{
  "protocolVersion": "1.0",
  "id": "d9e4a5b6-7c8d-4e1f-8a3b-4d5e6f7a8b9c",
  "type": "member.leave",
  "sender": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "ts": 1787991900380,
  "payload": {
    "memberId": "0b9e6b7e-8f2a-4c3d-9a1b-2c3d4e5f6a7b",
    "reason": "left"
  }
}
```

### 4.6 rtc.offer / rtc.answer（SDP 交换）

| 项 | 说明 |
|---|---|
| 方向 | 成员 ⇄ 成员，经 Host **定向**路由（按 `target` 私发，不广播） |
| 通道 | 信令 WebSocket |

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| target | string(uuid v4) | 是 | 目标成员 id |
| sdp | string | 是 | 完整 SDP 文本（`RTCSessionDescription.sdp`），offer 与 answer 同构 |

```json
{
  "protocolVersion": "1.0",
  "id": "eaf5b6c7-8d9e-4f2a-9b4c-5e6f7a8b9c0d",
  "type": "rtc.offer",
  "sender": "0b9e6b7e-8f2a-4c3d-9a1b-2c3d4e5f6a7b",
  "ts": 1787991601500,
  "payload": {
    "target": "3f8a1c2d-5b6e-4f70-8a92-1b2c3d4e5f60",
    "sdp": "v=0\r\no=- 4611731400430051336 2 IN IP4 127.0.0.1\r\n..."
  }
}
```

`rtc.answer` payload 完全同构（`target` + `sdp`），示例略。

### 4.7 rtc.ice（ICE 候选，trickle）

| 项 | 说明 |
|---|---|
| 方向 | 成员 ⇄ 成员，经 Host 定向路由 |
| 通道 | 信令 WebSocket |

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| target | string(uuid v4) | 是 | 目标成员 id |
| candidate | string \| null | 是 | `RTCIceCandidate.candidate`；`null` 表示候选收集结束（V0.1 允许不发送，由连接超时兜底） |
| sdpMid | string \| null | 否 | 候选所属 media stream id |
| sdpMLineIndex | number \| null | 否 | 候选所属 m-line 下标 |
| usernameFragment | string \| null | 否 | ice-ufrag |

```json
{
  "protocolVersion": "1.0",
  "id": "fba6c7d8-9eaf-4a3b-8c5d-6f7a8b9c0d1e",
  "type": "rtc.ice",
  "sender": "0b9e6b7e-8f2a-4c3d-9a1b-2c3d4e5f6a7b",
  "ts": 1787991601610,
  "payload": {
    "target": "3f8a1c2d-5b6e-4f70-8a92-1b2c3d4e5f60",
    "candidate": "candidate:842163049 1 udp 1677729535 192.168.1.37 54403 typ srflx raddr 0.0.0.0 rport 0",
    "sdpMid": "0",
    "sdpMLineIndex": 0,
    "usernameFragment": "4acc7a3c"
  }
}
```

trickle 约定：候选随收集随发；接收端在 `remoteDescription` 未就绪时先入队缓存，就绪后依次 `addIceCandidate`。

### 4.8 RTC 并发约定（Perfect Negotiation，防 glare）

1. **角色判定（纯函数，双端必然一致）**：对每对连接 (a, b)，按成员 id 字典序比较（JS `String` 的 `<` 比较，即 UTF-8 码元序）：**id 较小者为 polite，id 较大者为 impolite**。无需任何额外握手字段。
2. **首次建连采用 New Joiner 模式**：新成员对每个已有成员主动 `rtc.offer`（§5.2 步骤⑥），已有成员只 answer——正常流程不产生 glare。
3. **glare**（本地 offer/answer 事务未完成时又收到对方 offer）只出现在两端几乎同时互发 offer（同时入房、断线重连、同时 renegotiate）：
   - **polite 端**：回滚自身 offer（`setRemoteDescription` 隐式回滚 / 显式 `rollback()`），接受对方 offer 并 answer；
   - **impolite 端**：忽略对方迟到的 offer，继续完成自己的 offer/answer。
4. **屏幕共享 renegotiation**：共享者开始/停止共享时（addTrack/removeTrack 触发 `onnegotiationneeded`）向每个对端发起新的 `rtc.offer`，此时该对内的 offer 发起方临时切换为共享者；glare 仍按第 3 条处理。
5. **DataChannel 归属**：每对连接的 DataChannel（label `"meeting"`）由 **id 较大一端**创建，另一端 `ondatachannel` 接收。该规则与 polite 判定同源，glare 场景下也不会建出两条 DC。

### 4.9 screen.start / screen.stop（屏幕共享状态）

| 项 | 说明 |
|---|---|
| 方向 | 共享者 → 各对端（P2P 扇出；补发约定见 §4.13） |
| 通道 | RTCDataChannel |

`screen.start` payload：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| sourceName | string | 是 | 共享源显示名，如 `"Visual Studio Code"`、`"整个屏幕 · 显示器 1"`；取 `getDisplayMedia` 轨道描述，取不到时填 `"屏幕共享"` |
| app | string | 是 | 来源应用/浏览器标识（进程或应用名），如 `"Code"`、`"msedge"`；取不到时填 `"unknown"` |
| withAudio | boolean | 否 | 是否携带屏幕音频，默认 `false`（V0.1 不采集屏幕音频，字段为 V0.2 预留） |

`screen.stop` payload：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| reason | string | 否 | `"user"`（默认，主动停止）\| `"error"`（采集异常终止） |

```json
{
  "protocolVersion": "1.0",
  "id": "acb7d8e9-0fab-4b4c-9d6e-7a8b9c0d1e2f",
  "type": "screen.start",
  "sender": "3f8a1c2d-5b6e-4f70-8a92-1b2c3d4e5f60",
  "ts": 1787991605000,
  "payload": {
    "sourceName": "Visual Studio Code — Login.tsx",
    "app": "Code",
    "withAudio": false
  }
}
```

约束：同一成员同一时刻至多一路共享（PRD P0-2）；接收端以最新事件为准，`screen.start` 直接覆盖旧状态。屏幕**视频流本身**走 MediaStream（§6），本事件只承载共享状态元数据（供侧栏"🖥 张伟正在共享屏幕"与 Agent Screen Context 使用）。

### 4.10 agent.status（Agent 状态）

| 项 | 说明 |
|---|---|
| 方向 | Agent 成员 → 各对端（P2P 扇出；补发约定见 §4.13） |
| 通道 | RTCDataChannel |
| 展示 | 全员在协作侧边栏可见人类可读短语（交互稿 §11） |

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| state | string(enum) | 是 | 9 态枚举，见下表，与 PRD §11.4 / 交互稿 §11 一致 |
| detail | string | 否 | 人类可读短语（含具体对象，如 `"正在修改 Login.tsx"`）；缺省时接收端按 state 映射默认短语 |

| state | 默认短语（detail 缺省时） | 触发场景 |
|---|---|---|
| IDLE | 空闲 | 未接手会议任务 |
| LISTENING | 正在听取会议 | 唤起词已识别，正在等待/汇聚指令 |
| THINKING | 分析中 | 正在结合 Meeting Context 推理、给方案 |
| READING_SCREEN | 正在查看共享屏幕 | Screen Context 同步/读取中 |
| READING_CODE | 读取代码 | Workspace 文件检索/读取中 |
| EXECUTING | 修改代码 / 运行测试 | 修改文件、运行 Terminal 命令（detail 给具体对象） |
| WAITING_CONFIRM | 等待确认 | Harness 原生权限/Plan 确认挂起 |
| COMPLETED | 已完成 | 任务完成（V0.1 结果摘要放 detail 文本，结构化见 TODO-6） |
| ERROR | 出错了 | 执行失败（detail 给原因短语） |

```json
{
  "protocolVersion": "1.0",
  "id": "bdc8e9fa-1abc-4c5d-8e7f-8b9c0d1e2f3a",
  "type": "agent.status",
  "sender": "9a7b3c2d-1e4f-4a5b-8c6d-7e8f9a0b1c2d",
  "ts": 1787991700000,
  "payload": { "state": "EXECUTING", "detail": "正在运行 npm test" }
}
```

约束：

- 仅 `kind="agent"` 的成员可发送（§3.4）；普通成员客户端收到后直接展示，不转发、不回应；
- 状态变化即发（事件驱动），不周期重发；DC 重连后按 §4.13 补发当前值；
- `detail` 面向全体成员展示，**必须是人类可读短语**，不承载完整 Agent Chain / 工具调用细节（PRD §11.4）。

### 4.11 meeting.transcript（实时转写）

| 项 | 说明 |
|---|---|
| 方向 | 发言者所在端 → 各对端（各端转写自己的麦克风，P2P 扇出；汇聚位置见 TODO-7） |
| 通道 | RTCDataChannel |

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| speakerMemberId | string(uuid v4) | 是 | 发言成员 id（恒等于 envelope.sender，冗余携带便于落库） |
| speakerName | string | 是 | 发言者显示名（冗余字段，接收端免查成员表直显） |
| ts | number | 是 | 该片段语音时间（毫秒）；同一句话的 partial 序列共享同一 ts |
| text | string | 是 | 转写文本 |
| final | boolean | 是 | `false` = 中间结果（覆盖同键旧值），`true` = 定稿 |

```json
{
  "protocolVersion": "1.0",
  "id": "ced9fafb-2bcd-4d6e-9f8a-9c0d1e2f3a4b",
  "type": "meeting.transcript",
  "sender": "0b9e6b7e-8f2a-4c3d-9a1b-2c3d4e5f6a7b",
  "ts": 1787991601234,
  "payload": {
    "speakerMemberId": "0b9e6b7e-8f2a-4c3d-9a1b-2c3d4e5f6a7b",
    "speakerName": "张伟",
    "ts": 1787991601234,
    "text": "应该是 useEffect 这里。",
    "final": true
  }
}
```

约定：partial 覆盖键 = `speakerMemberId + ts`；侧栏只稳定展示 final 条目，partial 仅做即时刷新（交互稿 §8：最近 2~3 条）。

### 4.12 DataChannel 附加事件：voice.level / chat.message

> 这两个事件不在 PRD §10.4 首版清单内，但分别是 T2.3（发言指示）、T3.2（文字聊天）的必需承载，随 v1 一并冻结，纳入 §7 版本化管理。

**voice.level** payload（发言音量 + 麦克风状态）：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| level | number | 是 | 实时音量 0~1，保留 2 位小数（`AnalyserNode` 计算，T2.3） |
| micState | `"on"` \| `"off"` | 是 | 发送端当前麦克风状态，兼作全员静音图标（🎤/🔇）的同步通道（§3.4） |

频率约定：节流 ≥100ms（≤10Hz）；静音时 `level` 恒为 0 但仍按频率发送（兼作发言活性信号）。发言高亮阈值（建议 `level > 0.1`）与降频优化待 T2.3 实测（TODO-2）。

```json
{
  "protocolVersion": "1.0",
  "id": "dfeafabc-3cde-4e7f-8a9b-0d1e2f3a4b5c",
  "type": "voice.level",
  "sender": "0b9e6b7e-8f2a-4c3d-9a1b-2c3d4e5f6a7b",
  "ts": 1787991602000,
  "payload": { "level": 0.73, "micState": "on" }
}
```

**chat.message** payload（文字聊天，转写降级通道，T3.2）：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| text | string | 是 | 1~500 字符 |

```json
{
  "protocolVersion": "1.0",
  "id": "eafbbccd-4def-4f8a-9bcd-1e2f3a4b5c6d",
  "type": "chat.message",
  "sender": "3f8a1c2d-5b6e-4f70-8a92-1b2c3d4e5f60",
  "ts": 1787991605000,
  "payload": { "text": "我把报错栈贴这里了，你看下第三行" }
}
```

顺序依据 envelope.ts；接收端按 ts 排序写入 recentMessages（T3.1）。

### 4.13 状态补发（重放）约定

DataChannel 事件为 **P2P 扇出**：发送端逐一向已建立 DC 的对端发送。为此区分两类：

| 类别 | 事件 | 规则 |
|---|---|---|
| **会话态** | `screen.start/stop`、`agent.status`、`voice.level` | 每当与某对端的 DC 新建/重连完成，发送端**必须**向该对端补发当前会话态（screen 当前值、agent 当前值；voice.level 随节流自然恢复） |
| **历史流** | `meeting.transcript`、`chat.message` | 不补发；新成员的历史上下文由 Host 的 MeetingContext 提供（T3.1，经 Agent Tools 读取） |

所有会话态事件幂等（以最新一条为准），补发不产生副作用。该约定保证：后加入的成员在 Mesh 建立后立即看到"谁在共享、Agent 在干什么"，无需等待下一次状态变化。

---

## 5. 信令握手时序

### 5.1 时序图

```
 新成员 C                    Host（房间发起人的 Harness 实例）           已有成员 A、B
    │                                │                                    │
    │ ① ws connect                   │                                    │
    │    ws://<announce.host>:<port> │                                    │
    ├───────────────────────────────>│                                    │
    │ ② envelope: room.join          │                                    │
    │    { name, secret?, micState } │                                    │
    ├───────────────────────────────>│ ③ 校验：版本/口令/上限/id 查重        │
    │                                │    （失败 → room.reject，断开）       │
    │                                │ ④ envelope: member.join(C) 广播     │
    │                                ├───────────────────────────────────>│
    │ ⑤ envelope: member.list        │    （全量成员快照，含 C 自己）          │
    │<───────────────────────────────┤                                    │
    │                                │                                    │
    │ ⑥ rtc.offer(target=A)          │   （C 按 target id 升序逐个发起，      │
    ├───────────────────────────────>│     New Joiner 模式，§4.8）          │
    │                                │────────── rtc.offer(target=A) ────>│
    │                                │<───────── rtc.answer(target=C) ─────┤
    │<───────────────────────────────┤                                    │
    │ ⑦ rtc.ice ⇄ rtc.ice（双向 trickle，§4.7）                            │
    │                                                                     │
    │<══════ P2P 建连：MediaStream（语音）+ DataChannel "meeting" ══════════>│
    │                                                                     │
    │ ⑧ A/B 经 DataChannel 向 C 补发当前会话态（screen/agent，§4.13）          │
    │                                                                     │
    │                 Mesh 完成，C 进入会议（member.list 全序 = UI 成员列表）   │
```

### 5.2 步骤说明

1. **发现**：C 从 `room_announce` 获得 `host:port`（§2）；
2. **连接**：C 与 Host 建立信令 WebSocket；
3. **校验**：Host 收到 `room.join` 后依次校验 `protocolVersion` major（→ `VERSION_MISMATCH`）、口令（→ `BAD_SECRET`）、成员上限（V0.1 建议 ≤8，→ `ROOM_FULL`）、sender id 查重（房内冲突即拒绝）；任一失败回 `room.reject` 并断开；
4. **注册与广播**：校验通过后 Host 写入成员注册表（role 一律 `member`），向其余成员广播 `member.join`；
5. **全量快照**：Host 向 C 回 `member.list`（含 Host 自己与 C）。注意：**房间创建者不经 `room.join`**——创建即本机 RoomService 直接注册（role=`host`）；所有经信令加入的成员 role 一律 `member`（V0.1 无角色转移）；
6. **New Joiner offer**：C 对 `member.list` 中除自己外的每个成员发起 `rtc.offer`，按 target id 升序**逐个串行**（建议间隔 ≥50ms，避免瞬时并发风暴）；已有成员 answer；
7. **ICE**：双向 trickle（§4.7），Mesh 逐对建立；DataChannel 由每对中 id 较大一端创建（§4.8 第 5 条）；
8. **状态补发**：每对 DC 打开后，老成员向 C 补发当前会话态（§4.13），C 即获得"谁在共享、Agent 在干什么"；
9. **会议中**：成员增减走 `member.join` / `member.leave` 增量广播；Host 退出走 `room.ended`；普通成员掉线由心跳判定（§5.3）。

### 5.3 信令控制消息（Host → 成员，均用 envelope 封装）

**member.list**（`room.join` 的成功应答）payload：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| room | object | 是 | `{ roomId, roomName, protocolVersion, hostId }` |
| members | member[] | 是 | 全量成员快照（含 Host 与加入者本人），按入房时间排序 |

**room.reject**（加入被拒，随后断开）payload：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| code | string | 是 | `BAD_SECRET` \| `ROOM_FULL` \| `VERSION_MISMATCH` \| `ROOM_CLOSED` \| `BAD_REQUEST`（rc2 增补：畸形 join payload——显示名/micState/sender 非法） |
| message | string | 否 | 人类可读原因，供大厅 toast 直接展示 |

**room.ended**（Host 退出散会，PRD §7.2）payload：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| reason | string | 否 | `"host-left"`（V0.1 唯一取值） |

成员收到 `room.ended`：提示"会议发起人已退出，本次协作会议已结束"，清理本地 RTC 与状态，返回协作大厅。

**心跳**：使用 WebSocket 协议层 ping/pong 帧（不占 envelope）。建议：客户端 10s 一跳，Host 30s 未收到即判掉线 → 广播 `member.leave(reason="timeout")`（建议值，TODO-3）。

### 5.4 Room Secret（加入口令）MVP 方案

- 创建房间时可选设置口令；`room_announce` 仅携带 `secretRequired` 布尔，**不含口令本身**（§2.2）；
- 加入时口令以**明文**放 `room.join.payload.secret`（§4.2），Host 比对后回 `member.list` 或 `room.reject(BAD_SECRET)`；
- V0.1 接受局域网明文 MVP：ws 无 TLS、口令明文传输的安全缺口由企业内网边界覆盖；挑战-应答 / 摘要校验为 v1.x 候选（TODO-4，对应 PRD 开放问题 5）；
- 防爆破：同一连接连续 3 次 `BAD_SECRET` 后 Host 主动断开（建议值）；
- 口令如何分发给团队成员（口头 / 二维码）属 UI 层决策，协议只定义校验接口。

---

## 6. 通道分工

| 通道 | 承载 | 事件 / 数据 | 拓扑 | 说明 |
|---|---|---|---|---|
| UDP 组播（发现平面） | 房间发现 | `room_announce` | Host → 局域网（单向） | 无会话状态，见 §2 |
| 信令 WebSocket（Host，默认 :18990） | 房间与成员一致性、RTC 协调 | `room.join`、`room.leave`、`member.join`、`member.leave`、`rtc.offer`、`rtc.answer`、`rtc.ice`、`member.list`、`room.reject`、`room.ended` | 成员 ⇄ Host ⇄ 成员（广播/定向） | 成员注册表权威在 Host；**信令只协调、不传媒体**（PRD §7.3 / §8.4） |
| RTCDataChannel（label `"meeting"`，每对成员一条，V0.1 可靠有序） | 协作状态与会议上下文 | `screen.start`、`screen.stop`、`agent.status`、`meeting.transcript`、`voice.level`、`chat.message` | P2P 扇出 | 高频数据直达，不经 Host；可靠性策略见 TODO-2 |
| WebRTC MediaStream | 媒体 | 麦克风音频（Opus）、屏幕视频（VP8/H.264），屏幕音频预留 | P2P Mesh 直连 | 不经 Host 转发（PRD §7.3）；摄像头 V0.1 不做 |

分工依据：成员表需要**全序与权威性**（Host 裁决）；协作状态需要**点对点、高频、低延迟**且不希望 Host 成为吞吐瓶颈；媒体流量大且 PRD 明确 P2P 直连。Host 进程退出时信令 ws 全断（即会议结束，PRD §7.2），DC 与媒体随 Mesh 自然消亡——不存在需要维护的"半可用"状态。

---

## 7. 版本化与兼容

### 7.1 版本号与携带位置

- `protocolVersion` 为字符串 `"major.minor"`，v1 冻结为 **`"1.0"`**；兼容性判断只看 **major**，minor 表示向后兼容增量；
- 携带位置：`room_announce.protocolVersion`（顶层，§2.2）与 `envelope.protocolVersion`（顶层，每条消息，§3.2）；信令 ws 无独立握手版本字段——版本检查发生在首条 `room.join` 与其应答上。

### 7.2 变更分类规则

| 变更类型 | 版本动作 | 示例 |
|---|---|---|
| 新增**可选**字段 | minor + 1 | `screen.start` 增加 `withAudio` |
| 新增事件类型 | minor + 1 | 未来新增 `meeting.topic` |
| 新增枚举取值（要求接收端容忍未知值） | minor + 1 | `agent.status.state` 增加新状态 |
| 删除 / 改名字段；改字段类型；改必填性；改既有枚举值语义 | **major + 1** | `micState` 改为布尔；删除 `rtc.ice.target` |

### 7.3 协商与拦截

1. **大厅**：`room_announce.protocolVersion` 的 major ≠ 本端 major → 列表中置灰/隐藏并提示"版本不兼容"；
2. **JOIN**：`room.join.protocolVersion` major 不符 → `room.reject(VERSION_MISMATCH)`；
3. **DataChannel**：首条事件防御性校验（同一房间内理论一致，防御混入异版本端）。

接收端兼容基本法：未知**事件类型**与未知**字段**必须忽略（向前兼容）；未知**枚举值**按最接近语义回落（如 `agent.status` 未知态显示 detail 或默认短语）。

### 7.4 v1 冻结后的变更流程

1. 在本文档 §9 变更记录追加条目，升 minor / major，同步更新对应 payload 字段表与 JSON 示例（**文档先行**，dev-plan §11 工程约定）；
2. 协议常量（版本号、事件类型枚举、DC label、默认端口）收敛到共享代码单点定义，禁止散落魔法字符串；
3. major 升级在 V0.1 阶段**不做多版本并存**：major 不符直接拒绝并提示升级（团队内部两端同步发版即可）。

---

## 8. 遗留 TODO

| 编号 | 事项 | 依赖 / 归属 | 说明 |
|---|---|---|---|
| TODO-1 | 组播地址 / 端口 / TTL / 广播间隔定稿 | T0.3 Spike（Gate B） | §2.4 全部为建议值；组播不可用则切 mDNS（bonjour-service）或手动 IP 兜底，`room_announce` 字段语义不变 |
| TODO-2 | DataChannel 可靠性策略 | T2.6 | V0.1 默认单条可靠有序通道（`ordered=true`）；`voice.level` 是否拆 lossy 通道（`maxRetransmits=0`）或降频，待实测带宽/CPU 后定 |
| TODO-3 | 心跳间隔 / 超时阈值定稿 | T1.2 | 建议 10s / 30s，联调校准 |
| TODO-4 | Room Secret 安全升级（挑战-应答 / ws TLS） | v1.x | MVP 明文方案仅限可信局域网（§5.4） |
| TODO-5 | `meeting.topic`（当前讨论）事件化 | v1.x 候选 | topic 现属 MeetingContext 内部状态（T3.1 先手动置顶）；若需要全员实时广播再入协议 |
| TODO-6 | `agent.status` 结果卡结构化 | v1.x | V0.1 结果摘要（修改文件数 / 测试结果）放 `detail` 文本；结构化字段待「让 Agent 实现」闭环稳定后定义 |
| TODO-7 | 转写汇聚位置 | T4.2 前定稿 | 本协议按 dev-plan T4.2 假定**各端转写自己并经 DC 广播**；Host 汇聚为备选（PRD 开放问题 3），若切换仅影响 `meeting.transcript` 发送方 |
| TODO-8 | Host 信令端口冲突与防火墙放行 | T0.3 / T1.2 | 默认 18990；冲突递增重试策略与防火墙提示待定（PRD 开放问题 7） |
| TODO-9 | 跨子网 / 企业 AP 隔离兜底 | T0.3 之后 | 手动 IP 直连所需的最小入口（是否复用 `room_announce` 字段直填 host:port）待 Spike 结论 |
| TODO-10 | 多人同时「让 Agent 实现」的冲突策略 | T3.5 前 | 队列 / 锁 / 仅 Host 可触发三选一（PRD 开放问题 13）；协议侧暂不新增事件 |

---

## 9. 变更记录

| 版本 | 状态 | 说明 |
|---|---|---|
| v1.0-rc1 | 冻结候选 | T0.4 初稿：`room_announce` 报文、envelope 封包、11 个核心事件 + 2 个附加事件（voice.level / chat.message）、3 个信令控制消息、New Joiner 握手时序与完美协商约定、通道分工、版本化规则 |
| v1.0-rc2 | 冻结候选（修订） | T1.1 实现反馈：`room.reject` 新增 `BAD_REQUEST` 拒绝码（畸形 join payload——显示名 1~24 字符校验、micState 非法、sender 非 uuid）；minor 增量 |

> 冻结范围：§3 envelope 结构、§4 事件类型与 payload 必填字段、§5 握手时序与控制消息、§6 通道分工、§7 版本规则。变更须按 §7.4 流程执行并记录于上表。
