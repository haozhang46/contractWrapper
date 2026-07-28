# Onion Capability Gate 对齐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对齐洋葱能力档为 L1 allow / L2 ask / L3 deny；名单进契约；删掉 require-confirm；runtime 只做 pipe；Web 可编辑工具等级。

**Architecture:** `capability-gate.config` 持有 `levels` / `tools` / `defaultLevel`；`layers/capabilityGate.ts` 读配置裁决；`OnionRuntime` 缓存 gate 配置并暴露 `classify`；load 时迁移旧契约；Settings 展开 gate 可编辑 `tools`、`levels`、`defaultLevel`。

**Tech Stack:** Bun、`@harness/protocol`、`@harness/onion`、Hono Control、React Web。

## Global Constraints

- L1 → `allow`；L2 → `ask`；L3 → `deny`；未列入工具 → `defaultLevel`（默认 L2）
- 全删 `require-confirm`（协议类型、实现、默认层、Web 类型、测试）
- 工具分档真源在契约；`defaultLayers` 仅作出厂值
- `deny` 不被 `autoAllow` 绕过；仅 `ask` 可被 `autoAllow` 跳过确认
- 本轮不做参数级规则；UI **可**改 levels→裁决与 defaultLevel

---

## File map

| Path | Responsibility |
|------|----------------|
| `packages/protocol/src/index.ts` | 去掉 `require-confirm`；重写 `CapabilityGateConfig` |
| `packages/onion/src/defaultLayers.ts` | 仅 audit + gate；新 config |
| `packages/onion/src/layers/audit.ts` | audit 中间件 |
| `packages/onion/src/layers/capabilityGate.ts` | 解析 config、middleware、纯函数 classify |
| `packages/onion/src/layers/migrate.ts` | 旧契约剥离/补齐 |
| `packages/onion/src/classifyToolCapability.ts` | 薄 re-export 或改为接受 config 的纯函数 |
| `packages/onion/src/runtime.ts` | 纯 pipe + `classify()` + load 时 migrate |
| `packages/onion/src/__tests__/runtime.test.ts` | 新语义测试 |
| `apps/control/src/mcp/handlers.ts` | 用 `runtime.classify`；简化 autoAllow |
| `apps/control` authorize / onion 测试 | 按新档位 |
| `apps/web/src/types/onion.ts` | 去掉 require-confirm |
| `apps/web/src/components/OnionEditor.tsx` | 展开 gate：工具表 + levels + defaultLevel |
| `.harness/contract-onion.json` | 可选：写成新默认（或依赖 load 迁移） |

---

### Task 1: Protocol — 删 require-confirm + CapabilityGateConfig

**Files:**
- Modify: `packages/protocol/src/index.ts`
- Test: 无独立 protocol 测试；由 onion 测试覆盖

**Interfaces:**
- Produces: `CapabilityGateConfig` 如下；`OnionLayerType` 无 `require-confirm`

- [ ] **Step 1: 改协议类型**

将 `OnionLayerType` 去掉 `'require-confirm'`。

替换 `CapabilityGateConfig` 为：

```ts
export type LayerDecision = 'allow' | 'deny' | 'ask'

export interface CapabilityGateConfig {
  levels: Record<CapabilityLevel, LayerDecision>
  tools: Record<CapabilityLevel, string[]>
  defaultLevel: CapabilityLevel
}
```

- [ ] **Step 2: 确认无其它文件仅依赖旧 `CapabilityGateConfig` 字段**

Run: `rg "allowedTools|disallowedTools|require-confirm" --glob '*.ts' --glob '*.tsx'`  
Expected: 仅 onion/web/control 待后续任务清理的命中

- [ ] **Step 3: Commit**

```bash
git add packages/protocol/src/index.ts
git commit -m "$(cat <<'EOF'
refactor(protocol): capability-gate config and drop require-confirm type

EOF
)"
```

---

### Task 2: defaultLayers + classify 纯函数 + capabilityGate 层

**Files:**
- Modify: `packages/onion/src/defaultLayers.ts`
- Create: `packages/onion/src/layers/capabilityGate.ts`
- Modify: `packages/onion/src/classifyToolCapability.ts`
- Test: `packages/onion/src/__tests__/capabilityGate.test.ts`（新建）

**Interfaces:**
- Produces:
  - `parseCapabilityGateConfig(raw: Record<string, unknown>): CapabilityGateConfig`
  - `classifyToolCapability(toolName: string, config: CapabilityGateConfig): CapabilityLevel`
  - `decisionForLevel(level: CapabilityLevel, config: CapabilityGateConfig): LayerDecision`
  - `createCapabilityGateMiddleware(layer: OnionLayerConfig): OnionMiddleware`
  - `DEFAULT_ONION_LAYERS` 仅两层，gate config 含完整 tools/levels/defaultLevel

- [ ] **Step 1: 写失败测试**

`packages/onion/src/__tests__/capabilityGate.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import {
  classifyToolCapability,
  decisionForLevel,
  parseCapabilityGateConfig,
} from '../layers/capabilityGate.ts'
import { DEFAULT_ONION_LAYERS } from '../defaultLayers.ts'

const gate = DEFAULT_ONION_LAYERS.find(l => l.type === 'capability-gate')!
const config = parseCapabilityGateConfig(gate.config)

describe('capabilityGate config', () => {
  test('L1 Read is allow', () => {
    expect(classifyToolCapability('Read', config)).toBe('L1')
    expect(decisionForLevel('L1', config)).toBe('allow')
  })
  test('Bash is L2 ask', () => {
    expect(classifyToolCapability('Bash', config)).toBe('L2')
    expect(decisionForLevel('L2', config)).toBe('ask')
  })
  test('unknown defaults L2', () => {
    expect(classifyToolCapability('TotallyNewTool', config)).toBe('L2')
  })
  test('explicit L3 is deny', () => {
    const withDeny = parseCapabilityGateConfig({
      ...config,
      tools: { ...config.tools, L3: ['Danger'] },
    })
    expect(classifyToolCapability('Danger', withDeny)).toBe('L3')
    expect(decisionForLevel('L3', withDeny)).toBe('deny')
  })
})
```

- [ ] **Step 2: Run 确认失败**

Run: `bun test packages/onion/src/__tests__/capabilityGate.test.ts`  
Expected: FAIL（模块/默认层尚未就绪）

- [ ] **Step 3: 实现 defaultLayers + capabilityGate + classify 薄封装**

`defaultLayers.ts`：删除 require-confirm；gate `config`：

```ts
levels: { L1: 'allow', L2: 'ask', L3: 'deny' },
tools: {
  L1: [/* 原 L1_TOOLS */],
  L2: [/* 原 L3_TOOLS */],
  L3: [],
},
defaultLevel: 'L2',
```

`layers/capabilityGate.ts`：实现 parse（缺字段用默认补齐）、classify（先查 L3/L1/L2 列表，冲突时优先 L3 > L1 > L2）、middleware（按 decision 设 `ctx.decision` 为 allow 路径则 `next()`，ask/deny 则短路设 decision+message）。

`classifyToolCapability.ts`：改为从 `./layers/capabilityGate.ts` re-export 需要 config 的函数；或删除并由 index 改 export。**不要**再保留模块级 Set。

- [ ] **Step 4: Run 测试通过**

Run: `bun test packages/onion/src/__tests__/capabilityGate.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/onion/src/defaultLayers.ts packages/onion/src/layers/capabilityGate.ts packages/onion/src/classifyToolCapability.ts packages/onion/src/__tests__/capabilityGate.test.ts
git commit -m "$(cat <<'EOF'
feat(onion): capability-gate config-driven L1 allow / L2 ask / L3 deny

EOF
)"
```

---

### Task 3: audit 层拆出 + runtime 纯 pipe + migrate + classify API

**Files:**
- Create: `packages/onion/src/layers/audit.ts`
- Create: `packages/onion/src/layers/migrate.ts`
- Modify: `packages/onion/src/runtime.ts`
- Modify: `packages/onion/src/index.ts`
- Modify: `packages/onion/src/__tests__/runtime.test.ts`

**Interfaces:**
- Produces: `OnionRuntime.classify(toolName: string): CapabilityLevel`
- Produces: `migrateOnionLayers(layers: OnionLayerConfig[]): OnionLayerConfig[]`
- Consumes: Task 2 gate/audit factories

- [ ] **Step 1: 改写 runtime 测试（TDD）**

替换/删除 `require-confirm yields ask`。新增：

```ts
test('default contract: Bash asks, Read allows, L3 tool denies', async () => {
  const rt = new OnionRuntime()
  rt.load(null)
  expect((await rt.evaluate('Read', {})).decision).toBe('allow')
  expect((await rt.evaluate('Bash', {})).decision).toBe('ask')
  // 注入 L3
  const layers = rt.getLayers().map(l => {
    if (l.type !== 'capability-gate') return l
    return {
      ...l,
      config: {
        ...l.config,
        tools: {
          ...(l.config.tools as object),
          L3: ['Banned'],
        },
      },
    }
  })
  rt.updateLayers(layers)
  expect((await rt.evaluate('Banned', {})).decision).toBe('deny')
})

test('migrate strips require-confirm and remaps old levels', () => {
  // 构造旧 layers，load 后无 require-confirm，Bash 为 ask
})
```

- [ ] **Step 2: Run 确认失败**

Run: `bun test packages/onion`  
Expected: FAIL on new assertions / missing migrate

- [ ] **Step 3: 实现 audit.ts、migrate.ts、瘦身 runtime**

`migrate.ts` 行为：
1. filter out `type === 'require-confirm'`
2. 对 capability-gate：若 `levels.L1` 不是字符串 `'allow'|'ask'|'deny'`，视为旧格式 → 换成默认 levels；若无 `tools`，用 `DEFAULT` 的 tools（L2=原特权，L3=[]）
3. 返回迁移后 layers

`runtime.ts`：
- `layerToMiddleware` 只 switch `audit` | `capability-gate` | default no-op
- 删掉类内 createCapabilityGate / createRequireConfirm / createAudit 实现体（改 import）
- `load`/`updateLayers` 先 `migrateOnionLayers`
- 缓存 `gateConfig`；`classify(toolName)` 调纯函数
- 允许 `evaluate` 在 decision 已是 allow 时继续 next 直到末端默认 allow；ask/deny 短路

- [ ] **Step 4: Run `bun test packages/onion` — PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/onion
git commit -m "$(cat <<'EOF'
refactor(onion): pipe-only runtime with gate migrate and classify API

EOF
)"
```

---

### Task 4: Control handlers + 测试

**Files:**
- Modify: `apps/control/src/mcp/handlers.ts`
- Modify: `apps/control/src/mcp/__tests__/authorize.test.ts`
- Modify: `apps/control/src/mcp/__tests__/authorize-headless.test.ts`
- Modify: `apps/control/src/http/__tests__/onion-routes.test.ts`
- Modify: 凡引用 `classifyToolCapability(...)` 无 config 的调用点

**Interfaces:**
- Consumes: `onionRuntime.classify(toolName)`（或 evaluate 结果即可）
- autoAllow：仅当 `result.decision === 'ask'` 且 `settings.autoAllow` 时变 allow；**删除** `isL3` / `unsafeMode` 对本路径的特殊分支

- [ ] **Step 1: 改 authorize-headless / authorize 测试期望**

原「L3 WebSearch 需 confirm / unsafe 才过」→ WebSearch 现为 L2 ask：`autoAllow` 即可跳过；`deny` 工具测一条不被 autoAllow 绕过。

- [ ] **Step 2: 改 handlers**

```ts
const result = await runtime.evaluate(req.toolName, req.input)
// ...
if (result.decision === 'ask') {
  const settings = loadHeadlessSettings(opts.workspaceRoot)
  if (settings.autoAllow) {
    return { decision: 'allow' }
  }
  // pending + needs_confirm ...
}
```

`handleAuthorize` 的 runtime 类型增加可选 `classify`；测试用 fake 一并更新。

- [ ] **Step 3: onion-routes 测试去掉 require-confirm 断言**

- [ ] **Step 4: Run**

Run: `bun test apps/control/src/mcp apps/control/src/http/__tests__/onion-routes.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/control
git commit -m "$(cat <<'EOF'
fix(control): authorize autoAllow only for ask; drop L3 special-case

EOF
)"
```

---

### Task 5: Web 类型 + 选等级 UI

**Files:**
- Modify: `apps/web/src/types/onion.ts`
- Modify: `apps/web/src/components/OnionEditor.tsx`
- Modify: `apps/web/src/components/OnionLayerForm.tsx`（实现 gate 工具表，或内联 Editor）
- Modify: `apps/web` 样式若已有 `onion-editor` class，复用扩展

**Interfaces:**
- Consumes: `GET/PUT /api/onion`
- Produces: 展开 capability-gate 后编辑 `config.tools`，保存整份 layers

- [ ] **Step 1: 去掉 web `OnionLayerType` 的 require-confirm**

- [ ] **Step 2: 实现展开 UI**

在 `OnionEditor`：
- state：`expandedId: string | null`
- gate 层显示「编辑」按钮；展开后：
  - **Levels**：L1/L2/L3 各一 `<select>`（allow|ask|deny）
  - **defaultLevel**：`<select>` L1|L2|L3
  - **工具表**：从 `config.tools` 展平为 `{ name, level }[]`；每行等级下拉 + 删除；底部添加（默认 L2）
  - 「保存」→ 写回完整 `config: { levels, tools, defaultLevel }`，调用现有 `save`
  - 若字段缺失，打开编辑区时用出厂默认补齐到本地 state

- [ ] **Step 3: 手动或轻量测试**

Run control+web；Settings → 把某工具改为 L3 → 保存 → 刷新仍在 L3。

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "$(cat <<'EOF'
feat(web): edit capability-gate tools, levels, and defaultLevel

EOF
)"
```

---

### Task 6: 落地仓库契约文件 + 全量回归

**Files:**
- Modify: `.harness/contract-onion.json`（写成新默认形状，去掉 require-confirm）

- [ ] **Step 1: 重写 `.harness/contract-onion.json` 为 Task 2 默认 gate 形状**

- [ ] **Step 2: 全量相关测试**

Run: `bun test packages/onion packages/protocol apps/control/src/mcp apps/control/src/http/__tests__/onion-routes.test.ts`  
Expected: PASS

- [ ] **Step 3: `rg require-confirm` 应为 0（文档/历史 plan 可忽略；源码与测试必须为 0）**

- [ ] **Step 4: Commit**

```bash
git add .harness/contract-onion.json
git commit -m "$(cat <<'EOF'
chore: refresh contract-onion.json to L1/L2/L3 gate config

EOF
)"
```

---

## Spec coverage check

| Spec 项 | Task |
|---------|------|
| L1 allow / L2 ask / L3 deny | 2, 3 |
| 名单进契约 | 2 |
| 删 require-confirm | 1, 2, 3, 4, 5, 6 |
| runtime 纯 pipe | 3 |
| migrate 旧 JSON | 3, 6 |
| handleAuthorize autoAllow | 4 |
| Web 选等级 + 改 levels/defaultLevel | 5 |
| 不做参数级规则 | 遵守 |

---
