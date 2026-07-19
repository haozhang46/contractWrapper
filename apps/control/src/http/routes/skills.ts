import { Hono } from 'hono'
import { loadSkillFactoryTools } from '../../skill-factory/loadTools.ts'
import { resolveSkillFactoryRoots } from '../../skill-factory/resolveRoots.ts'
import {
  SkillConflictError,
  SkillNotFoundError,
  disableSkill,
  enableSkill,
  getSkill,
  listSkills,
} from '../../skills/service.ts'
import type { FactoryTools, SkillSource, SkillZone } from '../../skills/types.ts'

const FACTORY_UNAVAILABLE = {
  ok: false as const,
  error: {
    code: 'SKILL_FACTORY_UNAVAILABLE',
    message:
      'skill-factory submodule not initialized; run: git submodule update --init --recursive',
  },
}

function mapSkillError(err: unknown): { status: number; body: unknown } {
  if (err instanceof SkillNotFoundError || (err as { code?: string })?.code === 'NOT_FOUND') {
    return {
      status: 404,
      body: {
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: err instanceof Error ? err.message : 'Skill not found',
        },
      },
    }
  }
  if (
    err instanceof SkillConflictError ||
    (err as { code?: string })?.code === 'CONFLICT'
  ) {
    return {
      status: 409,
      body: {
        ok: false,
        error: {
          code: 'CONFLICT',
          message: err instanceof Error ? err.message : 'Skill conflict',
        },
      },
    }
  }
  throw err
}

export function createSkillsRoutes(opts: {
  workspaceRoot: string
  /** Inject factory tools (or null) for tests; omit to resolve best-effort. */
  factory?: FactoryTools | null
}): Hono {
  const api = new Hono()
  const { workspaceRoot } = opts

  let factoryPromise: Promise<FactoryTools | null> | null = null

  const resolveFactory = async (): Promise<FactoryTools | null> => {
    if (opts.factory !== undefined) return opts.factory
    if (!factoryPromise) {
      factoryPromise = (async () => {
        const roots = resolveSkillFactoryRoots(workspaceRoot)
        if (!roots) return null
        try {
          const tools = await loadSkillFactoryTools(roots.factoryRoot)
          return {
            assetsRoot: roots.assetsRoot,
            skillList: tools.skillList,
            skillGet: tools.skillGet,
          }
        } catch {
          return null
        }
      })()
    }
    return factoryPromise
  }

  api.get('/', async c => {
    const enabled = c.req.query('enabled')
    const factory = await resolveFactory()
    const data = await listSkills(workspaceRoot, {
      enabledOnly: enabled === 'true',
      factory,
    })
    return c.json({ ok: true, data })
  })

  api.get('/:id', async c => {
    const id = c.req.param('id')
    const sourceQuery = c.req.query('source')
    const zoneQuery = c.req.query('zone')
    const source: SkillSource | undefined =
      sourceQuery === 'runtime' || sourceQuery === 'factory'
        ? sourceQuery
        : undefined
    const zone: SkillZone | undefined =
      zoneQuery === 'staging' || zoneQuery === 'published'
        ? zoneQuery
        : undefined
    const factory = await resolveFactory()
    try {
      const data = await getSkill(workspaceRoot, id, factory, { source, zone })
      return c.json({ ok: true, data })
    } catch (err) {
      const mapped = mapSkillError(err)
      return c.json(mapped.body, mapped.status)
    }
  })

  api.post('/:id/enable', async c => {
    const id = c.req.param('id')
    let body: { source?: SkillSource; zone?: SkillZone } = {}
    try {
      body = await c.req.json()
    } catch {
      body = {}
    }
    const source: SkillSource = body.source ?? 'runtime'
    const factory = await resolveFactory()

    if (source === 'factory' && !factory) {
      return c.json(FACTORY_UNAVAILABLE, 503)
    }

    try {
      const data = await enableSkill(
        workspaceRoot,
        id,
        { source, zone: body.zone },
        factory,
      )
      return c.json({ ok: true, data })
    } catch (err) {
      const mapped = mapSkillError(err)
      return c.json(mapped.body, mapped.status)
    }
  })

  api.post('/:id/disable', async c => {
    const id = c.req.param('id')
    try {
      const data = await disableSkill(workspaceRoot, id)
      return c.json({ ok: true, data })
    } catch (err) {
      const mapped = mapSkillError(err)
      return c.json(mapped.body, mapped.status)
    }
  })

  return api
}
