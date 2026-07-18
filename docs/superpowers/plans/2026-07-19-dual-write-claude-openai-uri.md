# Dual-write Claude Config + OpenAI URI Normalization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize OpenAI-compatible Base URLs (including full `…/v1/chat/completions`) and dual-write `.harness/llm.json` plus `~/.claude/settings.json` with cloud snapshot restore, so Harness and CCB hit the same URI as `qwen-chat.html`.

**Architecture:** Pure helpers in `apps/control/src/llm/` for URL normalize and Claude user-settings mutate. `PUT /api/llm` applies them after saving `llm.json`. Web Remote save uses the same normalize (shared via importing control helper is awkward across packages — duplicate thin normalize in web **or** normalize only on server; **prefer server as source of truth**, web trims only and may call a tiny shared copy under `apps/web` that mirrors tests). **Decision: implement normalize once in `apps/control`, export for tests; web `buildRemoteSavePatch` also normalizes by copying the same pure function into `apps/web/src/components/normalizeOpenAiBaseUrl.ts` kept identical (or extract to a tiny shared package — YAGNI: duplicate 30-line pure fn + same tests in control only; web calls server-normalized values on next GET). Simplest: normalize in control PUT only; update web helper to normalize too so UI shows/saves correct value before PUT.**

**Tech Stack:** Bun, Hono control routes, React web settings, JSON file IO for `~/.claude/settings.json`.

## Global Constraints

- Final request URI must equal `{OPENAI_BASE_URL}/chat/completions` matching HTML `http://HOST:PORT/v1/chat/completions`.
- Strip trailing `/chat/completions` from user input before save.
- Origin-only URLs get `/v1` appended.
- Empty API key → `ollama`.
- Remote/Local: snapshot cloud `modelType`+`env` once into `cloudEndpointSnapshot` on `~/.claude/settings.json`; clear `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `CLAUDE_CODE_USE_GEMINI`, `CLAUDE_CODE_USE_GROK` from `env` when applying OpenAI.
- Set `modelType: 'openai'`, `CLAUDE_CODE_USE_OPENAI: '1'`, `OPENAI_*` + three `OPENAI_DEFAULT_*_MODEL` = same model.
- Local↔Remote must **not** overwrite existing `cloudEndpointSnapshot`.
- Cloud restore: restore snapshot; set `endpointMode: 'cloud'`.
- Claude settings write failure: still save `llm.json`, return JSON with `warning` string; HTTP 200.
- Invalid URL: HTTP 400, no writes.
- Do not change CCB OpenAI SDK request body shape.
- Spec: `docs/superpowers/specs/2026-07-19-dual-write-claude-openai-uri-design.md`

## File Map

| File | Role |
|------|------|
| `apps/control/src/llm/normalizeOpenAiBaseUrl.ts` | Pure URL normalize |
| `apps/control/src/llm/__tests__/normalizeOpenAiBaseUrl.test.ts` | Unit tests |
| `apps/control/src/llm/claudeUserSettings.ts` | Read/write `~/.claude/settings.json` + snapshot apply/restore |
| `apps/control/src/llm/__tests__/claudeUserSettings.test.ts` | Unit tests with temp HOME |
| `apps/control/src/http/routes/llm.ts` | Hook PUT |
| `apps/control/src/http/__tests__/llm-routes.test.ts` | Extend PUT tests |
| `apps/web/src/components/normalizeOpenAiBaseUrl.ts` | Same normalize for web save UX |
| `apps/web/src/components/llmRemoteSave.ts` | Call normalize in `buildRemoteSavePatch` |
| `apps/web/src/components/__tests__/llmRemoteSave.test.ts` | Add chat/completions strip case |
| Spec+plan docs | Tracked in repo |

---

### Task 1: `normalizeOpenAiBaseUrl` (control + web mirror)

**Files:**
- Create: `apps/control/src/llm/normalizeOpenAiBaseUrl.ts`
- Create: `apps/control/src/llm/__tests__/normalizeOpenAiBaseUrl.test.ts`
- Create: `apps/web/src/components/normalizeOpenAiBaseUrl.ts` (identical logic)
- Modify: `apps/web/src/components/llmRemoteSave.ts`
- Modify: `apps/web/src/components/__tests__/llmRemoteSave.test.ts`

**Interfaces:**
```ts
export function normalizeOpenAiBaseUrl(input: string): string
```
Throws `Error` with message starting `Invalid OpenAI base URL` if unparseable.

Rules (verbatim from spec): scheme default http; trim; strip trailing slashes; strip `/chat/completions` suffix; if pathname empty or `/`, use `/v1`; if pathname does not end with `/v1`, append `/v1`.

- [ ] **Step 1: Failing tests** in control for:
  - `http://192.168.1.7:8080/v1/chat/completions` → `http://192.168.1.7:8080/v1`
  - `http://192.168.1.7:8080/v1` → unchanged
  - `http://192.168.1.7:8080` → `http://192.168.1.7:8080/v1`
  - `192.168.1.7:8080` → `http://192.168.1.7:8080/v1`

- [ ] **Step 2: Implement + pass control tests**

- [ ] **Step 3: Mirror file in web; update `buildRemoteSavePatch` to normalize baseUrl; add one web test for chat/completions strip**

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(llm): normalize OpenAI base URLs including chat/completions

EOF
)"
```

---

### Task 2: Claude user settings dual-write helpers

**Files:**
- Create: `apps/control/src/llm/claudeUserSettings.ts`
- Create: `apps/control/src/llm/__tests__/claudeUserSettings.test.ts`

**Interfaces:**
```ts
export type ClaudeEndpointApply = {
  endpointMode: 'ollama-local' | 'ollama-remote'
  baseUrl: string  // already normalized
  model: string
  apiKey: string
}

export function claudeSettingsPath(homeDir?: string): string
// default join(homeDir ?? os.homedir(), '.claude', 'settings.json')

export function applyOpenAiEndpointToClaudeSettings(
  apply: ClaudeEndpointApply,
  opts?: { homeDir?: string; readFile?: ...; writeFile?: ... }
): { ok: true } | { ok: false; warning: string }

export function restoreCloudEndpointToClaudeSettings(
  opts?: { homeDir?: string; ... }
): { ok: true } | { ok: false; warning: string }
```

Behavior:
- `apply`: load JSON (missing file → `{}`); if `cloudEndpointSnapshot` absent **or** current `endpointMode` is `cloud`/undefined, set snapshot from current `modelType`+`env`; set openai fields per Global Constraints; delete routing-steal keys from `env`; write pretty JSON.
- `restore`: if snapshot present, restore `modelType`+`env`, set `endpointMode: 'cloud'`; if no snapshot, set `endpointMode: 'cloud'` only (leave env).
- Tests use temp directory as `homeDir`.

- [ ] **Step 1: Failing tests** (snapshot once, Remote↔Local no overwrite, restore, clear ANTHROPIC_*)

- [ ] **Step 2: Implement + pass**

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(control): dual-write OpenAI endpoint into Claude user settings

EOF
)"
```

---

### Task 3: Wire `PUT /api/llm` + docs

**Files:**
- Modify: `apps/control/src/http/routes/llm.ts`
- Modify: `apps/control/src/http/__tests__/llm-routes.test.ts`
- Modify: `apps/web/src/components/LLMSettings.tsx` — placeholder example `http://192.168.1.7:8080/v1/chat/completions`
- Add: design+plan under `docs/superpowers/` if not committed

**PUT behavior:**
1. If `baseUrl` provided and provider openai / endpoint ollama-* / cloud with baseUrl: try `normalizeOpenAiBaseUrl`; on throw → 400 `{ error }`
2. `saveLLMSettings` with normalized baseUrl
3. If `endpointMode` is `ollama-local` or `ollama-remote`: `applyOpenAiEndpointToClaudeSettings(...)`
4. If `endpointMode` is `cloud`: `restoreCloudEndpointToClaudeSettings()`
5. bounce; return saved JSON; if apply/restore warning, include `warning` field

- [ ] **Step 1: Extend llm-routes tests** with mock homeDir via env `HARNESS_CLAUDE_HOME` that helpers honor (add opts already — route passes `process.env.HARNESS_CLAUDE_HOME`)

**Resolution:** `claudeUserSettings` reads `process.env.HARNESS_CLAUDE_HOME` as homeDir override when opts.homeDir omitted — for tests.

- [ ] **Step 2: Implement route + placeholder**

- [ ] **Step 3: Run** `bun test apps/control/src/llm/__tests__` and `bun test apps/control/src/http/__tests__/llm-routes.test.ts` and web llmRemoteSave tests

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(control): sync llm settings to Claude config on save

EOF
)"
```

---

## Progress Ledger

Use `.superpowers/sdd/progress-dual-write-claude-uri.md` (separate from prior ledgers).
