import { describe, expect, test } from 'bun:test'
import '@harness/widgets/skill-factory'
import { getWidget } from '@harness/widgets'
import { getDynamicWidgets, isFixedTab } from '../shellTabs'

describe('shellTabs', () => {
  test('skill-factory widget is registered', () => {
    const ids = getDynamicWidgets().map((w) => w.id)
    expect(ids).toContain('skill-factory')
    expect(getWidget('skill-factory')?.title).toBe('Skill Factory')
  })

  test('isFixedTab identifies fixed tabs only', () => {
    expect(isFixedTab('chat')).toBe(true)
    expect(isFixedTab('settings')).toBe(true)
    expect(isFixedTab('skill-factory')).toBe(false)
  })
})
