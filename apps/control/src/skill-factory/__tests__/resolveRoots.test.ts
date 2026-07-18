import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolveSkillFactoryRoots } from '../resolveRoots.ts'

describe('resolveSkillFactoryRoots', () => {
  test('missing dir → null', () => {
    const result = resolveSkillFactoryRoots('/tmp/no-such-workspace-xyz', {})
    expect(result).toBeNull()
  })

  test('present dir with mcp/src/tools.ts → non-null', () => {
    const root = mkdtempSync(join(tmpdir(), 'sf-roots-'))
    try {
      const factoryRoot = join(root, 'skill-factory')
      mkdirSync(join(factoryRoot, 'mcp/src'), { recursive: true })
      writeFileSync(join(factoryRoot, 'mcp/src/tools.ts'), 'export {}')
      const result = resolveSkillFactoryRoots(root, {})
      expect(result).toEqual({
        factoryRoot,
        assetsRoot: join(factoryRoot, 'skill-assets'),
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
