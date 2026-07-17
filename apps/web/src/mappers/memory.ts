import type { ApiMemoryConfig, ApiMemoryEntry } from '../types/api'

export interface MemoryConfigDTO {
  provider: string
  maxEntries: number
  autoRecall: boolean
}

export interface MemoryEntryDTO {
  id?: string
  type?: string
  content?: string
}

export const MEMORY_CONFIG_DEFAULT: MemoryConfigDTO = {
  provider: 'ccb',
  maxEntries: 200,
  autoRecall: true,
}

export function toMemoryConfig(raw: ApiMemoryConfig): MemoryConfigDTO {
  return {
    provider: raw.provider,
    maxEntries: raw.maxEntries,
    autoRecall: raw.autoRecall,
  }
}

export function toMemoryEntry(raw: ApiMemoryEntry): MemoryEntryDTO {
  return {
    id: raw.id,
    type: raw.type,
    content: raw.content,
  }
}

export function toMemoryEntryList(raw: unknown): MemoryEntryDTO[] {
  const list = Array.isArray(raw) ? raw : []
  return list.map(toMemoryEntry)
}
