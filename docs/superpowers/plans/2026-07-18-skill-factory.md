# Skill Factory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地业务无关的 Skill 自动化生产与评测闭环骨架：`skill-assets` + `skill-factory` 双仓、中控 submodule 挂载、MCP 半自动工具（含冻结路径拒绝）、pinchbench 跑批 + 0/1 Judge 最小闭环。

**Architecture:** `skill-assets` 仅约定资产（staging/published + 冻结金标/通用 Rubric）。`skill-factory` 提供离线仿真 runner、评测大脑 stub、stdio MCP Server。`harness-console` 只 submodule 引用并通过 CCB/Agent 连接该 MCP；不实现业务 Skill。消费仓上线不在范围。

**Tech Stack:** Bun、TypeScript、`@modelcontextprotocol/sdk`、`bun:test`、git submodule

**Spec:** [2026-07-18-skill-factory-design.md](../specs/2026-07-18-skill-factory-design.md)

**Repo layout (创建后):**

```text
../skill-assets/                         # 独立 Git 仓 → harness 不直接挂；由 factory 嵌套
  README.md
  package.json
  _meta/common_rubric.json
  _meta/schema/skill-manifest.schema.json
  staging/.gitkeep
  published/.gitkeep
  scripts/validate-assets.ts
  scripts/__tests__/validate-assets.test.ts

../skill-factory/                        # 独立 Git 仓 → harness submodule
  README.md
  package.json
  bun.lock
  skill-assets/                          # nested submodule → skill-assets
  offline/
    pinchbench-eval/src/runBatch.ts
    pinchbench-eval/src/simRunner.ts
    auto-evaluation/src/judge.ts
    auto-evaluation/src/cluster.ts
    auto-evaluation/src/suggest.ts
  mcp/src/server.ts
  mcp/src/tools.ts
  mcp/src/paths.ts
  mcp/src/audit.ts
  mcp/src/__tests__/*.test.ts
  offline/**/__tests__/*.test.ts
  reports/                               # eval 报告落盘（gitignore 大文件可选）

harness-console/
  skill-factory/                         # submodule
  .gitmodules                            # + skill-factory
  docs/skill-factory-submodule.md        # clone / MCP 接入说明
```

**分段提示：** Tasks 1–5 = 可交付「挂载 + 只读/写 staging MCP」；Tasks 6–8 = 评测最小闭环。可在 Task 5 后停一次做集成验收。

---

### Task 1: 创建 `skill-assets` 仓与目录骨架

**Files:**
- Create (new repo root `../skill-assets/` relative to harness-console): all paths below

- [ ] **Step 1: 初始化仓并建目录**

```bash
cd /Users/hz/Desktop/fe
mkdir skill-assets && cd skill-assets
git init
mkdir -p _meta/schema staging published
touch staging/.gitkeep published/.gitkeep
```

- [ ] **Step 2: 写入冻结通用 Rubric 占位与 manifest schema**

Create `_meta/common_rubric.json`:

```json
{
  "version": "1",
  "frozen": true,
  "dimensions": [
    { "id": "follows_steps", "description": "Follows predefined workflow steps", "score": "binary" },
    { "id": "schema_valid", "description": "Input/output matches schema", "score": "binary" },
    { "id": "no_unauthorized_tools", "description": "No unauthorized tool calls", "score": "binary" },
    { "id": "no_severe_violation", "description": "No severe_violation markers", "score": "binary" }
  ]
}
```

Create `_meta/schema/skill-manifest.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["id", "triggers", "steps"],
  "properties": {
    "id": { "type": "string", "pattern": "^[a-z0-9][a-z0-9_-]*$" },
    "triggers": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
    "steps": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["id", "description"],
        "properties": {
          "id": { "type": "string" },
          "description": { "type": "string" },
          "allowedTools": { "type": "array", "items": { "type": "string" } }
        }
      }
    }
  }
}
```

Create `package.json`:

```json
{
  "name": "skill-assets",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "bun test",
    "validate": "bun run scripts/validate-assets.ts"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

Create `README.md` explaining staging vs published and frozen paths.

- [ ] **Step 3: 写失败测试 — 校验器要求 published skill 含 SKILL.md**

Create `scripts/__tests__/validate-assets.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { validateAssetsRoot } from '../validate-assets.ts'

describe('validateAssetsRoot', () => {
  test('fails when published skill lacks SKILL.md', () => {
    const root = mkdtempSync(join(tmpdir(), 'assets-'))
    mkdirSync(join(root, 'published', 'demo'), { recursive: true })
    mkdirSync(join(root, '_meta'), { recursive: true })
    writeFileSync(
      join(root, '_meta', 'common_rubric.json'),
      JSON.stringify({ version: '1', frozen: true, dimensions: [] }),
    )
    const result = validateAssetsRoot(root)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('SKILL.md'))).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })

  test('passes empty published with meta present', () => {
    const root = mkdtempSync(join(tmpdir(), 'assets-'))
    mkdirSync(join(root, 'published'), { recursive: true })
    mkdirSync(join(root, 'staging'), { recursive: true })
    mkdirSync(join(root, '_meta'), { recursive: true })
    writeFileSync(
      join(root, '_meta', 'common_rubric.json'),
      JSON.stringify({ version: '1', frozen: true, dimensions: [] }),
    )
    const result = validateAssetsRoot(root)
    expect(result.ok).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })
})
```

- [ ] **Step 4: Run test — expect FAIL (module missing)**

```bash
cd /Users/hz/Desktop/fe/skill-assets && bun test scripts/__tests__/validate-assets.test.ts
```

Expected: fail resolving `../validate-assets.ts`

- [ ] **Step 5: 实现最小校验器**

Create `scripts/validate-assets.ts`:

```ts
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export type ValidateResult = { ok: boolean; errors: string[] }

export function validateAssetsRoot(root: string): ValidateResult {
  const errors: string[] = []
  const meta = join(root, '_meta', 'common_rubric.json')
  if (!existsSync(meta)) errors.push('missing _meta/common_rubric.json')
  for (const zone of ['staging', 'published'] as const) {
    const dir = join(root, zone)
    if (!existsSync(dir)) {
      errors.push(`missing ${zone}/`)
      continue
    }
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.')) continue
      const skillDir = join(dir, name)
      if (!statSync(skillDir).isDirectory()) continue
      if (!existsSync(join(skillDir, 'SKILL.md'))) {
        errors.push(`${zone}/${name}: missing SKILL.md`)
      }
    }
  }
  return { ok: errors.length === 0, errors }
}

if (import.meta.main) {
  const root = process.argv[2] ?? process.cwd()
  const result = validateAssetsRoot(root)
  if (!result.ok) {
    console.error(result.errors.join('\n'))
    process.exit(1)
  }
  console.log('ok')
}
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
cd /Users/hz/Desktop/fe/skill-assets && bun test
```

Expected: PASS

- [ ] **Step 7: Commit and create remote**

```bash
cd /Users/hz/Desktop/fe/skill-assets
git add -A
git commit -m "chore: scaffold skill-assets convention tree"
# 若有 gh：创建远程并 push（URL 写入后续 submodule）
gh repo create skill-assets --private --source=. --remote=origin --push
```

若暂无远程：记下本地路径，Task 3 用本地 URL `../skill-assets` 作 submodule（仅本机开发）。

---

### Task 2: 创建 `skill-factory` 仓 + nested `skill-assets` + 路径守卫

**Files:**
- Create: `../skill-factory/package.json`
- Create: `../skill-factory/mcp/src/paths.ts`
- Create: `../skill-factory/mcp/src/__tests__/paths.test.ts`
- Create: `../skill-factory/README.md`

- [ ] **Step 1: 初始化 factory 并挂 nested submodule**

```bash
cd /Users/hz/Desktop/fe
mkdir skill-factory && cd skill-factory
git init
# 远程已存在时：
git submodule add <SKILL_ASSETS_GIT_URL> skill-assets
# 仅本地时：
# git submodule add ../skill-assets skill-assets
mkdir -p mcp/src offline/pinchbench-eval/src offline/auto-evaluation/src reports
```

Create `package.json`:

```json
{
  "name": "skill-factory",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "bun test",
    "mcp": "bun run mcp/src/server.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.1"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

- [ ] **Step 2: 写失败测试 — 冻结路径检测**

Create `mcp/src/__tests__/paths.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { assertWritablePath, FrozenPathError } from '../paths.ts'

describe('assertWritablePath', () => {
  const assetsRoot = '/tmp/fake-assets'

  test('allows staging skill files', () => {
    expect(() =>
      assertWritablePath(assetsRoot, 'staging/demo/SKILL.md'),
    ).not.toThrow()
  })

  test('rejects common_rubric.json', () => {
    expect(() =>
      assertWritablePath(assetsRoot, '_meta/common_rubric.json'),
    ).toThrow(FrozenPathError)
  })

  test('rejects published reference gold', () => {
    expect(() =>
      assertWritablePath(
        assetsRoot,
        'published/demo/cases/reference/case-1.json',
      ),
    ).toThrow(FrozenPathError)
  })

  test('rejects path escape', () => {
    expect(() =>
      assertWritablePath(assetsRoot, '../outside.txt'),
    ).toThrow()
  })
})
```

- [ ] **Step 3: Run — expect FAIL**

```bash
cd /Users/hz/Desktop/fe/skill-factory && bun test mcp/src/__tests__/paths.test.ts
```

Expected: cannot find `../paths.ts`

- [ ] **Step 4: 实现 `paths.ts`**

Create `mcp/src/paths.ts`:

```ts
import { isAbsolute, join, normalize, relative, resolve } from 'node:path'

export class FrozenPathError extends Error {
  readonly code = 'FROZEN_PATH' as const
  constructor(path: string) {
    super(`FROZEN_PATH: ${path}`)
    this.name = 'FrozenPathError'
  }
}

export function resolveAssetsPath(assetsRoot: string, rel: string): string {
  const abs = resolve(assetsRoot, rel)
  const relToRoot = relative(resolve(assetsRoot), abs)
  if (relToRoot.startsWith('..') || isAbsolute(relToRoot)) {
    throw new Error(`path escapes assets root: ${rel}`)
  }
  return abs
}

/** AI/MCP 可写：仅 staging/** ；其余写操作拒绝 */
export function assertWritablePath(assetsRoot: string, rel: string): string {
  const norm = normalize(rel).replace(/^\.\/+/, '')
  resolveAssetsPath(assetsRoot, norm)

  if (norm === '_meta/common_rubric.json' || norm.startsWith('_meta/')) {
    throw new FrozenPathError(norm)
  }
  if (norm.includes('/cases/reference/') || norm.startsWith('cases/reference/')) {
    throw new FrozenPathError(norm)
  }
  if (norm.startsWith('published/')) {
    throw new FrozenPathError(norm)
  }
  if (!norm.startsWith('staging/')) {
    throw new FrozenPathError(norm)
  }
  return join(assetsRoot, norm)
}

export function getAssetsRoot(factoryRoot: string): string {
  return join(factoryRoot, 'skill-assets')
}
```

- [ ] **Step 5: Run tests — PASS**

```bash
cd /Users/hz/Desktop/fe/skill-factory && bun install && bun test mcp/src/__tests__/paths.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/hz/Desktop/fe/skill-factory
git add -A
git commit -m "feat: scaffold factory with nested assets and frozen path guard"
gh repo create skill-factory --private --source=. --remote=origin --push
```

---

### Task 3: MCP 只读工具 `skill.list` / `skill.get`

**Files:**
- Create: `mcp/src/tools.ts`
- Create: `mcp/src/audit.ts`
- Create: `mcp/src/server.ts`
- Create: `mcp/src/__tests__/tools-read.test.ts`

- [ ] **Step 1: 写失败测试 — list/get**

Create `mcp/src/__tests__/tools-read.test.ts`:

```ts
import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { skillList, skillGet } from '../tools.ts'

describe('skill read tools', () => {
  let assetsRoot: string

  beforeEach(() => {
    assetsRoot = mkdtempSync(join(tmpdir(), 'sf-assets-'))
    mkdirSync(join(assetsRoot, 'published', 'alpha'), { recursive: true })
    writeFileSync(
      join(assetsRoot, 'published', 'alpha', 'SKILL.md'),
      '---\nname: alpha\n---\n# Alpha\n',
    )
    mkdirSync(join(assetsRoot, 'staging', 'beta'), { recursive: true })
    writeFileSync(
      join(assetsRoot, 'staging', 'beta', 'SKILL.md'),
      '---\nname: beta\n---\n# Beta draft\n',
    )
  })

  afterEach(() => rmSync(assetsRoot, { recursive: true, force: true }))

  test('skillList returns staging and published', () => {
    const rows = skillList(assetsRoot)
    expect(rows).toEqual(
      expect.arrayContaining([
        { id: 'alpha', zone: 'published' },
        { id: 'beta', zone: 'staging' },
      ]),
    )
  })

  test('skillGet returns content for published', () => {
    const got = skillGet(assetsRoot, 'alpha', 'published')
    expect(got.id).toBe('alpha')
    expect(got.skillMd).toContain('# Alpha')
  })
})
```

- [ ] **Step 2: Run — FAIL**

```bash
cd /Users/hz/Desktop/fe/skill-factory && bun test mcp/src/__tests__/tools-read.test.ts
```

- [ ] **Step 3: 实现 tools + audit + server**

Create `mcp/src/audit.ts`:

```ts
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export function auditLog(
  factoryRoot: string,
  entry: Record<string, unknown>,
): void {
  const dir = join(factoryRoot, 'reports', 'audit')
  mkdirSync(dir, { recursive: true })
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n'
  appendFileSync(join(dir, 'mcp.jsonl'), line)
}
```

Create `mcp/src/tools.ts`:

```ts
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export type SkillZone = 'staging' | 'published'

export function skillList(
  assetsRoot: string,
): Array<{ id: string; zone: SkillZone }> {
  const out: Array<{ id: string; zone: SkillZone }> = []
  for (const zone of ['published', 'staging'] as const) {
    const dir = join(assetsRoot, zone)
    if (!existsSync(dir)) continue
    for (const id of readdirSync(dir)) {
      if (id.startsWith('.')) continue
      if (!statSync(join(dir, id)).isDirectory()) continue
      out.push({ id, zone })
    }
  }
  return out
}

export function skillGet(
  assetsRoot: string,
  id: string,
  zone: SkillZone = 'published',
): { id: string; zone: SkillZone; skillMd: string } {
  const skillMdPath = join(assetsRoot, zone, id, 'SKILL.md')
  if (!existsSync(skillMdPath)) {
    throw new Error(`skill not found: ${zone}/${id}`)
  }
  return { id, zone, skillMd: readFileSync(skillMdPath, 'utf8') }
}
```

Create `mcp/src/server.ts`（stdio MCP，注册 list/get；写类工具在后续 Task 注册）：

```ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js'
import { resolve } from 'node:path'
import { auditLog } from './audit.ts'
import { getAssetsRoot } from './paths.ts'
import { skillGet, skillList, type SkillZone } from './tools.ts'

const factoryRoot = resolve(process.env.SKILL_FACTORY_ROOT ?? process.cwd())
const assetsRoot = getAssetsRoot(factoryRoot)

const server = new Server(
  { name: 'skill-factory', version: '0.0.1' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'skill.list',
      description: 'List skills in staging and published',
      inputSchema: { type: 'object' as const, properties: {} },
    },
    {
      name: 'skill.get',
      description: 'Get SKILL.md for a skill id',
      inputSchema: {
        type: 'object' as const,
        properties: {
          id: { type: 'string' },
          zone: { type: 'string', enum: ['staging', 'published'] },
        },
        required: ['id'],
      },
    },
  ],
}))

server.setRequestHandler(
  CallToolRequestSchema,
  async (request): Promise<CallToolResult> => {
    const { name, arguments: args } = request.params
    const a = (args ?? {}) as Record<string, unknown>
    try {
      if (name === 'skill.list') {
        const rows = skillList(assetsRoot)
        auditLog(factoryRoot, { tool: name, ok: true })
        return {
          content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }],
        }
      }
      if (name === 'skill.get') {
        const got = skillGet(
          assetsRoot,
          String(a.id),
          (a.zone as SkillZone) ?? 'published',
        )
        auditLog(factoryRoot, { tool: name, id: a.id, ok: true })
        return {
          content: [{ type: 'text', text: JSON.stringify(got, null, 2) }],
        }
      }
      return {
        content: [{ type: 'text', text: `unknown tool: ${name}` }],
        isError: true,
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      auditLog(factoryRoot, { tool: name, ok: false, error: msg })
      return { content: [{ type: 'text', text: msg }], isError: true }
    }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
```

- [ ] **Step 4: Run unit tests — PASS**

```bash
cd /Users/hz/Desktop/fe/skill-factory && bun test mcp/src/__tests__/tools-read.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add mcp && git commit -m "feat: MCP skill.list and skill.get"
```

---

### Task 4: 中控挂载 submodule + 接入文档

**Files:**
- Modify: `harness-console/.gitmodules`
- Create: `harness-console/skill-factory/` (via submodule add)
- Create: `harness-console/docs/skill-factory-submodule.md`
- Modify: `harness-console/README.md`（加一节链接）
- Modify: `docs/superpowers/specs/2026-07-18-skill-factory-design.md`（状态 → Approved）

- [ ] **Step 1: submodule add**

```bash
cd /Users/hz/Desktop/fe/harness-console
git submodule add <SKILL_FACTORY_GIT_URL> skill-factory
git submodule update --init --recursive
```

- [ ] **Step 2: 写接入文档**

Create `docs/skill-factory-submodule.md`:

```markdown
# Skill Factory 挂载

## Clone

git clone --recurse-submodules <harness-console-url>
# 或
git submodule update --init --recursive

## 启动 MCP（供 CCB / Agent 连接）

cd skill-factory && bun install && bun run mcp

## CCB MCP 配置示例（stdio）

在 CCB mcp 设置中增加：

{
  "skill-factory": {
    "command": "bun",
    "args": ["run", "mcp/src/server.ts"],
    "cwd": "<absolute-path-to>/harness-console/skill-factory"
  }
}

控制面：Chat 经 Agent 调 skill-factory tools。看板 iframe 可选，后续再加。
```

- [ ] **Step 3: README 增加链接到上述文档；spec 状态改为 Approved**

- [ ] **Step 4: Commit（仅 harness）**

```bash
cd /Users/hz/Desktop/fe/harness-console
git add .gitmodules skill-factory docs/skill-factory-submodule.md README.md docs/superpowers/specs/2026-07-18-skill-factory-design.md
git commit -m "chore: add skill-factory submodule and mount docs"
```

---

### Task 5: staging 生成工具 + `FROZEN_PATH` 契约测试

**Files:**
- Modify: `skill-factory/mcp/src/tools.ts`
- Modify: `skill-factory/mcp/src/server.ts`
- Create: `skill-factory/mcp/src/__tests__/tools-write.test.ts`

- [ ] **Step 1: 写失败测试**

Create `mcp/src/__tests__/tools-write.test.ts`:

```ts
import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { FrozenPathError } from '../paths.ts'
import { skillGenerate, tryWriteAssetsFile } from '../tools.ts'

describe('skill write tools', () => {
  let assetsRoot: string

  beforeEach(() => {
    assetsRoot = mkdtempSync(join(tmpdir(), 'sf-w-'))
    mkdirSync(join(assetsRoot, 'staging'), { recursive: true })
    mkdirSync(join(assetsRoot, 'published'), { recursive: true })
    mkdirSync(join(assetsRoot, '_meta'), { recursive: true })
    writeFileSync(
      join(assetsRoot, '_meta', 'common_rubric.json'),
      JSON.stringify({ version: '1', frozen: true, dimensions: [] }),
    )
  })

  afterEach(() => rmSync(assetsRoot, { recursive: true, force: true }))

  test('skillGenerate writes staging tree', () => {
    const r = skillGenerate(assetsRoot, {
      id: 'demo',
      description: 'A demo fixed workflow',
    })
    expect(r.zone).toBe('staging')
    expect(
      readFileSync(join(assetsRoot, 'staging', 'demo', 'SKILL.md'), 'utf8'),
    ).toContain('demo')
  })

  test('tryWriteAssetsFile rejects frozen common rubric', () => {
    expect(() =>
      tryWriteAssetsFile(assetsRoot, '_meta/common_rubric.json', '{}'),
    ).toThrow(FrozenPathError)
  })
})
```

- [ ] **Step 2: Run — FAIL（函数不存在）**

- [ ] **Step 3: 实现 `skillGenerate` / `tryWriteAssetsFile` 并注册 MCP**

Append to `mcp/src/tools.ts`:

```ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { assertWritablePath } from './paths.ts'

export function tryWriteAssetsFile(
  assetsRoot: string,
  rel: string,
  content: string,
): string {
  const abs = assertWritablePath(assetsRoot, rel)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, content)
  return abs
}

export function skillGenerate(
  assetsRoot: string,
  input: { id: string; description: string },
): { id: string; zone: 'staging'; paths: string[] } {
  const id = input.id
  const base = `staging/${id}`
  const skillMd = `---\nname: ${id}\n---\n# ${id}\n\n${input.description}\n\n## Steps\n1. Parse input per schema\n2. Run scripts\n3. Emit structured output\n`
  const paths = [
    tryWriteAssetsFile(assetsRoot, `${base}/SKILL.md`, skillMd),
    tryWriteAssetsFile(
      assetsRoot,
      `${base}/constraint.md`,
      '# Constraints\n\n- No step skipping\n- No unauthorized tools\n',
    ),
    tryWriteAssetsFile(
      assetsRoot,
      `${base}/rubric_config.json`,
      JSON.stringify({ skillId: id, dimensions: [] }, null, 2) + '\n',
    ),
  ]
  mkdirSync(join(assetsRoot, 'staging', id, 'scripts'), { recursive: true })
  mkdirSync(join(assetsRoot, 'staging', id, 'cases', 'generated'), {
    recursive: true,
  })
  return { id, zone: 'staging', paths }
}
```

在 `server.ts` 的 tools 列表与 switch 中增加：

- `skill.generate` → `skillGenerate`（args: `id`, `description`）
- 暂不实现完整 LLM 生成；模板草稿即可（YAGNI）。`eval.cases.generate` / `rubric.generate` 同理用占位写入 `staging/.../cases/generated` 与专项 rubric，**禁止**写 `_meta/common_rubric.json`。

最小占位也可一并加：

```ts
export function casesGenerate(
  assetsRoot: string,
  input: { skillId: string; note: string },
): { path: string } {
  const rel = `staging/${input.skillId}/cases/generated/case-${Date.now()}.json`
  tryWriteAssetsFile(
    assetsRoot,
    rel,
    JSON.stringify({ note: input.note, input: {}, expect: {} }, null, 2),
  )
  return { path: rel }
}

export function rubricGenerate(
  assetsRoot: string,
  input: { skillId: string },
): { path: string } {
  const rel = `staging/${input.skillId}/rubric_config.json`
  tryWriteAssetsFile(
    assetsRoot,
    rel,
    JSON.stringify(
      {
        skillId: input.skillId,
        dimensions: [{ id: 'special_ok', score: 'binary' }],
      },
      null,
      2,
    ),
  )
  return { path: rel }
}
```

- [ ] **Step 4: Run tests — PASS；手动确认写 published 抛 `FROZEN_PATH`**

- [ ] **Step 5: Commit in skill-factory；harness 更新 submodule 指针**

```bash
cd /Users/hz/Desktop/fe/skill-factory
git add -A && git commit -m "feat: staging generate tools with FROZEN_PATH"
git push
cd /Users/hz/Desktop/fe/harness-console
git add skill-factory && git commit -m "chore: bump skill-factory for staging MCP tools"
```

---

### Task 6: pinchbench 最小跑批

**Files:**
- Create: `offline/pinchbench-eval/src/simRunner.ts`
- Create: `offline/pinchbench-eval/src/runBatch.ts`
- Create: `offline/pinchbench-eval/src/__tests__/runBatch.test.ts`
- Modify: `mcp/src/tools.ts` + `server.ts`（`eval.run`）

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runBatch } from '../runBatch.ts'

describe('runBatch', () => {
  test('runs fixture case and returns exec result', () => {
    const root = mkdtempSync(join(tmpdir(), 'pb-'))
    const skill = join(root, 'published', 'demo')
    mkdirSync(join(skill, 'cases', 'reference'), { recursive: true })
    writeFileSync(join(skill, 'SKILL.md'), '# demo\n')
    writeFileSync(
      join(skill, 'cases', 'reference', 'c1.json'),
      JSON.stringify({
        id: 'c1',
        input: { q: 'hi' },
        expect: { ok: true },
      }),
    )
    const report = runBatch({
      assetsRoot: root,
      skillId: 'demo',
      zone: 'published',
    })
    expect(report.results).toHaveLength(1)
    expect(report.results[0]?.status).toBe('ok')
    rmSync(root, { recursive: true, force: true })
  })
})
```

- [ ] **Step 2: 实现仿真 runner（无 Claude）**

`simRunner.ts`：读 case → 返回 `{ status: 'ok' | 'exec_error', output, severe_violation?: boolean }`。  
最小行为：若 `expect.ok === true` 则 `ok`，否则可模拟失败；脚本抛错 → `exec_error`。

`runBatch.ts`：扫描 `cases/reference` + 可选 `generated`，逐条 `simRunner`，返回：

```ts
export type CaseResult = {
  caseId: string
  status: 'ok' | 'exec_error'
  output: unknown
  severe_violation?: boolean
}

export type BatchReport = {
  skillId: string
  zone: string
  results: CaseResult[]
}
```

- [ ] **Step 3: MCP `eval.run`** 调用 `runBatch`，把 JSON 报告写入 `reports/eval/<skillId>-<ts>.json`

- [ ] **Step 4: Tests PASS + commit**

```bash
git commit -m "feat: pinchbench sim runner and eval.run"
```

---

### Task 7: Judge 0/1 + severe 兜底

**Files:**
- Create: `offline/auto-evaluation/src/judge.ts`
- Create: `offline/auto-evaluation/src/__tests__/judge.test.ts`
- Modify: MCP / `eval.run` 流水线：跑批后调用 judge

- [ ] **Step 1: 测试二元分与 severe**

```ts
import { describe, expect, test } from 'bun:test'
import { judgeBatch } from '../judge.ts'

describe('judgeBatch', () => {
  test('binary scores and severe locks total low', () => {
    const scored = judgeBatch({
      commonDimensions: ['follows_steps', 'schema_valid', 'no_severe_violation'],
      specialDimensions: ['special_ok'],
      caseResults: [
        {
          caseId: 'c1',
          status: 'ok',
          output: {},
          severe_violation: true,
          dimHints: {
            follows_steps: 0,
            schema_valid: 1,
            no_severe_violation: 0,
            special_ok: 1,
          },
        },
      ],
    })
    expect(scored.cases[0]?.dimensions.schema_valid).toBe(1)
    expect(scored.cases[0]?.dimensions.follows_steps).toBe(0)
    expect(scored.totalPass).toBe(false)
    expect(scored.severeLocked).toBe(true)
  })

  test('exec_error does not get high pass', () => {
    const scored = judgeBatch({
      commonDimensions: ['follows_steps'],
      specialDimensions: [],
      caseResults: [
        {
          caseId: 'c2',
          status: 'exec_error',
          output: null,
          dimHints: { follows_steps: 1 },
        },
      ],
    })
    expect(scored.cases[0]?.dimensions.follows_steps).toBe(0)
    expect(scored.totalPass).toBe(false)
  })
})
```

- [ ] **Step 2: 实现 `judge.ts`（第一期无真 Claude 调用）**

规则引擎 Judge（可复跑）：使用 `dimHints` 或从结果推导；所有维仅 `0 | 1`；`severe_violation` 或 `exec_error` → `severeLocked` / 强制相关维 0 且 `totalPass=false`。  
预留 `judgePromptVersion: 'rule-v1'` 字段写入报告，便于日后换 LLM Judge 而不改报告 schema。

- [ ] **Step 3: 接入 `eval.run` 产出带 scores 的报告**

- [ ] **Step 4: PASS + commit**

```bash
git commit -m "feat: binary judge with severe lock"
```

---

### Task 8: report get/diff/cluster/suggest

**Files:**
- Create: `offline/auto-evaluation/src/cluster.ts`
- Create: `offline/auto-evaluation/src/suggest.ts`
- Create: `offline/auto-evaluation/src/reports.ts`
- Create: matching `__tests__`
- Modify: `mcp/src/server.ts` 注册  
  `eval.report.get` / `eval.diff` / `eval.low_score.cluster` / `skill.optimize.suggest`

- [ ] **Step 1: 测试 report 读写与 diff**

`reports.ts`：`saveReport` / `loadReport` / `diffReports(a,b)`（按 caseId+dimension 对比 0/1）。

- [ ] **Step 2: cluster** — 按失败维聚合 caseId 列表

- [ ] **Step 3: suggest** — 纯规则草稿：对低分维输出  
  `{ attribution: 'skill'|'scripts'|'rubric'|'cases', message: string }`  
  **不写**资产文件（只返回文本）

- [ ] **Step 4: MCP 注册四工具；审计日志**

- [ ] **Step 5: 端到端手测**

```bash
cd skill-factory
bun run mcp   # 另开终端用任意 MCP client 调 skill.generate → eval.run → eval.report.get
```

- [ ] **Step 6: Commit + bump harness submodule**

```bash
git commit -m "feat: eval report diff cluster and optimize suggest"
```

**明确不做（本 plan 结束仍不做）：** iframe 看板、真 Claude 生成正文、`cases.ingest`、自动 merge 入库、消费仓上线。

---

## Spec coverage self-check

| Spec 项 | Task |
|---------|------|
| skill-assets 目录约定 / 冻结 meta | 1 |
| skill-factory + nested submodule | 2 |
| 冻结路径 FROZEN_PATH | 2, 5 |
| MCP 只读 list/get | 3 |
| 中控 submodule 挂载 + 文档 | 4 |
| staging generate / cases / rubric 草稿 | 5 |
| pinchbench 跑批 | 6 |
| 0/1 Judge + severe + exec_error | 7 |
| report/diff/cluster/suggest + 审计 | 3,5,8 |
| 上线 / 微前端 / 业务 Skill 内容 | 非目标，无 task |
| 真 Claude 离线生成 | 延后；Task 5/7 先模板/规则，接口预留 |

## Type / name consistency

- Zones: `'staging' | 'published'`
- Error: `FrozenPathError.code === 'FROZEN_PATH'`
- Tools: `skill.list`, `skill.get`, `skill.generate`, `eval.cases.generate`, `rubric.generate`, `eval.run`, `eval.report.get`, `eval.diff`, `eval.low_score.cluster`, `skill.optimize.suggest`
- Judge report: `dimensions: Record<string, 0 | 1>`, `severeLocked: boolean`, `judgePromptVersion: string`
