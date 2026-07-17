# Harness ↔ CCB 进程分离 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Web 壳与洋葱/Control 从 `ccb/harness/` 迁到本仓 `apps/*` + `packages/*`；CCB 仅留 MCP 薄钩子；tool 热路径经 `onion.authorize` / `onion.wait_resolve`，fail-closed。

**Architecture:** 单进程 Control（Hono HTTP :3100 + MCP stdio/SSE）拥有洋葱 runtime 与 `.harness` I/O；Vite Web :5173 只打 Control HTTP；CCB 无头进程作 MCP client。洋葱类型与 CCB `Tool` 解耦，使用 `packages/protocol` 中的纯数据契约。

**Tech Stack:** Bun workspaces, TypeScript, Hono, `@modelcontextprotocol/sdk`, Vite 8, React 19, Tailwind 4, Headless UI, bun:test

**Spec:** [2026-07-17-harness-control-ccb-process-separation-design.md](../specs/2026-07-17-harness-control-ccb-process-separation-design.md)

**Source to migrate:** `.claude/worktrees/feat+harness-t1-onion-web-shell/ccb/harness/`（若 worktree 不在，从该分支/历史取同等文件）

---

## File structure

```text
package.json                          # bun workspaces root
apps/web/                             # Vite React :5173
  package.json
  vite.config.ts
  index.html
  src/main.tsx
  src/App.tsx
  src/components/...
  src/styles/index.css
apps/control/                         # Bun Control :3100 + MCP
  package.json
  src/index.ts                        # boot HTTP + MCP
  src/bootstrap/init.ts
  src/bootstrap/loadOnion.ts
  src/bootstrap/loadCharter.ts
  src/http/app.ts                     # Hono app
  src/http/routes/onion.ts
  src/http/routes/charter.ts
  src/http/routes/confirm.ts
  src/http/routes/pending.ts
  src/pending/store.ts                # requestId → waiters
  src/mcp/server.ts                   # onion.authorize / wait_resolve
  src/audit/write.ts
packages/protocol/
  package.json
  src/index.ts                        # AuthorizeRequest/Result, OnionLayerConfig, …
packages/onion/
  package.json
  src/types.ts                        # re-export protocol + runtime-only types
  src/defaultLayers.ts
  src/runtime.ts
  src/__tests__/runtime.test.ts
ccb/src/harness/                      # ONLY thin hook in submodule
  mcpOnionBridge.ts                   # authorize + wait_resolve client
  # wire into canUseTool / hasPermissionsToUseTool
```

---

### Task 1: Root Bun workspace scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-07-17-harness-t1-onion-web-shell.md` (add superseded banner)

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "harness-console",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "web:dev": "bun run --filter @harness/web dev",
    "control:dev": "bun run --filter @harness/control dev",
    "agent:dev": "bun run scripts/agent-dev.ts",
    "test": "bun test packages apps/control",
    "typecheck": "bun run --filter '*' typecheck"
  }
}
```

- [ ] **Step 2: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["bun-types"]
  }
}
```

- [ ] **Step 3: Mark old T1 plan superseded**

At the top of `docs/superpowers/plans/2026-07-17-harness-t1-onion-web-shell.md`, insert:

```markdown
> **SUPERSEDED (layout):** 仓库布局与进程模型以
> [process-separation design](../specs/2026-07-17-harness-control-ccb-process-separation-design.md)
> 与 [本计划](./2026-07-17-harness-control-ccb-process-separation.md) 为准。
> 下文「代码放进 `ccb/harness/`」不再执行；能力清单仍可参考。
```

- [ ] **Step 4: Update root README scripts section**

Replace「本地跑 CCB」旁增加：

```markdown
## 本地跑中控（分离后）

```bash
bun install
bun run control:dev   # :3100 HTTP + MCP
bun run web:dev       # :5173 → proxy /api → :3100
# 另开终端：bun run agent:dev  # CCB 无头 + Control MCP（fail-closed）
```
```

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.base.json README.md docs/superpowers/plans/2026-07-17-harness-t1-onion-web-shell.md
git commit -m "chore: scaffold harness-console workspaces for process separation"
```

---

### Task 2: `packages/protocol` — 共享契约类型

**Files:**
- Create: `packages/protocol/package.json`
- Create: `packages/protocol/tsconfig.json`
- Create: `packages/protocol/src/index.ts`
- Test: `packages/protocol/src/__tests__/types.test.ts`

- [ ] **Step 1: Write failing test (shape guards)**

`packages/protocol/src/__tests__/types.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import {
  isAuthorizeResult,
  type AuthorizeResult,
} from '../index.ts'

describe('isAuthorizeResult', () => {
  test('accepts allow', () => {
    const r: AuthorizeResult = { decision: 'allow' }
    expect(isAuthorizeResult(r)).toBe(true)
  })

  test('accepts needs_confirm with requestId', () => {
    expect(
      isAuthorizeResult({
        decision: 'needs_confirm',
        requestId: 'req_1',
        message: 'Confirm Bash',
      }),
    ).toBe(true)
  })

  test('rejects needs_confirm without requestId', () => {
    expect(isAuthorizeResult({ decision: 'needs_confirm' })).toBe(false)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd /Users/hz/Desktop/fe/harness-console && bun test packages/protocol
```

Expected: fail (module not found)

- [ ] **Step 3: Implement protocol package**

`packages/protocol/package.json`:

```json
{
  "name": "@harness/protocol",
  "version": "0.0.1",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc -p tsconfig.json" }
}
```

`packages/protocol/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*"]
}
```

`packages/protocol/src/index.ts`:

```ts
export type CapabilityLevel = 'L1' | 'L2' | 'L3'

export type OnionLayerType =
  | 'audit'
  | 'capability-gate'
  | 'require-confirm'
  | 'path-sandbox'
  | 'network-allowlist'
  | 'deny-pattern'
  | 'custom'

export interface OnionLayerConfig {
  id: string
  type: OnionLayerType
  name: string
  enabled: boolean
  priority: number
  config: Record<string, unknown>
}

export interface ContractOnion {
  version: 1
  layers: OnionLayerConfig[]
}

export interface CapabilityGateConfig {
  level: CapabilityLevel
  allowedTools?: string[]
  disallowedTools?: string[]
}

export interface AuthorizeRequest {
  toolName: string
  input: Record<string, unknown>
  sessionId: string
  /** optional display hint */
  description?: string
}

export type AuthorizeDecision = 'allow' | 'deny' | 'needs_confirm'

export interface AuthorizeResult {
  decision: AuthorizeDecision
  requestId?: string
  message?: string
  reason?: string
}

export interface WaitResolveRequest {
  requestId: string
  /** ms; default 60000 on server */
  timeoutMs?: number
}

export interface WaitResolveResult {
  decision: 'allow' | 'deny'
  reason?: string
}

export function isAuthorizeResult(v: unknown): v is AuthorizeResult {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  if (o.decision !== 'allow' && o.decision !== 'deny' && o.decision !== 'needs_confirm') {
    return false
  }
  if (o.decision === 'needs_confirm' && typeof o.requestId !== 'string') {
    return false
  }
  return true
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
bun test packages/protocol
```

- [ ] **Step 5: Commit**

```bash
git add packages/protocol
git commit -m "feat: add @harness/protocol authorize and onion config types"
```

---

### Task 3: `packages/onion` — 解耦后的洋葱 runtime

**Files:**
- Create: `packages/onion/package.json`
- Create: `packages/onion/tsconfig.json`
- Create: `packages/onion/src/types.ts`
- Create: `packages/onion/src/defaultLayers.ts`
- Create: `packages/onion/src/runtime.ts`
- Create: `packages/onion/src/index.ts`
- Test: `packages/onion/src/__tests__/runtime.test.ts`

**Note:** 不再依赖 `ccb/src/Tool`。`execute` 入参为 `toolName` + `input`；层决策用 `'allow' | 'deny' | 'ask'`（`ask` → Control 映射为 `needs_confirm`）。

- [ ] **Step 1: Write failing tests**

`packages/onion/src/__tests__/runtime.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { OnionRuntime } from '../runtime.ts'
import type { ContractOnion } from '@harness/protocol'

describe('OnionRuntime', () => {
  test('empty non-audit chain denies', async () => {
    const rt = new OnionRuntime()
    const contract: ContractOnion = {
      version: 1,
      layers: [
        {
          id: 'audit',
          type: 'audit',
          name: 'Audit',
          enabled: true,
          priority: 0,
          config: {},
        },
      ],
    }
    rt.load(contract)
    const d = await rt.evaluate('Bash', { command: 'ls' })
    expect(d.decision).toBe('deny')
  })

  test('require-confirm yields ask', async () => {
    const rt = new OnionRuntime()
    rt.load({
      version: 1,
      layers: [
        {
          id: 'audit',
          type: 'audit',
          name: 'Audit',
          enabled: true,
          priority: 0,
          config: {},
        },
        {
          id: 'rc',
          type: 'require-confirm',
          name: 'Confirm',
          enabled: true,
          priority: 10,
          config: { tools: ['Bash'] },
        },
      ],
    })
    const d = await rt.evaluate('Bash', { command: 'ls' })
    expect(d.decision).toBe('ask')
  })

  test('L1 capability gate allows unknown tools by default', async () => {
    const rt = new OnionRuntime()
    rt.load(null)
    const d = await rt.evaluate('Read', { path: 'a.ts' })
    expect(['allow', 'ask']).toContain(d.decision)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
bun test packages/onion
```

- [ ] **Step 3: Implement onion package**

`packages/onion/package.json`:

```json
{
  "name": "@harness/onion",
  "version": "0.0.1",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@harness/protocol": "workspace:*"
  },
  "scripts": { "typecheck": "tsc -p tsconfig.json" }
}
```

`packages/onion/src/types.ts`:

```ts
import type { OnionLayerConfig, OnionLayerType } from '@harness/protocol'

export type { OnionLayerConfig, OnionLayerType }

export type LayerDecision = 'allow' | 'deny' | 'ask'

export interface AuditEntry {
  timestamp: string
  layerId: string
  layerType: OnionLayerType
  toolName: string
  decision: LayerDecision
  reason?: string
}

export interface OnionEvaluateContext {
  toolName: string
  input: Record<string, unknown>
  decision: LayerDecision | null
  auditTrail: AuditEntry[]
}

export type OnionMiddleware = (
  ctx: OnionEvaluateContext,
  next: () => Promise<void>,
) => Promise<void>

export interface EvaluateResult {
  decision: LayerDecision
  auditTrail: AuditEntry[]
  message?: string
}
```

`packages/onion/src/defaultLayers.ts` — 从 worktree `harness/onion/defaultLayers.ts` 复制层定义，去掉对 CCB 的 import；保持 `audit` + `capability-gate` + `require-confirm` 三层。

`packages/onion/src/runtime.ts` — 移植 worktree `OnionRuntime`，但：

- `evaluate(toolName, input): Promise<EvaluateResult>` 替代 `execute(tool, input, toolUseContext, innerCheck)`
- 内层 `next` 默认 `ctx.decision = ctx.decision ?? 'allow'`（Control 不再调用 CCB 本地权限；CCB 原权限可在 hook 侧另行处理，本切片 YAGNI）
- `require-confirm` 匹配到工具时设 `decision = 'ask'`
- 空非 audit 链 → `deny`

`packages/onion/src/index.ts`:

```ts
export { OnionRuntime } from './runtime.ts'
export { DEFAULT_ONION_LAYERS, DEFAULT_ONION_CONTRACT } from './defaultLayers.ts'
export type * from './types.ts'
```

- [ ] **Step 4: Run tests — PASS**

```bash
bun install && bun test packages/onion
```

- [ ] **Step 5: Commit**

```bash
git add packages/onion
git commit -m "feat: add @harness/onion runtime decoupled from CCB Tool types"
```

---

### Task 4: `apps/control` bootstrap + HTTP CRUD

**Files:**
- Create: `apps/control/package.json`
- Create: `apps/control/src/bootstrap/init.ts`
- Create: `apps/control/src/bootstrap/loadOnion.ts`
- Create: `apps/control/src/bootstrap/loadCharter.ts`
- Create: `apps/control/src/http/app.ts`
- Create: `apps/control/src/http/routes/onion.ts`
- Create: `apps/control/src/http/routes/charter.ts`
- Create: `apps/control/src/onionSingleton.ts`
- Test: `apps/control/src/http/__tests__/onion-routes.test.ts`

- [ ] **Step 1: Write failing HTTP test**

```ts
import { describe, expect, test, beforeAll } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../app.ts'
import { initHarnessDir } from '../../bootstrap/init.ts'

describe('GET/PUT /api/onion', () => {
  const root = mkdtempSync(join(tmpdir(), 'harness-'))

  beforeAll(() => {
    initHarnessDir(root)
  })

  test('GET returns layers', async () => {
    const app = createApp({ workspaceRoot: root })
    const res = await app.request('http://localhost/api/onion')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.layers)).toBe(true)
    expect(body.layers.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run — FAIL**

```bash
bun test apps/control
```

- [ ] **Step 3: Implement bootstrap + routes**

`apps/control/package.json`:

```json
{
  "name": "@harness/control",
  "version": "0.0.1",
  "type": "module",
  "dependencies": {
    "@harness/onion": "workspace:*",
    "@harness/protocol": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.12.0",
    "hono": "^4.12.0"
  },
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "start": "bun run src/index.ts",
    "typecheck": "tsc -p tsconfig.json"
  }
}
```

`initHarnessDir(workspaceRoot)` 创建：

- `.harness/charter.md`
- `.harness/contract-onion.json`（`DEFAULT_ONION_CONTRACT`）
- `.harness/manifest.json`
- 子目录 `audit/ chat/ skills/ memory/ fusion/ workflows/`

`loadOnion` / `saveOnion` 读写 `join(workspaceRoot, '.harness/contract-onion.json')`，并 `onionRuntime.load(...)`。

`createApp({ workspaceRoot })`：

- `GET/PUT /api/onion`
- `GET/PUT /api/charter`
- CORS 对本机 Vite 开放（或由 Vite proxy，可不加 CORS）

移植逻辑可参考 worktree `harness/bootstrap/*` 与 `harness/web/routes/api/onion.ts`，改 import 到 `@harness/onion`。

- [ ] **Step 4: Tests PASS**

```bash
bun install && bun test apps/control/src/http
```

- [ ] **Step 5: Commit**

```bash
git add apps/control
git commit -m "feat: control HTTP API for onion and charter with .harness bootstrap"
```

---

### Task 5: Pending store + confirm HTTP + SSE

**Files:**
- Create: `apps/control/src/pending/store.ts`
- Create: `apps/control/src/http/routes/confirm.ts`
- Create: `apps/control/src/http/routes/pending.ts`
- Test: `apps/control/src/pending/__tests__/store.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, test } from 'bun:test'
import { PendingStore } from '../store.ts'

describe('PendingStore', () => {
  test('resolve unblocks waiter', async () => {
    const store = new PendingStore({ defaultTimeoutMs: 60_000 })
    const { requestId } = store.create({
      toolName: 'Bash',
      input: { command: 'ls' },
      sessionId: 's1',
      message: 'Confirm Bash',
    })
    const wait = store.wait(requestId, 5_000)
    const ok = store.resolve(requestId, 'allow')
    expect(ok).toBe(true)
    await expect(wait).resolves.toEqual({ decision: 'allow' })
  })

  test('timeout denies', async () => {
    const store = new PendingStore({ defaultTimeoutMs: 50 })
    const { requestId } = store.create({
      toolName: 'Bash',
      input: {},
      sessionId: 's1',
      message: 'x',
    })
    await expect(store.wait(requestId, 50)).resolves.toEqual({
      decision: 'deny',
      reason: 'timeout',
    })
  })

  test('unknown requestId resolve returns false', () => {
    const store = new PendingStore({ defaultTimeoutMs: 60_000 })
    expect(store.resolve('nope', 'allow')).toBe(false)
  })
})
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement `PendingStore`**

```ts
import { randomUUID } from 'node:crypto'

export type PendingDecision = 'allow' | 'deny'

export interface PendingMeta {
  toolName: string
  input: Record<string, unknown>
  sessionId: string
  message: string
}

interface Entry {
  meta: PendingMeta
  resolveFn: (r: { decision: PendingDecision; reason?: string }) => void
  timer: ReturnType<typeof setTimeout>
  settled: boolean
}

export class PendingStore {
  private entries = new Map<string, Entry>()
  private listeners = new Set<(list: Array<{ requestId: string } & PendingMeta>) => void>()
  constructor(private opts: { defaultTimeoutMs: number }) {}

  create(meta: PendingMeta): { requestId: string } {
    const requestId = `req_${randomUUID()}`
    // placeholder until wait() attaches — or create+wait in one path from MCP
    this.entries.set(requestId, {
      meta,
      resolveFn: () => {},
      timer: setTimeout(() => {}, 0),
      settled: false,
    })
    clearTimeout(this.entries.get(requestId)!.timer)
    this.emit()
    return { requestId }
  }

  wait(
    requestId: string,
    timeoutMs?: number,
  ): Promise<{ decision: PendingDecision; reason?: string }> {
    const entry = this.entries.get(requestId)
    if (!entry) {
      return Promise.resolve({ decision: 'deny', reason: 'unknown_request' })
    }
    if (entry.settled) {
      return Promise.resolve({ decision: 'deny', reason: 'already_settled' })
    }
    const ms = timeoutMs ?? this.opts.defaultTimeoutMs
    return new Promise(resolve => {
      entry.resolveFn = r => {
        entry.settled = true
        clearTimeout(entry.timer)
        this.entries.delete(requestId)
        this.emit()
        resolve(r)
      }
      entry.timer = setTimeout(() => {
        entry.resolveFn({ decision: 'deny', reason: 'timeout' })
      }, ms)
    })
  }

  resolve(requestId: string, decision: PendingDecision): boolean {
    const entry = this.entries.get(requestId)
    if (!entry || entry.settled) return false
    entry.resolveFn({ decision })
    return true
  }

  list(): Array<{ requestId: string } & PendingMeta> {
    return [...this.entries.entries()].map(([requestId, e]) => ({
      requestId,
      ...e.meta,
    }))
  }

  subscribe(fn: (list: Array<{ requestId: string } & PendingMeta>) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit() {
    const list = this.list()
    for (const fn of this.listeners) fn(list)
  }
}
```

Wire routes:

- `GET /api/pending` → `store.list()`
- `POST /api/confirm` body `{ requestId, decision: 'allow'|'deny' }` → `store.resolve`
- `GET /api/pending/stream` → SSE，每次 `subscribe` emit 推送 JSON

Mount store as singleton on `createApp`.

- [ ] **Step 4: Tests PASS**

```bash
bun test apps/control/src/pending
```

- [ ] **Step 5: Commit**

```bash
git add apps/control/src/pending apps/control/src/http/routes
git commit -m "feat: pending confirm store with timeout deny and SSE"
```

---

### Task 6: Control MCP — `onion.authorize` + `onion.wait_resolve`

**Files:**
- Create: `apps/control/src/mcp/server.ts`
- Create: `apps/control/src/audit/write.ts`
- Create: `apps/control/src/index.ts`
- Test: `apps/control/src/mcp/__tests__/authorize.test.ts`

- [ ] **Step 1: Failing unit test for authorize mapping**

```ts
import { describe, expect, test } from 'bun:test'
import { OnionRuntime } from '@harness/onion'
import { PendingStore } from '../../pending/store.ts'
import { handleAuthorize } from '../handlers.ts'

describe('handleAuthorize', () => {
  test('ask becomes needs_confirm and registers pending', async () => {
    const rt = new OnionRuntime()
    rt.load(null)
    // force ask: load require-confirm for Bash only — use evaluate path via handler
    const pending = new PendingStore({ defaultTimeoutMs: 60_000 })
    // Prefer testing handler with a stub runtime if easier:
    const result = await handleAuthorize(
      {
        evaluate: async () => ({
          decision: 'ask' as const,
          auditTrail: [],
          message: 'Confirm Bash',
        }),
      },
      pending,
      { toolName: 'Bash', input: {}, sessionId: 's1' },
      { workspaceRoot: '/tmp' },
    )
    expect(result.decision).toBe('needs_confirm')
    expect(typeof result.requestId).toBe('string')
    expect(pending.list().length).toBe(1)
  })
})
```

- [ ] **Step 2: Implement `handlers.ts`**

```ts
import type { AuthorizeRequest, AuthorizeResult } from '@harness/protocol'
import type { PendingStore } from '../pending/store.ts'
import type { EvaluateResult } from '@harness/onion'
import { writeAudit } from '../audit/write.ts'

export async function handleAuthorize(
  runtime: { evaluate: (tool: string, input: Record<string, unknown>) => Promise<EvaluateResult> },
  pending: PendingStore,
  req: AuthorizeRequest,
  opts: { workspaceRoot: string },
): Promise<AuthorizeResult> {
  const result = await runtime.evaluate(req.toolName, req.input)
  await writeAudit(opts.workspaceRoot, result.auditTrail)

  if (result.decision === 'ask') {
    const message =
      result.message ?? `Confirm tool ${req.toolName}`
    const { requestId } = pending.create({
      toolName: req.toolName,
      input: req.input,
      sessionId: req.sessionId,
      message,
    })
    return { decision: 'needs_confirm', requestId, message }
  }

  if (result.decision === 'deny') {
    return { decision: 'deny', reason: result.message ?? 'denied by onion' }
  }
  return { decision: 'allow' }
}

export async function handleWaitResolve(
  pending: PendingStore,
  requestId: string,
  timeoutMs?: number,
): Promise<{ decision: 'allow' | 'deny'; reason?: string }> {
  return pending.wait(requestId, timeoutMs)
}
```

- [ ] **Step 3: MCP server registration**

In `apps/control/src/mcp/server.ts`，用 `@modelcontextprotocol/sdk` 注册：

- `onion.authorize` — args = AuthorizeRequest fields；调用 `handleAuthorize`
- `onion.wait_resolve` — args `{ requestId, timeoutMs? }`；调用 `handleWaitResolve`

可选：保留 worktree 的 `onion.list` / `onion.update` 作 Agent 改配置通道（非本切片验收必需；若加，须走同一 `saveOnion`）。

- [ ] **Step 4: `src/index.ts` boot**

```ts
import { serve } from 'bun'
import { createApp } from './http/app.ts'
import { initHarnessDir } from './bootstrap/init.ts'
import { loadOnion } from './bootstrap/loadOnion.ts'

const workspaceRoot = process.env.HARNESS_WORKSPACE ?? process.cwd()
initHarnessDir(workspaceRoot)
loadOnion(workspaceRoot)

const port = Number(process.env.CONTROL_PORT ?? 3100)
const app = createApp({ workspaceRoot })

serve({
  port,
  fetch: app.fetch,
})

console.log(`[control] HTTP :${port} workspace=${workspaceRoot}`)

// MCP: if argv includes --mcp, connect stdio transport (see MCP SDK StdioServerTransport)
```

Also support `HARNESS_MCP=1` or `--mcp` to attach stdio MCP alongside HTTP（同一进程共享 `PendingStore` 与 `OnionRuntime` 单例）。

- [ ] **Step 5: Tests PASS + commit**

```bash
bun test apps/control
git add apps/control
git commit -m "feat: Control MCP onion.authorize and onion.wait_resolve"
```

---

### Task 7: `apps/web` — 迁出 Vite 壳

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/**`（从 worktree `harness/web/client/**` 复制并改 API base）
- Modify components that assumed co-located server

- [ ] **Step 1: Scaffold web package**

```json
{
  "name": "@harness/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@headlessui/react": "^2.2.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tailwindcss": "^4.0.0",
    "vite": "^6.0.0"
  }
}
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3100' },
  },
})
```

- [ ] **Step 2: Copy UI from worktree**

```bash
SRC=".claude/worktrees/feat+harness-t1-onion-web-shell/ccb/harness/web/client"
mkdir -p apps/web/src
cp "$SRC/main.tsx" "$SRC/App.tsx" apps/web/src/
cp -R "$SRC/components" apps/web/src/
cp -R "$SRC/styles" apps/web/src/
# index.html → apps/web/index.html，script 指向 /src/main.tsx
```

- [ ] **Step 3: Add Confirm UI wired to pending**

In `App.tsx` or new `ConfirmBanner.tsx`:

- `EventSource('/api/pending/stream')` 或轮询 `GET /api/pending`
- 展示 `message`；按钮 → `POST /api/confirm` `{ requestId, decision }`

- [ ] **Step 4: Manual smoke**

```bash
bun install
bun run control:dev   # terminal 1
bun run web:dev       # terminal 2
```

Open `http://localhost:5173/` — Chat|Settings；Settings 能 GET/PUT onion。

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat: move web shell to apps/web outside ccb"
```

---

### Task 8: CCB 薄钩子（fail-closed MCP client）

**Files:**
- Create: `ccb/src/harness/mcpOnionBridge.ts`（仅此产品相关目录名；无 runtime）
- Modify: CCB `hasPermissionsToUseTool` / `useCanUseTool` 注入点（与 worktree 注入点相同文件）
- Create: `scripts/agent-dev.ts`（本仓）
- Test: `ccb/src/harness/__tests__/mcpOnionBridge.test.ts`（mock MCP client）

- [ ] **Step 1: Failing test — unreachable denies**

```ts
import { describe, expect, test } from 'bun:test'
import { authorizeViaMcp } from '../mcpOnionBridge.ts'

describe('authorizeViaMcp', () => {
  test('transport error returns deny', async () => {
    const result = await authorizeViaMcp(
      {
        callTool: async () => {
          throw new Error('ECONNREFUSED')
        },
      },
      { toolName: 'Bash', input: {}, sessionId: 's' },
    )
    expect(result.behavior).toBe('deny')
  })
})
```

（将 `behavior` 对齐 CCB `PermissionDecision` 形状；若 CCB 用 `decision` 字段，按实际类型命名。）

- [ ] **Step 2: Implement bridge**

```ts
import type { AuthorizeResult } from '../../../../packages/protocol/src/index.ts'
// Prefer: duplicate minimal types in ccb OR depend via relative path.
// Submodule MUST NOT import workspace packages by name unless ccb package.json
// adds a file: dependency. Use inlined types in the bridge to keep ccb freestanding:

export interface BridgeClient {
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
}

export async function authorizeViaMcp(
  client: BridgeClient,
  req: { toolName: string; input: Record<string, unknown>; sessionId: string },
): Promise<{ behavior: 'allow' | 'deny'; message?: string }> {
  let raw: unknown
  try {
    raw = await client.callTool('onion.authorize', req)
  } catch {
    return { behavior: 'deny', message: 'control unreachable' }
  }
  const r = raw as AuthorizeResult
  if (!r || (r.decision !== 'allow' && r.decision !== 'deny' && r.decision !== 'needs_confirm')) {
    return { behavior: 'deny', message: 'invalid authorize result' }
  }
  if (r.decision === 'allow') return { behavior: 'allow' }
  if (r.decision === 'deny') return { behavior: 'deny', message: r.reason }
  // needs_confirm
  try {
    const waited = (await client.callTool('onion.wait_resolve', {
      requestId: r.requestId,
      timeoutMs: 60_000,
    })) as { decision: 'allow' | 'deny'; reason?: string }
    if (waited?.decision === 'allow') return { behavior: 'allow' }
    return { behavior: 'deny', message: waited?.reason ?? 'denied by user' }
  } catch {
    return { behavior: 'deny', message: 'wait_resolve failed' }
  }
}
```

**Important:** CCB submodule 不要 `import '@harness/protocol'`。桥接文件内联最小类型，或把 `AuthorizeResult` 接口复制进 `mcpOnionBridge.ts`。

- [ ] **Step 3: Wire into permission pipeline**

在 CCB 中替换/包裹原 `hasPermissionsToUseTool`：

```ts
// pseudo — match real signatures in permissions.ts
const bridgeResult = await authorizeViaMcp(getControlMcpClient(), {
  toolName: tool.name,
  input,
  sessionId: getSessionId(),
})
if (bridgeResult.behavior === 'deny') {
  return denyDecision(bridgeResult.message)
}
// optionally still run CCB native checks after allow
return nativeHasPermissionsToUseTool(...)
```

`getControlMcpClient()` 从 env 读：

- `HARNESS_CONTROL_MCP_URL` 或 stdio 由 `agent-dev.ts` 拉起

若 client 未配置 → **deny**（fail-closed）。

- [ ] **Step 4: `scripts/agent-dev.ts`**

```ts
// 1. ensure control is reachable (HTTP health) or spawn control
// 2. spawn ccb headless with env pointing MCP at control
// Example: bun run ccb/src/entrypoints/cli.tsx -p  with MCP config
console.log('Start CCB with HARNESS_CONTROL_MCP connected; fail-closed enabled')
```

具体 spawn 命令按 CCB 现有 headless / MCP client 配置方式填写（查阅 `ccb` MCP 客户端连接文档；优先复用已有 MCP server 连接 API）。

- [ ] **Step 5: Commit in ccb submodule + bump pointer in parent**

```bash
cd ccb
git add src/harness/mcpOnionBridge.ts src/utils/permissions/permissions.ts # actual paths
git commit -m "feat: fail-closed MCP onion bridge for harness control"
cd ..
git add ccb scripts/agent-dev.ts
git commit -m "feat: wire agent-dev to Control MCP onion bridge"
```

---

### Task 9: 删除 `ccb/harness` 产品树 + 验收脚本

**Files:**
- Delete: any `ccb/harness/**` product code（若仍存在于 fork）
- Create: `scripts/acceptance-separation.sh`
- Modify: root README

- [ ] **Step 1: Remove product tree from ccb**

```bash
# In ccb working tree used by this repo:
rm -rf ccb/harness
# Keep ONLY src/harness/mcpOnionBridge.ts (different path on purpose)
```

确认无 `ccb/harness/web`、`ccb/harness/onion` 等。

- [ ] **Step 2: Acceptance script**

`scripts/acceptance-separation.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
# 1. web sources not under ccb
if find ccb -path '*apps/web*' -o -name 'ChatPanel.tsx' 2>/dev/null | grep -q .; then
  echo "FAIL: web UI still under ccb"
  exit 1
fi
test -f apps/web/src/App.tsx
test -f apps/control/src/index.ts
test -f packages/onion/src/runtime.ts
# 2. unit tests
bun test packages/onion packages/protocol apps/control
echo "PASS: separation layout + unit tests"
```

- [ ] **Step 3: Run acceptance**

```bash
chmod +x scripts/acceptance-separation.sh
./scripts/acceptance-separation.sh
```

- [ ] **Step 4: Manual L3 + fail-closed checklist**

1. Start control + web；用测试客户端调 `onion.authorize` 使 `needs_confirm`；Web 点允许；`wait_resolve` 得 allow  
2. Kill control；CCB bridge 对任意 tool 返回 deny  

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove ccb product harness tree; add separation acceptance script"
```

---

## Self-review vs spec

| Spec 要求 | Task |
|-----------|------|
| 本仓 apps/web + apps/control + packages/onion + protocol | 1–7 |
| CCB 仅薄钩子 | 8–9 |
| 洋葱全在 Control | 3–6 |
| Fail-closed | 8 |
| MCP authorize + wait_resolve | 6, 8 |
| L3 异步两段 + 60s timeout | 5, 6 |
| 一次搬清删除 ccb/harness | 9 |
| Settings CRUD → .harness | 4, 7 |
| 审计由 Control 写 | 6 (`writeAudit`) |
| 旧 T1 plan superseded | 1 |

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-17-harness-control-ccb-process-separation.md`. Two execution options:

**1. Subagent-Driven (recommended)** — 每个 Task 新开 subagent，Task 间复查，迭代快  

**2. Inline Execution** — 本会话用 executing-plans 按 Task 推进，设检查点  

Which approach?
