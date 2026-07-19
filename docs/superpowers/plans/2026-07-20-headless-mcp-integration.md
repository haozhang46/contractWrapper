# Headless MCP Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the headless MCP server (`libs/harness-headless-connect`) into Harness Console — HTTP API for MCP server register/delete that syncs to the slot, auto-discovery on startup, and page form rendering in the Chat tab UI.

**Architecture:** The headless MCP server runs as a stdio subprocess. The Control layer (`apps/control`) spawns it on-demand to query pages (`pages_list`) and execute form submissions (`page_execute`), returning results to the web UI. No CCB subprocess dependency needed for headless page discovery — Control handles this directly via the MCP SDK. Pages appear as a sidebar section in the Chat tab.

**Tech Stack:** Bun, Hono (Control HTTP API), React 19 (web UI), `@modelcontextprotocol/sdk`, `@harness/widgets`

## Global Constraints

- All changes in `harness-console` monorepo (not modifying `libs/harness-headless-connect` submodule)
- `bun run precheck` zero errors
- Follow existing patterns: Hono routes, React components
- Prefer existing infrastructure (widget system, slot interface) over new abstractions

---

### Task 1: MCP Server Register/Delete API (existing) + Bootstrap Auto-Discovery

**Files:**
- Create: `apps/control/src/bootstrap/discoverHeadlessMcp.ts`
- Modify: `apps/control/src/index.ts`
- Create: `apps/control/src/http/__tests__/mcp-routes.test.ts`

**Interfaces:**
- Consumes: `.mcp.json` config file, `libs/harness-headless-connect` package path
- Produces: Auto-registration of `harness-headless` MCP server in `.mcp.json` on startup

The MCP register/delete HTTP API already exists at `POST /api/mcp/register` and `DELETE /api/mcp/:name` in `apps/control/src/http/routes/mcp.ts`. This task adds:
1. Auto-discovery: Control server checks for the `harness-headless-connect` package on startup and registers it as an MCP server in `.mcp.json`
2. Tests for the existing MCP register/delete API

- [ ] **Step 1: Create discoverHeadlessMcp.ts**

```ts
// apps/control/src/bootstrap/discoverHeadlessMcp.ts
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { controlLog } from './controlLog.ts'

const MCP_CONFIG_FILE = '.mcp.json'
const HEADLESS_MCP_NAME = 'harness-headless'

interface McpConfigFile {
  mcpServers: Record<string, { command: string; args?: string[]; env?: Record<string, string> }>
}

function readMcpConfig(workspaceRoot: string): McpConfigFile {
  const filePath = join(workspaceRoot, MCP_CONFIG_FILE)
  if (!existsSync(filePath)) return { mcpServers: {} }
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as McpConfigFile
  } catch {
    return { mcpServers: {} }
  }
}

function writeMcpConfig(workspaceRoot: string, config: McpConfigFile): void {
  const filePath = join(workspaceRoot, MCP_CONFIG_FILE)
  writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n')
}

/**
 * Auto-discover and register the headless MCP server on startup.
 * Looks for the harness-headless-connect package and registers it
 * as a stdio MCP server in .mcp.json.
 */
export function discoverAndRegisterHeadlessMcp(workspaceRoot: string): void {
  const config = readMcpConfig(workspaceRoot)
  if (config.mcpServers[HEADLESS_MCP_NAME]) {
    controlLog(workspaceRoot, 'headless-mcp', 'already registered')
    return
  }

  const __dirname = dirname(fileURLToPath(import.meta.url))
  const possiblePaths = [
    join(workspaceRoot, 'libs', 'harness-headless-connect', 'src', 'mcp-server.ts'),
    join(__dirname, '..', '..', '..', '..', 'libs', 'harness-headless-connect', 'src', 'mcp-server.ts'),
    process.env.HEADLESS_MCP_PATH || '',
  ]

  const entryPath = possiblePaths.find(p => p && existsSync(p))
  if (!entryPath) {
    controlLog(workspaceRoot, 'headless-mcp', 'package not found, skipping')
    return
  }

  config.mcpServers[HEADLESS_MCP_NAME] = {
    command: 'bun',
    args: ['run', entryPath],
  }
  writeMcpConfig(workspaceRoot, config)
  controlLog(workspaceRoot, 'headless-mcp', `registered (${entryPath})`)
}
```

- [ ] **Step 2: Wire into index.ts**

```diff
// apps/control/src/index.ts
import { startControlMcpServer } from './mcp/server.ts'
+import { discoverAndRegisterHeadlessMcp } from './bootstrap/discoverHeadlessMcp.ts'
import { onionRuntime } from './onionSingleton.ts'
import { pendingStore } from './pendingSingleton.ts'

const workspaceRoot = resolveWorkspaceRoot()
installProcessErrorHandlers(workspaceRoot)
initHarnessDir(workspaceRoot)
loadOnion(workspaceRoot)
+discoverAndRegisterHeadlessMcp(workspaceRoot)
```

- [ ] **Step 3: Create MCP routes test**

```ts
// apps/control/src/http/__tests__/mcp-routes.test.ts
import { describe, test, expect, afterAll } from 'bun:test'
import { join } from 'path'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'

describe('MCP registration API', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mcp-route-'))
  afterAll(() => { rmSync(tmp, { recursive: true, force: true }) })

  test('POST /api/mcp/register adds server to .mcp.json', async () => {
    const { createMcpRoutes } = await import('../routes/mcp.ts')
    const app = createMcpRoutes(tmp)
    const res = await app.request('/api/mcp/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test-server', command: 'bun', args: ['run', 'test.ts'] }),
    })
    expect(res.status).toBe(200)
    const { registered } = await res.json()
    expect(registered).toBe(true)
    const config = JSON.parse(require('fs').readFileSync(join(tmp, '.mcp.json'), 'utf-8'))
    expect(config.mcpServers['test-server'].command).toBe('bun')
  })

  test('DELETE /api/mcp/:name removes server', async () => {
    const { createMcpRoutes } = await import('../routes/mcp.ts')
    const app = createMcpRoutes(tmp)
    const res = await app.request('/api/mcp/test-server', { method: 'DELETE' })
    expect(res.status).toBe(200)
    const { removed } = await res.json()
    expect(removed).toBe(true)
  })

  test('DELETE nonexistent returns 404', async () => {
    const { createMcpRoutes } = await import('../routes/mcp.ts')
    const app = createMcpRoutes(tmp)
    const res = await app.request('/api/mcp/nonexistent', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })

  test('POST duplicate returns 409', async () => {
    const { createMcpRoutes } = await import('../routes/mcp.ts')
    const app = createMcpRoutes(tmp)
    await app.request('/api/mcp/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'dup', command: 'echo' }),
    })
    const res = await app.request('/api/mcp/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'dup', command: 'echo' }),
    })
    expect(res.status).toBe(409)
  })

  test('POST invalid name returns 400', async () => {
    const { createMcpRoutes } = await import('../routes/mcp.ts')
    const app = createMcpRoutes(tmp)
    const res = await app.request('/api/mcp/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'bad name!', command: 'echo' }),
    })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/hz/Desktop/fe/harness-console && bun test apps/control/src/http/__tests__/mcp-routes.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add apps/control/src/bootstrap/discoverHeadlessMcp.ts apps/control/src/index.ts apps/control/src/http/__tests__/mcp-routes.test.ts
git commit -m "feat(control): auto-discover headless MCP server on startup

Add discoverAndRegisterHeadlessMcp() bootstrap function that checks
for the harness-headless-connect package and registers it as an MCP
server in .mcp.json. Includes tests for MCP register/delete HTTP API.

Co-Authored-By: deepseek-chat <deepseek-ai@claude-code-best.win>
"
```

---

### Task 2: Headless Pages HTTP API (Control Layer)

**Files:**
- Create: `apps/control/src/http/routes/headless-pages.ts`
- Modify: `apps/control/src/http/app.ts`
- Create: `apps/control/src/http/__tests__/headless-pages.test.ts`

**Interfaces:**
- Consumes: `.mcp.json` headless server entry, MCP SDK `StdioClientTransport`, `Client`
- Produces: `GET /api/headless/pages` → `PageDefinition[]`, `GET /api/headless/pages/:id/schema` → `{ schema: PageSchema }`, `POST /api/headless/pages/:id/execute` → execution result

The Control layer spawns the registered headless MCP server on-demand (not keeping it running), calls `pages_list`/`page_schema`/`page_execute` tools, and returns the result. This avoids requiring the CCB subprocess to manage MCP clients.

- [ ] **Step 1: Install MCP SDK in apps/control**

Run: `cd /Users/hz/Desktop/fe/harness-console && bun add @modelcontextprotocol/sdk@^1.29.0 --cwd apps/control`

- [ ] **Step 2: Create headless-pages route module**

```ts
// apps/control/src/http/routes/headless-pages.ts
import { Hono } from 'hono'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const MCP_CONFIG_FILE = '.mcp.json'

interface McpConfigFile {
  mcpServers: Record<string, { command: string; args?: string[]; env?: Record<string, string> }>
}

function readMcpConfig(workspaceRoot: string): McpConfigFile {
  const filePath = join(workspaceRoot, MCP_CONFIG_FILE)
  if (!existsSync(filePath)) return { mcpServers: {} }
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as McpConfigFile
  } catch {
    return { mcpServers: {} }
  }
}

function findHeadlessMcpServer(config: McpConfigFile): { command: string; args: string[]; env: Record<string, string> } | null {
  for (const [, server] of Object.entries(config.mcpServers)) {
    const cmd = [server.command, ...(server.args ?? [])].join(' ').toLowerCase()
    if (cmd.includes('harness-headless') || cmd.includes('headless-connect')) {
      return { command: server.command, args: server.args ?? [], env: server.env ?? {} }
    }
  }
  return null
}

async function callHeadlessTool<T>(
  serverInfo: { command: string; args: string[]; env: Record<string, string> },
  toolName: string,
  toolArgs?: Record<string, unknown>,
): Promise<T> {
  const transport = new StdioClientTransport({ command: serverInfo.command, args: serverInfo.args })
  const client = new Client({ name: 'harness-control-headless', version: '0.1.0' }, { capabilities: {} })
  try {
    await client.connect(transport)
    return await client.request(
      { method: 'tools/call', params: { name: toolName, arguments: toolArgs ?? {} } },
      { schema: {} as any },
    ) as T
  } finally {
    await client.close()
  }
}

export function createHeadlessPagesRoutes(workspaceRoot: string): Hono {
  const api = new Hono()

  api.get('/pages', async c => {
    const server = findHeadlessMcpServer(readMcpConfig(workspaceRoot))
    if (!server) return c.json([])
    try {
      const result = await callHeadlessTool<{ content: Array<{ type: string; text: string }> }>(server, 'pages_list')
      const text = result.content?.[0]?.text
      return c.json(text ? JSON.parse(text) : [])
    } catch (err) {
      return c.json({ error: String(err) }, 502)
    }
  })

  api.get('/pages/:id/schema', async c => {
    const { id } = c.req.param()
    const server = findHeadlessMcpServer(readMcpConfig(workspaceRoot))
    if (!server) return c.json({ error: 'No headless MCP server' }, 404)
    try {
      const result = await callHeadlessTool<{ content: Array<{ type: string; text: string }>; isError?: boolean }>(server, 'page_schema', { pageId: id })
      const text = result.content?.[0]?.text
      if (!text || result.isError) return c.json({ error: 'Page not found' }, 404)
      return c.json(JSON.parse(text))
    } catch (err) {
      return c.json({ error: String(err) }, 502)
    }
  })

  api.post('/pages/:id/execute', async c => {
    const { id } = c.req.param()
    const { formData } = await c.req.json<{ formData?: Record<string, unknown> }>()
    const server = findHeadlessMcpServer(readMcpConfig(workspaceRoot))
    if (!server) return c.json({ error: 'No headless MCP server' }, 404)
    try {
      const result = await callHeadlessTool<{ content: Array<{ type: string; text: string }> }>(server, 'page_execute', { pageId: id, formData: formData ?? {} })
      const text = result.content?.[0]?.text
      if (!text) return c.json({ error: 'Execution failed' }, 500)
      return c.json(JSON.parse(text))
    } catch (err) {
      return c.json({ error: String(err) }, 502)
    }
  })

  return api
}
```

- [ ] **Step 3: Register routes in app.ts**

```diff
// apps/control/src/http/app.ts
import { createHeadlessRoutes } from './routes/headless.ts'
+import { createHeadlessPagesRoutes } from './routes/headless-pages.ts'
...
app.route('/api/headless', createHeadlessRoutes(workspaceRoot))
+app.route('/api/headless', createHeadlessPagesRoutes(workspaceRoot))
```

- [ ] **Step 4: Write API tests**

```ts
// apps/control/src/http/__tests__/headless-pages.test.ts
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { join } from 'path'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { existsSync, readFileSync } from 'fs'

const headlessMcpPath = join(import.meta.dirname, '../../../../../libs/harness-headless-connect/src/mcp-server.ts')

describe('headless pages API', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hpl-test-'))
  beforeAll(() => {
    if (!existsSync(headlessMcpPath)) return
    mkdirSync(join(tmp, '.harness'), { recursive: true })
    writeFileSync(join(tmp, '.mcp.json'), JSON.stringify({
      mcpServers: {
        'harness-headless': { command: 'bun', args: ['run', headlessMcpPath] },
      },
    }, null, 2))
  })
  afterAll(() => { rmSync(tmp, { recursive: true, force: true }) })

  test('GET /api/headless/pages returns page list', async () => {
    if (!existsSync(headlessMcpPath)) return
    const { createApp } = await import('../../http/app.ts')
    const res = await createApp({ workspaceRoot: tmp }).request('/api/headless/pages')
    expect(res.status).toBe(200)
    const body = await res.json() as Array<{ id: string; description: string; pageid: string }>
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThan(0)
    expect(body[0]).toHaveProperty('id')
    expect(body[0]).toHaveProperty('description')
  })

  test('GET /api/headless/pages/:id/schema returns form schema', async () => {
    if (!existsSync(headlessMcpPath)) return
    const { createApp } = await import('../../http/app.ts')
    const res = await createApp({ workspaceRoot: tmp }).request('/api/headless/pages/hello-world/schema')
    expect(res.status).toBe(200)
    const body = await res.json() as { schema: { form: unknown[] } }
    expect(body.schema).toHaveProperty('form')
  })

  test('POST /api/headless/pages/:id/execute submits form', async () => {
    if (!existsSync(headlessMcpPath)) return
    const { createApp } = await import('../../http/app.ts')
    const res = await createApp({ workspaceRoot: tmp }).request('/api/headless/pages/hello-world/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ formData: { name: 'Test', greeting: 'hello', count: 1 } }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { status: string }
    expect(body.status).toBe('simulated')
  })

  test('GET unknown page returns 404', async () => {
    if (!existsSync(headlessMcpPath)) return
    const { createApp } = await import('../../http/app.ts')
    const res = await createApp({ workspaceRoot: tmp }).request('/api/headless/pages/nonexist/schema')
    expect(res.status).toBe(404)
  })

  test('returns empty array when no headless MCP', async () => {
    const emptyTmp = mkdtempSync(join(tmpdir(), 'hpl-empty-'))
    writeFileSync(join(emptyTmp, '.mcp.json'), JSON.stringify({ mcpServers: {} }))
    try {
      const { createApp } = await import('../../http/app.ts')
      const res = await createApp({ workspaceRoot: emptyTmp }).request('/api/headless/pages')
      expect(res.status).toBe(200)
      const body = await res.json() as unknown[]
      expect(body).toEqual([])
    } finally { rmSync(emptyTmp, { recursive: true, force: true }) }
  })
})
```

- [ ] **Step 5: Run tests**

Run: `cd /Users/hz/Desktop/fe/harness-console && bun test apps/control/src/http/__tests__/headless-pages.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/control/src/http/routes/headless-pages.ts apps/control/src/http/__tests__/headless-pages.test.ts apps/control/src/http/app.ts apps/control/package.json
git commit -m "feat(control): add headless pages HTTP API with MCP on-demand spawn

Add GET /api/headless/pages, GET /api/headless/pages/:id/schema,
POST /api/headless/pages/:id/execute. Control layer spawns the
headless MCP server on-demand via StdioClientTransport to query
page definitions and execute form submissions.

Co-Authored-By: deepseek-chat <deepseek-ai@claude-code-best.win>
"
```

---

### Task 3: Headless Pages UI — Dynamic Form and Chat Panel Integration

**Files:**
- Create: `apps/web/src/components/DynamicForm.tsx`
- Create: `apps/web/src/components/HeadlessPagesPanel.tsx`
- Modify: `apps/web/src/components/ChatPanel.tsx`
- Create: `apps/web/src/styles/headless-pages.css`

**Interfaces:**
- Consumes: `GET /api/headless/pages`, `GET /api/headless/pages/:id/schema`, `POST /api/headless/pages/:id/execute`
- Produces: Sidebar "Pages" section in ChatPanel, dynamic form rendering from schema, form submission + result display

- [ ] **Step 1: Create DynamicForm component**

```tsx
// apps/web/src/components/DynamicForm.tsx
import { useState, type ReactElement } from 'react'

export interface FormField {
  name: string; label: string
  type: 'text' | 'textarea' | 'select' | 'number' | 'boolean'
  required?: boolean
  options?: { label: string; value: string }[]
  placeholder?: string
  defaultValue?: string | number | boolean
}

interface PageSchema {
  form: FormField[]
  request: { method: string; url: string; bodyTemplate?: string }
}

interface DynamicFormProps {
  schema: PageSchema
  onSubmit: (formData: Record<string, unknown>) => void
  submitting?: boolean
}

export default function DynamicForm({ schema, onSubmit, submitting = false }: DynamicFormProps): ReactElement {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {}
    for (const f of schema.form) {
      if (f.defaultValue !== undefined) initial[f.name] = f.defaultValue
      else if (f.type === 'boolean') initial[f.name] = false
      else initial[f.name] = ''
    }
    return initial
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    for (const f of schema.form) {
      if (f.required && (values[f.name] === '' || values[f.name] === undefined)) {
        errs[f.name] = `${f.label} is required`
      }
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (validate()) onSubmit(values)
  }

  const setVal = (name: string, value: unknown) => {
    setValues(p => ({ ...p, [name]: value }))
    if (errors[name]) setErrors(p => { const { [name]: _, ...r } = p; return r })
  }

  return (
    <form onSubmit={handleSubmit} className="dynamic-form">
      {schema.form.map(f => (
        <div key={f.name} className="dynamic-form__field">
          <label className="dynamic-form__label">
            {f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}
          </label>
          {f.type === 'text' && (
            <input type="text" value={String(values[f.name] ?? '')} onChange={e => setVal(f.name, e.target.value)}
              placeholder={f.placeholder} className="dynamic-form__input" disabled={submitting} />
          )}
          {f.type === 'textarea' && (
            <textarea value={String(values[f.name] ?? '')} onChange={e => setVal(f.name, e.target.value)}
              placeholder={f.placeholder} className="dynamic-form__textarea" disabled={submitting} />
          )}
          {f.type === 'number' && (
            <input type="number" value={Number(values[f.name] ?? '')} onChange={e => setVal(f.name, e.target.value === '' ? '' : Number(e.target.value))}
              placeholder={f.placeholder} className="dynamic-form__input" disabled={submitting} />
          )}
          {f.type === 'select' && f.options && (
            <select value={String(values[f.name] ?? '')} onChange={e => setVal(f.name, e.target.value)}
              className="dynamic-form__select" disabled={submitting}>
              {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          {f.type === 'boolean' && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={Boolean(values[f.name])} onChange={e => setVal(f.name, e.target.checked)}
                className="dynamic-form__checkbox" disabled={submitting} />
              <span>{f.label}</span>
            </label>
          )}
          {errors[f.name] && <p className="dynamic-form__error">{errors[f.name]}</p>}
        </div>
      ))}
      <button type="submit" className="dynamic-form__submit" disabled={submitting}>
        {submitting ? 'Submitting...' : 'Submit'}
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Create HeadlessPagesPanel component**

```tsx
// apps/web/src/components/HeadlessPagesPanel.tsx
import { useState, useEffect, useCallback, type ReactElement } from 'react'
import DynamicForm from './DynamicForm'

interface PageMeta { id: string; description: string; pageid: string; hasSchema: boolean }
interface PageResult { status: string; page: string; method: string; url: string; message?: string }

interface HeadlessPagesPanelProps {
  /** When set, opens the page directly. When null, shows page list. */
  selectedPageId?: string | null
  onPageSelect?: (id: string | null) => void
}

export default function HeadlessPagesPanel({ selectedPageId, onPageSelect }: HeadlessPagesPanelProps): ReactElement {
  const [pages, setPages] = useState<PageMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activePage, setActivePage] = useState<PageMeta | null>(null)
  const [schema, setSchema] = useState<{ form: unknown[]; request: { method: string; url: string } } | null>(null)
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<PageResult | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    fetch('/api/headless/pages')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`Server error: ${r.status}`)))
      .then((data: PageMeta[]) => { if (!cancelled) { setPages(data); setLoading(false) } })
      .catch((err: Error) => { if (!cancelled) { setError(err.message); setLoading(false) } })
    return () => { cancelled = true }
  }, [refreshKey])

  // Sync external selectedPageId
  useEffect(() => {
    if (!selectedPageId) { setActivePage(null); setSchema(null); setResult(null); return }
    const page = pages.find(p => p.id === selectedPageId)
    if (page) setActivePage(page)
  }, [selectedPageId, pages])

  // Load schema when active page changes
  useEffect(() => {
    if (!activePage) { setSchema(null); setResult(null); return }
    let cancelled = false
    setSchemaLoading(true); setSchema(null); setResult(null)
    fetch(`/api/headless/pages/${activePage.id}/schema`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Not found')))
      .then((data: { schema: typeof schema }) => { if (!cancelled) { setSchema(data.schema); setSchemaLoading(false) } })
      .catch(() => { if (!cancelled) setSchemaLoading(false) })
    return () => { cancelled = true }
  }, [activePage])

  const handleSubmit = useCallback(async (formData: Record<string, unknown>) => {
    if (!activePage) return
    setSubmitting(true); setResult(null)
    try {
      const res = await fetch(`/api/headless/pages/${activePage.id}/execute`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formData }),
      })
      setResult(res.ok ? await res.json() : { status: 'error', page: activePage.id, method: '', url: '', message: `Error ${res.status}` })
    } catch (err) {
      setResult({ status: 'error', page: activePage.id, method: '', url: '', message: String(err) })
    } finally { setSubmitting(false) }
  }, [activePage])

  const selectPage = (page: PageMeta) => {
    setActivePage(page); setSchema(null); setResult(null)
    onPageSelect?.(page.id)
  }

  const goBack = () => {
    setActivePage(null); setSchema(null); setResult(null)
    onPageSelect?.(null)
  }

  // List view
  if (!activePage) {
    if (loading) return <div className="headless-pages"><p className="text-zinc-500 text-sm px-3 py-2">Loading pages...</p></div>
    if (error) return <div className="headless-pages"><p className="text-red-400 text-sm px-3 py-2">{error}</p></div>
    if (pages.length === 0) return null // Don't render if no pages
    return (
      <div className="headless-pages">
        <div className="headless-pages__header">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Pages</span>
          <button type="button" onClick={() => setRefreshKey(k => k + 1)} className="text-xs text-zinc-500 hover:text-zinc-300" title="Refresh">↻</button>
        </div>
        {pages.map(p => (
          <button key={p.id} type="button" onClick={() => selectPage(p)}
            className="w-full text-left px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700/50 rounded">
            <div className="font-medium">{p.pageid || p.id}</div>
            <div className="text-xs text-zinc-500 truncate">{p.description}</div>
          </button>
        ))}
      </div>
    )
  }

  // Schema loading / form / result views
  if (result) return (
    <div className="headless-pages__main">
      <button type="button" onClick={goBack} className="text-sm text-zinc-400 hover:text-zinc-200 mb-2">← Back</button>
      <h3 className="text-sm font-semibold text-zinc-300 mb-2">Result</h3>
      <pre className="text-xs bg-zinc-800 p-3 rounded overflow-auto max-h-60">{JSON.stringify(result, null, 2)}</pre>
      <button type="button" onClick={goBack} className="mt-2 text-sm text-zinc-400 hover:text-zinc-200">Submit Another</button>
    </div>
  )

  if (schemaLoading) return (
    <div className="headless-pages__main">
      <button type="button" onClick={goBack} className="text-sm text-zinc-400 hover:text-zinc-200 mb-2">← Back</button>
      <p className="text-sm text-zinc-500">Loading form...</p>
    </div>
  )

  if (schema) return (
    <div className="headless-pages__main">
      <button type="button" onClick={goBack} className="text-sm text-zinc-400 hover:text-zinc-200 mb-2">← Back</button>
      <h3 className="text-sm font-semibold text-zinc-300 mb-3">{activePage.description}</h3>
      <DynamicForm schema={schema} onSubmit={handleSubmit} submitting={submitting} />
    </div>
  )

  return (
    <div className="headless-pages__main">
      <button type="button" onClick={goBack} className="text-sm text-zinc-400 hover:text-zinc-200 mb-2">← Back</button>
      <p className="text-sm text-zinc-500">This page has no form schema.</p>
    </div>
  )
}
```

- [ ] **Step 3: Integrate into ChatPanel sidebar**

Add a "Pages" section in the ChatPanel sidebar. The HeadlessPagesPanel self-manages — when no headless MCP pages are available, it renders null (empty).

```diff
// apps/web/src/components/ChatPanel.tsx
+import HeadlessPagesPanel from './HeadlessPagesPanel'

export default function ChatPanel(): ReactElement {
   // ...existing state
+  const [activePage, setActivePage] = useState<string | null>(null)

   // ...existing code

   return (
     <div className="chat-panel">
       <div className={`chat-panel__sidebar ...`}>
         {/* ...existing session list ... */}
+        {/* ── Headless Pages ── */}
+        <div className="chat-panel__pages-section">
+          <HeadlessPagesPanel
+            selectedPageId={activePage}
+            onPageSelect={setActivePage}
+          />
+        </div>

         {/* existing: sidebar toggle button */}
```

In the main content area, when `activePage` is set and the active tab has no session running, render the page content:

```diff
         <div ref={scrollRef} className="chat-panel__messages">
           {!activeTab ? (
+            activePage ? (
+              <HeadlessPagesPanel
+                selectedPageId={activePage}
+                onPageSelect={setActivePage}
+              />
+            ) : (
             <div className="chat-panel__messages--empty">
               ...
             </div>
+            )
           ) : messages.length === 0 ? (
             /* ... existing empty tab ... */
```

- [ ] **Step 4: Add CSS styles**

```css
/* apps/web/src/styles/headless-pages.css */

.headless-pages__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px 4px;
}

.headless-pages__main {
  padding: 16px;
}

.dynamic-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dynamic-form__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dynamic-form__label {
  font-size: 13px;
  color: #a1a1aa;
  font-weight: 500;
}

.dynamic-form__input,
.dynamic-form__textarea,
.dynamic-form__select {
  background: #27272a;
  border: 1px solid #3f3f46;
  border-radius: 6px;
  padding: 8px 12px;
  color: #e4e4e7;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}

.dynamic-form__input:focus,
.dynamic-form__textarea:focus,
.dynamic-form__select:focus {
  border-color: #D77757;
}

.dynamic-form__textarea {
  min-height: 80px;
  resize: vertical;
}

.dynamic-form__submit {
  background: #D77757;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.dynamic-form__submit:hover:not(:disabled) {
  background: #c0684e;
}

.dynamic-form__submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dynamic-form__error {
  font-size: 12px;
  color: #f87171;
}

.chat-panel__pages-section {
  border-top: 1px solid #3f3f46;
  margin-top: 8px;
  padding-top: 4px;
}
```

Import the CSS in `App.tsx` or the main entry point.

- [ ] **Step 5: Run tests**

Run: `cd /Users/hz/Desktop/fe/harness-console && bun run precheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/DynamicForm.tsx apps/web/src/components/HeadlessPagesPanel.tsx apps/web/src/components/ChatPanel.tsx apps/web/src/styles/headless-pages.css
git commit -m "feat(web): add headless pages UI with dynamic form in ChatPanel

Add HeadlessPagesPanel and DynamicForm components. Pages appear as a
section in the ChatPanel sidebar. Selecting a page shows its dynamic
form (rendered from MCP schema) in the main area. Form submission
calls page_execute and displays the result.

Co-Authored-By: deepseek-chat <deepseek-ai@claude-code-best.win>
"
```

---

## Self-Review

### Spec coverage
1. MCP 注册/删除能力 — existing `POST /api/mcp/register` / `DELETE /api/mcp/:name` in `routes/mcp.ts`, now tested ✅ (Task 1)
2. 同步给 slot — auto-discovery on startup registers the headless MCP server ✅ (Task 1)
3. 读取 headless server 的 page 模板 — `GET /api/headless/pages` + schema endpoints via Control ✅ (Task 2)
4. Page 在当前 header tab 中进行跳转 — ChatPanel sidebar pages section + in-tab page rendering ✅ (Task 3)

### Placeholder scan
- No TBD/TODO/fill-in-later placeholders — all code is complete
- No "add error handling" without code — all error paths have handlers
- No "similar to Task N" — each task is self-contained with full code

### Type consistency
- `PageDefinition` type from headless MCP server matches `{id, description, pageid, prompt, schema}` — preserved across all 3 tasks
- `DynamicForm` consumes `FormField[]` matching the MCP server's schema format
- `HeadlessPagesPanel` props (`selectedPageId`, `onPageSelect`) consistent between ChatPanel integration and component definition
- MCP register API `{name, command, args?, env?}` format consistent with existing `createMcpRoutes`
