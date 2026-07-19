import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { SkillRegistry, SkillRegistryEntry, SkillSource } from './types.ts'

const REGISTRY_REL = '.harness/skills-registry.json'

export function registryPath(workspaceRoot: string): string {
  return join(workspaceRoot, REGISTRY_REL)
}

export function emptyRegistry(): SkillRegistry {
  return { version: 1, entries: [] }
}

export function loadRegistry(workspaceRoot: string): SkillRegistry {
  const path = registryPath(workspaceRoot)
  if (!existsSync(path)) return emptyRegistry()
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as Partial<SkillRegistry>
    if (raw.version !== 1 || !Array.isArray(raw.entries)) return emptyRegistry()
    return {
      version: 1,
      entries: raw.entries.filter(isRegistryEntry),
    }
  } catch {
    return emptyRegistry()
  }
}

export function saveRegistry(
  workspaceRoot: string,
  registry: SkillRegistry,
): void {
  const path = registryPath(workspaceRoot)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(registry, null, 2), 'utf-8')
}

export function findEntry(
  registry: SkillRegistry,
  id: string,
  source?: SkillSource,
): SkillRegistryEntry | undefined {
  return registry.entries.find(
    (e) => e.id === id && (source === undefined || e.source === source),
  )
}

export function upsertEntry(
  registry: SkillRegistry,
  entry: SkillRegistryEntry,
): SkillRegistry {
  const idx = registry.entries.findIndex(
    (e) => e.id === entry.id && e.source === entry.source,
  )
  const entries = [...registry.entries]
  if (idx >= 0) entries[idx] = entry
  else entries.push(entry)
  return { version: 1, entries }
}

function isRegistryEntry(raw: unknown): raw is SkillRegistryEntry {
  if (!raw || typeof raw !== 'object') return false
  const e = raw as Record<string, unknown>
  return (
    typeof e.id === 'string' &&
    (e.source === 'runtime' || e.source === 'factory') &&
    typeof e.enabled === 'boolean' &&
    typeof e.updatedAt === 'string'
  )
}
