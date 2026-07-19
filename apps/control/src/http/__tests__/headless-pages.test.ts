// apps/control/src/http/__tests__/headless-pages.test.ts
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { join } from 'path'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync } from 'fs'
import { tmpdir } from 'os'

const headlessMcpPath = join(import.meta.dirname, '../../../../../libs/harness-headless-connect/src/mcp-server.ts')

describe('headless pages API', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'hpl-test-'))
  beforeAll(() => {
    if (!existsSync(headlessMcpPath)) return
    mkdirSync(join(tmp, '.harness'), { recursive: true })
    writeFileSync(join(tmp, '.mcp.json'), JSON.stringify({
      mcpServers: {
        'harness-headless': { command: 'bun', args: ['run', headlessMcpPath] },
      },
    }, null, 2))
  })
  afterAll(() => { rmSync(tmp, { recursive: true, force: true }) })

  test('GET /api/headless/pages returns page list', async () => {
    if (!existsSync(headlessMcpPath)) return
    const { createApp } = await import('../app.ts')
    const res = await createApp({ workspaceRoot: tmp }).request('/api/headless/pages')
    expect(res.status).toBe(200)
    const body = await res.json() as Array<{ id: string; description: string; pageid: string }>
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThan(0)
    expect(body[0]).toHaveProperty('id')
    expect(body[0]).toHaveProperty('description')
  })

  test('GET /api/headless/pages/:id/schema returns form schema', async () => {
    if (!existsSync(headlessMcpPath)) return
    const { createApp } = await import('../app.ts')
    const res = await createApp({ workspaceRoot: tmp }).request('/api/headless/pages/hello-world/schema')
    expect(res.status).toBe(200)
    const body = await res.json() as { form: unknown[]; request: { method: string; url: string } }
    expect(body).toHaveProperty('form')     // FIXED: data.schema returns { form, request } directly
    expect(body).toHaveProperty('request')   // FIXED
  })

  test('POST /api/headless/pages/:id/execute submits form', async () => {
    if (!existsSync(headlessMcpPath)) return
    const { createApp } = await import('../app.ts')
    const res = await createApp({ workspaceRoot: tmp }).request('/api/headless/pages/hello-world/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ formData: { name: 'Test', greeting: 'hello', count: 1 } }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { status: string }
    expect(body.status).toBe('simulated')
  })

  test('GET unknown page returns 404', async () => {
    if (!existsSync(headlessMcpPath)) return
    const { createApp } = await import('../app.ts')
    const res = await createApp({ workspaceRoot: tmp }).request('/api/headless/pages/nonexist/schema')
    expect(res.status).toBe(404)
  })

  test('returns empty array when no headless MCP', async () => {
    const emptyTmp = mkdtempSync(join(tmpdir(), 'hpl-empty-'))
    writeFileSync(join(emptyTmp, '.mcp.json'), JSON.stringify({ mcpServers: {} }))
    try {
      const { createApp } = await import('../app.ts')
      const res = await createApp({ workspaceRoot: emptyTmp }).request('/api/headless/pages')
      expect(res.status).toBe(200)
      const body = await res.json() as unknown[]
      expect(body).toEqual([])
    } finally { rmSync(emptyTmp, { recursive: true, force: true }) }
  })
})
