import { describe, expect, test } from 'bun:test'
import '@harness/widgets/skill-factory'
import '@harness/widgets/deeptutor'
import { getWidget } from '@harness/widgets'
import { getDynamicWidgets, isFixedTab } from '../shellTabs'

describe('shellTabs', () => {
  test('skill-factory widget is registered', () => {
    const ids = getDynamicWidgets().map((w) => w.id)
    expect(ids).toContain('skill-factory')
    expect(getWidget('skill-factory')?.title).toBe('Skill Factory')
  })

  test('deeptutor widget is registered', () => {
    const ids = getDynamicWidgets().map((w) => w.id)
    expect(ids).toContain('deeptutor')
    expect(getWidget('deeptutor')?.title).toBe('DeepTutor')
    expect(getWidget('deeptutor')?.order).toBe(60)
  })

  test('isFixedTab identifies fixed tabs only', () => {
    expect(isFixedTab('chat')).toBe(true)
    expect(isFixedTab('settings')).toBe(true)
    expect(isFixedTab('skills')).toBe(true)
    expect(isFixedTab('skill-factory')).toBe(false)
  })
})
