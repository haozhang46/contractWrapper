import { describe, expect, test } from 'bun:test'
import { PendingStore } from '../../pending/store.ts'
import { handleAuthorize } from '../handlers.ts'

describe('handleAuthorize', () => {
  test('ask becomes needs_confirm and registers pending', async () => {
    const pending = new PendingStore({ defaultTimeoutMs: 60_000 })
    const result = await handleAuthorize(
      {
        evaluate: async () => ({
          decision: 'ask' as const,
          auditTrail: [],
          message: 'Confirm Bash',
        }),
      },
      pending,
      { toolName: 'Bash', input: {}, sessionId: 's1' },
      { workspaceRoot: '/tmp' },
    )
    expect(result.decision).toBe('needs_confirm')
    expect(typeof result.requestId).toBe('string')
    expect(pending.list().length).toBe(1)
  })

  test('allow maps to allow', async () => {
    const pending = new PendingStore({ defaultTimeoutMs: 60_000 })
    const result = await handleAuthorize(
      {
        evaluate: async () => ({
          decision: 'allow' as const,
          auditTrail: [],
        }),
      },
      pending,
      { toolName: 'Read', input: {}, sessionId: 's1' },
      { workspaceRoot: '/tmp' },
    )
    expect(result).toEqual({ decision: 'allow' })
    expect(pending.list().length).toBe(0)
  })

  test('deny maps to deny', async () => {
    const pending = new PendingStore({ defaultTimeoutMs: 60_000 })
    const result = await handleAuthorize(
      {
        evaluate: async () => ({
          decision: 'deny' as const,
          auditTrail: [],
          message: 'blocked',
        }),
      },
      pending,
      { toolName: 'Bash', input: {}, sessionId: 's1' },
      { workspaceRoot: '/tmp' },
    )
    expect(result).toEqual({ decision: 'deny', reason: 'blocked' })
    expect(pending.list().length).toBe(0)
  })
})
