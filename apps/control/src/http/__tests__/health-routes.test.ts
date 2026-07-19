import { describe, expect, test, beforeAll } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../app.ts'
import { initHarnessDir } from '../../bootstrap/init.ts'

describe('GET /api/health', () => {
  const root = mkdtempSync(join(tmpdir(), 'harness-health-'))

  beforeAll(() => {
    initHarnessDir(root)
  })

  test('returns ok', async () => {
    const app = createApp({ workspaceRoot: root })
    const res = await app.request('http://localhost/api/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})
