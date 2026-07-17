import type { ChatMessage } from '../types/chat'

export function deriveChatStatus(
  messages: ChatMessage[],
  streaming: boolean,
  opts?: { pendingConfirm?: boolean },
): string | null {
  if (!streaming) return null
  if (opts?.pendingConfirm) {
    return 'Waiting for confirmation — Allow/Deny in the header'
  }

  const last = [...messages].reverse().find(m => m.role === 'assistant')
  const running = last?.toolCalls?.find(
    tc => tc.status === 'running' || tc.status === 'pending',
  )
  if (running) return `Running ${running.toolName}…`
  if (last?.content) return 'Writing…'
  return 'Thinking…'
}
