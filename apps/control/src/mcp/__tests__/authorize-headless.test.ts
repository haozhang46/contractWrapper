import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PendingStore } from '../../pending/store.ts'
import { handleAuthorize } from '../handlers.ts'

function writeHeadless(
  root: string,
  settings: { autoAllow: boolean; unsafeMode?: boolean },
) {
  mkdirSync(join(root, '.harness'), { recursive: true })
  writeFileSync(
    join(root, '.harness', 'headless.json'),
    JSON.stringify({
      autoAllow: settings.autoAllow,
      unsafeMode: settings.unsafeMode ?? false,
    }),
  )
}

describe('handleAuthorize headless autoAllow', () => {
  test('L2 WebSearch ask auto-allows when autoAllow=true (no unsafeMode needed)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-headless-l2-'))
    writeHeadless(root, { autoAllow: true, unsafeMode: false })
    const pending = new PendingStore({ defaultTimeoutMs: 60_000 })
    const result = await handleAuthorize(
      {
        evaluate: async () => ({
          decision: 'ask' as const,
          auditTrail: [],
          message: 'Confirm WebSearch',
        }),
        classify: () => 'L2' as const,
      },
      pending,
      { toolName: 'WebSearch', input: {}, sessionId: 's1' },
      { workspaceRoot: root },
    )
    expect(result).toEqual({ decision: 'allow' })
    expect(pending.list().length).toBe(0)
  })

  test('deny is never bypassed by autoAllow', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-headless-deny-'))
    writeHeadless(root, { autoAllow: true, unsafeMode: true })
    const pending = new PendingStore({ defaultTimeoutMs: 60_000 })
    const result = await handleAuthorize(
      {
        evaluate: async () => ({
          decision: 'deny' as const,
          auditTrail: [],
          message: 'L3 denied',
        }),
        classify: () => 'L3' as const,
      },
      pending,
      { toolName: 'Danger', input: {}, sessionId: 's1' },
      { workspaceRoot: root },
    )
    expect(result).toEqual({ decision: 'deny', reason: 'L3 denied' })
    expect(pending.list().length).toBe(0)
  })

  test('ask auto-allows when autoAllow=true', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-headless-ask-'))
    writeHeadless(root, { autoAllow: true, unsafeMode: false })
    const pending = new PendingStore({ defaultTimeoutMs: 60_000 })
    const result = await handleAuthorize(
      {
        evaluate: async () => ({
          decision: 'ask' as const,
          auditTrail: [],
          message: 'Confirm Bash',
        }),
        classify: () => 'L2' as const,
      },
      pending,
      { toolName: 'Bash', input: {}, sessionId: 's1' },
      { workspaceRoot: root },
    )
    expect(result).toEqual({ decision: 'allow' })
    expect(pending.list().length).toBe(0)
  })

  test('ask still needs_confirm when autoAllow is off', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-headless-off-'))
    writeHeadless(root, { autoAllow: false, unsafeMode: false })
    const pending = new PendingStore({ defaultTimeoutMs: 60_000 })
    const result = await handleAuthorize(
      {
        evaluate: async () => ({
          decision: 'ask' as const,
          auditTrail: [],
          message: 'Confirm WebSearch',
        }),
        classify: () => 'L2' as const,
      },
      pending,
      { toolName: 'WebSearch', input: {}, sessionId: 's1' },
      { workspaceRoot: root },
    )
    expect(result.decision).toBe('needs_confirm')
    expect(pending.list().length).toBe(1)
  })
})
