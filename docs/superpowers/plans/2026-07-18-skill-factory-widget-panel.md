# Skill Factory Widget Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-repo widget registry, a Skill Factory human control panel as the first registered widget, and Control HTTP thin proxies that call the same `skill-factory` `tools.ts` APIs as MCP.

**Architecture:** `packages/widgets` owns `WidgetDefinition` + registry + `SkillFactoryPanel`. `apps/web` keeps Chat/Settings fixed and mounts `listWidgets()` as dynamic tabs after a side-effect bootstrap import. `apps/control` exposes `/api/skill-factory/*` that resolves the submodule roots and invokes skill-factory tools in-process (no second business layer).

**Tech Stack:** Bun workspaces, React 19, Hono, TypeScript, `bun:test`, existing shell CSS (`.shell__*`, `.settings*`, `.form-field*`)

**Spec:** [2026-07-18-skill-factory-widget-panel-design.md](../specs/2026-07-18-skill-factory-widget-panel-design.md)

## Global Constraints

- Package name: `@harness/widgets` (align `@harness/protocol`)
- Widget id for first panel: `skill-factory`; title: `Skill Factory`; default `order` when omitted: `100`
- `registerWidget`: same `id` → overwrite + `console.warn`
- `listWidgets()`: sort by `order` ascending, then `id` ascending
- Shell depends only on registry API; registration via `import '@harness/widgets/skill-factory'`
- HTTP prefix: `/api/skill-factory`; request/response args/results isomorphic with MCP tools; envelope `{ ok, data, error }` allowed
- FROZEN_PATH → HTTP **403** with `code: 'FROZEN_PATH'`; illegal zone / zero cases → **400**; skill missing → **404**; report path escape → **400**; submodule missing → **503** with init guidance
- No HTTP for publish / gold cases / `_meta/common_rubric.json`
- Write ops must call skill-factory `auditLog(factoryRoot, …)` (same audit file as MCP); use `actor: 'http'`
- Panel must not talk stdio MCP; only `/api/skill-factory/*`
- UI follows existing Settings/shell classes; no new visual system
- Prefer in-process import of `skill-factory/mcp/src/tools.ts`; do not reimplement tools
- Work from a branch that already has the `skill-factory` submodule entry (e.g. branch from `feat/skill-factory`). If submodule checkout is empty, APIs still return 503.
- YAGNI: no widget submodule, no microfrontend, no iframe product, no CCB codegen pipeline
- Tests: `bun:test`; root script already covers `packages`

## File structure

```
packages/widgets/
  package.json
  tsconfig.json
  src/
    types.ts
    registry.ts
    index.ts
    __tests__/registry.test.ts
  skill-factory/
    api.ts                 # fetch helpers (testable without DOM)
    SkillFactoryPanel.tsx
    index.ts               # registerWidget side-effect
    __tests__/api.test.ts

apps/control/src/
  skill-factory/
    resolveRoots.ts
    mapError.ts
    loadTools.ts
  http/routes/skill-factory.ts
  http/__tests__/skill-factory-routes.test.ts
  http/app.ts              # mount route

apps/web/src/
  main.tsx                 # bootstrap import
  App.tsx                  # dynamic tabs
  package.json             # @harness/widgets dep

docs/skill-factory-submodule.md   # panel + MCP (create/update)
```

---

### Task 1: Widget registry (`@harness/widgets`)

**Files:**
- Create: `packages/widgets/package.json`
- Create: `packages/widgets/tsconfig.json`
- Create: `packages/widgets/src/types.ts`
- Create: `packages/widgets/src/registry.ts`
- Create: `packages/widgets/src/index.ts`
- Create: `packages/widgets/src/__tests__/registry.test.ts`

**Interfaces:**
- Consumes: React types only (`ReactElement`)
- Produces:
  - `WidgetDefinition = { id: string; title: string; order?: number; mount: () => ReactElement }`
  - `registerWidget(def: WidgetDefinition): void`
  - `getWidget(id: string): WidgetDefinition | undefined`
  - `listWidgets(): WidgetDefinition[]`
  - `clearWidgetsForTests(): void` (test-only reset; export from registry, re-export only if tests need it — OK to import from `../registry.ts` in tests)

- [ ] **Step 1: Write the failing registry test**

```ts
// packages/widgets/src/__tests__/registry.test.ts
import { describe, expect, test, beforeEach, afterEach, spyOn } from 'bun:test'
import { createElement, type ReactElement } from 'react'
import {
  registerWidget,
  getWidget,
  listWidgets,
  clearWidgetsForTests,
} from '../registry.ts'

function mountStub(): ReactElement {
  return createElement('div', null, 'stub')
}

describe('widget registry', () => {
  beforeEach(() => clearWidgetsForTests())
  afterEach(() => clearWidgetsForTests())

  test('register + getWidget', () => {
    registerWidget({ id: 'a', title: 'A', mount: mountStub })
    expect(getWidget('a')?.title).toBe('A')
  })

  test('same id overwrites and warns', () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    registerWidget({ id: 'a', title: 'A1', mount: mountStub })
    registerWidget({ id: 'a', title: 'A2', mount: mountStub })
    expect(getWidget('a')?.title).toBe('A2')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  test('listWidgets sorts by order then id', () => {
    registerWidget({ id: 'b', title: 'B', order: 10, mount: mountStub })
    registerWidget({ id: 'a', title: 'A', order: 10, mount: mountStub })
    registerWidget({ id: 'c', title: 'C', order: 5, mount: mountStub })
    registerWidget({ id: 'd', title: 'D', mount: mountStub }) // default 100
    expect(listWidgets().map((w) => w.id)).toEqual(['c', 'a', 'b', 'd'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/widgets/src/__tests__/registry.test.ts`

Expected: FAIL (module / package not found)

- [ ] **Step 3: Implement package + registry**

`packages/widgets/package.json`:

```json
{
  "name": "@harness/widgets",
  "version": "0.0.1",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./skill-factory": "./skill-factory/index.ts"
  },
  "peerDependencies": {
    "react": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "react": "^19.0.0",
    "typescript": "^5.0.0"
  },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json"
  }
}
```

`packages/widgets/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["bun"]
  },
  "include": ["src/**/*", "skill-factory/**/*"]
}
```

`packages/widgets/src/types.ts`:

```ts
import type { ReactElement } from 'react'

export type WidgetDefinition = {
  id: string
  title: string
  order?: number
  /** Sync factory; shell calls on each render of the active tab. */
  mount: () => ReactElement
}
```

`packages/widgets/src/registry.ts`:

```ts
import type { WidgetDefinition } from './types.ts'

const DEFAULT_ORDER = 100
const widgets = new Map<string, WidgetDefinition>()

export function registerWidget(def: WidgetDefinition): void {
  if (widgets.has(def.id)) {
    console.warn(`[widgets] overwriting widget id="${def.id}"`)
  }
  widgets.set(def.id, def)
}

export function getWidget(id: string): WidgetDefinition | undefined {
  return widgets.get(id)
}

export function listWidgets(): WidgetDefinition[] {
  return [...widgets.values()].sort((a, b) => {
    const oa = a.order ?? DEFAULT_ORDER
    const ob = b.order ?? DEFAULT_ORDER
    if (oa !== ob) return oa - ob
    return a.id.localeCompare(b.id)
  })
}

export function clearWidgetsForTests(): void {
  widgets.clear()
}
```

`packages/widgets/src/index.ts`:

```ts
export type { WidgetDefinition } from './types.ts'
export { registerWidget, getWidget, listWidgets } from './registry.ts'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/widgets/src/__tests__/registry.test.ts`

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/widgets
git commit -m "$(cat <<'EOF'
feat(widgets): add WidgetDefinition registry with ordered listWidgets

EOF
)"
```

---

### Task 2: Control `/api/skill-factory/*` thin proxy

**Files:**
- Create: `apps/control/src/skill-factory/resolveRoots.ts`
- Create: `apps/control/src/skill-factory/mapError.ts`
- Create: `apps/control/src/skill-factory/loadTools.ts`
- Create: `apps/control/src/http/routes/skill-factory.ts`
- Create: `apps/control/src/http/__tests__/skill-factory-routes.test.ts`
- Modify: `apps/control/src/http/app.ts` — mount `/api/skill-factory`

**Interfaces:**
- Consumes: skill-factory exports from `mcp/src/tools.ts`, `mcp/src/paths.ts` (`FrozenPathError`), `mcp/src/audit.ts` (`auditLog`); `getAssetsRoot` from paths
- Produces:
  - `resolveSkillFactoryRoots(workspaceRoot, env?): { factoryRoot: string; assetsRoot: string } | null`
    - `env.SKILL_FACTORY_ROOT` if set, else `join(workspaceRoot, 'skill-factory')`
    - return `null` if `factoryRoot` missing or `mcp/src/tools.ts` missing
  - `mapSkillFactoryError(err: unknown): { status: number; body: { ok: false; error: { code?: string; message: string } } }`
  - `createSkillFactoryRoutes(opts: { workspaceRoot: string; roots?: { factoryRoot: string; assetsRoot: string } | null; tools?: SkillFactoryTools }): Hono`
  - Routes (exact):

| Method | Path | Tool call |
|--------|------|-----------|
| GET | `/skills` | `skillList(assetsRoot)` |
| GET | `/skills/:id` | `skillGet(assetsRoot, id, zone?)` query `zone` |
| POST | `/skills/generate` | body `{ id, description }` → `skillGenerate` |
| POST | `/cases/generate` | body `{ skillId, note }` → `casesGenerate` |
| POST | `/rubric/generate` | body `{ skillId }` → `rubricGenerate` |
| POST | `/eval/run` | body `{ skillId, zone? }` → `evalRun(factoryRoot, assetsRoot, …)` |
| GET | `/eval/report` | query `path` → `evalReportGet(factoryRoot, { reportPath: path })` |
| POST | `/eval/diff` | body `{ reportPathA, reportPathB }` → `evalDiff` |
| POST | `/eval/cluster` | body `{ reportPath }` → `evalLowScoreCluster` |
| POST | `/optimize/suggest` | body `{ reportPath }` → `skillOptimizeSuggest` |

- Success: `{ ok: true, data: <tool result> }`
- Missing roots: every handler (or middleware) returns **503** `{ ok: false, error: { code: 'SKILL_FACTORY_UNAVAILABLE', message: 'skill-factory submodule not initialized; run: git submodule update --init --recursive' } }`
- Write tools (`skillGenerate`, `casesGenerate`, `rubricGenerate`, `evalRun`) must `auditLog(factoryRoot, { actor: 'http', tool: '<mcp-name>', ok: true/false, params, outputPath? })`

- [ ] **Step 1: Write failing route tests**

```ts
// apps/control/src/http/__tests__/skill-factory-routes.test.ts
import { describe, expect, test, beforeEach } from 'bun:test'
import { Hono } from 'hono'
import { createSkillFactoryRoutes } from '../routes/skill-factory.ts'
import type { SkillFactoryTools } from '../../skill-factory/loadTools.ts'

function mockTools(overrides: Partial<SkillFactoryTools> = {}): SkillFactoryTools {
  return {
    skillList: () => [{ id: 'demo', zone: 'staging' }],
    skillGet: (_a, id, zone = 'published') => ({
      id,
      zone,
      skillMd: '# demo',
    }),
    skillGenerate: (_a, input) => ({
      id: input.id,
      zone: 'staging',
      paths: [`staging/${input.id}/SKILL.md`],
    }),
    casesGenerate: () => ({ path: 'staging/demo/cases/generated/c.json' }),
    rubricGenerate: () => ({ path: 'staging/demo/rubric_config.json' }),
    evalRun: () => ({
      reportPath: 'reports/eval/demo-1.json',
      report: { skillId: 'demo', cases: [] },
    }),
    evalReportGet: () => ({ skillId: 'demo', cases: [] }),
    evalDiff: () => ({ diff: [] }),
    evalLowScoreCluster: () => ({ clusters: [] }),
    skillOptimizeSuggest: () => ({ suggestions: [] }),
    auditLog: () => {},
    FrozenPathError: class FrozenPathError extends Error {
      readonly code = 'FROZEN_PATH' as const
      constructor(path: string) {
        super(`FROZEN_PATH: ${path}`)
        this.name = 'FrozenPathError'
      }
    },
    ...overrides,
  } as SkillFactoryTools
}

describe('/api/skill-factory', () => {
  test('503 when roots null', async () => {
    const api = createSkillFactoryRoutes({
      workspaceRoot: '/tmp/none',
      roots: null,
      tools: mockTools(),
    })
    const app = new Hono().route('/api/skill-factory', api)
    const res = await app.request('http://localhost/api/skill-factory/skills')
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('SKILL_FACTORY_UNAVAILABLE')
  })

  test('GET /skills happy path', async () => {
    const api = createSkillFactoryRoutes({
      workspaceRoot: '/tmp/x',
      roots: { factoryRoot: '/tmp/sf', assetsRoot: '/tmp/sf/skill-assets' },
      tools: mockTools(),
    })
    const app = new Hono().route('/api/skill-factory', api)
    const res = await app.request('http://localhost/api/skill-factory/skills')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      data: [{ id: 'demo', zone: 'staging' }],
    })
  })

  test('FROZEN_PATH → 403', async () => {
    const tools = mockTools()
    tools.skillGenerate = () => {
      throw new tools.FrozenPathError('published/x')
    }
    const api = createSkillFactoryRoutes({
      workspaceRoot: '/tmp/x',
      roots: { factoryRoot: '/tmp/sf', assetsRoot: '/tmp/sf/skill-assets' },
      tools,
    })
    const app = new Hono().route('/api/skill-factory', api)
    const res = await app.request(
      'http://localhost/api/skill-factory/skills/generate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'x', description: 'd' }),
      },
    )
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe('FROZEN_PATH')
  })

  test('skill not found → 404', async () => {
    const tools = mockTools({
      skillGet: () => {
        throw new Error('skill not found: staging/missing')
      },
    })
    const api = createSkillFactoryRoutes({
      workspaceRoot: '/tmp/x',
      roots: { factoryRoot: '/tmp/sf', assetsRoot: '/tmp/sf/skill-assets' },
      tools,
    })
    const app = new Hono().route('/api/skill-factory', api)
    const res = await app.request(
      'http://localhost/api/skill-factory/skills/missing?zone=staging',
    )
    expect(res.status).toBe(404)
  })

  test('POST write + read routes happy paths', async () => {
    const api = createSkillFactoryRoutes({
      workspaceRoot: '/tmp/x',
      roots: { factoryRoot: '/tmp/sf', assetsRoot: '/tmp/sf/skill-assets' },
      tools: mockTools(),
    })
    const app = new Hono().route('/api/skill-factory', api)
    const json = async (path: string, init?: RequestInit) => {
      const res = await app.request(`http://localhost/api/skill-factory${path}`, init)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)
      return body.data
    }
    await json('/skills/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'demo', description: 'd' }),
    })
    await json('/cases/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skillId: 'demo', note: 'n' }),
    })
    await json('/rubric/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skillId: 'demo' }),
    })
    await json('/eval/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skillId: 'demo', zone: 'staging' }),
    })
    await json('/eval/report?path=reports/eval/demo-1.json')
    await json('/eval/diff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reportPathA: 'reports/a.json',
        reportPathB: 'reports/b.json',
      }),
    })
    await json('/eval/cluster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportPath: 'reports/eval/demo-1.json' }),
    })
    await json('/optimize/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportPath: 'reports/eval/demo-1.json' }),
    })
  })
})
```

Also add a unit test for `resolveSkillFactoryRoots` in the same file or `apps/control/src/skill-factory/__tests__/resolveRoots.test.ts`: missing dir → `null`; present dir with `mcp/src/tools.ts` → non-null.

- [ ] **Step 2: Run tests — expect FAIL**

Run: `bun test apps/control/src/http/__tests__/skill-factory-routes.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Implement resolve / mapError / loadTools / routes / app mount**

`resolveRoots.ts`:

```ts
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export function resolveSkillFactoryRoots(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): { factoryRoot: string; assetsRoot: string } | null {
  const factoryRoot = (
    env.SKILL_FACTORY_ROOT?.trim() || join(workspaceRoot, 'skill-factory')
  )
  const toolsPath = join(factoryRoot, 'mcp/src/tools.ts')
  if (!existsSync(toolsPath)) return null
  const assetsRoot = join(factoryRoot, 'skill-assets')
  return { factoryRoot, assetsRoot }
}
```

`mapError.ts` — map by:
- `err` with `code === 'FROZEN_PATH'` or name `FrozenPathError` → 403
- message includes `skill not found` → 404
- message includes `invalid zone` | `no cases found` | `path escapes` | `report path must` | `invalid skill id` → 400
- else → 500 with message

`loadTools.ts` — define `SkillFactoryTools` type matching the mock; `loadSkillFactoryTools(factoryRoot)` dynamically imports via `pathToFileURL(join(factoryRoot, 'mcp/src/tools.ts'))` plus `paths.ts` / `audit.ts`. Production routes call this when `tools` option omitted.

`skill-factory.ts` routes: thin wrappers; on missing roots return 503; try/catch → `mapSkillFactoryError`; audit on writes.

`app.ts`: after other routes:

```ts
app.route(
  '/api/skill-factory',
  createSkillFactoryRoutes({ workspaceRoot }),
)
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `bun test apps/control/src/http/__tests__/skill-factory-routes.test.ts`

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add apps/control/src/skill-factory apps/control/src/http/routes/skill-factory.ts apps/control/src/http/__tests__/skill-factory-routes.test.ts apps/control/src/http/app.ts
git commit -m "$(cat <<'EOF'
feat(control): add /api/skill-factory HTTP proxy over tools.ts

EOF
)"
```

---

### Task 3: `SkillFactoryPanel` + API client

**Files:**
- Create: `packages/widgets/skill-factory/api.ts`
- Create: `packages/widgets/skill-factory/SkillFactoryPanel.tsx`
- Create: `packages/widgets/skill-factory/index.ts`
- Create: `packages/widgets/skill-factory/__tests__/api.test.ts`

**Interfaces:**
- Consumes: `/api/skill-factory/*` envelope; `registerWidget` from `../src/registry.ts`
- Produces:
  - `sfFetch<T>(path, init?): Promise<{ ok: true; data: T } | { ok: false; status: number; error: { code?: string; message: string } }>`
  - `SkillFactoryPanel` React component — three sections in one page (no router)
  - Registration: `id: 'skill-factory'`, `title: 'Skill Factory'`, `order: 50`, `mount: () => createElement(SkillFactoryPanel)`

**Panel IA (must cover all MCP tools via HTTP):**

1. **Skills** — load list; zone toggle `staging` | `published`; select skill → get + show `skillMd`
2. **Generate** — forms for skill.generate / cases.generate / rubric.generate
3. **Eval** — eval.run; show `reportPath` + summary; forms for report get / diff / cluster / suggest

On 503: show the submodule init command from `error.message`. Surface `error.code` (including `FROZEN_PATH`) in the UI error area — do not swallow.

Reuse CSS class names from web shell: wrap with `className="settings"` and sections `settings__section`; inputs use `form-field` / `form-field__label` / `form-field__input` / `form-field__save-btn` (same strings as Settings). Widgets package does not import web CSS — shell already loads global CSS.

- [ ] **Step 1: Write failing api tests**

```ts
// packages/widgets/skill-factory/__tests__/api.test.ts
import { describe, expect, test, afterEach, mock } from 'bun:test'
import { sfFetch } from '../api.ts'

afterEach(() => {
  mock.restore()
})

describe('sfFetch', () => {
  test('parses ok envelope', async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ ok: true, data: { id: 'x' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch
    const r = await sfFetch<{ id: string }>('/skills/x')
    expect(r).toEqual({ ok: true, data: { id: 'x' } })
  })

  test('parses error envelope with status', async () => {
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'FROZEN_PATH', message: 'FROZEN_PATH: published/x' },
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as unknown as typeof fetch
    const r = await sfFetch('/skills/generate', { method: 'POST', body: '{}' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(403)
      expect(r.error.code).toBe('FROZEN_PATH')
    }
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `bun test packages/widgets/skill-factory/__tests__/api.test.ts`

- [ ] **Step 3: Implement `api.ts`, panel, registration**

`api.ts` — `sfFetch` prefixes `/api/skill-factory`, sets JSON content-type for body, returns typed envelope.

`SkillFactoryPanel.tsx` — functional component with local state; three sections; call `sfFetch` for each action.

`index.ts`:

```ts
import { createElement } from 'react'
import { registerWidget } from '../src/registry.ts'
import { SkillFactoryPanel } from './SkillFactoryPanel.tsx'

registerWidget({
  id: 'skill-factory',
  title: 'Skill Factory',
  order: 50,
  mount: () => createElement(SkillFactoryPanel),
})
```

- [ ] **Step 4: Run tests — PASS**

Run: `bun test packages/widgets`

- [ ] **Step 5: Commit**

```bash
git add packages/widgets/skill-factory
git commit -m "$(cat <<'EOF'
feat(widgets): add Skill Factory panel and registerWidget side-effect

EOF
)"
```

---

### Task 4: Shell dynamic tabs + bootstrap

**Files:**
- Modify: `apps/web/package.json` — add `"@harness/widgets": "workspace:*"`
- Modify: `apps/web/src/main.tsx` — import `@harness/widgets/skill-factory` before App
- Modify: `apps/web/src/App.tsx` — fixed Chat/Settings + `listWidgets()` tabs
- Create: `apps/web/src/__tests__/listWidgetTabs.test.ts` (optional pure helper) OR test a tiny extracted helper

**Interfaces:**
- Consumes: `listWidgets` from `@harness/widgets`
- Produces: tab id union effectively `chat` | `settings` | string widget ids; active widget renders `widget.mount()`

- [ ] **Step 1: Extract + test tab model helper (TDD)**

```ts
// apps/web/src/shellTabs.ts
import { listWidgets, type WidgetDefinition } from '@harness/widgets'

export type FixedTab = 'chat' | 'settings'
export type ShellTab = FixedTab | string

export function getDynamicWidgets(): WidgetDefinition[] {
  return listWidgets()
}

export function isFixedTab(tab: ShellTab): tab is FixedTab {
  return tab === 'chat' || tab === 'settings'
}
```

```ts
// apps/web/src/__tests__/shellTabs.test.ts
import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { createElement } from 'react'
import { registerWidget, clearWidgetsForTests } from '@harness/widgets/src/registry.ts'
// Prefer public API: if clearWidgetsForTests is not public, register only and assert list length via getDynamicWidgets after bootstrap import pattern.
```

Prefer: export `clearWidgetsForTests` only from registry (already); from web test, import bootstrap module that registers skill-factory, then:

```ts
import '@harness/widgets/skill-factory'
import { getDynamicWidgets } from '../shellTabs.ts'

test('skill-factory widget is registered', () => {
  const ids = getDynamicWidgets().map((w) => w.id)
  expect(ids).toContain('skill-factory')
})
```

Note: side-effect import may register once globally — use `clearWidgetsForTests` then re-import is hard; instead assert `getWidget('skill-factory')` after importing the skill-factory entry in the test file.

- [ ] **Step 2: Run — FAIL until App wired / dep added**

- [ ] **Step 3: Wire package.json, main.tsx, App.tsx**

`main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@harness/widgets/skill-factory'
import App from './App'
import './styles/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`App.tsx` pattern:

```tsx
const widgets = listWidgets()
// nav: Chat, Settings, then widgets.map(w => TabButton ...)
// main:
//   chat → ChatPanel
//   settings → SettingsPanel
//   else → widgets.find(w => w.id === activeTab)?.mount() ?? null
```

- [ ] **Step 4: Run focused + broader tests**

Run:

```bash
bun test packages/widgets apps/web/src/__tests__
bun run --filter @harness/web typecheck
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/src/main.tsx apps/web/src/App.tsx apps/web/src/shellTabs.ts apps/web/src/__tests__/shellTabs.test.ts bun.lock
git commit -m "$(cat <<'EOF'
feat(web): mount registry widgets as dynamic shell tabs

EOF
)"
```

---

### Task 5: Docs — panel + MCP mount

**Files:**
- Create or update: `docs/skill-factory-submodule.md` (if missing on branch, create from feat/skill-factory content and extend)
- Modify: `docs/superpowers/specs/2026-07-18-skill-factory-widget-panel-design.md` — set status to **Approved** if still Draft

**Content to include:**

1. Submodule init: `git submodule update --init --recursive`
2. MCP stdio launch (existing): `cd skill-factory && bun install && bun run mcp`
3. **NEW:** Human panel — open web shell → Skill Factory tab; Control proxies `/api/skill-factory/*`; requires Control running with workspace root that contains `skill-factory/`
4. Env override: `SKILL_FACTORY_ROOT`
5. Widget contract summary + submodule extraction triggers (copy from spec §后续抽 submodule)
6. Dual channel table: Chat+MCP vs Panel+HTTP, shared `tools.ts`

- [ ] **Step 1: Write/update the doc** (no code test)

- [ ] **Step 2: Commit**

```bash
git add docs/skill-factory-submodule.md docs/superpowers/specs/2026-07-18-skill-factory-widget-panel-design.md
git commit -m "$(cat <<'EOF'
docs: document Skill Factory panel alongside MCP mount

EOF
)"
```

---

## Spec coverage self-check

| Spec requirement | Task |
|------------------|------|
| Widget registry types/API/sort/overwrite | 1 |
| `@harness/widgets` + skill-factory export path | 1, 3 |
| Control routes table (all 10) | 2 |
| Error mapping 403/400/404/503 | 2 |
| Audit on writes | 2 |
| Panel three zones covering MCP tools | 3 |
| Dynamic tabs from `listWidgets` | 4 |
| Bootstrap side-effect import | 4 |
| Docs panel + MCP + widget contract | 5 |
| No publish HTTP / no CCB codegen | Global Constraints |

## Placeholder scan

No TBD/TODO left in task steps. Exact paths, envelopes, and route table specified.

## Type consistency

- Widget id `skill-factory` used in registry, panel registration, and shell tests
- HTTP envelope `{ ok, data, error }` shared by Control and `sfFetch`
- Tool function names match skill-factory `tools.ts` exports
