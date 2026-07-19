import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  installSkillMdPath,
  isInstalled,
  listFactoryCatalog,
  listRuntimeCatalog,
  parseSkillDescription,
  runtimeSkillsDir,
  type CatalogEntry,
} from './catalog.ts'
import {
  findEntry,
  loadRegistry,
  saveRegistry,
  upsertEntry,
} from './registry.ts'
import { copySkillDir, removeInstalledSkill, writeInstalledSkillMd } from './sync.ts'
import {
  SkillConflictError,
  SkillNotFoundError,
  type FactoryTools,
  type SkillDetail,
  type SkillListItem,
  type SkillSource,
  type SkillZone,
} from './types.ts'

export {
  SkillConflictError,
  SkillNotFoundError,
} from './types.ts'

export type ListSkillsOpts = {
  enabledOnly?: boolean
  factory?: FactoryTools | null
}

export async function listSkills(
  workspaceRoot: string,
  opts: ListSkillsOpts = {},
): Promise<SkillListItem[]> {
  const catalog = collectCatalog(workspaceRoot, opts.factory ?? null)
  const registry = loadRegistry(workspaceRoot)
  const items = catalog.map((entry) => toListItem(workspaceRoot, entry, registry))

  if (opts.enabledOnly) {
    return items.filter((item) => item.enabled && item.installed)
  }
  return items
}

export type GetSkillOpts = {
  source?: SkillSource
  zone?: SkillZone
}

export async function getSkill(
  workspaceRoot: string,
  id: string,
  factory?: FactoryTools | null,
  opts?: GetSkillOpts,
): Promise<SkillDetail> {
  const catalog = collectCatalog(workspaceRoot, factory ?? null)
  const entry = catalog.find((e) => {
    if (e.id !== id) return false
    if (opts?.source && e.source !== opts.source) return false
    if (opts?.zone != null && e.zone !== opts.zone) return false
    return true
  })
  if (!entry) throw new SkillNotFoundError(id)

  const registry = loadRegistry(workspaceRoot)
  const item = toListItem(workspaceRoot, entry, registry)
  const installedPath = installSkillMdPath(workspaceRoot, id)
  // Installed copy is shared by id; only prefer it when it matches the selected
  // catalog entry's source (runtime default / enabled source).
  const reg = registry.entries.find(
    (e) => e.id === id && e.enabled && e.source === entry.source,
  )
  const skillMd =
    reg && existsSync(installedPath)
      ? readFileSync(installedPath, 'utf-8')
      : entry.skillMd

  return {
    ...item,
    skillMd,
    description: parseSkillDescription(skillMd) || item.description,
  }
}

export async function enableSkill(
  workspaceRoot: string,
  id: string,
  opts: { source: SkillSource; zone?: SkillZone },
  factory?: FactoryTools | null,
): Promise<SkillListItem> {
  const zone: SkillZone | undefined =
    opts.source === 'factory' ? (opts.zone ?? 'published') : opts.zone

  const registry = loadRegistry(workspaceRoot)
  const conflicting = registry.entries.find(
    (e) => e.id === id && e.enabled && e.source !== opts.source,
  )
  if (conflicting) {
    throw new SkillConflictError(
      `Skill "${id}" is already enabled from source "${conflicting.source}"`,
    )
  }

  if (opts.source === 'runtime') {
    const sourceDir = join(runtimeSkillsDir(workspaceRoot), id)
    const skillMdPath = join(sourceDir, 'SKILL.md')
    if (!existsSync(skillMdPath)) throw new SkillNotFoundError(id)
    copySkillDir(sourceDir, join(workspaceRoot, '.claude', 'skills', id))
  } else {
    if (!factory) throw new SkillNotFoundError(id)
    let skillMd: string
    try {
      const got = factory.skillGet(factory.assetsRoot, id, zone)
      skillMd = got.skillMd
    } catch {
      throw new SkillNotFoundError(id)
    }
    const assetsDir = join(factory.assetsRoot, zone ?? 'published', id)
    if (existsSync(join(assetsDir, 'SKILL.md'))) {
      copySkillDir(assetsDir, join(workspaceRoot, '.claude', 'skills', id))
    } else {
      writeInstalledSkillMd(workspaceRoot, id, skillMd)
    }
  }

  const updated = upsertEntry(registry, {
    id,
    source: opts.source,
    zone,
    enabled: true,
    updatedAt: new Date().toISOString(),
  })
  saveRegistry(workspaceRoot, updated)

  const items = await listSkills(workspaceRoot, { factory: factory ?? null })
  const item = items.find((s) => s.id === id && s.source === opts.source)
  if (!item) throw new SkillNotFoundError(id)
  return item
}

export async function disableSkill(
  workspaceRoot: string,
  id: string,
): Promise<SkillListItem> {
  const registry = loadRegistry(workspaceRoot)
  const entry = findEntry(registry, id)
  const source: SkillSource = entry?.source ?? 'runtime'
  const zone = entry?.zone

  removeInstalledSkill(workspaceRoot, id)

  const now = new Date().toISOString()
  const hasEntries = registry.entries.some((e) => e.id === id)
  const updated = hasEntries
    ? {
        version: 1 as const,
        entries: registry.entries.map((e) =>
          e.id === id ? { ...e, enabled: false, updatedAt: now } : e,
        ),
      }
    : upsertEntry(registry, {
        id,
        source,
        zone,
        enabled: false,
        updatedAt: now,
      })
  saveRegistry(workspaceRoot, updated)

  // Prefer returning list item from catalog when still present
  const items = await listSkills(workspaceRoot, { factory: null })
  const item = items.find((s) => s.id === id)
  if (item) {
    return { ...item, enabled: false, installed: false }
  }

  return {
    id,
    name: id,
    description: '',
    source,
    zone,
    enabled: false,
    installed: false,
  }
}

function collectCatalog(
  workspaceRoot: string,
  factory: FactoryTools | null,
): CatalogEntry[] {
  const runtime = listRuntimeCatalog(workspaceRoot)
  if (!factory) return runtime
  return [...runtime, ...listFactoryCatalog(factory)]
}

function toListItem(
  workspaceRoot: string,
  entry: CatalogEntry,
  registry: ReturnType<typeof loadRegistry>,
): SkillListItem {
  const reg = registry.entries.find(
    (e) => e.id === entry.id && e.source === entry.source,
  )
  return {
    id: entry.id,
    name: entry.id,
    description: entry.description,
    source: entry.source,
    zone: entry.zone,
    enabled: reg?.enabled ?? false,
    installed: isInstalled(workspaceRoot, entry.id),
  }
}
