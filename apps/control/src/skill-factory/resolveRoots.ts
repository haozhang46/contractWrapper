import { existsSync } from 'node:fs'
import { join } from 'node:path'

export function resolveSkillFactoryRoots(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): { factoryRoot: string; assetsRoot: string } | null {
  const factoryRoot =
    env.SKILL_FACTORY_ROOT?.trim() || join(workspaceRoot, 'skill-factory')
  const toolsPath = join(factoryRoot, 'mcp/src/tools.ts')
  if (!existsSync(toolsPath)) return null
  const assetsRoot = join(factoryRoot, 'skill-assets')
  return { factoryRoot, assetsRoot }
}
