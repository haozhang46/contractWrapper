import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PendingStore } from '../../pending/store.ts'
import { handleAuthorize } from '../handlers.ts'

describe('handleAuthorize headless autoAllow', () => {
  test('ask auto-allows when .harness/headless.json autoAllow=true', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-headless-'))
    mkdirSync(join(root, '.harness'), { recursive: true })
    writeFileSync(
      join(root, '.harness', 'headless.json'),
      JSON.stringify({ autoAllow: true }),
    )
    const pending = new PendingStore({ defaultTimeoutMs: 60_000 })
    const result = await handleAuthorize(
      {
        evaluate: async () => ({
          decision: 'ask' as const,
          auditTrail: [],
          message: 'Confirm WebSearch',
        }),
      },
      pending,
      { toolName: 'WebSearch', input: {}, sessionId: 's1' },
      { workspaceRoot: root },
    )
    expect(result).toEqual({ decision: 'allow' })
    expect(pending.list().length).toBe(0)
  })

  test('ask still needs_confirm when autoAllow is off', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-headless-off-'))
    mkdirSync(join(root, '.harness'), { recursive: true })
    writeFileSync(
      join(root, '.harness', 'headless.json'),
      JSON.stringify({ autoAllow: false }),
    )
    const pending = new PendingStore({ defaultTimeoutMs: 60_000 })
    const result = await handleAuthorize(
      {
        evaluate: async () => ({
          decision: 'ask' as const,
          auditTrail: [],
          message: 'Confirm WebSearch',
        }),
      },
      pending,
      { toolName: 'WebSearch', input: {}, sessionId: 's1' },
      { workspaceRoot: root },
    )
    expect(result.decision).toBe('needs_confirm')
    expect(pending.list().length).toBe(1)
  })
})
