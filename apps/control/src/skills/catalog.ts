import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { FactoryTools, SkillSource, SkillZone } from './types.ts'

export const RUNTIME_SKILLS_REL = '.harness/skills'
export const INSTALL_SKILLS_REL = '.claude/skills'

export type CatalogEntry = {
  id: string
  source: SkillSource
  zone?: SkillZone
  skillMdPath: string
  skillMd: string
  description: string
}

export function runtimeSkillsDir(workspaceRoot: string): string {
  return join(workspaceRoot, RUNTIME_SKILLS_REL)
}

export function installSkillsDir(workspaceRoot: string): string {
  return join(workspaceRoot, INSTALL_SKILLS_REL)
}

export function installSkillMdPath(workspaceRoot: string, id: string): string {
  return join(installSkillsDir(workspaceRoot), id, 'SKILL.md')
}

export function isInstalled(workspaceRoot: string, id: string): boolean {
  return existsSync(installSkillMdPath(workspaceRoot, id))
}

export function parseSkillDescription(skillMd: string): string {
  const frontmatter = extractFrontmatter(skillMd)
  if (frontmatter) {
    const desc = frontmatter.description
    if (typeof desc === 'string' && desc.trim()) return desc.trim()
  }

  const body = frontmatter
    ? skillMd.slice(skillMd.indexOf('---', 3) + 3)
    : skillMd
  for (const line of body.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const plain = trimmed.replace(/^#+\s*/, '').trim()
    if (!plain) continue
    return plain.length > 200 ? plain.slice(0, 200) : plain
  }
  return ''
}

export function listRuntimeCatalog(workspaceRoot: string): CatalogEntry[] {
  const root = runtimeSkillsDir(workspaceRoot)
  if (!existsSync(root)) return []

  const entries: CatalogEntry[] = []
  for (const name of readdirSync(root)) {
    const dir = join(root, name)
    try {
      if (!statSync(dir).isDirectory()) continue
    } catch {
      continue
    }
    const skillMdPath = join(dir, 'SKILL.md')
    if (!existsSync(skillMdPath)) continue
    try {
      const skillMd = readFileSync(skillMdPath, 'utf-8')
      entries.push({
        id: name,
        source: 'runtime',
        skillMdPath,
        skillMd,
        description: parseSkillDescription(skillMd),
      })
    } catch {
      // skip unreadable
    }
  }
  return entries
}

export function listFactoryCatalog(factory: FactoryTools): CatalogEntry[] {
  try {
    const listed = factory.skillList(factory.assetsRoot)
    const entries: CatalogEntry[] = []
    for (const item of listed) {
      try {
        const got = factory.skillGet(factory.assetsRoot, item.id, item.zone)
        entries.push({
          id: got.id,
          source: 'factory',
          zone: got.zone,
          skillMdPath: join(factory.assetsRoot, got.zone, got.id, 'SKILL.md'),
          skillMd: got.skillMd,
          description: parseSkillDescription(got.skillMd),
        })
      } catch {
        // skip individual factory skill failures
      }
    }
    return entries
  } catch {
    return []
  }
}

function extractFrontmatter(
  skillMd: string,
): Record<string, string> | null {
  if (!skillMd.startsWith('---\n') && !skillMd.startsWith('---\r\n')) {
    return null
  }
  const end = skillMd.indexOf('\n---', 3)
  if (end < 0) return null
  const block = skillMd.slice(4, end).replace(/^\r/, '')
  const result: Record<string, string> = {}
  for (const line of block.split('\n')) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.trim())
    if (!match) continue
    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    result[match[1]] = value
  }
  return result
}
