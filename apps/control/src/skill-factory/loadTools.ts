import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export type SkillZone = 'staging' | 'published'

export type SkillFactoryTools = {
  skillList: (assetsRoot: string) => Array<{ id: string; zone: SkillZone }>
  skillGet: (
    assetsRoot: string,
    id: string,
    zone?: SkillZone,
  ) => { id: string; zone: SkillZone; skillMd: string }
  skillGenerate: (
    assetsRoot: string,
    input: { id: string; description: string },
  ) => { id: string; zone: 'staging'; paths: string[] }
  casesGenerate: (
    assetsRoot: string,
    input: { skillId: string; note: string },
  ) => { path: string }
  rubricGenerate: (
    assetsRoot: string,
    input: { skillId: string },
  ) => { path: string }
  evalRun: (
    factoryRoot: string,
    assetsRoot: string,
    input: { skillId: string; zone?: SkillZone },
  ) => { reportPath: string; report: unknown }
  evalReportGet: (
    factoryRoot: string,
    input: { reportPath: string },
  ) => unknown
  evalDiff: (
    factoryRoot: string,
    input: { reportPathA: string; reportPathB: string },
  ) => unknown
  evalLowScoreCluster: (
    factoryRoot: string,
    input: { reportPath: string },
  ) => unknown
  skillOptimizeSuggest: (
    factoryRoot: string,
    input: { reportPath: string },
  ) => unknown
  auditLog: (factoryRoot: string, entry: Record<string, unknown>) => void
  FrozenPathError: new (path: string) => Error & { code: 'FROZEN_PATH' }
}

export async function loadSkillFactoryTools(
  factoryRoot: string,
): Promise<SkillFactoryTools> {
  const toolsUrl = pathToFileURL(join(factoryRoot, 'mcp/src/tools.ts')).href
  const pathsUrl = pathToFileURL(join(factoryRoot, 'mcp/src/paths.ts')).href
  const auditUrl = pathToFileURL(join(factoryRoot, 'mcp/src/audit.ts')).href

  const [toolsMod, pathsMod, auditMod] = await Promise.all([
    import(toolsUrl),
    import(pathsUrl),
    import(auditUrl),
  ])

  return {
    skillList: toolsMod.skillList,
    skillGet: toolsMod.skillGet,
    skillGenerate: toolsMod.skillGenerate,
    casesGenerate: toolsMod.casesGenerate,
    rubricGenerate: toolsMod.rubricGenerate,
    evalRun: toolsMod.evalRun,
    evalReportGet: toolsMod.evalReportGet,
    evalDiff: toolsMod.evalDiff,
    evalLowScoreCluster: toolsMod.evalLowScoreCluster,
    skillOptimizeSuggest: toolsMod.skillOptimizeSuggest,
    auditLog: auditMod.auditLog,
    FrozenPathError: pathsMod.FrozenPathError,
  }
}
