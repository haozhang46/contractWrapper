import { Hono } from 'hono'
import {
  loadSkillFactoryTools,
  type SkillFactoryTools,
  type SkillZone,
} from '../../skill-factory/loadTools.ts'
import { mapSkillFactoryError } from '../../skill-factory/mapError.ts'
import { resolveSkillFactoryRoots } from '../../skill-factory/resolveRoots.ts'

const UNAVAILABLE = {
  ok: false as const,
  error: {
    code: 'SKILL_FACTORY_UNAVAILABLE',
    message:
      'skill-factory submodule not initialized; run: git submodule update --init --recursive',
  },
}

type Roots = { factoryRoot: string; assetsRoot: string }

export function createSkillFactoryRoutes(opts: {
  workspaceRoot: string
  roots?: Roots | null
  tools?: SkillFactoryTools
}): Hono {
  const api = new Hono()

  const resolveRoots = (): Roots | null => {
    if (opts.roots !== undefined) return opts.roots
    return resolveSkillFactoryRoots(opts.workspaceRoot)
  }

  let toolsPromise: Promise<SkillFactoryTools> | null = null
  const getTools = async (factoryRoot: string): Promise<SkillFactoryTools> => {
    if (opts.tools) return opts.tools
    if (!toolsPromise) {
      toolsPromise = loadSkillFactoryTools(factoryRoot)
    }
    return toolsPromise
  }

  const withCtx = async (
    c: { json: (body: unknown, status?: number) => Response },
    run: (ctx: { roots: Roots; tools: SkillFactoryTools }) => Promise<unknown>,
  ) => {
    const roots = resolveRoots()
    if (!roots) return c.json(UNAVAILABLE, 503)
    try {
      const tools = await getTools(roots.factoryRoot)
      const data = await run({ roots, tools })
      return c.json({ ok: true, data })
    } catch (err) {
      const mapped = mapSkillFactoryError(err)
      return c.json(mapped.body, mapped.status)
    }
  }

  const auditWrite = (
    tools: SkillFactoryTools,
    factoryRoot: string,
    tool: string,
    params: Record<string, unknown>,
    ok: boolean,
    outputPath?: string,
  ) => {
    tools.auditLog(factoryRoot, {
      actor: 'http',
      tool,
      ok,
      params,
      ...(outputPath !== undefined ? { outputPath } : {}),
    })
  }

  api.get('/skills', c =>
    withCtx(c, async ({ roots, tools }) => tools.skillList(roots.assetsRoot)),
  )

  api.get('/skills/:id', c =>
    withCtx(c, async ({ roots, tools }) => {
      const id = c.req.param('id')
      const zone = (c.req.query('zone') as SkillZone | undefined) ?? undefined
      return tools.skillGet(roots.assetsRoot, id, zone)
    }),
  )

  api.post('/skills/generate', c =>
    withCtx(c, async ({ roots, tools }) => {
      const body = await c.req.json<{ id: string; description: string }>()
      const params = { id: body.id, description: body.description }
      try {
        const result = tools.skillGenerate(roots.assetsRoot, params)
        auditWrite(
          tools,
          roots.factoryRoot,
          'skill.generate',
          params,
          true,
          result.paths[0],
        )
        return result
      } catch (err) {
        auditWrite(tools, roots.factoryRoot, 'skill.generate', params, false)
        throw err
      }
    }),
  )

  api.post('/cases/generate', c =>
    withCtx(c, async ({ roots, tools }) => {
      const body = await c.req.json<{ skillId: string; note: string }>()
      const params = { skillId: body.skillId, note: body.note }
      try {
        const result = tools.casesGenerate(roots.assetsRoot, params)
        auditWrite(
          tools,
          roots.factoryRoot,
          'eval.cases.generate',
          params,
          true,
          result.path,
        )
        return result
      } catch (err) {
        auditWrite(
          tools,
          roots.factoryRoot,
          'eval.cases.generate',
          params,
          false,
        )
        throw err
      }
    }),
  )

  api.post('/rubric/generate', c =>
    withCtx(c, async ({ roots, tools }) => {
      const body = await c.req.json<{ skillId: string }>()
      const params = { skillId: body.skillId }
      try {
        const result = tools.rubricGenerate(roots.assetsRoot, params)
        auditWrite(
          tools,
          roots.factoryRoot,
          'rubric.generate',
          params,
          true,
          result.path,
        )
        return result
      } catch (err) {
        auditWrite(tools, roots.factoryRoot, 'rubric.generate', params, false)
        throw err
      }
    }),
  )

  api.post('/eval/run', c =>
    withCtx(c, async ({ roots, tools }) => {
      const body = await c.req.json<{ skillId: string; zone?: SkillZone }>()
      const params = { skillId: body.skillId, zone: body.zone }
      try {
        const result = tools.evalRun(roots.factoryRoot, roots.assetsRoot, params)
        auditWrite(
          tools,
          roots.factoryRoot,
          'eval.run',
          params,
          true,
          result.reportPath,
        )
        return result
      } catch (err) {
        auditWrite(tools, roots.factoryRoot, 'eval.run', params, false)
        throw err
      }
    }),
  )

  api.get('/eval/report', c =>
    withCtx(c, async ({ roots, tools }) => {
      const path = c.req.query('path')
      if (!path) throw new Error('report path must be provided')
      return tools.evalReportGet(roots.factoryRoot, { reportPath: path })
    }),
  )

  api.post('/eval/diff', c =>
    withCtx(c, async ({ roots, tools }) => {
      const body = await c.req.json<{
        reportPathA: string
        reportPathB: string
      }>()
      return tools.evalDiff(roots.factoryRoot, {
        reportPathA: body.reportPathA,
        reportPathB: body.reportPathB,
      })
    }),
  )

  api.post('/eval/cluster', c =>
    withCtx(c, async ({ roots, tools }) => {
      const body = await c.req.json<{ reportPath: string }>()
      return tools.evalLowScoreCluster(roots.factoryRoot, {
        reportPath: body.reportPath,
      })
    }),
  )

  api.post('/optimize/suggest', c =>
    withCtx(c, async ({ roots, tools }) => {
      const body = await c.req.json<{ reportPath: string }>()
      return tools.skillOptimizeSuggest(roots.factoryRoot, {
        reportPath: body.reportPath,
      })
    }),
  )

  return api
}
