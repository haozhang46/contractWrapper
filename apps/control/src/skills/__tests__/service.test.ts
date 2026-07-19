import { afterEach, describe, expect, test } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  disableSkill,
  enableSkill,
  listSkills,
  SkillConflictError,
} from '../service.ts'
import type { FactoryTools } from '../types.ts'

const fixtures: string[] = []

function makeWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'skills-svc-'))
  fixtures.push(root)
  return root
}

function writeRuntimeSkill(
  workspaceRoot: string,
  id: string,
  skillMd: string,
): void {
  const dir = join(workspaceRoot, '.harness', 'skills', id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), skillMd, 'utf-8')
}

afterEach(() => {
  while (fixtures.length > 0) {
    const root = fixtures.pop()
    if (root) rmSync(root, { recursive: true, force: true })
  }
})

describe('listSkills', () => {
  test('empty registry + runtime file listed as disabled', async () => {
    const root = makeWorkspace()
    writeRuntimeSkill(
      root,
      'demo',
      '---\ndescription: Demo skill\n---\n\n# Demo\n',
    )

    const items = await listSkills(root, { factory: null })

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: 'demo',
      name: 'demo',
      description: 'Demo skill',
      source: 'runtime',
      enabled: false,
      installed: false,
    })
  })

  test('enabledOnly filters to enabled && installed', async () => {
    const root = makeWorkspace()
    writeRuntimeSkill(root, 'a', '# A skill\n')
    writeRuntimeSkill(root, 'b', '# B skill\n')

    await enableSkill(root, 'a', { source: 'runtime' })

    const enabled = await listSkills(root, {
      enabledOnly: true,
      factory: null,
    })
    expect(enabled.map((s) => s.id)).toEqual(['a'])

    const all = await listSkills(root, { factory: null })
    expect(all.map((s) => s.id).sort()).toEqual(['a', 'b'])
  })

  test('factory null skips factory entries without throwing', async () => {
    const root = makeWorkspace()
    writeRuntimeSkill(root, 'local', '# Local\n')

    const items = await listSkills(root, { factory: null })
    expect(items.every((s) => s.source === 'runtime')).toBe(true)
  })
})

describe('enableSkill / disableSkill', () => {
  test('enable runtime copies to .claude/skills and sets enabled', async () => {
    const root = makeWorkspace()
    writeRuntimeSkill(
      root,
      'pack',
      '---\ndescription: Pack helper\n---\n\nBody\n',
    )

    const item = await enableSkill(root, 'pack', { source: 'runtime' })

    expect(item.enabled).toBe(true)
    expect(item.installed).toBe(true)
    const installed = join(root, '.claude', 'skills', 'pack', 'SKILL.md')
    expect(existsSync(installed)).toBe(true)
    expect(readFileSync(installed, 'utf-8')).toContain('Pack helper')
  })

  test('disable removes install dir and marks disabled', async () => {
    const root = makeWorkspace()
    writeRuntimeSkill(root, 'pack', '# Pack\n')
    await enableSkill(root, 'pack', { source: 'runtime' })

    const item = await disableSkill(root, 'pack')

    expect(item.enabled).toBe(false)
    expect(item.installed).toBe(false)
    expect(existsSync(join(root, '.claude', 'skills', 'pack'))).toBe(false)
    expect(
      existsSync(join(root, '.harness', 'skills', 'pack', 'SKILL.md')),
    ).toBe(true)
  })

  test('factory enable with stub tools', async () => {
    const root = makeWorkspace()
    const factory: FactoryTools = {
      assetsRoot: '/virtual-assets',
      skillList: () => [{ id: 'factory-skill', zone: 'published' }],
      skillGet: (_assetsRoot, id, zone) => ({
        id,
        zone: zone ?? 'published',
        skillMd: '---\ndescription: From factory\n---\n\n# Factory\n',
      }),
    }

    const item = await enableSkill(
      root,
      'factory-skill',
      { source: 'factory', zone: 'published' },
      factory,
    )

    expect(item).toMatchObject({
      id: 'factory-skill',
      source: 'factory',
      zone: 'published',
      enabled: true,
      installed: true,
      description: 'From factory',
    })
    expect(
      readFileSync(
        join(root, '.claude', 'skills', 'factory-skill', 'SKILL.md'),
        'utf-8',
      ),
    ).toContain('From factory')
  })

  test('409 when other source already enabled for same id', async () => {
    const root = makeWorkspace()
    writeRuntimeSkill(root, 'dup', '# Runtime dup\n')
    await enableSkill(root, 'dup', { source: 'runtime' })

    const factory: FactoryTools = {
      assetsRoot: '/virtual-assets',
      skillList: () => [{ id: 'dup', zone: 'published' }],
      skillGet: (_assetsRoot, id, zone) => ({
        id,
        zone: zone ?? 'published',
        skillMd: '# Factory dup\n',
      }),
    }

    expect(
      enableSkill(root, 'dup', { source: 'factory', zone: 'published' }, factory),
    ).rejects.toBeInstanceOf(SkillConflictError)
  })
})
