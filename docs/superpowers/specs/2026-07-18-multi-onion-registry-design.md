# Multi-Onion Registry — 多套洋葱 + Layer 函数编辑器

**日期：** 2026-07-18  
**状态：** Draft（待用户确认后 Approved）  
**宿主：** `harness-console`（`packages/onion`、`apps/control`、`apps/web`）  
**范围：** 多套命名洋葱注册表、default 不可删、Layer 列表 CRUD、JS 函数层编辑器、authorize 预留 `onionId`、旧单文件迁移  
**非范围：** Workflow 节点选洋葱 UI、LangGraph/Python 编排、洋葱剖面可视化、全局 Layer 复用库、自定义层强沙箱隔离产品化

## 背景与目标

当前 Workspace 只有一条全局洋葱（`.harness/contract-onion.json` + 单例 `OnionRuntime`）。Chat、Subagent、工具授权都过同一条链。Settings 仅有层列表（开关/排序/删），新增/改参表单未完成，且不支持多套配置。

**目标：** 把洋葱拆成可管理的多套资源：

- Settings 可新增 / 编辑 / 删除多套洋葱；**default 不可删**（可改）
- 每套洋葱 = 有序 layer 列表；运行时 Koa 式 `compose`（函数式管道）
- Layer 可用内置策略，或 **JS 函数**（`(ctx, next) => …`）
- Chat / Subagent / 未指定套装的调用 **一律走 default**
- Workflow 节点选套 **本轮不做**；authorize 预留 `onionId` 供后续接入

## 核心模型

洋葱不是业务编排图。Workflow / LangGraph 才是图；洋葱是授权路径上的 **多层积木栈**。

- 多个洋葱 `{a, b, c, …}`，其中一套为 default  
- 每个洋葱持有 `layers[]`；不同列表 = 不同策略组合  
- 授权、审计、门控等 **都只是某一种 layer**，不是特殊旁路  
- Layer 编辑器产出可组合函数；内置类型是预置函数，JS `source` 是用户写的函数  

后续 Workflow（无论本地 JS、Python，或线上 LangGraph）只要工具调用进入 Harness `authorize` 并带上 `onionId`，即可套用某套洋葱。

## 架构结论

采用 **洋葱目录 + 层内嵌脚本**：

```
.harness/
  onions/
    default.json
    <onionId>.json
  contract-onion.json        # 迁移源；迁完可删除或只读保留
```

列表 API 通过扫 `onions/*.json` 得到，不另维护 index 文件（避免双真相）。

| 组件 | 职责 |
|------|------|
| `OnionRegistry` | 加载多套；`get(id)` / `evaluate(..., { onionId? })`；热更新单套 |
| `OnionRuntime`（或等价 compose） | 对单套 layers 做 middleware compose |
| Settings Onions UI | 套装列表 + 单套层编辑 + JS 编辑器 |
| HTTP `/api/onions` | CRUD；旧 `/api/onion` 代理 default |

## 数据模型

### 单套洋葱文件

```ts
interface NamedOnion {
  version: 1
  id: string
  name: string
  layers: OnionLayer[]
}

type OnionLayer =
  | {
      id: string
      name: string
      enabled: boolean
      priority: number
      kind: 'builtin'
      type: OnionLayerType // audit | capability-gate | require-confirm | ...
      config: Record<string, unknown>
    }
  | {
      id: string
      name: string
      enabled: boolean
      priority: number
      kind: 'js'
      source: string // async (ctx, next) => { ... }
    }
```

### 约束

- **default 判定唯一规则：** `id === 'default'`。该套 **不可删除**；可改 `name` / `layers`。API 列表可派生 `isDefault: id === 'default'`，不另存字段。
- 无有效层（全关或空链）→ 拒绝一切特权调用（与现网安全默认一致）
- 单套内 `type === 'audit'` 的 builtin 层不可删（与现 UI 一致）；不阻止删除整套非 default 洋葱

### 迁移

启动时若存在 `.harness/contract-onion.json` 且尚无 `onions/default.json`：

1. 将旧 `layers` 写入 `onions/default.json`（`kind: 'builtin'`）
2. 加载进 Registry  
3. 旧文件可删除或保留只读；新写入只走 `onions/`

## 运行时

### OnionRegistry

- Bootstrap：扫 `.harness/onions/*.json`；若无 default 则写入出厂默认层  
- `evaluate(toolName, input, opts?: { onionId?: string })`  
  - 省略 / 空 → `default`  
  - 未知 id → **回退 default**，并记一条审计 warning（不 400，避免调用方短暂不一致时全挂）  
- 保存某套后只重载该套；进行中的 evaluate 用旧 compose 跑完即可  

### Layer → 函数

- `kind: 'builtin'` → 现有 `layerToMiddleware`  
- `kind: 'js'` → 编译 `source` 为 `OnionMiddleware`  
  - `ctx`：`toolName`、`input`、`decision`、`auditTrail`、`message`（可改写）  
  - 须调用 `next()` 进入内层，除非本层已 `deny` / `ask` 并中止  

### 错误

| 情况 | 行为 |
|------|------|
| JS 保存时编译失败 | **拒绝保存**，UI 报错 |
| JS 运行时抛错 | 本次调用 **deny** + 审计（`layerId` + 错误信息） |
| 删 default | HTTP 403；UI 禁用 |
| 未知 `onionId` | 回退 default + warning |

### Authorize 预留

- `AuthorizeRequest` 增加可选 `onionId?: string`  
- HTTP `POST /api/agent/onion/authorize` 与 MCP `onion.authorize` 透传  
- 本轮所有调用方不传 → 行为等于今日单链（default）

## Settings UI

1. **Onions 列表** — 名称、id、层数；新建默认 **从 default 深拷贝 layers**（可再改）；删除（default 禁用）  
2. **单套编辑** — 改 name；层列表（开关 / 排序 / 删）；添加层：`builtin`（type + config）或 `js`  
3. **JS 编辑器** — 默认模板：

```js
async (ctx, next) => {
  // ctx.toolName, ctx.input, ctx.decision, ctx.message
  await next()
}
```

本轮不做洋葱剖面可视化；列表 + 代码框即可。

### API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/onions` | 列表（id、name、layerCount、isDefault） |
| POST | `/api/onions` | 新建 |
| GET | `/api/onions/:id` | 读整套 |
| PUT | `/api/onions/:id` | 保存（含 layers；JS 须编译通过） |
| DELETE | `/api/onions/:id` | 删；default → 403 |
| GET/PUT | `/api/onion` | **兼容**：读写 default |

## 本轮非范围与后续接法

**不做：** Workflow 节点选洋葱、LangGraph/Python 引擎、可视化洋葱图、Layer 全局库、JS 层完整安全沙箱产品化。

**后续 Workflow：** 节点配置 `onionId` → 该步工具 `authorize({ onionId })`。编排实现可换；契约是授权入口，不是把图嵌进洋葱编辑器。

## 测试计划

- Registry：多套加载；删 default 失败；evaluate 默认 default；未知 id 回退  
- JS layer：allow / 改写 input / 抛错 → deny  
- HTTP：CRUD；DELETE default → 403；旧 `/api/onion` 仍操作 default  
- 迁移：旧 `contract-onion.json` → `onions/default.json`

## 成功标准

1. Settings 可管理多套洋葱；default 无法删除  
2. 可为层编写并保存可运行的 JS 函数；非法源码无法保存  
3. Chat/Subagent 行为与迁移后的 default 一致  

4. authorize 接受可选 `onionId`（本轮调用方不使用）  
5. 旧单文件 Workspace 启动后自动出现 default 套装  
