import { describe, expect, test, beforeEach, afterEach, spyOn } from 'bun:test'
import { createElement, type ReactElement } from 'react'
import {
  registerWidget,
  getWidget,
  listWidgets,
  clearWidgetsForTests,
} from '../registry.ts'

function mountStub(): ReactElement {
  return createElement('div', null, 'stub')
}

describe('widget registry', () => {
  beforeEach(() => clearWidgetsForTests())
  afterEach(() => clearWidgetsForTests())

  test('register + getWidget', () => {
    registerWidget({ id: 'a', title: 'A', mount: mountStub })
    expect(getWidget('a')?.title).toBe('A')
  })

  test('same id overwrites and warns', () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    registerWidget({ id: 'a', title: 'A1', mount: mountStub })
    registerWidget({ id: 'a', title: 'A2', mount: mountStub })
    expect(getWidget('a')?.title).toBe('A2')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  test('listWidgets sorts by order then id', () => {
    registerWidget({ id: 'b', title: 'B', order: 10, mount: mountStub })
    registerWidget({ id: 'a', title: 'A', order: 10, mount: mountStub })
    registerWidget({ id: 'c', title: 'C', order: 5, mount: mountStub })
    registerWidget({ id: 'd', title: 'D', mount: mountStub }) // default 100
    expect(listWidgets().map((w) => w.id)).toEqual(['c', 'a', 'b', 'd'])
  })
})
