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

export interface ApiToolCall {
  id: string
  toolName: string
  input: Record<string, unknown>
  output?: string
  status: 'pending' | 'running' | 'complete' | 'error'
}

export interface ApiChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  toolCalls?: ApiToolCall[]
}

export interface ApiOnionResponse {
  layers?: ApiOnionLayer[]
}

export interface ApiOnionsListResponse {
  onions?: ApiOnionListItem[]
}

export interface ApiOnionListItem {
  id: string
  name: string
  layerCount: number
  isDefault: boolean
}

export interface ApiNamedOnion {
  version?: number
  id: string
  name: string
  layers?: ApiOnionLayer[]
  error?: string
}

export interface ApiOnionLayer {
  id: string
  name: string
  enabled: boolean
  priority: number
  kind?: 'builtin' | 'js'
  type?: string
  config?: Record<string, unknown>
  source?: string
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
