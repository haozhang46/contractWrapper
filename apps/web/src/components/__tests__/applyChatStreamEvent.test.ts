import { describe, expect, test } from 'bun:test'
import type { ChatMessage } from '../../types/chat'
import {
  applyChatStreamEvent,
  finalizeChatStream,
} from '../applyChatStreamEvent'

function assistant(content: string): ChatMessage {
  return {
    id: 'a1',
    role: 'assistant',
    content,
    timestamp: '2026-01-01T00:00:00.000Z',
    status: 'streaming',
    toolCalls: [],
  }
}

describe('applyChatStreamEvent', () => {
  test('appends text-delta without mutating previous messages', () => {
    const prev = [assistant('')]
    const next = applyChatStreamEvent(prev, {
      type: 'text-delta',
      content: '你',
    })
    expect(next[0]?.content).toBe('你')
    expect(prev[0]?.content).toBe('')
  })

  test('StrictMode double-invoke appends delta only once', () => {
    const prev = [assistant('')]
    const event = { type: 'text-delta', content: '你' }

    // React Strict Mode calls the updater twice with the same prev and
    // keeps the second result. A pure updater must not double-append.
    const first = applyChatStreamEvent(prev, event)
    const second = applyChatStreamEvent(prev, event)

    expect(first[0]?.content).toBe('你')
    expect(second[0]?.content).toBe('你')
    expect(prev[0]?.content).toBe('')
  })

  test('appends tool-call immutably', () => {
    const prev = [assistant('hi')]
    const toolCall = {
      id: 't1',
      toolName: 'Bash',
      input: {},
      status: 'running' as const,
    }
    const next = applyChatStreamEvent(prev, { type: 'tool-call', toolCall })
    expect(next[0]?.toolCalls).toEqual([toolCall])
    expect(prev[0]?.toolCalls).toEqual([])
  })

  test('upserts tool-call by id instead of duplicating', () => {
    const prev = [
      {
        ...assistant('hi'),
        toolCalls: [
          {
            id: 't1',
            toolName: 'Bash',
            input: {},
            status: 'running' as const,
          },
        ],
      },
    ]
    const next = applyChatStreamEvent(prev, {
      type: 'tool-call',
      toolCall: {
        id: 't1',
        toolName: 'Bash',
        input: {},
        output: 'done',
        status: 'complete',
      },
    })
    expect(next[0]?.toolCalls).toHaveLength(1)
    expect(next[0]?.toolCalls?.[0]?.status).toBe('complete')
    expect(next[0]?.toolCalls?.[0]?.output).toBe('done')
  })

  test('marks error without mutating previous messages', () => {
    const prev = [assistant('partial')]
    const next = applyChatStreamEvent(prev, {
      type: 'error',
      message: 'boom',
    })
    expect(next[0]?.status).toBe('error')
    expect(next[0]?.content).toContain('[Error: boom]')
    expect(prev[0]?.status).toBe('streaming')
    expect(prev[0]?.content).toBe('partial')
  })
})

describe('finalizeChatStream', () => {
  test('marks complete when stream received [DONE]', () => {
    const prev = [assistant('hello')]
    const next = finalizeChatStream(prev, {
      receivedDone: true,
      aborted: false,
    })
    expect(next[0]?.status).toBe('complete')
    expect(next[0]?.content).toBe('hello')
  })

  test('marks interrupted when stream ends without [DONE]', () => {
    const prev = [assistant('partial')]
    const next = finalizeChatStream(prev, {
      receivedDone: false,
      aborted: false,
    })
    expect(next[0]?.status).toBe('error')
    expect(next[0]?.content).toContain('partial')
    expect(next[0]?.content).toContain('连接中断')
    expect(prev[0]?.status).toBe('streaming')
    expect(prev[0]?.content).toBe('partial')
  })

  test('shows interrupt notice when empty stream drops', () => {
    const prev = [assistant('')]
    const next = finalizeChatStream(prev, {
      receivedDone: false,
      aborted: false,
    })
    expect(next[0]?.status).toBe('error')
    expect(next[0]?.content).toContain('连接中断')
  })

  test('user abort keeps stopped placeholder without interrupt notice', () => {
    const prev = [assistant('')]
    const next = finalizeChatStream(prev, {
      receivedDone: false,
      aborted: true,
    })
    expect(next[0]?.status).toBe('complete')
    expect(next[0]?.content).toBe('(stopped)')
    expect(next[0]?.content).not.toContain('连接中断')
  })
})
