import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { controlLog } from '../controlLog.ts'

describe('controlLog', () => {
  test('appends ISO lines to .harness/control.log', () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-control-log-'))
    controlLog(root, 'hello', { n: 1 })
    controlLog(root, 'world')

    const text = readFileSync(join(root, '.harness', 'control.log'), 'utf-8')
    const lines = text.trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(
      /^\[\d{4}-\d{2}-\d{2}T.+\] hello \{"n":1\}$/,
    )
    expect(lines[1]).toMatch(/^\[\d{4}-\d{2}-\d{2}T.+\] world$/)
  })
})
