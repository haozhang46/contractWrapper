import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { OnionRegistry } from '@harness/onion'
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

  test('forwards onionId to evaluate', async () => {
    const pending = new PendingStore({ defaultTimeoutMs: 60_000 })
    let capturedOpts: { onionId?: string } | undefined
    const result = await handleAuthorize(
      {
        evaluate: async (_tool, _input, opts) => {
          capturedOpts = opts
          return { decision: 'allow' as const, auditTrail: [] }
        },
      },
      pending,
      { toolName: 'Read', input: {}, sessionId: 's1', onionId: 'strict' },
      { workspaceRoot: '/tmp' },
    )
    expect(capturedOpts).toEqual({ onionId: 'strict' })
    expect(result).toEqual({ decision: 'allow' })
  })

  describe('unknown onionId', () => {
    let root: string

    beforeEach(() => {
      root = join(
        tmpdir(),
        `authorize-onion-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      )
      mkdirSync(join(root, '.harness'), { recursive: true })
    })

    afterEach(() => {
      rmSync(root, { recursive: true, force: true })
    })

    test('falls back to default without error', async () => {
      const registry = new OnionRegistry(root)
      registry.bootstrap()
      const pending = new PendingStore({ defaultTimeoutMs: 60_000 })
      const result = await handleAuthorize(
        registry,
        pending,
        { toolName: 'Read', input: { path: 'x' }, sessionId: 's1', onionId: 'missing' },
        { workspaceRoot: root },
      )
      expect(['allow', 'deny', 'needs_confirm']).toContain(result.decision)
    })
  })
})
