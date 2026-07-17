import { describe, expect, test, beforeAll } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../app.ts'
import { initHarnessDir } from '../../bootstrap/init.ts'

describe('/api/chat-sessions', () => {
  const root = mkdtempSync(join(tmpdir(), 'harness-chat-'))

  beforeAll(() => {
    initHarnessDir(root)
  })

  test('GET lists empty sessions initially', async () => {
    const app = createApp({ workspaceRoot: root })
    const res = await app.request('http://localhost/api/chat-sessions')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sessions).toEqual([])
  })

  test('PUT creates session; GET by id returns messages; DELETE removes it', async () => {
    const app = createApp({ workspaceRoot: root })
    const id = 'chat_test_1'
    const messages = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ]

    const putRes = await app.request('http://localhost/api/chat-sessions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title: 'hello', messages }),
    })
    expect(putRes.status).toBe(200)

    const listRes = await app.request('http://localhost/api/chat-sessions')
    const listBody = await listRes.json()
    expect(listBody.sessions).toHaveLength(1)
    expect(listBody.sessions[0]).toMatchObject({
      id,
      title: 'hello',
    })
    expect(listBody.sessions[0].createdAt).toBeTruthy()
    expect(listBody.sessions[0].updatedAt).toBeTruthy()

    const getRes = await app.request(
      `http://localhost/api/chat-sessions/${id}`,
    )
    expect(getRes.status).toBe(200)
    const getBody = await getRes.json()
    expect(getBody.messages).toEqual(messages)

    const delRes = await app.request(
      `http://localhost/api/chat-sessions/${id}`,
      { method: 'DELETE' },
    )
    expect(delRes.status).toBe(200)

    const listAfter = await app.request('http://localhost/api/chat-sessions')
    expect((await listAfter.json()).sessions).toEqual([])
  })

  test('PUT persists toolCalls on assistant messages', async () => {
    const app = createApp({ workspaceRoot: root })
    const id = 'chat_tools_1'
    const messages = [
      { role: 'user', content: 'search something' },
      {
        role: 'assistant',
        content: 'here you go',
        toolCalls: [
          {
            id: 'tc1',
            toolName: 'WebSearch',
            input: { query: 'something' },
            output: 'results…',
            status: 'complete',
          },
        ],
      },
    ]

    const putRes = await app.request('http://localhost/api/chat-sessions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title: 'tools', messages }),
    })
    expect(putRes.status).toBe(200)

    const getRes = await app.request(
      `http://localhost/api/chat-sessions/${id}`,
    )
    expect(getRes.status).toBe(200)
    const getBody = await getRes.json()
    expect(getBody.messages).toEqual(messages)
  })

  test('GET unknown id returns 404', async () => {
    const app = createApp({ workspaceRoot: root })
    const res = await app.request(
      'http://localhost/api/chat-sessions/missing',
    )
    expect(res.status).toBe(404)
  })
})
