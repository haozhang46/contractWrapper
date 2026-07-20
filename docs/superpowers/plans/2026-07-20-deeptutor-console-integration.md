# DeepTutor Console Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a thin CLI-backed MCP bridge (`status` + `run`) and a DeepTutor iframe Widget tab so harness-console Chat can drive DeepTutor and the Shell can embed/open its Web UI.

**Architecture:** Pure helpers build CLI args and aggregate NDJSON; an injectable spawn layer runs `deeptutor`; a stdio MCP server (same pattern as `libs/harness-headless-connect`) exposes two tools. A `@harness/widgets/deeptutor` panel iframes a configurable URL with open-in-new-tab fallback. DeepTutor itself stays an external process.

**Tech Stack:** Bun, TypeScript, `@modelcontextprotocol/sdk`, React 19, existing `@harness/widgets` registry, `bun:test`

**Spec:** [2026-07-20-deeptutor-console-integration-design.md](../specs/2026-07-20-deeptutor-console-integration-design.md)

## Global Constraints

- MCP server name in `.mcp.json`: `deeptutor`
- Tools only: `status`, `run` (no kb/session/memory/partner/skill)
- Capabilities enum: `chat` | `deep_solve` | `deep_question` | `deep_research` | `visualize` | `math_animator` | `mastery_path`
- Env: `DEEPTUTOR_BIN` (default `deeptutor`), `DEEPTUTOR_WEB_URL` (default `http://127.0.0.1:3782`), `DEEPTUTOR_HOME` (pass-through to child env only), `DEEPTUTOR_MCP_TIMEOUT_MS` (default `120000`)
- Error codes: `CLI_NOT_FOUND`, `TIMEOUT`; non-zero exit returns summary + exit code
- Widget id: `deeptutor`; title: `DeepTutor`; `order: 60`; localStorage key: `harness.deeptutor.webUrl`
- No control proxy / Docker lifecycle / WebSocket bridge / X-Frame header stripping
- UI reuses existing `.settings*` / `.form-field*` classes; no new visual system
- Tests: `bun:test`; no live DeepTutor e2e in CI
- `libs/*` is **not** a Bun workspace member (same as headless-connect); run via `bun run` absolute/relative path

## File structure

```
libs/deeptutor-bridge/
  package.json
  src/
    types.ts              # Capability, RunInput, StatusResult, RunResult
    args.ts               # buildRunArgs
    ndjson.ts             # aggregateNdjson
    spawn.ts              # runCli (injectable), probeStatus, runCapability
    mcp-server.ts         # stdio MCP entry
    __tests__/
      args.test.ts
      ndjson.test.ts
      spawn.test.ts

packages/widgets/
  package.json            # add "./deeptutor" export
  deeptutor/
    DeepTutorPanel.tsx
    index.ts              # registerWidget side-effect
    __tests__/register.test.ts

apps/web/src/
  main.tsx                # import '@harness/widgets/deeptutor'
  __tests__/shellTabs.test.ts  # assert deeptutor registered

.mcp.json                 # add deeptutor server (or document-only if file is local-only — prefer add with bun path)

docs/deeptutor-console.md # install / MCP / iframe guide

docs/superpowers/specs/2026-07-20-deeptutor-console-integration-design.md
                          # status → Approved
```

---

### Task 1: Pure CLI arg builder + NDJSON aggregator

**Files:**
- Create: `libs/deeptutor-bridge/package.json`
- Create: `libs/deeptutor-bridge/src/types.ts`
- Create: `libs/deeptutor-bridge/src/args.ts`
- Create: `libs/deeptutor-bridge/src/ndjson.ts`
- Create: `libs/deeptutor-bridge/src/__tests__/args.test.ts`
- Create: `libs/deeptutor-bridge/src/__tests__/ndjson.test.ts`

**Interfaces:**
- Consumes: none
- Produces:
  - `Capability` union type
  - `RunInput = { capability: Capability; message: string; session?: string; kb?: string | string[]; tool?: string[]; language?: string; config?: Record<string, string | number | boolean> }`
  - `buildRunArgs(input: RunInput): string[]` — argv **after** binary (starts with `run`, …, `--format`, `json`)
  - `aggregateNdjson(stdout: string): { text: string; session_id?: string }`

- [ ] **Step 1: Write failing tests for `buildRunArgs`**

Create `libs/deeptutor-bridge/src/__tests__/args.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { buildRunArgs } from '../args.ts'

describe('buildRunArgs', () => {
  test('minimal chat', () => {
    expect(
      buildRunArgs({ capability: 'chat', message: 'Explain Fourier' }),
    ).toEqual(['run', 'chat', 'Explain Fourier', '--format', 'json'])
  })

  test('kb string, tools, session, language, config', () => {
    expect(
      buildRunArgs({
        capability: 'deep_solve',
        message: 'Solve x^2=4',
        session: 'abc',
        kb: 'textbook',
        tool: ['rag', 'reason'],
        language: 'zh',
        config: { depth: 'standard', n: 2 },
      }),
    ).toEqual([
      'run',
      'deep_solve',
      'Solve x^2=4',
      '--session',
      'abc',
      '--kb',
      'textbook',
      '--tool',
      'rag',
      '--tool',
      'reason',
      '--language',
      'zh',
      '--config',
      'depth=standard',
      '--config',
      'n=2',
      '--format',
      'json',
    ])
  })

  test('kb array expands to repeated --kb', () => {
    expect(
      buildRunArgs({
        capability: 'chat',
        message: 'hi',
        kb: ['a', 'b'],
      }),
    ).toEqual([
      'run',
      'chat',
      'hi',
      '--kb',
      'a',
      '--kb',
      'b',
      '--format',
      'json',
    ])
  })
})
```

- [ ] **Step 2: Write failing tests for `aggregateNdjson`**

Create `libs/deeptutor-bridge/src/__tests__/ndjson.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { aggregateNdjson } from '../ndjson.ts'

describe('aggregateNdjson', () => {
  test('prefers done event content and session_id', () => {
    const stdout = [
      JSON.stringify({ type: 'content', text: 'partial' }),
      JSON.stringify({
        type: 'done',
        session_id: 's1',
        content: 'final answer',
      }),
    ].join('\n')
    expect(aggregateNdjson(stdout)).toEqual({
      text: 'final answer',
      session_id: 's1',
    })
  })

  test('falls back to concatenating content events', () => {
    const stdout = [
      JSON.stringify({ type: 'content', text: 'Hello ' }),
      JSON.stringify({ type: 'content', text: 'world' }),
    ].join('\n')
    expect(aggregateNdjson(stdout)).toEqual({ text: 'Hello world' })
  })

  test('non-JSON lines are appended as raw fallback text', () => {
    expect(aggregateNdjson('not-json\nstill plain')).toEqual({
      text: 'not-json\nstill plain',
    })
  })
})
```

- [ ] **Step 3: Run tests — expect FAIL**

```bash
cd /Users/hz/Desktop/fe/harness-console && bun test libs/deeptutor-bridge/src/__tests__/args.test.ts libs/deeptutor-bridge/src/__tests__/ndjson.test.ts
```

Expected: FAIL (modules not found)

- [ ] **Step 4: Implement package + types + helpers**

`libs/deeptutor-bridge/package.json`:

```json
{
  "name": "@harness/deeptutor-bridge",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "deeptutor-mcp": "./src/mcp-server.ts"
  },
  "scripts": {
    "test": "bun test",
    "start": "bun run src/mcp-server.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0"
  }
}
```

`libs/deeptutor-bridge/src/types.ts`:

```ts
export type Capability =
  | 'chat'
  | 'deep_solve'
  | 'deep_question'
  | 'deep_research'
  | 'visualize'
  | 'math_animator'
  | 'mastery_path'

export type RunInput = {
  capability: Capability
  message: string
  session?: string
  kb?: string | string[]
  tool?: string[]
  language?: string
  config?: Record<string, string | number | boolean>
}

export type StatusResult = {
  cli_ok: boolean
  version: string | null
  web_ok: boolean | null
  web_url: string
  error: { code: string; message: string } | null
}

export type RunResult = {
  ok: boolean
  text: string
  session_id?: string
  exit_code?: number
  error?: { code: string; message: string }
}
```

`libs/deeptutor-bridge/src/args.ts`:

```ts
import type { RunInput } from './types.ts'

export function buildRunArgs(input: RunInput): string[] {
  const args: string[] = ['run', input.capability, input.message]
  if (input.session) args.push('--session', input.session)
  const kbs = input.kb == null ? [] : Array.isArray(input.kb) ? input.kb : [input.kb]
  for (const kb of kbs) args.push('--kb', kb)
  for (const t of input.tool ?? []) args.push('--tool', t)
  if (input.language) args.push('--language', input.language)
  if (input.config) {
    for (const [k, v] of Object.entries(input.config)) {
      args.push('--config', `${k}=${v}`)
    }
  }
  args.push('--format', 'json')
  return args
}
```

`libs/deeptutor-bridge/src/ndjson.ts`:

```ts
type Ev = Record<string, unknown>

function asText(v: unknown): string | undefined {
  if (typeof v === 'string') return v
  return undefined
}

export function aggregateNdjson(stdout: string): {
  text: string
  session_id?: string
} {
  const lines = stdout.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const contentParts: string[] = []
  let session_id: string | undefined
  let doneText: string | undefined
  const raw: string[] = []

  for (const line of lines) {
    let ev: Ev
    try {
      ev = JSON.parse(line) as Ev
    } catch {
      raw.push(line)
      continue
    }
    const sid = asText(ev.session_id)
    if (sid) session_id = sid
    const typ = asText(ev.type)
    if (typ === 'done') {
      doneText =
        asText(ev.content) ?? asText(ev.text) ?? asText(ev.message) ?? doneText
      continue
    }
    if (typ === 'content') {
      const t = asText(ev.text) ?? asText(ev.content)
      if (t) contentParts.push(t)
    }
  }

  if (doneText != null && doneText.length > 0) {
    return session_id ? { text: doneText, session_id } : { text: doneText }
  }
  if (contentParts.length > 0) {
    const text = contentParts.join('')
    return session_id ? { text, session_id } : { text }
  }
  const text = raw.join('\n') || stdout.trim()
  return session_id ? { text, session_id } : { text }
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd /Users/hz/Desktop/fe/harness-console && bun test libs/deeptutor-bridge/src/__tests__/args.test.ts libs/deeptutor-bridge/src/__tests__/ndjson.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add libs/deeptutor-bridge/package.json libs/deeptutor-bridge/src/types.ts libs/deeptutor-bridge/src/args.ts libs/deeptutor-bridge/src/ndjson.ts libs/deeptutor-bridge/src/__tests__/args.test.ts libs/deeptutor-bridge/src/__tests__/ndjson.test.ts
git commit -m "$(cat <<'EOF'
feat(deeptutor-bridge): add run arg builder and NDJSON aggregator

EOF
)"
```

---

### Task 2: Spawn layer — `probeStatus` + `runCapability`

**Files:**
- Create: `libs/deeptutor-bridge/src/spawn.ts`
- Create: `libs/deeptutor-bridge/src/__tests__/spawn.test.ts`

**Interfaces:**
- Consumes: `buildRunArgs`, `aggregateNdjson`, `RunInput`, `StatusResult`, `RunResult`
- Produces:
  - `CliRunner = (argv: string[], opts: { timeoutMs: number; env: NodeJS.ProcessEnv }) => Promise<{ exitCode: number; stdout: string; stderr: string }>`
  - `defaultCliRunner` using `Bun.spawn`
  - `getBridgeConfig(): { bin: string; webUrl: string; timeoutMs: number }`
  - `probeStatus(opts?: { check_web?: boolean; runner?: CliRunner }): Promise<StatusResult>`
  - `runCapability(input: RunInput, opts?: { runner?: CliRunner }): Promise<RunResult>`

- [ ] **Step 1: Write failing spawn tests**

```ts
import { describe, expect, test } from 'bun:test'
import { probeStatus, runCapability, type CliRunner } from '../spawn.ts'

describe('probeStatus', () => {
  test('CLI_NOT_FOUND when runner fails to start', async () => {
    const runner: CliRunner = async () => {
      throw Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })
    }
    const r = await probeStatus({ check_web: false, runner })
    expect(r.cli_ok).toBe(false)
    expect(r.error?.code).toBe('CLI_NOT_FOUND')
  })

  test('cli_ok with version from --version stdout', async () => {
    const runner: CliRunner = async (argv) => {
      expect(argv).toEqual(['--version'])
      return { exitCode: 0, stdout: 'deeptutor 1.5.2\n', stderr: '' }
    }
    const r = await probeStatus({ check_web: false, runner })
    expect(r.cli_ok).toBe(true)
    expect(r.version).toContain('1.5.2')
    expect(r.error).toBeNull()
  })
})

describe('runCapability', () => {
  test('aggregates NDJSON on success', async () => {
    const runner: CliRunner = async (argv) => {
      expect(argv[0]).toBe('run')
      expect(argv).toContain('--format')
      return {
        exitCode: 0,
        stdout:
          JSON.stringify({
            type: 'done',
            session_id: 's9',
            content: 'ok',
          }) + '\n',
        stderr: '',
      }
    }
    const r = await runCapability(
      { capability: 'chat', message: 'hi' },
      { runner },
    )
    expect(r.ok).toBe(true)
    expect(r.text).toBe('ok')
    expect(r.session_id).toBe('s9')
  })

  test('TIMEOUT when runner throws timeout code', async () => {
    const runner: CliRunner = async () => {
      throw Object.assign(new Error('timed out'), { code: 'TIMEOUT' })
    }
    const r = await runCapability(
      { capability: 'chat', message: 'hi' },
      { runner },
    )
    expect(r.ok).toBe(false)
    expect(r.error?.code).toBe('TIMEOUT')
  })

  test('non-zero exit returns summary', async () => {
    const runner: CliRunner = async () => ({
      exitCode: 2,
      stdout: '',
      stderr: 'boom',
    })
    const r = await runCapability(
      { capability: 'chat', message: 'hi' },
      { runner },
    )
    expect(r.ok).toBe(false)
    expect(r.exit_code).toBe(2)
    expect(r.text).toContain('boom')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
bun test libs/deeptutor-bridge/src/__tests__/spawn.test.ts
```

Expected: FAIL (spawn module missing)

- [ ] **Step 3: Implement `spawn.ts`**

```ts
import { buildRunArgs } from './args.ts'
import { aggregateNdjson } from './ndjson.ts'
import type { RunInput, RunResult, StatusResult } from './types.ts'

export type CliRunner = (
  argv: string[],
  opts: { timeoutMs: number; env: NodeJS.ProcessEnv },
) => Promise<{ exitCode: number; stdout: string; stderr: string }>

export function getBridgeConfig(): {
  bin: string
  webUrl: string
  timeoutMs: number
} {
  const timeoutRaw = process.env.DEEPTUTOR_MCP_TIMEOUT_MS
  const timeoutMs = timeoutRaw ? Number(timeoutRaw) : 120_000
  return {
    bin: process.env.DEEPTUTOR_BIN?.trim() || 'deeptutor',
    webUrl: process.env.DEEPTUTOR_WEB_URL?.trim() || 'http://127.0.0.1:3782',
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 120_000,
  }
}

function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  if (process.env.DEEPTUTOR_HOME) {
    env.DEEPTUTOR_HOME = process.env.DEEPTUTOR_HOME
  }
  return env
}

export const defaultCliRunner: CliRunner = async (argv, opts) => {
  const { bin } = getBridgeConfig()
  const proc = Bun.spawn([bin, ...argv], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: opts.env,
  })
  const timer = setTimeout(() => {
    try {
      proc.kill()
    } catch {
      /* ignore */
    }
  }, opts.timeoutMs)
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    if (exitCode === null) {
      throw Object.assign(new Error('timed out'), { code: 'TIMEOUT' })
    }
    // If kill raced, treat long-running killed process as timeout when wall exceeded —
    // Bun sets a numeric exit; rely on thrown TIMEOUT from caller wrapper if needed.
    return { exitCode, stdout, stderr }
  } finally {
    clearTimeout(timer)
  }
}

async function withTimeoutKill(
  runner: CliRunner,
  argv: string[],
  timeoutMs: number,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const started = Date.now()
  try {
    return await runner(argv, { timeoutMs, env: childEnv() })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'ENOENT' || /ENOENT/i.test(String(err.message))) {
      throw Object.assign(new Error(String(err.message)), { code: 'CLI_NOT_FOUND' })
    }
    if (err.code === 'TIMEOUT' || Date.now() - started >= timeoutMs) {
      throw Object.assign(new Error('timed out'), { code: 'TIMEOUT' })
    }
    throw e
  }
}

export async function probeStatus(opts?: {
  check_web?: boolean
  runner?: CliRunner
}): Promise<StatusResult> {
  const { webUrl, timeoutMs } = getBridgeConfig()
  const runner = opts?.runner ?? defaultCliRunner
  const checkWeb = opts?.check_web !== false
  let cli_ok = false
  let version: string | null = null
  let error: StatusResult['error'] = null
  try {
    const r = await withTimeoutKill(runner, ['--version'], Math.min(timeoutMs, 15_000))
    if (r.exitCode === 0) {
      cli_ok = true
      version = (r.stdout || r.stderr).trim() || null
    } else {
      error = {
        code: 'CLI_FAILED',
        message: (r.stderr || r.stdout || `exit ${r.exitCode}`).trim(),
      }
    }
  } catch (e) {
    const err = e as { code?: string; message?: string }
    error = {
      code: err.code === 'TIMEOUT' ? 'TIMEOUT' : 'CLI_NOT_FOUND',
      message: String(err.message ?? e),
    }
  }

  let web_ok: boolean | null = null
  if (checkWeb) {
    try {
      const res = await fetch(webUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      })
      web_ok = res.ok || res.status < 500
    } catch {
      web_ok = false
    }
  }

  return { cli_ok, version, web_ok, web_url: webUrl, error }
}

export async function runCapability(
  input: RunInput,
  opts?: { runner?: CliRunner },
): Promise<RunResult> {
  const { timeoutMs } = getBridgeConfig()
  const runner = opts?.runner ?? defaultCliRunner
  const argv = buildRunArgs(input)
  try {
    const r = await withTimeoutKill(runner, argv, timeoutMs)
    if (r.exitCode !== 0) {
      const text = [r.stderr, r.stdout].filter(Boolean).join('\n').trim()
      return {
        ok: false,
        text,
        exit_code: r.exitCode,
        error: {
          code: 'EXIT_NONZERO',
          message: `deeptutor exited with ${r.exitCode}`,
        },
      }
    }
    const agg = aggregateNdjson(r.stdout)
    return { ok: true, text: agg.text, session_id: agg.session_id, exit_code: 0 }
  } catch (e) {
    const err = e as { code?: string; message?: string }
    const code = err.code === 'TIMEOUT' ? 'TIMEOUT' : 'CLI_NOT_FOUND'
    return {
      ok: false,
      text: '',
      error: { code, message: String(err.message ?? e) },
    }
  }
}
```

Note: if `Bun.spawn` ENOENT behavior differs, map it in `defaultCliRunner` by catching and rethrowing `{ code: 'ENOENT' }`.

- [ ] **Step 4: Run tests — expect PASS**

```bash
bun test libs/deeptutor-bridge/src/__tests__/spawn.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/deeptutor-bridge/src/spawn.ts libs/deeptutor-bridge/src/__tests__/spawn.test.ts
git commit -m "$(cat <<'EOF'
feat(deeptutor-bridge): add status/run spawn layer

EOF
)"
```

---

### Task 3: stdio MCP server + `.mcp.json` registration

**Files:**
- Create: `libs/deeptutor-bridge/src/mcp-server.ts`
- Modify: `.mcp.json` (create if missing; merge `deeptutor` entry without removing `harness-headless`)

**Interfaces:**
- Consumes: `probeStatus`, `runCapability`, `Capability` / `RunInput`
- Produces: stdio MCP process; tools `status`, `run`

- [ ] **Step 1: Implement `mcp-server.ts`**

Mirror `libs/harness-headless-connect/src/mcp-server.ts` structure:

```ts
#!/usr/bin/env bun
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { probeStatus, runCapability } from './spawn.ts'
import type { Capability, RunInput } from './types.ts'

const CAPABILITIES: Capability[] = [
  'chat',
  'deep_solve',
  'deep_question',
  'deep_research',
  'visualize',
  'math_animator',
  'mastery_path',
]

const server = new Server(
  { name: 'deeptutor', version: '0.1.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'status',
      description:
        'Probe whether the local deeptutor CLI is available and optionally whether the Web UI responds.',
      inputSchema: {
        type: 'object',
        properties: {
          check_web: {
            type: 'boolean',
            description: 'If true (default), HTTP-probe DEEPTUTOR_WEB_URL',
          },
        },
      },
    },
    {
      name: 'run',
      description:
        'Run one DeepTutor capability via `deeptutor run … --format json` and return aggregated text.',
      inputSchema: {
        type: 'object',
        required: ['capability', 'message'],
        properties: {
          capability: { type: 'string', enum: CAPABILITIES },
          message: { type: 'string' },
          session: { type: 'string' },
          kb: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
          },
          tool: { type: 'array', items: { type: 'string' } },
          language: { type: 'string' },
          config: {
            type: 'object',
            additionalProperties: {
              oneOf: [
                { type: 'string' },
                { type: 'number' },
                { type: 'boolean' },
              ],
            },
          },
        },
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name
  const args = (req.params.arguments ?? {}) as Record<string, unknown>
  if (name === 'status') {
    const result = await probeStatus({
      check_web: args.check_web !== false,
    })
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    }
  }
  if (name === 'run') {
    const capability = String(args.capability ?? '') as Capability
    if (!CAPABILITIES.includes(capability)) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error: { code: 'BAD_ARGS', message: 'invalid capability' },
            }),
          },
        ],
        isError: true,
      }
    }
    const message = String(args.message ?? '')
    if (!message) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error: { code: 'BAD_ARGS', message: 'message required' },
            }),
          },
        ],
        isError: true,
      }
    }
    const input: RunInput = {
      capability,
      message,
      session: args.session != null ? String(args.session) : undefined,
      kb: args.kb as RunInput['kb'],
      tool: Array.isArray(args.tool)
        ? args.tool.map(String)
        : undefined,
      language: args.language != null ? String(args.language) : undefined,
      config: args.config as RunInput['config'],
    }
    const result = await runCapability(input)
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      isError: !result.ok,
    }
  }
  return {
    content: [{ type: 'text', text: `Unknown tool: ${name}` }],
    isError: true,
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('[deeptutor-bridge] MCP server started')
```

- [ ] **Step 2: Install SDK dependency for the package**

```bash
cd /Users/hz/Desktop/fe/harness-console/libs/deeptutor-bridge && bun install
```

Expected: `node_modules` / lockfile for the package (or hoist — follow whatever bun does for a non-workspace package; if install is awkward, depend on root by copying the same `@modelcontextprotocol/sdk` resolution used by headless-connect — check whether headless has its own node_modules).

If `libs/harness-headless-connect` has no local install and relies on path resolution from repo root, instead add `@modelcontextprotocol/sdk` to the **root** `package.json` dependencies only if missing, and keep bridge importable via `bun run`.

- [ ] **Step 3: Wire `.mcp.json`**

Merge (keep existing servers):

```json
{
  "mcpServers": {
    "harness-headless": {
      "command": "bun",
      "args": [
        "run",
        "/Users/hz/Desktop/fe/harness-console/libs/harness-headless-connect/src/mcp-server.ts"
      ],
      "env": {
        "WIKI_DIR": "/Users/hz/Desktop/fe/harness-console/docs/wiki"
      }
    },
    "deeptutor": {
      "command": "bun",
      "args": [
        "run",
        "/Users/hz/Desktop/fe/harness-console/libs/deeptutor-bridge/src/mcp-server.ts"
      ],
      "env": {}
    }
  }
}
```

Prefer **relative** args if the project already standardizes on that; otherwise keep absolute paths consistent with the existing `harness-headless` entry. Do not commit machine-specific secrets. If `.mcp.json` is gitignored locally, still create/update it for the developer and document the snippet in `docs/deeptutor-console.md` (Task 5).

- [ ] **Step 4: Smoke ListTools (optional local)**

```bash
cd /Users/hz/Desktop/fe/harness-console && bun test libs/deeptutor-bridge
```

Expected: all Task 1–2 tests still PASS. MCP handshake is manual.

- [ ] **Step 5: Commit**

```bash
git add libs/deeptutor-bridge/src/mcp-server.ts libs/deeptutor-bridge/package.json
# add lockfiles / node_modules policy per repo norms — never commit node_modules
# add .mcp.json only if the repo tracks it
git commit -m "$(cat <<'EOF'
feat(deeptutor-bridge): expose status and run MCP tools

EOF
)"
```

---

### Task 4: DeepTutor Widget (iframe + open fallback)

**Files:**
- Create: `packages/widgets/deeptutor/DeepTutorPanel.tsx`
- Create: `packages/widgets/deeptutor/index.ts`
- Create: `packages/widgets/deeptutor/__tests__/register.test.ts`
- Modify: `packages/widgets/package.json` (exports)
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/__tests__/shellTabs.test.ts`

**Interfaces:**
- Consumes: `registerWidget` from `@harness/widgets`
- Produces: widget id `deeptutor`, title `DeepTutor`, order `60`

- [ ] **Step 1: Write failing register test**

`packages/widgets/deeptutor/__tests__/register.test.ts`:

```ts
import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { clearWidgetsForTests, getWidget, listWidgets } from '../../src/registry.ts'

describe('deeptutor widget registration', () => {
  beforeEach(() => clearWidgetsForTests())
  afterEach(() => clearWidgetsForTests())

  test('side-effect registers deeptutor at order 60', async () => {
    await import('../index.ts')
    expect(getWidget('deeptutor')?.title).toBe('DeepTutor')
    expect(getWidget('deeptutor')?.order).toBe(60)
    expect(listWidgets().some((w) => w.id === 'deeptutor')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
bun test packages/widgets/deeptutor/__tests__/register.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement panel + registration**

`packages/widgets/deeptutor/DeepTutorPanel.tsx`:

```tsx
import { useMemo, useState, type ReactElement } from 'react'

const STORAGE_KEY = 'harness.deeptutor.webUrl'
const DEFAULT_URL = 'http://127.0.0.1:3782'

function readStoredUrl(): string {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v && v.trim() ? v.trim() : DEFAULT_URL
  } catch {
    return DEFAULT_URL
  }
}

export function DeepTutorPanel(): ReactElement {
  const [urlInput, setUrlInput] = useState(readStoredUrl)
  const [activeUrl, setActiveUrl] = useState(readStoredUrl)
  const [iframeKey, setIframeKey] = useState(0)
  const [loadHint, setLoadHint] = useState(
    'If the frame stays blank, DeepTutor may block embedding — use Open.',
  )

  const normalized = useMemo(() => activeUrl.trim() || DEFAULT_URL, [activeUrl])

  function applyUrl(): void {
    const next = urlInput.trim() || DEFAULT_URL
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
    setActiveUrl(next)
    setIframeKey((k) => k + 1)
    setLoadHint(
      'If the frame stays blank, DeepTutor may block embedding — use Open.',
    )
  }

  function openExternal(): void {
    window.open(normalized, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="settings">
      <h2 className="settings__title">DeepTutor</h2>
      <p className="form-field__loading">{loadHint}</p>
      <section className="settings__section">
        <div className="form-field">
          <label className="form-field__label" htmlFor="deeptutor-url">
            Web URL
          </label>
          <input
            id="deeptutor-url"
            className="form-field__input"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
          />
          <button type="button" className="form-field__save-btn" onClick={applyUrl}>
            Apply
          </button>
          <button type="button" className="form-field__save-btn" onClick={() => setIframeKey((k) => k + 1)}>
            Refresh
          </button>
          <button type="button" className="form-field__save-btn" onClick={openExternal}>
            Open in new window
          </button>
        </div>
      </section>
      <section className="settings__section" style={{ minHeight: '70vh' }}>
        <iframe
          key={iframeKey}
          title="DeepTutor"
          src={normalized}
          style={{ width: '100%', height: '70vh', border: '1px solid #ccc' }}
          onLoad={() => {
            /* cannot detect X-Frame denial reliably cross-origin; keep hint visible */
          }}
        />
      </section>
    </div>
  )
}
```

`packages/widgets/deeptutor/index.ts`:

```ts
import { createElement } from 'react'
import { registerWidget } from '../src/registry.ts'
import { DeepTutorPanel } from './DeepTutorPanel.tsx'

registerWidget({
  id: 'deeptutor',
  title: 'DeepTutor',
  order: 60,
  mount: () => createElement(DeepTutorPanel),
})
```

Update `packages/widgets/package.json` exports:

```json
"exports": {
  ".": "./src/index.ts",
  "./skill-factory": "./skill-factory/index.ts",
  "./deeptutor": "./deeptutor/index.ts"
}
```

`apps/web/src/main.tsx` — add after skill-factory import:

```ts
import '@harness/widgets/deeptutor'
```

Extend `apps/web/src/__tests__/shellTabs.test.ts`:

```ts
import '@harness/widgets/deeptutor'
// existing skill-factory import stays

test('deeptutor widget is registered', () => {
  const ids = getDynamicWidgets().map((w) => w.id)
  expect(ids).toContain('deeptutor')
  expect(getWidget('deeptutor')?.title).toBe('DeepTutor')
  expect(getWidget('deeptutor')?.order).toBe(60)
})
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
bun test packages/widgets/deeptutor/__tests__/register.test.ts apps/web/src/__tests__/shellTabs.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/widgets/deeptutor packages/widgets/package.json apps/web/src/main.tsx apps/web/src/__tests__/shellTabs.test.ts
git commit -m "$(cat <<'EOF'
feat(widgets): add DeepTutor iframe panel tab

EOF
)"
```

---

### Task 5: Docs + mark spec Approved

**Files:**
- Create: `docs/deeptutor-console.md`
- Modify: `docs/superpowers/specs/2026-07-20-deeptutor-console-integration-design.md` (status line → `Approved（2026-07-20）`)

- [ ] **Step 1: Write `docs/deeptutor-console.md`**

Include:

1. Install DeepTutor (`pip install -U deeptutor`; `deeptutor init`; `deeptutor start`)
2. Default ports (`3782` frontend)
3. MCP snippet for `.mcp.json` (`deeptutor` → `bun run …/libs/deeptutor-bridge/src/mcp-server.ts`)
4. Env vars: `DEEPTUTOR_BIN`, `DEEPTUTOR_WEB_URL`, `DEEPTUTOR_HOME`, `DEEPTUTOR_MCP_TIMEOUT_MS`
5. Chat tools: `status`, `run` only
6. Widget Tab usage + iframe / open fallback
7. Link to upstream https://github.com/HKUDS/DeepTutor and https://deeptutor.info/
8. Explicit non-goals (no lifecycle management)

- [ ] **Step 2: Update spec status header to Approved**

- [ ] **Step 3: Commit**

```bash
git add docs/deeptutor-console.md docs/superpowers/specs/2026-07-20-deeptutor-console-integration-design.md
git commit -m "$(cat <<'EOF'
docs: DeepTutor console integration guide and approve spec

EOF
)"
```

---

## Plan self-review

| Spec requirement | Task |
|------------------|------|
| `status` + `run` MCP | Task 2–3 |
| CLI env / timeout / NDJSON aggregate | Task 1–2 |
| Widget iframe + localStorage + open | Task 4 |
| `.mcp.json` + docs | Task 3 + 5 |
| Tests for args / status / register | Task 1, 2, 4 |
| Out of scope items not planned | Confirmed omitted |

No TBD placeholders left after review. Types (`RunInput`, `Capability`, `CliRunner`) are consistent across tasks.

---

## Manual acceptance (after all tasks)

1. Without CLI: Chat `status` → `CLI_NOT_FOUND`  
2. With CLI: Chat `run` capability=`chat` short message → text reply  
3. Tab DeepTutor: Open works; iframe OK or blank+hint  
4. Remove `deeptutor` from `.mcp.json` → tools gone after restart  
