import type { ApiSessionMeta, ApiSessionDetail, ApiChatMessage } from '../types/api'

// --- DTO types (UI-ready) ---

export interface SessionMetaDTO {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface SessionDetailDTO {
  id: string
  messages: Array<{ role: 'user' | 'assistant' | 'system' | 'tool'; content: string }>
}

// --- Mappers ---

export function toSessionMeta(raw: ApiSessionMeta): SessionMetaDTO {
  return {
    id: raw.id,
    title: raw.title,
    createdAt: raw.createdAt ?? raw.created_at ?? new Date().toISOString(),
    updatedAt: raw.updatedAt ?? raw.updated_at ?? new Date().toISOString(),
  }
}

export function toSessionMetaList(raw: unknown): SessionMetaDTO[] {
  const list = Array.isArray(raw) ? raw : []
  return list.map(toSessionMeta)
}

export function toSessionDetail(raw: ApiSessionDetail): SessionDetailDTO {
  return {
    id: raw.id,
    messages: (raw.messages ?? []).map(m => ({
      role: m.role,
      content: m.content,
    })),
  }
}
