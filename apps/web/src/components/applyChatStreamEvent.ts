import type { ChatMessage, ToolCallEvent } from '../types/chat'

export type ChatStreamEvent = {
  type: string
  content?: string
  message?: string
  toolCall?: ToolCallEvent
}

/**
 * Pure reducer for SSE chat events. Must not mutate `messages` — React
 * StrictMode double-invokes setState updaters in development; in-place
 * `content +=` would append each delta twice (字符翻倍).
 */
export function applyChatStreamEvent(
  messages: ChatMessage[],
  event: ChatStreamEvent,
): ChatMessage[] {
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'assistant') return messages

  if (event.type === 'text-delta' && event.content) {
    return [
      ...messages.slice(0, -1),
      { ...last, content: last.content + event.content },
    ]
  }

  if (event.type === 'tool-call' && event.toolCall) {
    const existing = last.toolCalls ?? []
    const idx = existing.findIndex(tc => tc.id === event.toolCall!.id)
    const toolCalls =
      idx >= 0
        ? existing.map((tc, i) => (i === idx ? event.toolCall! : tc))
        : [...existing, event.toolCall]
    return [
      ...messages.slice(0, -1),
      {
        ...last,
        toolCalls,
      },
    ]
  }

  if (event.type === 'error') {
    return [
      ...messages.slice(0, -1),
      {
        ...last,
        content: `${last.content}\n\n[Error: ${event.message ?? 'unknown'}]`,
        status: 'error',
      },
    ]
  }

  return messages
}

export function markAssistantComplete(messages: ChatMessage[]): ChatMessage[] {
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'assistant') return messages
  return [...messages.slice(0, -1), { ...last, status: 'complete' }]
}

const STREAM_INTERRUPT_NOTICE =
  '⚠️ 连接中断（服务可能已重启），请重发或刷新后继续'

/**
 * Finalize an in-flight assistant turn after the SSE reader exits.
 * Distinguishes clean [DONE], user abort, and silent drop (e.g. control --watch restart).
 */
export function finalizeChatStream(
  messages: ChatMessage[],
  opts: { receivedDone: boolean; aborted: boolean },
): ChatMessage[] {
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'assistant') return messages

  if (opts.aborted) {
    return [
      ...messages.slice(0, -1),
      {
        ...last,
        status: 'complete',
        content: last.content || '(stopped)',
      },
    ]
  }

  if (opts.receivedDone) {
    return markAssistantComplete(messages)
  }

  return [
    ...messages.slice(0, -1),
    {
      ...last,
      status: 'error',
      content: last.content
        ? `${last.content}\n\n${STREAM_INTERRUPT_NOTICE}`
        : STREAM_INTERRUPT_NOTICE,
    },
  ]
}
