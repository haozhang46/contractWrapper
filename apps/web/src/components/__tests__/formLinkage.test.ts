import { describe, expect, test } from 'bun:test'
import type { FormField } from '../DynamicForm'
import {
  applyEffects,
  buildYupSchema,
  isFieldVisible,
  matchCondition,
  resolveOptions,
} from '../formLinkage'

const base = (partial: Partial<FormField> & Pick<FormField, 'name' | 'label' | 'type'>): FormField => ({
  ...partial,
})

describe('matchCondition', () => {
  test('matches strict equality', () => {
    expect(matchCondition({ field: 'mode', equals: 'advanced' }, { mode: 'advanced' })).toBe(true)
    expect(matchCondition({ field: 'mode', equals: 'advanced' }, { mode: 'basic' })).toBe(false)
  })

  test('matches boolean false', () => {
    expect(matchCondition({ field: 'on', equals: false }, { on: false })).toBe(true)
  })
})

describe('isFieldVisible', () => {
  test('visible when no visibleWhen', () => {
    expect(isFieldVisible(base({ name: 'a', label: 'A', type: 'text' }), {})).toBe(true)
  })

  test('respects visibleWhen', () => {
    const f = base({
      name: 'detail',
      label: 'Detail',
      type: 'text',
      visibleWhen: { field: 'mode', equals: 'advanced' },
    })
    expect(isFieldVisible(f, { mode: 'advanced' })).toBe(true)
    expect(isFieldVisible(f, { mode: 'basic' })).toBe(false)
  })
})

describe('resolveOptions', () => {
  test('uses static options when no optionsFrom', () => {
    const f = base({
      name: 'city',
      label: 'City',
      type: 'select',
      options: [{ label: 'A', value: 'a' }],
    })
    expect(resolveOptions(f, {})).toEqual([{ label: 'A', value: 'a' }])
  })

  test('resolves optionsFrom map; missing key yields []', () => {
    const f = base({
      name: 'district',
      label: 'District',
      type: 'select',
      optionsFrom: {
        field: 'city',
        map: {
          sh: [{ label: 'Pudong', value: 'pd' }],
        },
      },
    })
    expect(resolveOptions(f, { city: 'sh' })).toEqual([{ label: 'Pudong', value: 'pd' }])
    expect(resolveOptions(f, { city: 'bj' })).toEqual([])
  })
})

describe('applyEffects', () => {
  const fields: FormField[] = [
    base({ name: 'mode', label: 'Mode', type: 'select' }),
    base({ name: 'detail', label: 'Detail', type: 'text', defaultValue: 'x' }),
    base({ name: 'flag', label: 'Flag', type: 'boolean' }),
  ]

  test('clears then sets when when matches or when omitted', () => {
    const mode = base({
      name: 'mode',
      label: 'Mode',
      type: 'select',
      effects: [
        {
          when: { field: 'mode', equals: 'basic' },
          clear: ['detail', 'flag'],
          set: { detail: 'reset' },
        },
      ],
    })
    const next = applyEffects(mode, { mode: 'basic', detail: 'old', flag: true }, fields)
    expect(next.detail).toBe('reset')
    expect(next.flag).toBe(false)
  })

  test('skips effect when when does not match', () => {
    const mode = base({
      name: 'mode',
      label: 'Mode',
      type: 'select',
      effects: [
        {
          when: { field: 'mode', equals: 'basic' },
          clear: ['detail'],
        },
      ],
    })
    const next = applyEffects(mode, { mode: 'advanced', detail: 'keep' }, fields)
    expect(next.detail).toBe('keep')
  })
})

describe('buildYupSchema', () => {
  test('required only for visible fields; hidden still present in values', async () => {
    const fields: FormField[] = [
      base({ name: 'mode', label: 'Mode', type: 'select', required: true }),
      base({
        name: 'detail',
        label: 'Detail',
        type: 'text',
        required: true,
        visibleWhen: { field: 'mode', equals: 'advanced' },
      }),
    ]

    const hiddenSchema = buildYupSchema(fields, { mode: 'basic', detail: '' })
    await expect(hiddenSchema.validate({ mode: 'basic', detail: '' })).resolves.toBeTruthy()

    const visibleSchema = buildYupSchema(fields, { mode: 'advanced', detail: '' })
    await expect(visibleSchema.validate({ mode: 'advanced', detail: '' })).rejects.toThrow(/Detail/)
  })
})
