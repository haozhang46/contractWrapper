import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveWorkspaceRoot } from '../resolveWorkspaceRoot.ts'

const prevEnv = process.env.HARNESS_WORKSPACE
const prevCwd = process.cwd()

afterEach(() => {
  if (prevEnv === undefined) delete process.env.HARNESS_WORKSPACE
  else process.env.HARNESS_WORKSPACE = prevEnv
  process.chdir(prevCwd)
})

describe('resolveWorkspaceRoot', () => {
  test('HARNESS_WORKSPACE wins over cwd', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'harness-ws-')))
    process.env.HARNESS_WORKSPACE = root
    process.chdir('/tmp')
    expect(resolveWorkspaceRoot()).toBe(root)
  })

  test('when cwd is @harness/control package, use monorepo root', () => {
    delete process.env.HARNESS_WORKSPACE
    const mono = realpathSync(mkdtempSync(join(tmpdir(), 'harness-mono-')))
    const control = join(mono, 'apps', 'control')
    mkdirSync(control, { recursive: true })
    writeFileSync(
      join(control, 'package.json'),
      JSON.stringify({ name: '@harness/control' }),
    )
    process.chdir(control)
    expect(resolveWorkspaceRoot()).toBe(mono)
  })

  test('otherwise use process.cwd()', () => {
    delete process.env.HARNESS_WORKSPACE
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'harness-plain-')))
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'something-else' }),
    )
    process.chdir(root)
    expect(resolveWorkspaceRoot()).toBe(root)
  })
})
