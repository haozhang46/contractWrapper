export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  timestamp: string
  status?: 'pending' | 'streaming' | 'complete' | 'error'
  toolCalls?: ToolCallEvent[]
}

export interface ToolCallEvent {
  id: string
  toolName: string
  input: Record<string, unknown>
  output?: string
  status: 'pending' | 'running' | 'complete' | 'error'
}
