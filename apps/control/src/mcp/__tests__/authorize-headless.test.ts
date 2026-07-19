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

describe('handleAuthorize headless autoAllow / unsafeMode', () => {
  test('L3 ask still needs_confirm when autoAllow=true but unsafeMode=false', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-headless-safe-'))
    writeHeadless(root, { autoAllow: true, unsafeMode: false })
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

  test('L3 ask auto-allows when autoAllow + unsafeMode', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-headless-unsafe-'))
    writeHeadless(root, { autoAllow: true, unsafeMode: true })
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

  test('non-L3 ask auto-allows when autoAllow=true without unsafeMode', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-headless-l1-'))
    writeHeadless(root, { autoAllow: true, unsafeMode: false })
    const pending = new PendingStore({ defaultTimeoutMs: 60_000 })
    const result = await handleAuthorize(
      {
        evaluate: async () => ({
          decision: 'ask' as const,
          auditTrail: [],
          message: 'Confirm Read',
        }),
      },
      pending,
      { toolName: 'Read', input: {}, sessionId: 's1' },
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
      },
      pending,
      { toolName: 'WebSearch', input: {}, sessionId: 's1' },
      { workspaceRoot: root },
    )
    expect(result.decision).toBe('needs_confirm')
    expect(pending.list().length).toBe(1)
  })
})
