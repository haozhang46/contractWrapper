import { describe, expect, test } from 'bun:test'
import type { ChatMessage } from '../../types/chat'
import { deriveChatStatus } from '../deriveChatStatus'

function assistant(
  content: string,
  toolCalls: ChatMessage['toolCalls'] = [],
): ChatMessage {
  return {
    id: 'a1',
    role: 'assistant',
    content,
    timestamp: '2026-01-01T00:00:00.000Z',
    status: 'streaming',
    toolCalls,
  }
}

describe('deriveChatStatus', () => {
  test('idle when not streaming', () => {
    expect(deriveChatStatus([assistant('hi')], false)).toBeNull()
  })

  test('thinking before any content or tools', () => {
    expect(deriveChatStatus([assistant('')], true)).toBe('Thinking…')
  })

  test('writing when assistant has text and no running tools', () => {
    expect(deriveChatStatus([assistant('hello')], true)).toBe('Writing…')
  })

  test('running tool name when a tool is in progress', () => {
    expect(
      deriveChatStatus(
        [
          assistant('looking up weather', [
            {
              id: 't1',
              toolName: 'WebSearch',
              input: {},
              status: 'running',
            },
          ]),
        ],
        true,
      ),
    ).toBe('Running WebSearch…')
  })

  test('waiting for confirmation when pendingConfirm', () => {
    expect(
      deriveChatStatus([assistant('need access')], true, {
        pendingConfirm: true,
      }),
    ).toBe('Waiting for confirmation — Allow/Deny in the header')
  })
})
