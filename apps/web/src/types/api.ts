// Raw API response shapes — never use these directly in components.
// Always map through a mapper function to a DTO type first.

export interface ApiSessionMeta {
  id: string
  title: string
  created_at?: string
  createdAt?: string
  updated_at?: string
  updatedAt?: string
}

export interface ApiSessionDetail {
  id: string
  title: string
  messages?: ApiChatMessage[]
}

export interface ApiChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
}

export interface ApiOnionResponse {
  layers?: ApiOnionLayer[]
}

export interface ApiOnionLayer {
  id: string
  type: string
  name: string
  enabled: boolean
  priority: number
  config?: Record<string, unknown>
}

export interface ApiLLMSettings {
  provider: string
  model: string
  baseUrl: string
  apiKey: string
}

export interface ApiMemoryResponse {
  config?: ApiMemoryConfig
}

export interface ApiMemoryConfig {
  provider: string
  maxEntries: number
  autoRecall: boolean
}

export interface ApiMemoryEntriesResponse {
  entries?: ApiMemoryEntry[]
}

export interface ApiMemoryEntry {
  id?: string
  type?: string
  content?: string
}

export interface ApiHeadlessSettings {
  autoAllow: boolean
}

export interface ApiPendingResponse {
  pending?: ApiPendingItem[]
}

export interface ApiPendingItem {
  requestId: string
  toolName: string
  input: Record<string, unknown>
  sessionId: string
  message: string
}
