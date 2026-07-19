# DynamicForm Field Linkage Design

**Date:** 2026-07-20  
**Status:** Approved for implementation (user chose approach A + Formik/Yup + execute)

## Goal

Extend headless `DynamicForm` with declarative field linkage: show/hide, static option cascading, and clear/set value effects. Migrate form state/validation from hand-rolled `useState` to Formik + Yup.

## Decisions

| Topic | Choice |
|-------|--------|
| Scope | A+B+C: `visibleWhen`, static `optionsFrom`, `effects` (clear and/or set) |
| Cascade options | Schema-local static map only (no remote fetch) |
| Hidden fields | Skip Yup required validation; **keep values in Formik and include on submit** |
| Form stack | Formik + Yup |
| Conditions | `equals` only (strict equality) for v1 |
| Store | No external datastore |

## Schema

Extend `FormField` (keep all existing fields; additive only):

```ts
type FieldCondition = { field: string; equals: unknown }

type FormOption = { label: string; value: string }

interface FormField {
  name: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'number' | 'boolean'
  required?: boolean
  options?: FormOption[]
  placeholder?: string
  defaultValue?: string | number | boolean
  visibleWhen?: FieldCondition
  optionsFrom?: {
    field: string
    map: Record<string, FormOption[]>
  }
  effects?: Array<{
    when?: FieldCondition  // omitted => fire on any change of this field
    clear?: string[]
    set?: Record<string, unknown>
  }>
}
```

### Semantics

1. **visibleWhen** — If present and condition fails, field is not rendered. Hidden fields are omitted from Yup `required` checks. Their Formik values are unchanged and still submitted.
2. **optionsFrom** — When present, ignore static `options`. Resolve `map[String(values[field])]` (missing key → `[]`). If current select value is not in resolved options, leave value as-is until user changes it or an effect clears it.
3. **effects** — Evaluated when the field that owns `effects` changes. For each effect: if `when` is omitted or matches, apply `clear` then `set` via Formik `setFieldValue` / batch update. Clear uses type-aware empty (`false` for boolean, `''` otherwise, or field `defaultValue` if defined).
4. **equals** — `Object.is`-style / strict `===` against current values.

## Architecture

```
PageSchema.form[]
       │
       ▼
┌──────────────────┐
│ formLinkage.ts   │  pure helpers (unit-tested)
│ - matchCondition │
│ - isVisible      │
│ - resolveOptions │
│ - applyEffects   │
│ - buildYupSchema │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ DynamicForm.tsx  │  Formik + Yup; render by visibility/options
└──────────────────┘
```

Types live in:

- `apps/web/src/components/DynamicForm.tsx` (re-export or co-locate for UI)
- `libs/harness-headless-connect/src/types.ts` (authoritative for page definitions)

Keep both in sync.

## Formik / Yup flow

- `initialValues` from schema defaults (same rules as today).
- `validationSchema` rebuilt from current values so hidden fields are not required (`yup.object` shape where invisible fields are `yup.mixed().optional()` or omitted required).
- On field change: update value → run owning field's `effects` → Formik re-render → recompute visible options.
- `onSubmit`: pass full Formik `values` (including hidden keys) to existing `onSubmit` prop. `HeadlessPagesPanel` unchanged.

## Out of scope (v1)

- Remote option loading
- `and` / `or` / `in` / `notEquals` conditions
- Cross-page / global form store
- Migrating headless-mcp JSON Schema variant (separate type system)

## Testing

- Pure unit tests for linkage helpers (bun:test, matching existing `apps/web` style).
- No React Testing Library required for v1.
- Cover: visibility, options map miss, clear+set order, hidden required skipped, hidden values still in submit payload (helper-level assertion on schema builder / submit filter if any — submit filter is identity for hidden).

## Success criteria

1. Existing schemas without new keys behave identically.
2. A field with `visibleWhen` hides/shows correctly; required only when visible.
3. `optionsFrom` swaps select options from static map.
4. `effects` can clear and/or set sibling fields.
5. Submit includes hidden field values.
