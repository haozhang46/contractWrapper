import { afterEach, describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { createMockSlot } from '@harness/slot'
import { createChatRoutes } from '../../http/routes/chat.ts'
import { setDefaultSlotForTests } from '../factory.ts'

afterEach(() => {
  setDefaultSlotForTests(null)
})

describe('AgentSlot factory swap', () => {
  test('createChatRoutes uses setDefaultSlotForTests without second arg', async () => {
    const mock = createMockSlot([
      { type: 'text-delta', content: 'mock-swap-ok' },
      { type: 'done', messageId: 'm1' },
    ])
    setDefaultSlotForTests(mock)

    const app = new Hono()
    app.route('/api/chat', createChatRoutes('/tmp'))

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
    expect(text).toContain('mock-swap-ok')
    expect(text).toContain('data: [DONE]')
  })
})
