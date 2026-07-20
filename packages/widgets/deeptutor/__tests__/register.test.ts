import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { clearWidgetsForTests, getWidget, listWidgets } from '../../src/registry.ts'

describe('deeptutor widget registration', () => {
  beforeEach(() => clearWidgetsForTests())
  afterEach(() => clearWidgetsForTests())

  test('side-effect registers deeptutor at order 60', async () => {
    // Query suffix forces re-evaluation after clearWidgetsForTests (ESM cache).
    await import(`../index.ts?reload=${Date.now()}`)
    expect(getWidget('deeptutor')?.title).toBe('DeepTutor')
    expect(getWidget('deeptutor')?.order).toBe(60)
    expect(listWidgets().some((w) => w.id === 'deeptutor')).toBe(true)
  })
})
