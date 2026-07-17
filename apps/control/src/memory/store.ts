import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { extname, join } from 'node:path'

export type MemoryType = 'fact' | 'preference' | 'decision' | 'context'

export interface MemoryEntry {
  id: string
  type: MemoryType | string
  content: string
  timestamp: string
  source?: string
}

export interface MemoryConfig {
  provider: string
  maxEntries: number
  autoRecall: boolean
}

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  provider: 'ccb',
  maxEntries: 200,
  autoRecall: true,
}

const MEMORY_DIR = '.harness/memory'
const CONFIG_FILE = '.harness/memory-config.json'

function memoryDir(workspaceRoot: string): string {
  return join(workspaceRoot, MEMORY_DIR)
}

function configPath(workspaceRoot: string): string {
  return join(workspaceRoot, CONFIG_FILE)
}

function ensureMemoryDir(workspaceRoot: string): void {
  const dir = memoryDir(workspaceRoot)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function normalizeEntry(raw: Record<string, unknown>): MemoryEntry | null {
  if (typeof raw.id !== 'string' || typeof raw.content !== 'string') return null
  const timestamp =
    (typeof raw.timestamp === 'string' && raw.timestamp) ||
    (typeof raw.createdAt === 'string' && raw.createdAt) ||
    ''
  return {
    id: raw.id,
    type: typeof raw.type === 'string' ? raw.type : 'fact',
    content: raw.content,
    timestamp,
    source: typeof raw.source === 'string' ? raw.source : undefined,
  }
}

export function loadMemoryConfig(workspaceRoot: string): MemoryConfig {
  const path = configPath(workspaceRoot)
  if (!existsSync(path)) return { ...DEFAULT_MEMORY_CONFIG }
  try {
    return {
      ...DEFAULT_MEMORY_CONFIG,
      ...(JSON.parse(readFileSync(path, 'utf-8')) as Partial<MemoryConfig>),
    }
  } catch {
    return { ...DEFAULT_MEMORY_CONFIG }
  }
}

export function saveMemoryConfig(
  workspaceRoot: string,
  config: MemoryConfig,
): MemoryConfig {
  writeFileSync(configPath(workspaceRoot), JSON.stringify(config, null, 2), 'utf-8')
  return config
}

export function listMemoryEntries(workspaceRoot: string): MemoryEntry[] {
  const dir = memoryDir(workspaceRoot)
  if (!existsSync(dir)) return []

  const entries: MemoryEntry[] = []
  for (const file of readdirSync(dir)) {
    if (extname(file) !== '.json') continue
    try {
      const raw = JSON.parse(
        readFileSync(join(dir, file), 'utf-8'),
      ) as Record<string, unknown>
      const entry = normalizeEntry(raw)
      if (entry) entries.push(entry)
    } catch {
      // skip corrupt
    }
  }

  return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

export function storeMemoryEntry(
  workspaceRoot: string,
  input: { type: string; content: string; source?: string },
): MemoryEntry {
  ensureMemoryDir(workspaceRoot)
  const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const entry: MemoryEntry = {
    id,
    type: input.type,
    content: input.content,
    timestamp: new Date().toISOString(),
    source: input.source,
  }
  writeFileSync(
    join(memoryDir(workspaceRoot), `${id}.json`),
    JSON.stringify(entry, null, 2),
    'utf-8',
  )
  return entry
}

export function deleteMemoryEntry(
  workspaceRoot: string,
  id: string,
): boolean {
  const path = join(memoryDir(workspaceRoot), `${id}.json`)
  if (!existsSync(path)) return false
  unlinkSync(path)
  return true
}
