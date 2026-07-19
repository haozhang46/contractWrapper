# Skills Manage + Slash Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add unified Skills management (list / view / enable-disable for runtime + factory sources) and a Chat input `/` picker that inserts `/name` for enabled skills only.

**Architecture:** Control owns `.harness/skills-registry.json` and syncs enabled skills into `.claude/skills/<id>/` (CCB native). Web adds a fixed Skills tab and a Chat slash overlay fed by `GET /api/skills?enabled=true`. No CCB loader changes; no SKILL.md editor.

**Tech Stack:** Bun, Hono, React 19, TypeScript, `bun:test`, existing shell CSS

**Spec:** [2026-07-19-skills-manage-slash-picker-design.md](../specs/2026-07-19-skills-manage-slash-picker-design.md)

## Global Constraints

- Registry path: `<workspace>/.harness/skills-registry.json`; schema `version: 1`, `entries: SkillRegistryEntry[]`
- Runtime catalog: `.harness/skills/<id>/SKILL.md`
- Factory catalog: via existing `skillList` / `skillGet` (skill-factory tools); do not reimplement
- Install surface (CCB): `.claude/skills/<id>/` — enable copies here; disable deletes this dir only
- `GET /api/skills?enabled=true` returns only `enabled && installed`
- Enable conflict (same id, other source already enabled): HTTP **409**
- Missing skill both sources: **404**; factory submodule missing on factory ops: **503**
- Fixed shell tab id: `skills`; title: `Skills`
- Slash picker: insert `/<name>`; send path unchanged (existing chat stream)
- UI: reuse `.shell__*` / `.settings*` / `.form-field*`; no new design system
- YAGNI: no online editor, no Factory eval in Skills panel, no session preload mode
- Tests: `bun:test`; prefer pure functions for slash insert/filter

## File structure

```
apps/control/src/
  skills/
    types.ts
    registry.ts              # load/save registry
    catalog.ts               # scan runtime + factory list
    sync.ts                  # copy/remove .claude/skills/<id>
    service.ts               # list/get/enable/disable orchestration
    __tests__/service.test.ts
  http/routes/skills.ts
  http/__tests__/skills-routes.test.ts
  http/app.ts                # mount /api/skills

apps/web/src/
  components/
    SkillsPanel.tsx
    skillsApi.ts             # fetch helpers
    SlashSkillPicker.tsx     # overlay UI
    slashSkill.ts            # filter + applyInsert pure helpers
    __tests__/slashSkill.test.ts
    ChatPanel.tsx            # wire picker
  shellTabs.ts               # FixedTab += 'skills'
  App.tsx                    # Skills tab
```

---

### Task 1: Skills service (registry + catalog + sync)

**Files:**
- Create: `apps/control/src/skills/types.ts`
- Create: `apps/control/src/skills/registry.ts`
- Create: `apps/control/src/skills/catalog.ts`
- Create: `apps/control/src/skills/sync.ts`
- Create: `apps/control/src/skills/service.ts`
- Create: `apps/control/src/skills/__tests__/service.test.ts`

**Interfaces:**
- Consumes: `resolveWorkspaceRoot` patterns; optional inject of factory `skillList`/`skillGet` for tests
- Produces:
  - `SkillListItem`, `SkillDetail`, `SkillRegistry` types as in spec
  - `listSkills(workspaceRoot, opts?: { enabledOnly?: boolean; factory?: FactoryTools | null }): Promise<SkillListItem[]>`
  - `getSkill(workspaceRoot, id, factory?): Promise<SkillDetail>`
  - `enableSkill(workspaceRoot, id, opts: { source: 'runtime' | 'factory'; zone?: 'staging' | 'published' }, factory?): Promise<SkillListItem>`
  - `disableSkill(workspaceRoot, id): Promise<SkillListItem>`

- [ ] **Step 1: Write failing service tests**

Cover: empty registry + runtime file listed disabled; enable runtime copies to `.claude/skills` and sets enabled; disable removes install dir; `enabledOnly` filters; factory enable with stub tools; 409 when other source already enabled.

Use `mkdtempSync` under `os.tmpdir()` for workspace fixtures.

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd apps/control && bun test src/skills/__tests__/service.test.ts`
Expected: FAIL (module missing)

- [ ] **Step 3: Implement types, registry, catalog, sync, service**

- Parse SKILL.md description: frontmatter `description:` if present, else first non-empty markdown line truncated to 200 chars
- Factory list: if `factory` null/unavailable, skip factory entries (do not throw on list)
- Copy: recursive copy of source dir into `.claude/skills/<id>` (replace if exists)

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd apps/control && bun test src/skills/__tests__/service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/control/src/skills
git commit -m "$(cat <<'EOF'
feat(control): add skills registry, catalog, and enable sync

EOF
)"
```

---

### Task 2: HTTP `/api/skills` routes

**Files:**
- Create: `apps/control/src/http/routes/skills.ts`
- Create: `apps/control/src/http/__tests__/skills-routes.test.ts`
- Modify: `apps/control/src/http/app.ts`

**Interfaces:**
- Consumes: Task 1 service; `resolveSkillFactoryRoots` + `loadSkillFactoryTools` like skill-factory routes (best-effort; null if missing)
- Produces: Hono routes mounted at `/api/skills`

- [ ] **Step 1: Write failing route tests**

- `GET /api/skills` → 200 array
- `POST /api/skills/:id/enable` with runtime fixture → 200 enabled
- `GET /api/skills?enabled=true` after enable → includes id
- `POST disable` → installed false
- unknown id enable → 404

- [ ] **Step 2: Run — expect FAIL**

Run: `cd apps/control && bun test src/http/__tests__/skills-routes.test.ts`

- [ ] **Step 3: Implement routes + mount in `createApp`**

Map service errors to status codes per Global Constraints.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/control/src/http
git commit -m "$(cat <<'EOF'
feat(control): expose /api/skills list enable disable

EOF
)"
```

---

### Task 3: Skills management panel + shell tab

**Files:**
- Create: `apps/web/src/components/skillsApi.ts`
- Create: `apps/web/src/components/SkillsPanel.tsx`
- Modify: `apps/web/src/shellTabs.ts`
- Modify: `apps/web/src/App.tsx`
- Optional CSS: only if existing classes insufficient — prefer reuse

**Interfaces:**
- Consumes: `/api/skills`, `/api/skills/:id`, enable/disable endpoints
- Produces: `SkillsPanel` React component; fixed tab `skills`

- [ ] **Step 1: Extend `FixedTab` / `App` for Skills**

`FixedTab = 'chat' | 'settings' | 'skills'`; render `<SkillsPanel />` when active.

- [ ] **Step 2: Implement `skillsApi.ts` + `SkillsPanel`**

List with source badge; toggle enable/disable; click opens readonly detail (`skillMd` in `<pre>`). Errors via `role="alert"`.

- [ ] **Step 3: Manual smoke (or lightweight fetch mock test if easy)**

If adding a test file, keep it on `skillsApi` parse helpers only.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src
git commit -m "$(cat <<'EOF'
feat(web): add Skills management tab

EOF
)"
```

---

### Task 4: Chat `/` slash skill picker

**Files:**
- Create: `apps/web/src/components/slashSkill.ts`
- Create: `apps/web/src/components/__tests__/slashSkill.test.ts`
- Create: `apps/web/src/components/SlashSkillPicker.tsx`
- Modify: `apps/web/src/components/ChatPanel.tsx`

**Interfaces:**
- Consumes: `GET /api/skills?enabled=true`
- Produces:
  - `parseSlashQuery(input: string): { active: boolean; filter: string } | null`
  - `filterSkills(skills: { name: string; description: string }[], filter: string)`
  - `applySlashInsert(input: string, name: string): string`
  - `SlashSkillPicker` + ChatPanel wiring

- [ ] **Step 1: Write failing pure-function tests**

- `/` → active, filter `''`
- `/com` → filter `com`
- `hello` → null
- `applySlashInsert('/com', 'commit')` → `/commit`
- `applySlashInsert('/com extra', 'commit')` → `/commit extra` (replace first token only)
- filter matches name/description case-insensitive

- [ ] **Step 2: Run — expect FAIL**

Run: `cd apps/web && bun test src/components/__tests__/slashSkill.test.ts`

- [ ] **Step 3: Implement helpers + picker UI + ChatPanel**

Show overlay when `parseSlashQuery` active; ↑↓ Enter Esc; on select call `applySlashInsert` and keep focus.

Fetch enabled skills on mount / when picker opens.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "$(cat <<'EOF'
feat(web): add chat slash skill picker

EOF
)"
```

---

### Task 5: Spec self-check + docs touchpoint

**Files:**
- Modify if needed: any gap found during integration
- Optional: one-line note in `README.md` or existing harness docs — only if a natural place exists; skip if none

- [ ] **Step 1: Run focused suites**

```bash
cd apps/control && bun test src/skills src/http/__tests__/skills-routes.test.ts
cd apps/web && bun test src/components/__tests__/slashSkill.test.ts
```

- [ ] **Step 2: Fix any failures**

- [ ] **Step 3: Commit only if fixes landed**

```bash
git commit -m "$(cat <<'EOF'
test: verify skills manage and slash picker suites

EOF
)"
```

---

## Execution notes

- Work in git worktree under `.worktrees/` on branch `feat/skills-manage-slash-picker`
- Do not commit unrelated dirty files from `main` working tree
- Prefer `bun` for package scripts and tests
