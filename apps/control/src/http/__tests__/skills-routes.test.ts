import { afterEach, describe, expect, test } from 'bun:test'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import { createSkillsRoutes } from '../routes/skills.ts'

const fixtures: string[] = []

function makeWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'skills-routes-'))
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

function mountSkills(workspaceRoot: string, factory?: null) {
  const api = createSkillsRoutes({
    workspaceRoot,
    ...(factory !== undefined ? { factory } : { factory: null }),
  })
  return new Hono().route('/api/skills', api)
}

afterEach(() => {
  while (fixtures.length > 0) {
    const root = fixtures.pop()
    if (root) rmSync(root, { recursive: true, force: true })
  }
})

describe('/api/skills', () => {
  test('GET /api/skills → 200 array', async () => {
    const root = makeWorkspace()
    writeRuntimeSkill(
      root,
      'demo',
      '---\ndescription: Demo skill\n---\n\n# Demo\n',
    )

    const app = mountSkills(root)
    const res = await app.request('http://localhost/api/skills')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data).toHaveLength(1)
    expect(body.data[0]).toMatchObject({
      id: 'demo',
      source: 'runtime',
      enabled: false,
      installed: false,
    })
  })

  test('POST enable runtime → 200 enabled; enabled=true lists it; disable clears installed', async () => {
    const root = makeWorkspace()
    writeRuntimeSkill(root, 'pack', '# Pack\n')
    const app = mountSkills(root)

    const enableRes = await app.request(
      'http://localhost/api/skills/pack/enable',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'runtime' }),
      },
    )
    expect(enableRes.status).toBe(200)
    const enabledBody = await enableRes.json()
    expect(enabledBody.ok).toBe(true)
    expect(enabledBody.data).toMatchObject({
      id: 'pack',
      enabled: true,
      installed: true,
    })

    const listRes = await app.request(
      'http://localhost/api/skills?enabled=true',
    )
    expect(listRes.status).toBe(200)
    const listBody = await listRes.json()
    expect(listBody.data.map((s: { id: string }) => s.id)).toContain('pack')

    const disableRes = await app.request(
      'http://localhost/api/skills/pack/disable',
      { method: 'POST' },
    )
    expect(disableRes.status).toBe(200)
    const disabledBody = await disableRes.json()
    expect(disabledBody.ok).toBe(true)
    expect(disabledBody.data).toMatchObject({
      id: 'pack',
      enabled: false,
      installed: false,
    })
  })

  test('unknown id enable → 404', async () => {
    const root = makeWorkspace()
    const app = mountSkills(root)
    const res = await app.request(
      'http://localhost/api/skills/missing/enable',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'runtime' }),
      },
    )
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('NOT_FOUND')
  })

  test('factory enable without tools → 503', async () => {
    const root = makeWorkspace()
    const app = mountSkills(root, null)
    const res = await app.request(
      'http://localhost/api/skills/factory-skill/enable',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'factory', zone: 'published' }),
      },
    )
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('SKILL_FACTORY_UNAVAILABLE')
  })

  test('GET /:id?source=factory returns factory detail when id collides', async () => {
    const root = makeWorkspace()
    writeRuntimeSkill(
      root,
      'shared',
      '---\ndescription: Runtime body\n---\n\n# Runtime\n',
    )

    const factory = {
      assetsRoot: '/virtual-assets',
      skillList: () => [{ id: 'shared', zone: 'published' as const }],
      skillGet: (
        _assetsRoot: string,
        id: string,
        zone?: 'staging' | 'published',
      ) => ({
        id,
        zone: zone ?? ('published' as const),
        skillMd: '---\ndescription: Factory body\n---\n\n# Factory\n',
      }),
    }

    const api = createSkillsRoutes({ workspaceRoot: root, factory })
    const app = new Hono().route('/api/skills', api)

    const defaultRes = await app.request('http://localhost/api/skills/shared')
    expect(defaultRes.status).toBe(200)
    const defaultBody = await defaultRes.json()
    expect(defaultBody.data.source).toBe('runtime')

    const factoryRes = await app.request(
      'http://localhost/api/skills/shared?source=factory',
    )
    expect(factoryRes.status).toBe(200)
    const factoryBody = await factoryRes.json()
    expect(factoryBody.ok).toBe(true)
    expect(factoryBody.data).toMatchObject({
      id: 'shared',
      source: 'factory',
      zone: 'published',
      description: 'Factory body',
    })
    expect(factoryBody.data.skillMd).toContain('Factory body')
  })
})
