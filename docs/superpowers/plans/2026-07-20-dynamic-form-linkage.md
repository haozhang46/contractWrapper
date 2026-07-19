# DynamicForm Field Linkage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add declarative field linkage (visibleWhen / optionsFrom / effects) to DynamicForm and migrate it to Formik + Yup.

**Architecture:** Pure helpers in `formLinkage.ts` own condition matching, visibility, option resolution, effects, and Yup schema building. `DynamicForm.tsx` becomes a Formik shell. Types stay in sync with `harness-headless-connect`.

**Tech Stack:** React 19, Formik, Yup, bun:test

## Global Constraints

- Additive schema only — existing pages must keep working
- Hidden fields: no required validation; values still submitted
- Cascade options: static map only
- Conditions: `equals` / strict equality only
- No commits unless user asks

---

## File map

| File | Role |
|------|------|
| `apps/web/src/components/formLinkage.ts` | Pure linkage + Yup builders |
| `apps/web/src/components/__tests__/formLinkage.test.ts` | Unit tests |
| `apps/web/src/components/DynamicForm.tsx` | Formik UI + extended types |
| `apps/web/package.json` | Add `formik`, `yup` |
| `libs/harness-headless-connect/src/types.ts` | Mirror FormField extensions |

---

### Task 1: Dependencies + types + linkage helpers (TDD)

**Files:**
- Create: `apps/web/src/components/formLinkage.ts`
- Create: `apps/web/src/components/__tests__/formLinkage.test.ts`
- Modify: `apps/web/package.json`
- Modify: `libs/harness-headless-connect/src/types.ts`
- Modify: `apps/web/src/components/DynamicForm.tsx` (types only first if needed)

- [ ] **Step 1:** Add `formik` and `yup` to `@harness/web` via bun
- [ ] **Step 2:** Write failing tests for `matchCondition`, `isFieldVisible`, `resolveOptions`, `applyEffects`, `buildYupSchema` (hidden required skipped)
- [ ] **Step 3:** Run `bun test apps/web/src/components/__tests__/formLinkage.test.ts` — expect FAIL
- [ ] **Step 4:** Implement `formLinkage.ts` until green
- [ ] **Step 5:** Extend `FormField` in connect types + DynamicForm exports to match spec

### Task 2: Rewrite DynamicForm with Formik

**Files:**
- Modify: `apps/web/src/components/DynamicForm.tsx`

- [ ] **Step 1:** Replace useState form with `<Formik>` + `validationSchema` from `buildYupSchema(schema.form, values)`
- [ ] **Step 2:** Render only visible fields; resolve select options via `resolveOptions`
- [ ] **Step 3:** On change, apply `effects` from the changed field
- [ ] **Step 4:** `onSubmit` passes full values (including hidden)
- [ ] **Step 5:** Run web typecheck / related tests

### Task 3: Smoke sanity

- [ ] **Step 1:** `bun test apps/web/src/components/__tests__/formLinkage.test.ts`
- [ ] **Step 2:** `bun run --filter @harness/web typecheck`

---

## Done when

- All linkage unit tests pass
- DynamicForm uses Formik/Yup
- Types synced
- No behavior break for schemas without linkage keys
