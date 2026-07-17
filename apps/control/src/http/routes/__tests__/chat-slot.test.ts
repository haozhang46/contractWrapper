import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { createChatRoutes } from '../chat.ts'
import type { AgentSlot, SlotEvent } from '@harness/slot'

function mockSlot(events: SlotEvent[]): AgentSlot {
  return {
    async initSession() {},
    getSession: () => ({ workspaceRoot: '/tmp' }),
    abort() {},
    async sendMessageWithHistory(_m, onEvent) {
      for (const e of events) onEvent(e)
    },
  }
}

describe('POST /api/chat via AgentSlot', () => {
  test('streams SlotEvents as SSE and does not call LLM directly', async () => {
    const slot = mockSlot([
      { type: 'text-delta', content: 'hello' },
      { type: 'done', messageId: 'm1' },
    ])
    const app = new Hono()
    app.route('/api/chat', createChatRoutes('/tmp', slot))
    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('"type":"text-delta"')
    expect(text).toContain('hello')
    expect(text).toContain('data: [DONE]')
  })

  test('slot error becomes SSE error', async () => {
    const slot = mockSlot([{ type: 'error', message: 'Agent Slot / CCB 不可用' }])
    const app = new Hono()
    app.route('/api/chat', createChatRoutes('/tmp', slot))
    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })
    const text = await res.text()
    expect(text).toContain('Agent Slot / CCB 不可用')
  })
})
