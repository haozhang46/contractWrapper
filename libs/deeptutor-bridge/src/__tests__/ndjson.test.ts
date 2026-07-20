import { describe, expect, test } from 'bun:test'
import { aggregateNdjson } from '../ndjson.ts'

describe('aggregateNdjson', () => {
  test('prefers done event content and session_id', () => {
    const stdout = [
      JSON.stringify({ type: 'content', text: 'partial' }),
      JSON.stringify({
        type: 'done',
        session_id: 's1',
        content: 'final answer',
      }),
    ].join('\n')
    expect(aggregateNdjson(stdout)).toEqual({
      text: 'final answer',
      session_id: 's1',
    })
  })

  test('falls back to concatenating content events', () => {
    const stdout = [
      JSON.stringify({ type: 'content', text: 'Hello ' }),
      JSON.stringify({ type: 'content', text: 'world' }),
    ].join('\n')
    expect(aggregateNdjson(stdout)).toEqual({ text: 'Hello world' })
  })

  test('non-JSON lines are appended as raw fallback text', () => {
    expect(aggregateNdjson('not-json\nstill plain')).toEqual({
      text: 'not-json\nstill plain',
    })
  })
})
