import { describe, expect, test } from 'bun:test'
import type { SlotEvent } from '../types.ts'

test('SlotEvent text-delta shape', () => {
  const e: SlotEvent = { type: 'text-delta', content: 'hi' }
  expect(e.type).toBe('text-delta')
})
