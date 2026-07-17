import { describe, expect, test } from 'bun:test'
import { PendingStore } from '../store.ts'

describe('PendingStore', () => {
  test('resolve unblocks waiter', async () => {
    const store = new PendingStore({ defaultTimeoutMs: 60_000 })
    const { requestId } = store.create({
      toolName: 'Bash',
      input: { command: 'ls' },
      sessionId: 's1',
      message: 'Confirm Bash',
    })
    const wait = store.wait(requestId, 5_000)
    const ok = store.resolve(requestId, 'allow')
    expect(ok).toBe(true)
    await expect(wait).resolves.toEqual({ decision: 'allow' })
  })

  test('timeout denies', async () => {
    const store = new PendingStore({ defaultTimeoutMs: 50 })
    const { requestId } = store.create({
      toolName: 'Bash',
      input: {},
      sessionId: 's1',
      message: 'x',
    })
    await expect(store.wait(requestId, 50)).resolves.toEqual({
      decision: 'deny',
      reason: 'timeout',
    })
  })

  test('unknown requestId resolve returns false', () => {
    const store = new PendingStore({ defaultTimeoutMs: 60_000 })
    expect(store.resolve('nope', 'allow')).toBe(false)
  })
})
