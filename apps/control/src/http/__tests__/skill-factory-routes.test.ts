import { describe, expect, test, beforeEach } from 'bun:test'
import { Hono } from 'hono'
import { createSkillFactoryRoutes } from '../routes/skill-factory.ts'
import type { SkillFactoryTools } from '../../skill-factory/loadTools.ts'

function mockTools(overrides: Partial<SkillFactoryTools> = {}): SkillFactoryTools {
  return {
    skillList: () => [{ id: 'demo', zone: 'staging' }],
    skillGet: (_a, id, zone = 'published') => ({
      id,
      zone,
      skillMd: '# demo',
    }),
    skillGenerate: (_a, input) => ({
      id: input.id,
      zone: 'staging',
      paths: [`staging/${input.id}/SKILL.md`],
    }),
    casesGenerate: () => ({ path: 'staging/demo/cases/generated/c.json' }),
    rubricGenerate: () => ({ path: 'staging/demo/rubric_config.json' }),
    evalRun: () => ({
      reportPath: 'reports/eval/demo-1.json',
      report: { skillId: 'demo', cases: [] },
    }),
    evalReportGet: () => ({ skillId: 'demo', cases: [] }),
    evalDiff: () => ({ diff: [] }),
    evalLowScoreCluster: () => ({ clusters: [] }),
    skillOptimizeSuggest: () => ({ suggestions: [] }),
    auditLog: () => {},
    FrozenPathError: class FrozenPathError extends Error {
      readonly code = 'FROZEN_PATH' as const
      constructor(path: string) {
        super(`FROZEN_PATH: ${path}`)
        this.name = 'FrozenPathError'
      }
    },
    ...overrides,
  } as SkillFactoryTools
}

describe('/api/skill-factory', () => {
  test('503 when roots null', async () => {
    const api = createSkillFactoryRoutes({
      workspaceRoot: '/tmp/none',
      roots: null,
      tools: mockTools(),
    })
    const app = new Hono().route('/api/skill-factory', api)
    const res = await app.request('http://localhost/api/skill-factory/skills')
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('SKILL_FACTORY_UNAVAILABLE')
  })

  test('GET /skills happy path', async () => {
    const api = createSkillFactoryRoutes({
      workspaceRoot: '/tmp/x',
      roots: { factoryRoot: '/tmp/sf', assetsRoot: '/tmp/sf/skill-assets' },
      tools: mockTools(),
    })
    const app = new Hono().route('/api/skill-factory', api)
    const res = await app.request('http://localhost/api/skill-factory/skills')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      data: [{ id: 'demo', zone: 'staging' }],
    })
  })

  test('FROZEN_PATH → 403', async () => {
    const tools = mockTools()
    tools.skillGenerate = () => {
      throw new tools.FrozenPathError('published/x')
    }
    const api = createSkillFactoryRoutes({
      workspaceRoot: '/tmp/x',
      roots: { factoryRoot: '/tmp/sf', assetsRoot: '/tmp/sf/skill-assets' },
      tools,
    })
    const app = new Hono().route('/api/skill-factory', api)
    const res = await app.request(
      'http://localhost/api/skill-factory/skills/generate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'x', description: 'd' }),
      },
    )
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe('FROZEN_PATH')
  })

  test('skill not found → 404', async () => {
    const tools = mockTools({
      skillGet: () => {
        throw new Error('skill not found: staging/missing')
      },
    })
    const api = createSkillFactoryRoutes({
      workspaceRoot: '/tmp/x',
      roots: { factoryRoot: '/tmp/sf', assetsRoot: '/tmp/sf/skill-assets' },
      tools,
    })
    const app = new Hono().route('/api/skill-factory', api)
    const res = await app.request(
      'http://localhost/api/skill-factory/skills/missing?zone=staging',
    )
    expect(res.status).toBe(404)
  })

  test('POST write + read routes happy paths', async () => {
    const api = createSkillFactoryRoutes({
      workspaceRoot: '/tmp/x',
      roots: { factoryRoot: '/tmp/sf', assetsRoot: '/tmp/sf/skill-assets' },
      tools: mockTools(),
    })
    const app = new Hono().route('/api/skill-factory', api)
    const json = async (path: string, init?: RequestInit) => {
      const res = await app.request(`http://localhost/api/skill-factory${path}`, init)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)
      return body.data
    }
    await json('/skills/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'demo', description: 'd' }),
    })
    await json('/cases/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skillId: 'demo', note: 'n' }),
    })
    await json('/rubric/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skillId: 'demo' }),
    })
    await json('/eval/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skillId: 'demo', zone: 'staging' }),
    })
    await json('/eval/report?path=reports/eval/demo-1.json')
    await json('/eval/diff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reportPathA: 'reports/a.json',
        reportPathB: 'reports/b.json',
      }),
    })
    await json('/eval/cluster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportPath: 'reports/eval/demo-1.json' }),
    })
    await json('/optimize/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportPath: 'reports/eval/demo-1.json' }),
    })
  })
})
