# Multi-Onion Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single global onion with a multi-onion registry (`.harness/onions/*.json`), JS function layers, Settings CRUD, and optional `onionId` on authorize — Chat/Subagent keep using `default`.

**Architecture:** Protocol types gain `NamedOnion` + discriminated `OnionLayer` (`builtin` | `js`). `OnionRegistry` loads/scans `onions/`, migrates `contract-onion.json` → `onions/default.json`, and `evaluate(..., { onionId? })` (omit/unknown → default + warning). Control HTTP adds `/api/onions` CRUD; `/api/onion` proxies default. Web Settings gains onion list + JS editor.

**Tech Stack:** Bun, TypeScript, Hono (`apps/control`), React (`apps/web`), `@harness/protocol`, `@harness/onion`

## Global Constraints

- **default identity:** `id === 'default'` only; that onion **cannot be deleted** (HTTP 403); may rename `name` / edit layers
- **Unknown `onionId`:** fall back to `default` + audit warning (do **not** 400)
- **Omit / empty `onionId`:** use `default`
- **No valid layers** (all disabled or empty non-audit chain): deny all privileged calls (fail-closed, same as today)
- **Audit builtin layer** within a suite: cannot delete that layer (existing UI rule); deleting a whole non-default onion is allowed
- **JS save:** compile must succeed or **reject save** with error; **JS runtime throw:** that call **deny** + audit (`layerId` + error message)
- **New onion:** deep-copy layers from `default`
- **Storage:** `.harness/onions/<id>.json` only after migration; no separate index file
- **Authorize:** optional `onionId?: string` on `AuthorizeRequest`; callers this round do not pass it
- **Out of scope:** Workflow onion picker UI, LangGraph/Python, onion profile visualization, global layer library, production JS sandbox
- **Tests:** `bun test packages/onion`, `bun test packages/protocol`, `bun test apps/control/...`, `bun test` for web if UI tests added
- **Commits:** one logical commit per task; follow repo style (`feat:` / `fix:` / `test:`)

## File Structure

| Path | Responsibility |
|------|----------------|
| `packages/protocol/src/index.ts` | `NamedOnion`, `OnionLayer`, `AuthorizeRequest.onionId`, keep legacy `OnionLayerConfig`/`ContractOnion` as migration aliases |
| `packages/onion/src/compileJsLayer.ts` | Compile JS `source` → `OnionMiddleware`; throw on compile failure |
| `packages/onion/src/runtime.ts` | Accept `OnionLayer[]`; builtin + js; throw→deny |
| `packages/onion/src/registry.ts` | `OnionRegistry`: load dir, migrate, get, list, save, delete, evaluate |
| `packages/onion/src/index.ts` | Export registry + compile helpers |
| `apps/control/src/bootstrap/loadOnion.ts` | Bootstrap registry (migrate + ensure default) |
| `apps/control/src/onionSingleton.ts` | Hold `OnionRegistry` (replace bare `OnionRuntime`) |
| `apps/control/src/http/routes/onions.ts` | `/api/onions` CRUD |
| `apps/control/src/http/routes/onion.ts` | Proxy default |
| `apps/control/src/mcp/handlers.ts` | Pass `onionId` into `evaluate` |
| `apps/web/src/components/OnionsPanel.tsx` | List + create/delete |
| `apps/web/src/components/OnionEditor.tsx` | Edit one onion (layers + JS) |
| `apps/web/src/types/onion.ts` | Frontend DTOs |

---

### Task 1: Protocol — NamedOnion, OnionLayer, onionId

**Files:**
- Modify: `packages/protocol/src/index.ts`
- Modify: `packages/protocol/src/__tests__/types.test.ts` (or create if needed)
- Test: `packages/protocol/src/__tests__/named-onion.test.ts`

**Interfaces:**
- Consumes: existing `OnionLayerType`, `AuthorizeRequest`
- Produces:
  - `OnionLayer` discriminated union (`kind: 'builtin' | 'js'`)
  - `NamedOnion { version: 1, id: string, name: string, layers: OnionLayer[] }`
  - `OnionListItem { id, name, layerCount, isDefault }`
  - `AuthorizeRequest.onionId?: string`
  - `toBuiltinLayer(legacy: OnionLayerConfig): OnionLayer` helper for migration
  - Keep `OnionLayerConfig` + `ContractOnion` exported for migration/compat

- [ ] **Step 1: Write the failing test**

Create `packages/protocol/src/__tests__/named-onion.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import {
  type NamedOnion,
  type OnionLayer,
  type AuthorizeRequest,
  toBuiltinLayer,
  isDefaultOnionId,
} from '../index.ts'

describe('NamedOnion protocol', () => {
  test('isDefaultOnionId only true for default', () => {
    expect(isDefaultOnionId('default')).toBe(true)
    expect(isDefaultOnionId('other')).toBe(false)
  })

  test('toBuiltinLayer wraps legacy OnionLayerConfig', () => {
    const layer = toBuiltinLayer({
      id: 'audit',
      type: 'audit',
      name: 'Audit',
      enabled: true,
      priority: 0,
      config: {},
    })
    expect(layer.kind).toBe('builtin')
    if (layer.kind === 'builtin') {
      expect(layer.type).toBe('audit')
    }
  })

  test('NamedOnion accepts js layer', () => {
    const onion: NamedOnion = {
      version: 1,
      id: 'default',
      name: 'Default',
      layers: [
        {
          id: 'js-1',
          name: 'Custom',
          enabled: true,
          priority: 30,
          kind: 'js',
          source: 'async (ctx, next) => { await next() }',
        } satisfies OnionLayer,
      ],
    }
    expect(onion.layers[0]?.kind).toBe('js')
  })

  test('AuthorizeRequest may include onionId', () => {
    const req: AuthorizeRequest = {
      toolName: 'Bash',
      input: {},
      sessionId: 's1',
      onionId: 'strict',
    }
    expect(req.onionId).toBe('strict')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/protocol/src/__tests__/named-onion.test.ts`
Expected: FAIL — `toBuiltinLayer` / `isDefaultOnionId` / types missing

- [ ] **Step 3: Write minimal implementation**

In `packages/protocol/src/index.ts`, add after existing onion types (keep `OnionLayerConfig` and `ContractOnion`):

```ts
export type OnionLayer =
  | {
      id: string
      name: string
      enabled: boolean
      priority: number
      kind: 'builtin'
      type: OnionLayerType
      config: Record<string, unknown>
    }
  | {
      id: string
      name: string
      enabled: boolean
      priority: number
      kind: 'js'
      source: string
    }

export interface NamedOnion {
  version: 1
  id: string
  name: string
  layers: OnionLayer[]
}

export interface OnionListItem {
  id: string
  name: string
  layerCount: number
  isDefault: boolean
}

export function isDefaultOnionId(id: string): boolean {
  return id === 'default'
}

export function toBuiltinLayer(legacy: OnionLayerConfig): OnionLayer {
  return {
    id: legacy.id,
    name: legacy.name,
    enabled: legacy.enabled,
    priority: legacy.priority,
    kind: 'builtin',
    type: legacy.type,
    config: legacy.config,
  }
}

// AuthorizeRequest — add:
// onionId?: string
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/protocol/src/__tests__/named-onion.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/protocol/src/index.ts packages/protocol/src/__tests__/named-onion.test.ts
git commit -m "$(cat <<'EOF'
feat(protocol): add NamedOnion, OnionLayer kinds, and authorize onionId

EOF
)"
```

---

### Task 2: JS layer compile + OnionRuntime kind support

**Files:**
- Create: `packages/onion/src/compileJsLayer.ts`
- Modify: `packages/onion/src/runtime.ts`
- Modify: `packages/onion/src/defaultLayers.ts` (emit `kind: 'builtin'`)
- Modify: `packages/onion/src/index.ts`
- Modify: `packages/onion/src/__tests__/runtime.test.ts`
- Create: `packages/onion/src/__tests__/compileJsLayer.test.ts`
- Create: `packages/onion/src/__tests__/js-layer-runtime.test.ts`

**Interfaces:**
- Consumes: `OnionLayer` from `@harness/protocol`
- Produces:
  - `compileJsLayer(source: string): OnionMiddleware` — throws `Error` with message on failure
  - `OnionRuntime.loadNamed(onion: NamedOnion | null): void` OR extend `load` to accept layers with `kind`
  - `evaluate` unchanged signature for single runtime
  - Builtin path uses existing `layerToMiddleware`; js path uses compile; runtime throw → set `decision='deny'`, append audit, do not call next

**Runtime layer shape:** Prefer runtime stores `OnionLayer[]`. For backward-compat in this task: `load(contract)` accepts `ContractOnion` (legacy) by mapping via `toBuiltinLayer`, and also accept `NamedOnion` if `layers[0]?.kind` present. Simplest: change `OnionRuntime` to take `OnionLayer[]` via `loadLayers(layers: OnionLayer[])` and keep `load(contract: ContractOnion | null)` mapping legacy.

- [ ] **Step 1: Write failing tests**

`packages/onion/src/__tests__/compileJsLayer.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { compileJsLayer } from '../compileJsLayer.ts'

describe('compileJsLayer', () => {
  test('rejects invalid source', () => {
    expect(() => compileJsLayer('not valid js {{{')).toThrow()
  })

  test('compiles async middleware', async () => {
    const mw = compileJsLayer('async (ctx, next) => { ctx.message = "ok"; await next() }')
    const ctx = {
      toolName: 'Read',
      input: {},
      decision: null as 'allow' | 'deny' | 'ask' | null,
      auditTrail: [] as { layerId: string; decision: string; timestamp: number; detail?: string }[],
    }
    await mw(ctx, async () => {
      ctx.decision = 'allow'
    })
    expect(ctx.message).toBe('ok')
    expect(ctx.decision).toBe('allow')
  })
})
```

`packages/onion/src/__tests__/js-layer-runtime.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { OnionRuntime } from '../runtime.ts'
import type { NamedOnion } from '@harness/protocol'

function baseAudit() {
  return {
    id: 'audit',
    name: 'Audit',
    enabled: true,
    priority: 0,
    kind: 'builtin' as const,
    type: 'audit' as const,
    config: {},
  }
}

describe('OnionRuntime js layers', () => {
  test('js layer can allow and rewrite input', async () => {
    const rt = new OnionRuntime()
    const onion: NamedOnion = {
      version: 1,
      id: 'default',
      name: 'Default',
      layers: [
        baseAudit(),
        {
          id: 'js-allow',
          name: 'Allow Bash',
          enabled: true,
          priority: 10,
          kind: 'js',
          source: `async (ctx, next) => {
            if (ctx.toolName === 'Bash') {
              ctx.input = { ...ctx.input, rewritten: true }
              ctx.decision = 'allow'
              return
            }
            await next()
          }`,
        },
      ],
    }
    rt.loadNamed(onion)
    const d = await rt.evaluate('Bash', { command: 'ls' })
    expect(d.decision).toBe('allow')
  })

  test('js layer throw denies with audit', async () => {
    const rt = new OnionRuntime()
    rt.loadNamed({
      version: 1,
      id: 'default',
      name: 'Default',
      layers: [
        baseAudit(),
        {
          id: 'js-boom',
          name: 'Boom',
          enabled: true,
          priority: 10,
          kind: 'js',
          source: `async (ctx, next) => { throw new Error('boom') }`,
        },
      ],
    })
    const d = await rt.evaluate('Bash', {})
    expect(d.decision).toBe('deny')
    expect(d.auditTrail.some(e => e.layerId === 'js-boom')).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/onion/src/__tests__/compileJsLayer.test.ts packages/onion/src/__tests__/js-layer-runtime.test.ts`
Expected: FAIL — modules/methods missing

- [ ] **Step 3: Implement compile + runtime**

`compileJsLayer.ts`:

```ts
import type { OnionMiddleware } from './types.ts'

export function compileJsLayer(source: string): OnionMiddleware {
  const trimmed = source.trim()
  if (!trimmed) {
    throw new Error('JS layer source is empty')
  }
  // Function constructor: source must be an expression evaluating to async (ctx, next) => ...
  let fn: unknown
  try {
    fn = new Function(`return (${trimmed})`)()
  } catch (err) {
    throw new Error(
      `JS layer compile failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  if (typeof fn !== 'function') {
    throw new Error('JS layer source must evaluate to a function')
  }
  return fn as OnionMiddleware
}
```

In `runtime.ts`:
- Import `OnionLayer`, `NamedOnion`, `toBuiltinLayer`, `compileJsLayer`
- Add `loadNamed(onion: NamedOnion | null): void` — uses `onion?.layers` or defaults converted with `kind: 'builtin'`
- Keep `load(contract: ContractOnion | null)` mapping layers via `toBuiltinLayer`
- Store `layers: OnionLayer[]`
- In `layerToMiddleware`: if `kind === 'js'`, return wrapper that try/catches `compileJsLayer(layer.source)(ctx, next)`; on throw set `ctx.decision = 'deny'`, push audit with `layerId` + message
- Update `defaultLayers.ts` to include `kind: 'builtin'`
- Update existing tests that construct layers to include `kind: 'builtin'` OR keep `load(ContractOnion)` path so old tests still pass via mapping

- [ ] **Step 4: Run all onion tests**

Run: `bun test packages/onion`
Expected: PASS (existing + new)

- [ ] **Step 5: Commit**

```bash
git add packages/onion
git commit -m "$(cat <<'EOF'
feat(onion): compile JS layers and run them in OnionRuntime

EOF
)"
```

---

### Task 3: OnionRegistry — load, migrate, evaluate

**Files:**
- Create: `packages/onion/src/registry.ts`
- Create: `packages/onion/src/__tests__/registry.test.ts`
- Modify: `packages/onion/src/index.ts`

**Interfaces:**
- Consumes: `OnionRuntime`, `NamedOnion`, `toBuiltinLayer`, `DEFAULT_ONION_LAYERS`
- Produces:
```ts
class OnionRegistry {
  constructor(workspaceRoot: string)
  bootstrap(): void  // scan onions/, migrate contract-onion.json, ensure default
  list(): OnionListItem[]
  get(id: string): NamedOnion | null
  save(onion: NamedOnion): void  // validates JS compile; writes file; reloads that id
  delete(id: string): void  // throws if id === 'default'
  evaluate(
    toolName: string,
    input: Record<string, unknown>,
    opts?: { onionId?: string },
  ): Promise<EvaluateResult>
}
```
- Persistence dir: `.harness/onions/<safeId>.json`
- Migration: if `contract-onion.json` exists and `onions/default.json` missing → write default with mapped builtin layers, `id: 'default'`, `name: 'Default'`
- Unknown id → use default runtime + append warning audit entry `{ layerId: 'registry', decision: 'allow', detail: 'unknown onionId X, fell back to default' }` (or similar; decision field may be informational — prefer `detail` on an audit entry without changing allow/deny of the call)

- [ ] **Step 1: Write failing registry tests**

Use a temp dir under `os.tmpdir()` for each test:

```ts
import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { OnionRegistry } from '../registry.ts'

describe('OnionRegistry', () => {
  let root: string
  beforeEach(() => {
    root = join(tmpdir(), `onion-reg-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    mkdirSync(join(root, '.harness'), { recursive: true })
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  test('bootstrap creates default when empty', () => {
    const reg = new OnionRegistry(root)
    reg.bootstrap()
    expect(existsSync(join(root, '.harness/onions/default.json'))).toBe(true)
    expect(reg.list().some(i => i.isDefault)).toBe(true)
  })

  test('migrates contract-onion.json to onions/default.json', () => {
    writeFileSync(
      join(root, '.harness/contract-onion.json'),
      JSON.stringify({
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
      }),
    )
    const reg = new OnionRegistry(root)
    reg.bootstrap()
    const def = reg.get('default')
    expect(def?.layers.some(l => l.kind === 'builtin' && l.type === 'require-confirm')).toBe(true)
  })

  test('delete default throws', () => {
    const reg = new OnionRegistry(root)
    reg.bootstrap()
    expect(() => reg.delete('default')).toThrow()
  })

  test('evaluate defaults to default onion', async () => {
    const reg = new OnionRegistry(root)
    reg.bootstrap()
    const d = await reg.evaluate('Read', { path: 'x' })
    expect(['allow', 'ask', 'deny']).toContain(d.decision)
  })

  test('unknown onionId falls back to default', async () => {
    const reg = new OnionRegistry(root)
    reg.bootstrap()
    const d = await reg.evaluate('Read', { path: 'x' }, { onionId: 'missing' })
    expect(d.auditTrail.some(e => /unknown onionId|fell back/i.test(e.detail ?? ''))).toBe(true)
  })

  test('save rejects invalid js source', () => {
    const reg = new OnionRegistry(root)
    reg.bootstrap()
    const onion = reg.get('default')!
    expect(() =>
      reg.save({
        ...onion,
        layers: [
          ...onion.layers,
          {
            id: 'bad',
            name: 'Bad',
            enabled: true,
            priority: 99,
            kind: 'js',
            source: '{{{',
          },
        ],
      }),
    ).toThrow()
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `bun test packages/onion/src/__tests__/registry.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement OnionRegistry**

Mirror `apps/control/src/chat/store.ts` safe-id filename pattern. Keep an in-memory `Map<string, OnionRuntime>`. `save` compiles all js layers before write. `delete('default')` throws Error with message suitable for HTTP 403 mapping.

- [ ] **Step 4: Run tests pass**

Run: `bun test packages/onion`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/onion
git commit -m "$(cat <<'EOF'
feat(onion): add OnionRegistry with multi-file load and migration

EOF
)"
```

---

### Task 4: Control HTTP — `/api/onions` CRUD + `/api/onion` proxy

**Files:**
- Create: `apps/control/src/http/routes/onions.ts`
- Modify: `apps/control/src/http/routes/onion.ts`
- Modify: `apps/control/src/http/app.ts`
- Modify: `apps/control/src/onionSingleton.ts`
- Modify: `apps/control/src/bootstrap/loadOnion.ts`
- Modify: `apps/control/src/bootstrap/init.ts` (ensure `onions/` dir if needed)
- Create: `apps/control/src/http/__tests__/onions-routes.test.ts`
- Modify: `apps/control/src/http/__tests__/onion-routes.test.ts`

**Interfaces:**
- Consumes: `OnionRegistry` from singleton
- Produces routes:
  - `GET /api/onions` → `{ onions: OnionListItem[] }`
  - `POST /api/onions` body `{ id, name? }` → deep-copy default layers; 409 if exists; 400 if id invalid
  - `GET /api/onions/:id` → full `NamedOnion` or 404
  - `PUT /api/onions/:id` → save (400 on compile fail); id in body must match param or body omits id
  - `DELETE /api/onions/:id` → 403 if default; 404 if missing; 204/200 on success
  - `GET/PUT /api/onion` → operate on default's layers only (compat): GET returns `{ layers }` in a shape the web still understands — prefer returning layers with `kind` (UI task adapts); for this task keep PUT accepting either legacy `OnionLayerConfig[]` or `OnionLayer[]` (normalize with `toBuiltinLayer` if no kind)

- [ ] **Step 1: Write failing HTTP tests** (temp workspace root pattern from existing onion-routes tests)

Assert: list, create, get, put, delete non-default, DELETE default → 403, GET/PUT `/api/onion` still works on default.

- [ ] **Step 2: Run fail**

Run: `bun test apps/control/src/http/__tests__/onions-routes.test.ts`

- [ ] **Step 3: Implement routes + wire singleton**

```ts
// onionSingleton.ts
import { OnionRegistry } from '@harness/onion'
export let onionRegistry: OnionRegistry
export function initOnionRegistry(workspaceRoot: string): OnionRegistry {
  onionRegistry = new OnionRegistry(workspaceRoot)
  onionRegistry.bootstrap()
  return onionRegistry
}
```

`loadOnion.ts` becomes thin wrapper calling `initOnionRegistry` / `onionRegistry` save helpers for default.

Update all `onionRuntime` imports in control to use registry (authorize left to Task 5 if still compiling — for this task at least routes compile: temporary re-export `evaluate` bound to default is OK if authorize still uses old singleton; prefer updating singleton fully here and fixing authorize call sites in Task 5).

**Decision for this task:** Switch singleton to registry; update `routes/onion.ts` and `routes/agent-onion.ts` / `mcp/server.ts` so they still compile by calling `onionRegistry.evaluate(...)` without onionId (Task 5 adds passthrough).

- [ ] **Step 4: Run control onion tests**

Run: `bun test apps/control/src/http/__tests__/onion-routes.test.ts apps/control/src/http/__tests__/onions-routes.test.ts apps/control/src/mcp/__tests__/authorize.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/control packages/onion
git commit -m "$(cat <<'EOF'
feat(control): expose /api/onions CRUD and proxy /api/onion to default

EOF
)"
```

---

### Task 5: Authorize — pass optional onionId

**Files:**
- Modify: `apps/control/src/mcp/handlers.ts`
- Modify: `apps/control/src/http/routes/agent-onion.ts` (if body typing)
- Modify: `apps/control/src/mcp/server.ts` (tool schema if any)
- Modify: `apps/control/src/mcp/__tests__/authorize.test.ts` (add case: unknown onionId still works)
- Create or modify: test that `onionId` is forwarded

**Interfaces:**
- Consumes: `AuthorizeRequest.onionId`, `OnionRegistry.evaluate`
- Produces: `handleAuthorize` calls `runtime.evaluate(tool, input, { onionId: req.onionId })`
- Runtime dependency type becomes:
```ts
evaluate(
  tool: string,
  input: Record<string, unknown>,
  opts?: { onionId?: string },
): Promise<EvaluateResult>
```

- [ ] **Step 1: Write failing test** — authorize with `onionId: 'missing'` still allows/denies via default (not 500)

- [ ] **Step 2: Run fail / implement / pass**

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(control): pass optional onionId through authorize to registry

EOF
)"
```

---

### Task 6: Settings UI — onions list + JS layer editor

**Files:**
- Create: `apps/web/src/components/OnionsPanel.tsx`
- Modify: `apps/web/src/components/OnionEditor.tsx`
- Modify: `apps/web/src/components/SettingsPanel.tsx`
- Modify: `apps/web/src/types/onion.ts`
- Modify: `apps/web/src/types/api.ts`
- Modify: `apps/web/src/mappers/onion.ts`
- Modify CSS if existing onion styles live in a global stylesheet (find via grep `onion-editor`)

**Interfaces:**
- Consumes: `/api/onions`, `/api/onions/:id`
- Produces UI:
  1. List: name, id, layerCount; New (POST copy default); Delete (disabled for default)
  2. Detail: edit name; layer list (toggle/reorder/delete audit-protected); Add builtin or js
  3. JS editor textarea with default template:
```js
async (ctx, next) => {
  // ctx.toolName, ctx.input, ctx.decision, ctx.message
  await next()
}
```
  4. On save error (400), show message

- [ ] **Step 1: Extend types/mappers for `OnionLayer` with `kind`**

- [ ] **Step 2: Implement OnionsPanel + refactor OnionEditor to take `onionId` prop**

- [ ] **Step 3: Wire SettingsPanel to OnionsPanel**

- [ ] **Step 4: Manual sanity** — `bun run typecheck` for web; add a small component test only if the repo already tests React components similarly; otherwise typecheck is enough for this task

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): Settings UI for multi-onion list and JS layer editor

EOF
)"
```

---

### Task 7: End-to-end verification + migration smoke

**Files:**
- Possibly fix gaps found in Tasks 1–6
- Test: run full suites listed below

**Interfaces:** none new — verification only

- [ ] **Step 1: Run focused suites**

```bash
bun test packages/protocol packages/onion
bun test apps/control/src/http/__tests__/onion-routes.test.ts apps/control/src/http/__tests__/onions-routes.test.ts
bun test apps/control/src/mcp/__tests__/authorize.test.ts apps/control/src/mcp/__tests__/authorize-headless.test.ts
bun run typecheck
```

- [ ] **Step 2: Fix any failures** (minimal, in place)

- [ ] **Step 3: Commit only if fixes needed**

```bash
git commit -m "$(cat <<'EOF'
fix: tighten multi-onion registry after integration verification

EOF
)"
```

---

## Spec Coverage Checklist

| Spec requirement | Task |
|------------------|------|
| Multi named onions under `.harness/onions/` | 3, 4 |
| default undeletable | 3, 4, 6 |
| Layer CRUD + JS editor | 2, 6 |
| Chat uses default | 5 (no onionId) |
| authorize optional onionId | 1, 5 |
| Migrate contract-onion.json | 3 |
| Unknown id → default + warning | 3, 5 |
| JS compile fail reject save | 2, 3, 4 |
| JS throw → deny + audit | 2 |
| Old `/api/onion` compat | 4 |

## Success Criteria Mapping

1. Settings multi-onion + default undeletable → Task 6
2. JS layers save/run; illegal source blocked → Tasks 2–4, 6
3. Chat/Subagent = default → Task 5
4. authorize accepts onionId → Tasks 1, 5
5. Old workspace migrates → Task 3
