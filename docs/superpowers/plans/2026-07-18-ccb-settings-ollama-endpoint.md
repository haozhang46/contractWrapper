# CCB Settings Ollama Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/config` Endpoint setting that switches Cloud / Local Ollama / Remote Ollama, auto-lists models via `/api/tags`, and applies OpenAI-compatible env for the current session.

**Architecture:** Pure helpers for URL normalize, tags fetch, and endpoint apply/snapshot live under `src/utils/ollama/`. Settings schema gains `endpointMode`, `cloudEndpointSnapshot`, `ollamaRemoteBaseUrl`. Config panel opens an `EndpointPicker` submenu (same pattern as Model) that drives those helpers and mirrors `/login` OpenAI save (write settings + patch `process.env` + `clearOpenAIClientCache()`).

**Tech Stack:** Bun, TypeScript, React/Ink, `bun:test`, existing `updateSettingsForSource`, Zod settings schema

**Spec:** [2026-07-18-ccb-settings-ollama-endpoint-design.md](../specs/2026-07-18-ccb-settings-ollama-endpoint-design.md)

## Global Constraints

- Host: **`ccb` submodule** — all code commits happen in the `ccb` git repo (not harness-console root), unless the task explicitly updates the parent submodule pin
- Spec scope only: Settings Endpoint three-way switch; **no** skill factory / widget panel; **no** new `modelType: 'ollama'`; **do not** redesign `/login`
- `EndpointMode`: `'cloud' | 'ollama-local' | 'ollama-remote'`
- Local OpenAI URL: `http://127.0.0.1:11434/v1`; Local API key: `ollama`
- Tags API: `GET {origin}/api/tags` (not `/v1/api/tags`)
- Missing URL scheme: auto-prepend `http://`
- On Ollama apply: set `modelType: 'openai'`, `OPENAI_MODEL` and all three `OPENAI_DEFAULT_{HAIKU,SONNET,OPUS}_MODEL` to the **same** selected model name
- Snapshot: save `cloudEndpointSnapshot` only when leaving cloud/unset into ollama; Local↔Remote must **not** overwrite snapshot
- After successful apply: update `process.env` for changed keys and call `clearOpenAIClientCache()`
- YAGNI: no vLLM-specific UI; no harness-console Web Settings
- Tests: `bun:test` inside `ccb/`; mock `fetch` for tags; do not require a live Ollama for unit tests

## File structure

```
ccb/src/utils/ollama/
  url.ts                 # normalize + OpenAI /v1 URL helpers
  tags.ts                # fetchOllamaModelNames
  endpointSwitch.ts      # snapshot + build settings patch + applyEnv
  __tests__/
    url.test.ts
    tags.test.ts
    endpointSwitch.test.ts

ccb/src/utils/settings/types.ts   # schema fields

ccb/src/components/Settings/
  EndpointPicker.tsx              # Ink submenu flow
  Config.tsx                      # Endpoint managedEnum + submenu

ccb/src/services/api/openai/client.ts  # reuse clearOpenAIClientCache (no change expected)
```

---

### Task 1: Ollama URL helpers + tags client

**Files:**
- Create: `ccb/src/utils/ollama/url.ts`
- Create: `ccb/src/utils/ollama/tags.ts`
- Create: `ccb/src/utils/ollama/__tests__/url.test.ts`
- Create: `ccb/src/utils/ollama/__tests__/tags.test.ts`

**Interfaces:**
- Consumes: global `fetch`
- Produces:
  - `LOCAL_OLLAMA_ORIGIN = 'http://127.0.0.1:11434'`
  - `normalizeOllamaOrigin(input: string): string` — trim; if no `://` prepend `http://`; parse URL; return `origin` (no path); throw on invalid
  - `toOpenAiCompatibleBaseUrl(originOrUrl: string): string` — ensure ends with `/v1` (strip trailing slash first; if already ends with `/v1` keep once)
  - `tagsUrlFromOrigin(origin: string): string` — `${origin}/api/tags`
  - `fetchOllamaModelNames(origin: string, init?: { fetch?: typeof fetch; apiKey?: string }): Promise<string[]>` — GET tags; parse `{ models: { name: string }[] }`; return names; throw Error with message on non-OK / network / empty invalid JSON

- [ ] **Step 1: Write failing URL tests**

```ts
// ccb/src/utils/ollama/__tests__/url.test.ts
import { describe, expect, test } from 'bun:test'
import {
  LOCAL_OLLAMA_ORIGIN,
  normalizeOllamaOrigin,
  toOpenAiCompatibleBaseUrl,
  tagsUrlFromOrigin,
} from '../url.ts'

describe('normalizeOllamaOrigin', () => {
  test('prepends http:// when scheme missing', () => {
    expect(normalizeOllamaOrigin('192.168.1.10:11434')).toBe(
      'http://192.168.1.10:11434',
    )
  })
  test('returns origin only', () => {
    expect(normalizeOllamaOrigin('http://host:11434/v1')).toBe(
      'http://host:11434',
    )
  })
})

describe('toOpenAiCompatibleBaseUrl', () => {
  test('appends /v1', () => {
    expect(toOpenAiCompatibleBaseUrl(LOCAL_OLLAMA_ORIGIN)).toBe(
      'http://127.0.0.1:11434/v1',
    )
  })
  test('does not double /v1', () => {
    expect(toOpenAiCompatibleBaseUrl('http://127.0.0.1:11434/v1')).toBe(
      'http://127.0.0.1:11434/v1',
    )
  })
})

describe('tagsUrlFromOrigin', () => {
  test('uses /api/tags on origin', () => {
    expect(tagsUrlFromOrigin(LOCAL_OLLAMA_ORIGIN)).toBe(
      'http://127.0.0.1:11434/api/tags',
    )
  })
})
```

- [ ] **Step 2: Run URL tests — expect FAIL**

Run: `cd ccb && bun test src/utils/ollama/__tests__/url.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `url.ts`**

```ts
// ccb/src/utils/ollama/url.ts
export const LOCAL_OLLAMA_ORIGIN = 'http://127.0.0.1:11434'

export function normalizeOllamaOrigin(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('Ollama URL is required')
  const withScheme = trimmed.includes('://') ? trimmed : `http://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new Error(`Invalid Ollama URL: ${input}`)
  }
  return url.origin
}

export function toOpenAiCompatibleBaseUrl(originOrUrl: string): string {
  const origin = normalizeOllamaOrigin(originOrUrl)
  return `${origin}/v1`
}

export function tagsUrlFromOrigin(origin: string): string {
  return `${normalizeOllamaOrigin(origin)}/api/tags`
}
```

- [ ] **Step 4: Run URL tests — expect PASS**

Run: `cd ccb && bun test src/utils/ollama/__tests__/url.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing tags tests**

```ts
// ccb/src/utils/ollama/__tests__/tags.test.ts
import { describe, expect, test } from 'bun:test'
import { fetchOllamaModelNames } from '../tags.ts'

describe('fetchOllamaModelNames', () => {
  test('parses model names from tags response', async () => {
    const names = await fetchOllamaModelNames('http://127.0.0.1:11434', {
      fetch: (async () =>
        new Response(
          JSON.stringify({
            models: [{ name: 'qwen2.5:7b' }, { name: 'llama3:8b' }],
          }),
          { status: 200 },
        )) as typeof fetch,
    })
    expect(names).toEqual(['qwen2.5:7b', 'llama3:8b'])
  })

  test('throws on non-OK', async () => {
    await expect(
      fetchOllamaModelNames('http://127.0.0.1:11434', {
        fetch: (async () => new Response('nope', { status: 500 })) as typeof fetch,
      }),
    ).rejects.toThrow(/500|Ollama|tags/i)
  })
})
```

- [ ] **Step 6: Run tags tests — expect FAIL**

Run: `cd ccb && bun test src/utils/ollama/__tests__/tags.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 7: Implement `tags.ts`**

```ts
// ccb/src/utils/ollama/tags.ts
import { tagsUrlFromOrigin } from './url.ts'

type TagsResponse = { models?: Array<{ name?: string }> }

export async function fetchOllamaModelNames(
  origin: string,
  init?: { fetch?: typeof fetch; apiKey?: string },
): Promise<string[]> {
  const fetchFn = init?.fetch ?? globalThis.fetch
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (init?.apiKey) headers.Authorization = `Bearer ${init.apiKey}`
  let res: Response
  try {
    res = await fetchFn(tagsUrlFromOrigin(origin), { headers })
  } catch (e) {
    throw new Error(
      `Cannot reach Ollama at ${origin}. Is it running? (${e instanceof Error ? e.message : String(e)})`,
    )
  }
  if (!res.ok) {
    throw new Error(`Ollama tags request failed (${res.status})`)
  }
  const data = (await res.json()) as TagsResponse
  const names = (data.models ?? [])
    .map(m => m.name)
    .filter((n): n is string => typeof n === 'string' && n.length > 0)
  return names
}
```

- [ ] **Step 8: Run tags tests — expect PASS**

Run: `cd ccb && bun test src/utils/ollama/__tests__/tags.test.ts`
Expected: PASS

- [ ] **Step 9: Commit in ccb**

```bash
cd ccb
git add src/utils/ollama/url.ts src/utils/ollama/tags.ts src/utils/ollama/__tests__/url.test.ts src/utils/ollama/__tests__/tags.test.ts
git commit -m "$(cat <<'EOF'
feat: add Ollama URL helpers and tags client

Support Settings Endpoint local/remote model listing.
EOF
)"
```

---

### Task 2: Settings schema + endpoint switch apply logic

**Files:**
- Modify: `ccb/src/utils/settings/types.ts` (add fields next to `modelType`)
- Create: `ccb/src/utils/ollama/endpointSwitch.ts`
- Create: `ccb/src/utils/ollama/__tests__/endpointSwitch.test.ts`

**Interfaces:**
- Consumes: `EndpointMode` values from spec; URL helpers from Task 1
- Produces:
  - `type EndpointMode = 'cloud' | 'ollama-local' | 'ollama-remote'`
  - `type CloudEndpointSnapshot = { modelType?: 'anthropic' | 'openai' | 'gemini' | 'grok'; env?: Record<string, string> }`
  - `shouldSaveCloudSnapshot(currentMode: EndpointMode | undefined): boolean` — true when `currentMode` is `undefined` or `'cloud'`
  - `buildOllamaSettingsPatch(args: { mode: 'ollama-local' | 'ollama-remote'; modelName: string; remoteOrigin?: string; apiKey?: string; previous: { endpointMode?: EndpointMode; modelType?: string; env?: Record<string, string>; cloudEndpointSnapshot?: CloudEndpointSnapshot } }): Record<string, unknown>` — returns patch for `updateSettingsForSource` including snapshot when needed
  - `buildCloudRestorePatch(snapshot: CloudEndpointSnapshot | undefined): { ok: true; patch: Record<string, unknown> } | { ok: false; reason: 'no_snapshot' }`
  - `applyOpenAiEnvToProcess(env: Record<string, string | undefined>): void` — set or delete `process.env` keys
  - Zod: `endpointMode`, `cloudEndpointSnapshot`, `ollamaRemoteBaseUrl` on settings schema

- [ ] **Step 1: Write failing endpointSwitch tests**

```ts
// ccb/src/utils/ollama/__tests__/endpointSwitch.test.ts
import { describe, expect, test } from 'bun:test'
import {
  shouldSaveCloudSnapshot,
  buildOllamaSettingsPatch,
  buildCloudRestorePatch,
} from '../endpointSwitch.ts'

describe('shouldSaveCloudSnapshot', () => {
  test('true for cloud and unset', () => {
    expect(shouldSaveCloudSnapshot(undefined)).toBe(true)
    expect(shouldSaveCloudSnapshot('cloud')).toBe(true)
  })
  test('false for ollama modes', () => {
    expect(shouldSaveCloudSnapshot('ollama-local')).toBe(false)
    expect(shouldSaveCloudSnapshot('ollama-remote')).toBe(false)
  })
})

describe('buildOllamaSettingsPatch', () => {
  test('local writes localhost openai env and saves snapshot from cloud', () => {
    const patch = buildOllamaSettingsPatch({
      mode: 'ollama-local',
      modelName: 'qwen2.5:7b',
      previous: {
        endpointMode: 'cloud',
        modelType: 'anthropic',
        env: { ANTHROPIC_API_KEY: 'x' },
      },
    })
    expect(patch.endpointMode).toBe('ollama-local')
    expect(patch.modelType).toBe('openai')
    expect(patch.env).toMatchObject({
      OPENAI_BASE_URL: 'http://127.0.0.1:11434/v1',
      OPENAI_API_KEY: 'ollama',
      OPENAI_MODEL: 'qwen2.5:7b',
      OPENAI_DEFAULT_HAIKU_MODEL: 'qwen2.5:7b',
      OPENAI_DEFAULT_SONNET_MODEL: 'qwen2.5:7b',
      OPENAI_DEFAULT_OPUS_MODEL: 'qwen2.5:7b',
    })
    expect(patch.cloudEndpointSnapshot).toEqual({
      modelType: 'anthropic',
      env: { ANTHROPIC_API_KEY: 'x' },
    })
  })

  test('remote does not overwrite existing cloud snapshot when switching from local', () => {
    const existing = { modelType: 'anthropic' as const, env: { FOO: '1' } }
    const patch = buildOllamaSettingsPatch({
      mode: 'ollama-remote',
      modelName: 'llama3:8b',
      remoteOrigin: '192.168.1.10:11434',
      apiKey: 'secret',
      previous: {
        endpointMode: 'ollama-local',
        modelType: 'openai',
        env: { OPENAI_BASE_URL: 'http://127.0.0.1:11434/v1' },
        cloudEndpointSnapshot: existing,
      },
    })
    expect(patch.cloudEndpointSnapshot).toEqual(existing)
    expect(patch.ollamaRemoteBaseUrl).toBe('http://192.168.1.10:11434')
    expect((patch.env as Record<string, string>).OPENAI_BASE_URL).toBe(
      'http://192.168.1.10:11434/v1',
    )
    expect((patch.env as Record<string, string>).OPENAI_API_KEY).toBe('secret')
  })
})

describe('buildCloudRestorePatch', () => {
  test('restores snapshot', () => {
    const result = buildCloudRestorePatch({
      modelType: 'anthropic',
      env: { ANTHROPIC_API_KEY: 'x' },
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.patch.endpointMode).toBe('cloud')
      expect(result.patch.modelType).toBe('anthropic')
      expect(result.patch.env).toEqual({ ANTHROPIC_API_KEY: 'x' })
    }
  })
  test('fails without snapshot', () => {
    expect(buildCloudRestorePatch(undefined).ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd ccb && bun test src/utils/ollama/__tests__/endpointSwitch.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `endpointSwitch.ts` + schema fields**

Add to Zod settings in `types.ts` after `modelType`:

```ts
endpointMode: z
  .enum(['cloud', 'ollama-local', 'ollama-remote'])
  .optional()
  .describe('Settings Endpoint mode: cloud provider vs local/remote Ollama'),
cloudEndpointSnapshot: z
  .object({
    modelType: z.enum(['anthropic', 'openai', 'gemini', 'grok']).optional(),
    env: z.record(z.string(), z.string()).optional(),
  })
  .optional()
  .describe('Cloud provider snapshot saved before switching to Ollama'),
ollamaRemoteBaseUrl: z
  .string()
  .optional()
  .describe('Last remote Ollama origin (no /v1 required) for Settings form'),
```

Implement `endpointSwitch.ts` to satisfy the tests exactly (use Task 1 URL helpers for remote origin / `/v1`).

`applyOpenAiEnvToProcess`:

```ts
export function applyOpenAiEnvToProcess(
  env: Record<string, string | undefined>,
): void {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}
```

For cloud restore: when applying snapshot `env`, also clear OpenAI keys that are in current process but not in snapshot — at minimum delete `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_DEFAULT_HAIKU_MODEL`, `OPENAI_DEFAULT_SONNET_MODEL`, `OPENAI_DEFAULT_OPUS_MODEL` then apply snapshot env. Export helper `openaiEnvKeysToClear(): string[]` listing those keys if useful for UI.

- [ ] **Step 4: Run endpointSwitch tests — expect PASS**

Run: `cd ccb && bun test src/utils/ollama/__tests__/endpointSwitch.test.ts`
Expected: PASS

- [ ] **Step 5: Commit in ccb**

```bash
cd ccb
git add src/utils/ollama/endpointSwitch.ts src/utils/ollama/__tests__/endpointSwitch.test.ts src/utils/settings/types.ts
git commit -m "$(cat <<'EOF'
feat: add endpointMode settings schema and switch helpers

Persist Cloud/Local/Remote Ollama mode with cloud snapshot restore.
EOF
)"
```

---

### Task 3: EndpointPicker UI + Config wiring

**Files:**
- Create: `ccb/src/components/Settings/EndpointPicker.tsx`
- Modify: `ccb/src/components/Settings/Config.tsx`
- Create: `ccb/src/components/Settings/__tests__/endpointPickerLogic.test.ts` (optional thin re-export tests if any pure display helpers; otherwise cover via existing utils — prefer testing that Config setting id exists via a small extract if needed)

**Interfaces:**
- Consumes: Task 1–2 helpers; `updateSettingsForSource`; `clearOpenAIClientCache`; `getSettingsForSource('userSettings')` / `getInitialSettings`
- Produces: Ink `EndpointPicker` props:
  - `onDone: (message: string) => void`
  - `onCancel: () => void`
  - Flow states: `choose` → (`remote_form` if remote) → `loading_models` → `pick_model` → apply → `onDone`
  - Display labels: `Cloud`, `Local Ollama`, `Remote Ollama`

**Config wiring (follow Model submenu pattern):**
- Extend `showSubmenu` union with `'Endpoint'`
- Add setting near `model`:

```ts
{
  id: 'endpoint',
  label: 'Endpoint',
  value: endpointDisplayValue(settingsData?.endpointMode),
  type: 'managedEnum' as const,
  onChange: () => {}, // submenu handles apply
}
```

- `endpointDisplayValue(mode)`: `Cloud` / `Local Ollama` / `Remote Ollama` / `Cloud` when unset
- Enter on Endpoint opens submenu like Model (`setShowSubmenu('Endpoint'); setTabsHidden(true)`)
- Render `<EndpointPicker … />` branch alongside Model

**EndpointPicker behavior:**
1. Select Cloud → `buildCloudRestorePatch`; if `!ok`, call `onDone` with message to use `/login` first (do not write); if ok, `updateSettingsForSource`, apply env (clear openai keys then snapshot env), `clearOpenAIClientCache()`, `onDone('Switched to Cloud')`
2. Select Local → `fetchOllamaModelNames(LOCAL_OLLAMA_ORIGIN)`; on error show message and stay; on empty list show pull hint; on pick → `buildOllamaSettingsPatch` + write + `applyOpenAiEnvToProcess` for openai keys in patch.env + clear cache + `onDone`
3. Select Remote → prompt Base URL (TextInput) then optional API Key (empty → `ollama`) → normalize origin → fetch tags → pick model → same apply with `ollama-remote`

Keep UI minimal Ink: `Select` for mode/model; simple text fields for remote URL/key consistent with other Settings dialogs.

- [ ] **Step 1: Implement `EndpointPicker.tsx`** per above (TDD soft for UI — still run utils suite after)

- [ ] **Step 2: Wire `Config.tsx`**

- [ ] **Step 3: Run all ollama unit tests**

Run: `cd ccb && bun test src/utils/ollama/`
Expected: PASS

- [ ] **Step 4: Typecheck touched area**

Run: `cd ccb && bun run typecheck` (or project’s equivalent if `precheck` is too heavy — prefer `bunx tsc --noEmit` only if typecheck script fails for unrelated reasons; fix any errors introduced by this task)

- [ ] **Step 5: Commit in ccb**

```bash
cd ccb
git add src/components/Settings/EndpointPicker.tsx src/components/Settings/Config.tsx
git commit -m "$(cat <<'EOF'
feat: add Settings Endpoint picker for Cloud and Ollama

Enable /config fast-switch between cloud and local/remote Ollama.
EOF
)"
```

---

### Task 4: Parent pin + smoke checklist (docs only in harness if needed)

**Files:**
- Modify: harness-console gitlink `ccb` (submodule SHA) after ccb commits land — only if working from a harness worktree that tracks the pin
- Optional: short note in `ccb/DEV-LOG.md` under OpenAI/Ollama section pointing to `/config` Endpoint

- [ ] **Step 1: Verify manual smoke checklist (document in commit message body if no DEV-LOG change)**

1. `/config` shows Endpoint  
2. Local with Ollama up + `qwen2.5:7b` selectable  
3. Remote form rejects bad host with error  
4. Cloud restores prior snapshot after Local  

- [ ] **Step 2: Update submodule pin in harness-console if this branch tracks it**

```bash
# from harness-console worktree
git add ccb
git commit -m "chore: bump ccb submodule for Settings Ollama Endpoint"
```

If work is only inside `ccb` clone without parent pin update, skip and note in report.

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Settings `/config` Endpoint three-way | Task 3 |
| Auto list via `/api/tags` | Task 1 + 3 |
| Local URL + key defaults | Task 2 |
| Remote URL + optional key | Task 2 + 3 |
| Cloud snapshot restore | Task 2 + 3 |
| Same model → OPENAI_MODEL + three defaults | Task 2 |
| clearOpenAIClientCache + session env | Task 3 |
| No skill factory / no modelType ollama | Global Constraints |
| URL missing scheme → http:// | Task 1 |
| Empty list / errors | Task 1 throw + Task 3 UI |

No TBD placeholders remaining.
