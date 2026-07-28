# Onion Capability Gate 对齐设计

**日期:** 2026-07-28  
**状态:** 已审（含 Web 选等级 UI）  
**范围:** `@harness/onion` + `@harness/protocol` + Control authorize 消费者 + Web「工具选等级」UI；本轮不做参数级规则。

## 问题

当前能力档语义、默认契约与 runtime 行为不一致：

- 契约写着 L1 `autoAllow` / L2 `autoAllow: false` / L3 `requireConfirm`
- `createCapabilityGateMiddleware` 硬编码 L1 放行、L3 → ask、L2 放行，且**不读** `config.levels`
- 工具分档写死在 `classifyToolCapability.ts`
- 默认还有空跑的 `require-confirm` 层，与 gate 的 ask 重叠
- 策略实现塞在 `runtime.ts` 管道类里

## 目标语义

| 等级 | 裁决 | 默认工具来源 |
|------|------|----------------|
| **L1** | `allow` | 原 L1 名单（Read / FileWrite / Glob…） |
| **L2** | `ask` | 原 L3 特权名单（Bash / Agent / WebFetch…）+ 未列出的工具 |
| **L3** | `deny` | 默认空名单 |

未列入任何 `tools` 档 → **`defaultLevel: L2`**（ask）。

## 默认层

只保留：

1. `audit` — 记账，不裁决  
2. `capability-gate` — 唯一策略层  

**全删 `require-confirm`：** 协议 `OnionLayerType`、runtime 分支、默认层、Web 类型、相关测试一并移除，不保留「以后手动加层」。

## 契约形状

`capability-gate.config`：

```json
{
  "levels": {
    "L1": "allow",
    "L2": "ask",
    "L3": "deny"
  },
  "tools": {
    "L1": ["FileRead", "Read", "FileWrite", "FileEdit", "Glob", "Grep", "TaskCreate", "TaskUpdate", "TaskList", "TaskGet", "EnterPlanMode", "ExitPlanModeV2"],
    "L2": ["Bash", "PowerShell", "REPL", "Agent", "WebFetch", "WebSearch", "CronCreate", "CronDelete", "Skill", "MCP", "EnterWorktree", "ExitWorktree"],
    "L3": []
  },
  "defaultLevel": "L2"
}
```

`@harness/protocol`：

- `OnionLayerType` 去掉 `require-confirm`
- `CapabilityGateConfig` 改为上述形状（替换未使用的 `level` / `allowedTools` / `disallowedTools`）

## 代码结构

- `packages/onion/src/runtime.ts` — 只做 pipe：`compose` / `load` / `evaluate` / 按 `type` 查表挂中间件  
- `packages/onion/src/layers/capabilityGate.ts` — `createCapabilityGateMiddleware` + 从层 `config` 解析 `tools` / `levels` / `defaultLevel`  
- `packages/onion/src/layers/audit.ts` — audit 中间件  
- `classifyToolCapability` — 纯函数：入参为 `toolName` + 已解析的 gate 配置（或 tools 映射）；**不再**持有模块级硬编码 Set 作为真源。`OnionRuntime` 在 `load`/`updateLayers` 后缓存 gate 配置，并暴露 `classify(toolName)`（内部调该纯函数），供 `handleAuthorize` 使用  
- `defaultLayers.ts` — 仅 audit + capability-gate，config 为上表（默认名单只存在于此，作为契约出厂值）

未知层类型（`path-sandbox` 等）：继续 no-op `next()`。

## 迁移

对已有 `.harness/contract-onion.json`（如当前仓库内文件）：

1. load 时丢弃 `type === 'require-confirm'` 的层  
2. 若 capability-gate 缺少规范的 `tools` / `levels`（字符串裁决），用 `DEFAULT_ONION_LAYERS` 中对应字段补齐  
3. 旧 `levels` 对象（`autoAllow` / `requireConfirm`）映射为：L1 → `allow`，旧 L3 confirm → 新 L2 `ask`，新 L3 → `deny`；工具名单：原硬编码 L3 → 写入 `tools.L2`，`tools.L3 = []`

## Control / headless

`handleAuthorize`：

- `deny` **永不**被 `autoAllow` 绕过  
- 仅 `ask` 受 `autoAllow` 影响（可跳过确认变 allow）  
- 删除「非 L3 才 auto」分支：新 L3 已是 deny，不会进入 ask；`unsafeMode` 对本 capability 档位不再特殊放行（若 headless 别处仍读该字段则不动其存储）

`classifyToolCapability` 必须与 runtime 当前契约一致（同一名单源）。

## Web：工具选等级 UI

在现有 Settings → Contract Onion（`OnionEditor`）上扩展，不新开页面。

**交互（推荐：扁平表 + 下拉）**

1. 列表里点开 / 展开 `capability-gate` 层，显示编辑区  
2. **档位裁决**：L1 / L2 / L3 各一个下拉，选项为 `allow` | `ask` | `deny`（写回 `config.levels`）  
3. **默认档**：`defaultLevel` 下拉 L1|L2|L3（未列入工具走此档）  
4. **工具表**：每一行 = 工具名 + 等级下拉（L1 / L2 / L3）  
5. 可「添加工具」：输入工具名，默认 L2；可删除行；同一工具只能出现在一档  
6. 保存：写回该层完整 `config`（`levels` + `tools` + `defaultLevel`）  
7. `OnionLayerForm` 可实现为 gate 专用编辑块，或内联进 `OnionEditor` 展开区——二选一，实现时选改动更小的

**数据流:** 仍走现有 `GET/PUT /api/onion`；PUT 的 layers 含更新后的 capability-gate `config`。Control `saveOnion` 已有路径，无需新 API。

**不做（UI 本轮）:** 三列拖拽看板、参数级规则编辑。

## 测试

- gate：L1 → allow；L2（含原 Bash 等）→ ask；L3 名单内 → deny；未知工具 → ask（default L2）  
- 默认契约无 `require-confirm`  
- load 旧契约：剥离 require-confirm、补齐/映射 levels+tools  
- 删除 `require-confirm yields ask` 用例，改为 capability-gate 用例  
- `authorize-headless` / MCP authorize 测试按新档位更新（原 L3 工具现为 L2 ask）  
- Web：展开 gate 后改工具等级 / 档位裁决 / defaultLevel 并保存，再 GET 可见 `config` 更新（组件测或轻量集成）

## 非目标（本轮）

- 参数级规则（如 `Bash(rm *)`）  
- Claude Code 式独立 allow/ask/deny 规则引擎（档位已覆盖主路径；映射在 gate `levels` 里配即可）  

## 成功标准

1. 出厂默认一致：L1 allow / L2 ask / L3 deny；runtime 读契约 `levels`，不硬编码裁决  
2. 工具分档真源在契约；代码无第二份硬编码名单作为权威  
3. `runtime.ts` 无 capability 业务分支  
4. 仓库内无 `require-confirm` 类型与实现残留（协议 + onion + web types + 测试）  
5. 现有 `.harness/contract-onion.json` 经 load 迁移后可用，无需手删文件才能启动  
6. Web 可编辑：工具→档位、档位→裁决、`defaultLevel`，并持久化到契约  

