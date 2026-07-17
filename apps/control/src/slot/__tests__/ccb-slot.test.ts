import { afterEach, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import type { SlotEvent } from '@harness/slot'
import { CcbSlot } from '../ccb-slot.ts'
import { getDefaultSlot } from '../factory.ts'
import { encodeJsonl, parseJsonlLine } from '../jsonl.ts'

const fixturePath = join(import.meta.dir, 'fixtures', 'fake-agent.ts')

const slots: CcbSlot[] = []

afterEach(() => {
  for (const slot of slots) slot.dispose()
  slots.length = 0
})

function createTestSlot(overrides: ConstructorParameters<typeof CcbSlot>[0] = {
  workspaceRoot: '/tmp',
}): CcbSlot {
  const slot = new CcbSlot({
    workspaceRoot: '/tmp',
    spawnCommand: process.execPath,
    spawnArgs: [fixturePath],
    env: {},
    ...overrides,
  })
  slots.push(slot)
  return slot
}

describe('jsonl helpers', () => {
  test('encodeJsonl appends newline', () => {
    expect(encodeJsonl({ type: 'turn', id: '1' })).toBe(
      '{"type":"turn","id":"1"}\n',
    )
  })

  test('parseJsonlLine ignores non-JSON', () => {
    expect(parseJsonlLine('not-json')).toBeNull()
    expect(parseJsonlLine('{"type":"done","messageId":"x","id":"1"}')).toEqual({
      type: 'done',
      messageId: 'x',
      id: '1',
    })
  })
})

describe('CcbSlot', () => {
  test('CcbSlot turn over stdio', async () => {
    const slot = createTestSlot()
    await slot.initSession({ workspaceRoot: '/tmp' })
    const events: SlotEvent[] = []
    await slot.sendMessageWithHistory(
      [{ role: 'user', content: 'hi' }],
      e => events.push(e),
    )
    expect(events.some(e => e.type === 'text-delta')).toBe(true)
    expect(events.at(-1)?.type).toBe('done')
  })

  test('spawn failure emits Agent Slot / CCB 不可用 error', async () => {
    const slot = createTestSlot({
      workspaceRoot: '/tmp',
      spawnCommand: '/nonexistent/harness-ccb-agent-xyz',
      spawnArgs: [],
      env: {},
    })
    await slot.initSession({ workspaceRoot: '/tmp' })
    const events: SlotEvent[] = []
    await slot.sendMessageWithHistory(
      [{ role: 'user', content: 'hi' }],
      e => events.push(e),
    )
    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('error')
    if (events[0]?.type === 'error') {
      expect(events[0].message).toContain('Agent Slot / CCB 不可用')
    }
  })

  test('turns are serial — second waits for first done', async () => {
    const slot = createTestSlot()
    await slot.initSession({ workspaceRoot: '/tmp' })
    const order: string[] = []
    const first = slot.sendMessageWithHistory(
      [{ role: 'user', content: 'one' }],
      e => {
        if (e.type === 'done') order.push('first-done')
      },
    )
    const second = slot.sendMessageWithHistory(
      [{ role: 'user', content: 'two' }],
      e => {
        if (e.type === 'text-delta') order.push('second-delta')
        if (e.type === 'done') order.push('second-done')
      },
    )
    await Promise.all([first, second])
    expect(order).toEqual(['first-done', 'second-delta', 'second-done'])
  })

  test('getDefaultSlot returns CcbSlot', () => {
    const slot = getDefaultSlot('/tmp')
    expect(slot).toBeInstanceOf(CcbSlot)
    ;(slot as CcbSlot).dispose()
  })
})
