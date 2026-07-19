import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { SlotEvent } from '@harness/slot'
import {
  CcbSlot,
  defaultCcbSpawnArgs,
  resolveCcbBridgePath,
} from '../ccb-slot.ts'
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
  test('resolveCcbBridgePath is anchored to monorepo, not process.cwd()', () => {
    const path = resolveCcbBridgePath()
    expect(path).toMatch(/ccb[/\\]src[/\\]harness[/\\]stdioBridge\.ts$/)
    expect(existsSync(path)).toBe(true)
    const prev = process.cwd()
    try {
      process.chdir('/tmp')
      expect(resolveCcbBridgePath()).toBe(path)
      expect(existsSync(resolveCcbBridgePath())).toBe(true)
    } finally {
      process.chdir(prev)
    }
  })

  test('defaultCcbSpawnArgs injects MACRO.VERSION define before bridge path', () => {
    const args = defaultCcbSpawnArgs()
    const versionIdx = args.indexOf('MACRO.VERSION')
    // bun -d KEY:VALUE → flatMap yields ['-d', 'MACRO.VERSION:"..."']
    const defineFlag = args.findIndex(
      (a, i) => a === '-d' && args[i + 1]?.startsWith('MACRO.VERSION:'),
    )
    expect(defineFlag).toBeGreaterThanOrEqual(0)
    expect(args.at(-1)).toBe(resolveCcbBridgePath())
    expect(versionIdx).toBe(-1) // key is inside the -d value, not a bare arg
  })

  test('defaultCcbSpawnArgs includes --feature EXTRACT_MEMORIES', () => {
    const args = defaultCcbSpawnArgs()
    const idx = args.indexOf('--feature')
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(args.includes('EXTRACT_MEMORIES')).toBe(true)
    const featureIdx = args.findIndex(
      (a, i) => a === '--feature' && args[i + 1] === 'EXTRACT_MEMORIES',
    )
    expect(featureIdx).toBeGreaterThanOrEqual(0)
    expect(featureIdx).toBeLessThan(args.length - 1) // before bridge path
  })

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

  test('pre-aborted signal completes with terminal error (no hang)', async () => {
    const slot = createTestSlot()
    await slot.initSession({ workspaceRoot: '/tmp' })
    const ac = new AbortController()
    ac.abort()
    const events: SlotEvent[] = []
    await Promise.race([
      slot.sendMessageWithHistory(
        [{ role: 'user', content: 'hi' }],
        e => events.push(e),
        ac.signal,
      ),
      Bun.sleep(2000).then(() => {
        throw new Error('turn hung after pre-aborted signal')
      }),
    ])
    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('error')
    if (events[0]?.type === 'error') {
      expect(events[0].message).toContain('aborted')
    }
  })

  test('abort during ensureChild does not hang the turn waiter', async () => {
    const slot = createTestSlot()
    await slot.initSession({ workspaceRoot: '/tmp' })
    const ac = new AbortController()
    const events: SlotEvent[] = []
    const turn = slot.sendMessageWithHistory(
      [{ role: 'user', content: 'hi' }],
      e => events.push(e),
      ac.signal,
    )
    // Fire during ensureChild's spawn race (before waiter registration).
    queueMicrotask(() => ac.abort())
    await Promise.race([
      turn,
      Bun.sleep(2000).then(() => {
        throw new Error('turn hung after abort during ensureChild')
      }),
    ])
    expect(events.some(e => e.type === 'error')).toBe(true)
    const err = events.find(e => e.type === 'error')
    if (err?.type === 'error') {
      expect(err.message).toContain('aborted')
    }
  })

  test('abort mid-turn emits terminal error and completes', async () => {
    const slot = createTestSlot()
    await slot.initSession({ workspaceRoot: '/tmp' })
    const ac = new AbortController()
    const events: SlotEvent[] = []
    const turn = slot.sendMessageWithHistory(
      [{ role: 'user', content: 'slow' }],
      e => events.push(e),
      ac.signal,
    )
    // Allow child spawn + turn write, then abort while fake-agent waits.
    await Bun.sleep(80)
    ac.abort()
    await Promise.race([
      turn,
      Bun.sleep(2000).then(() => {
        throw new Error('turn hung after mid-turn abort')
      }),
    ])
    expect(events.some(e => e.type === 'error')).toBe(true)
    expect(events.every(e => e.type !== 'done')).toBe(true)
    const err = events.find(e => e.type === 'error')
    if (err?.type === 'error') {
      expect(err.message).toContain('aborted')
    }
  })

  test('queued turn abort does not kill in-flight turn', async () => {
    const slot = createTestSlot()
    await slot.initSession({ workspaceRoot: '/tmp' })
    const eventsA: SlotEvent[] = []
    const eventsB: SlotEvent[] = []
    const acA = new AbortController()
    const acB = new AbortController()

    const turnA = slot.sendMessageWithHistory(
      [{ role: 'user', content: 'delay' }],
      e => eventsA.push(e),
      acA.signal,
    )
    const turnB = slot.sendMessageWithHistory(
      [{ role: 'user', content: 'two' }],
      e => eventsB.push(e),
      acB.signal,
    )

    // A is in-flight; B is queued. Simulate createChatRoutes disconnect on B:
    // abort B's signal and call slot.abort(B.signal) — must not kill A.
    await Bun.sleep(50)
    acB.abort()
    slot.abort(acB.signal)

    await Promise.race([
      Promise.all([turnA, turnB]),
      Bun.sleep(3000).then(() => {
        throw new Error('turns hung after queued abort')
      }),
    ])

    expect(eventsA.some(e => e.type === 'text-delta')).toBe(true)
    expect(eventsA.at(-1)?.type).toBe('done')
    expect(eventsB.some(e => e.type === 'error')).toBe(true)
    const errB = eventsB.find(e => e.type === 'error')
    if (errB?.type === 'error') {
      expect(errB.message).toContain('aborted')
    }
    expect(eventsB.every(e => e.type !== 'done')).toBe(true)
  })
})
