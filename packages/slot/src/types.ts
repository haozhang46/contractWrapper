export interface ToolCallEvent {
  id: string
  toolName: string
  input: Record<string, unknown>
  output?: string
  status: 'pending' | 'running' | 'complete' | 'error'
}

export type SlotEvent =
  | { type: 'text-delta'; content: string }
  | { type: 'tool-call'; toolCall: ToolCallEvent }
  | { type: 'tool-result'; toolCallId: string; output: string }
  | { type: 'done'; messageId: string }
  | { type: 'error'; message: string }

export interface SlotSessionConfig {
  workspaceRoot: string
  model?: string
  provider?: string
  systemPrompt?: string
}

export interface AgentSlot {
  initSession(config: SlotSessionConfig): Promise<void>
  getSession(): SlotSessionConfig | null
  sendMessageWithHistory(
    messages: Array<{ role: string; content: string }>,
    onEvent: (event: SlotEvent) => void,
    signal?: AbortSignal,
  ): Promise<void>
  abort(): void
}
