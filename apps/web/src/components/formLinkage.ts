import * as Yup from 'yup'
import type { FormField, FieldCondition, FormOption } from './DynamicForm'

export function matchCondition(
  condition: FieldCondition,
  values: Record<string, unknown>,
): boolean {
  return values[condition.field] === condition.equals
}

export function isFieldVisible(
  field: FormField,
  values: Record<string, unknown>,
): boolean {
  if (!field.visibleWhen) return true
  return matchCondition(field.visibleWhen, values)
}

export function resolveOptions(
  field: FormField,
  values: Record<string, unknown>,
): FormOption[] {
  if (field.optionsFrom) {
    const key = String(values[field.optionsFrom.field] ?? '')
    return field.optionsFrom.map[key] ?? []
  }
  return field.options ?? []
}

function emptyValue(field: FormField | undefined): unknown {
  if (!field) return ''
  if (field.defaultValue !== undefined) return field.defaultValue
  if (field.type === 'boolean') return false
  return ''
}

/**
 * Apply effects owned by `changedField` against `values` (which should
 * already include the new value for that field). clear runs before set.
 */
export function applyEffects(
  changedField: FormField,
  values: Record<string, unknown>,
  allFields: FormField[],
): Record<string, unknown> {
  const effects = changedField.effects
  if (!effects?.length) return values

  let next = { ...values }
  const byName = new Map(allFields.map(f => [f.name, f]))

  for (const effect of effects) {
    if (effect.when && !matchCondition(effect.when, next)) continue
    for (const name of effect.clear ?? []) {
      next[name] = emptyValue(byName.get(name))
    }
    if (effect.set) {
      next = { ...next, ...effect.set }
    }
  }
  return next
}

function baseYupForField(field: FormField): Yup.AnySchema {
  switch (field.type) {
    case 'number':
      return Yup.number().transform((v, orig) => (orig === '' || orig === undefined ? undefined : v))
    case 'boolean':
      return Yup.boolean()
    default:
      return Yup.string()
  }
}

/** Build Yup schema; required applies only to currently visible fields. */
export function buildYupSchema(
  fields: FormField[],
  values: Record<string, unknown>,
): Yup.ObjectSchema<Record<string, unknown>> {
  const shape: Record<string, Yup.AnySchema> = {}
  for (const field of fields) {
    let schema = baseYupForField(field)
    const visible = isFieldVisible(field, values)
    if (field.required && visible) {
      schema = schema.required(`${field.label} is required`)
    } else {
      schema = schema.optional().nullable()
    }
    shape[field.name] = schema
  }
  return Yup.object().shape(shape) as Yup.ObjectSchema<Record<string, unknown>>
}

export function buildInitialValues(fields: FormField[]): Record<string, unknown> {
  const initial: Record<string, unknown> = {}
  for (const f of fields) {
    if (f.defaultValue !== undefined) initial[f.name] = f.defaultValue
    else if (f.type === 'boolean') initial[f.name] = false
    else initial[f.name] = ''
  }
  return initial
}
