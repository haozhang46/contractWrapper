# Web Remote OpenAI-Compatible Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change Web LLM Settings Remote mode to hand-filled Base URL + Model + optional API Key (default `ollama`), removing Host normalization and List models.

**Architecture:** Keep `endpointMode: 'ollama-remote'` and existing `PUT /api/llm` → `llm.json` → bounce slot. Only rewrite the Remote branch of `LLMSettings.tsx` so `baseUrl`/`model`/`apiKey` are saved verbatim. Extract a tiny pure helper for the Remote save payload so it can be unit-tested without mounting React.

**Tech Stack:** React (`apps/web`), existing `/api/llm`, Bun/vitest or whatever `apps/web` already uses for tests.

## Global Constraints

- Do **not** change Local Ollama (`/api/tags`, Start Ollama) or Cloud forms beyond shared layout if unavoidable.
- Do **not** change `applyLlmEnv` / OpenAI SDK path composition (`{baseUrl}/chat/completions`).
- Remote `baseUrl` must be saved **exactly** as the user typed (trimmed only); never force `/v1` or strip to origin.
- Empty Remote API Key saves as literal `ollama`.
- Keep `endpointMode` value `ollama-remote` (label may say `Remote`).
- YAGNI: no Models URL field, no `/v1/models` listing, no backend type picker.
- Spec: `docs/superpowers/specs/2026-07-19-web-remote-openai-compat-design.md`

## File Map

| File | Responsibility |
|------|----------------|
| `apps/web/src/components/llmRemoteSave.ts` (new) | Pure `buildRemoteSavePatch(input) → partial LLM settings` |
| `apps/web/src/components/__tests__/llmRemoteSave.test.ts` (new) | Unit tests for Remote save rules |
| `apps/web/src/components/LLMSettings.tsx` | Remote UI: Base URL / Model / API Key; wire helper on Save |
| `docs/superpowers/specs/2026-07-18-web-llm-endpoint-design.md` | Note Remote behavior superseded by 2026-07-19 spec |

---

### Task 1: Remote save helper + unit tests

**Files:**
- Create: `apps/web/src/components/llmRemoteSave.ts`
- Create: `apps/web/src/components/__tests__/llmRemoteSave.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type RemoteSaveInput = {
    baseUrl: string
    model: string
    apiKey: string
  }
  export type RemoteSavePatch = {
    endpointMode: 'ollama-remote'
    provider: 'openai'
    baseUrl: string
    model: string
    apiKey: string
  }
  export function buildRemoteSavePatch(input: RemoteSaveInput): RemoteSavePatch
  export function canSaveRemote(input: RemoteSaveInput): boolean
  ```
- `buildRemoteSavePatch`: trim `baseUrl` and `model`; if `apiKey.trim()` empty → `apiKey: 'ollama'`; else trim key.
- `canSaveRemote`: true iff trimmed baseUrl and model are non-empty.

- [ ] **Step 1: Write failing tests** covering:
  - preserves custom path: `http://192.168.1.7:8080/v1` unchanged (not stripped to origin)
  - empty key → `ollama`
  - whitespace-only key → `ollama`
  - `canSaveRemote` false when baseUrl or model blank

- [ ] **Step 2: Run tests — expect FAIL**

  Run from repo root (adjust if package scripts differ):
  `cd apps/web && bun test src/components/__tests__/llmRemoteSave.test.ts`
  (If web has no bun test, use the package’s existing test runner from `apps/web/package.json`.)

- [ ] **Step 3: Implement `llmRemoteSave.ts` minimally**

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/llmRemoteSave.ts apps/web/src/components/__tests__/llmRemoteSave.test.ts
git commit -m "$(cat <<'EOF'
feat(web): add remote LLM save helper for verbatim baseUrl

EOF
)"
```

---

### Task 2: Rewrite Remote UI in LLMSettings

**Files:**
- Modify: `apps/web/src/components/LLMSettings.tsx`
- Test: reuse Task 1 unit tests; manual smoke checklist in commit body optional

**Interfaces:**
- Consumes: `buildRemoteSavePatch`, `canSaveRemote` from `./llmRemoteSave`
- On Remote: bind inputs to `settings.baseUrl`, `settings.model`, `settings.apiKey` (no `remoteOrigin`).
- Remove Remote-only: `remoteOrigin` state, List models button, `loadModels` calls from Remote path.
- Endpoint `<option value="ollama-remote">` label text: `Remote`.
- Model field for Remote: always text input (not select-from-tags). Local may keep tags select.
- Save button: for `ollama-remote`, disabled when `!canSaveRemote(...)` or `saving`; on click merge `buildRemoteSavePatch` into settings before PUT (or build body from patch + endpointMode already set).
- Load effect: if `ollama-remote`, do not parse origin; leave `baseUrl` as stored.

- [ ] **Step 1: Update `LLMSettings.tsx` as specified**

- [ ] **Step 2: Re-run Task 1 tests + any existing web/control llm tests that still apply**

  `cd apps/web && bun test src/components/__tests__/llmRemoteSave.test.ts`
  Also run: `cd apps/control && bun test src/http/__tests__/llm-routes.test.ts` (must still pass; do not change control unless broken by accident).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/LLMSettings.tsx
git commit -m "$(cat <<'EOF'
feat(web): remote LLM settings use hand-filled baseUrl and model

EOF
)"
```

---

### Task 3: Point old web LLM spec at the new Remote behavior

**Files:**
- Modify: `docs/superpowers/specs/2026-07-18-web-llm-endpoint-design.md` (Remote bullet only)
- Ensure: `docs/superpowers/specs/2026-07-19-web-remote-openai-compat-design.md` is tracked

- [ ] **Step 1: In the 2026-07-18 web LLM spec, replace the Remote bullet** that says origin + tags with a short note: Remote is hand-filled Base URL / Model / API Key; see `2026-07-19-web-remote-openai-compat-design.md`.

- [ ] **Step 2: Commit both docs**

```bash
git add docs/superpowers/specs/2026-07-18-web-llm-endpoint-design.md docs/superpowers/specs/2026-07-19-web-remote-openai-compat-design.md
git commit -m "$(cat <<'EOF'
docs: supersede web Remote Ollama UI with hand-filled OpenAI compat

EOF
)"
```

---

## Progress Ledger

SDD controller: use `.superpowers/sdd/progress-web-remote-openai-compat.md` (do not reuse the CCB ollama-endpoint ledger).
