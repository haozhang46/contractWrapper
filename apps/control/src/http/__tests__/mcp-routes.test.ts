import { describe, expect, test, afterAll } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMcpRoutes } from '../routes/mcp.ts'

describe('MCP register/delete API', () => {
  const root = mkdtempSync(join(tmpdir(), 'harness-mcp-'))
  const api = createMcpRoutes(root)

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  test('POST /register adds server to .mcp.json -> 200, { registered: true }', async () => {
    const res = await api.request('http://localhost/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'my-server',
        command: 'bun',
        args: ['run', 'server.ts'],
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toEqual({ name: 'my-server', registered: true })
  })

  test('DELETE /:name removes server -> 200, { removed: true }', async () => {
    // Register first
    await api.request('http://localhost/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'to-remove', command: 'node' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await api.request('http://localhost/to-remove', {
      method: 'DELETE',
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toEqual({ name: 'to-remove', removed: true })
  })

  test('DELETE /:name nonexistent -> 404', async () => {
    const res = await api.request('http://localhost/nope', {
      method: 'DELETE',
    })
    expect(res.status).toBe(404)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toEqual({ error: 'MCP server "nope" not found' })
  })

  test('POST /register duplicate name -> 409', async () => {
    // First registration
    await api.request('http://localhost/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'dup', command: 'node' }),
      headers: { 'Content-Type': 'application/json' },
    })

    // Duplicate
    const res = await api.request('http://localhost/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'dup', command: 'node' }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(409)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toEqual({ error: 'MCP server "dup" already exists' })
  })

  test('POST /register invalid name (contains space) -> 400', async () => {
    const res = await api.request('http://localhost/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'bad name', command: 'node' }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toEqual({ error: 'name must match [a-zA-Z0-9_-]' })
  })
})
