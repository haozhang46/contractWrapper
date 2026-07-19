import { Hono } from 'hono'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'

const MCP_CONFIG_FILE = '.mcp.json'

interface McpConfigFile {
  mcpServers: Record<string, { command: string; args?: string[]; env?: Record<string, string> }>
}

function readMcpConfig(workspaceRoot: string): McpConfigFile {
  const filePath = join(workspaceRoot, MCP_CONFIG_FILE)
  if (!existsSync(filePath)) {
    return { mcpServers: {} }
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as McpConfigFile
  } catch {
    return { mcpServers: {} }
  }
}

function findHeadlessMcpServer(config: McpConfigFile): { command: string; args: string[]; env: Record<string, string> } | null {
  for (const [, server] of Object.entries(config.mcpServers)) {
    const cmd = [server.command, ...(server.args ?? [])].join(' ').toLowerCase()
    if (cmd.includes('harness-headless') || cmd.includes('headless-connect')) {
      return { command: server.command, args: server.args ?? [], env: server.env ?? {} }
    }
  }
  return null
}

async function callHeadlessTool<T>(
  serverInfo: { command: string; args: string[] },
  toolName: string,
  toolArgs?: Record<string, unknown>,
): Promise<T> {
  const transport = new StdioClientTransport({ command: serverInfo.command, args: serverInfo.args })
  const client = new Client(
    { name: 'harness-control-headless', version: '0.1.0' },
    { capabilities: {} },
  )
  try {
    await client.connect(transport)
    const result = await client.request(
      { method: 'tools/call', params: { name: toolName, arguments: toolArgs ?? {} } },
      CallToolResultSchema,
    )
    return result as T
  } finally {
    await client.close()
  }
}

export function createHeadlessPagesRoutes(workspaceRoot: string): Hono {
  const api = new Hono()

  api.get('/pages', async c => {
    const server = findHeadlessMcpServer(readMcpConfig(workspaceRoot))
    if (!server) return c.json([])
    try {
      const result = await callHeadlessTool<{ content: Array<{ type: string; text: string }> }>(
        server,
        'pages_list',
      )
      const text = result.content?.[0]?.text
      return c.json(text ? JSON.parse(text) : [])
    } catch (err) {
      return c.json({ error: String(err) }, 502)
    }
  })

  api.get('/pages/:id/schema', async c => {
    const { id } = c.req.param()
    const server = findHeadlessMcpServer(readMcpConfig(workspaceRoot))
    if (!server) return c.json({ error: 'No headless MCP server' }, 404)
    try {
      const result = await callHeadlessTool<{
        content: Array<{ type: string; text: string }>
        isError?: boolean
      }>(server, 'page_schema', { pageId: id })
      const text = result.content?.[0]?.text
      if (!text || result.isError) return c.json({ error: 'Page not found' }, 404)
      const data = JSON.parse(text) // { id, pageid, description, schema: { form, request } }
      return c.json(data.schema) // returns { form, request } directly
    } catch (err) {
      return c.json({ error: String(err) }, 502)
    }
  })

  api.post('/pages/:id/execute', async c => {
    const { id } = c.req.param()
    const { formData } = await c.req.json<{ formData?: Record<string, unknown> }>()
    const server = findHeadlessMcpServer(readMcpConfig(workspaceRoot))
    if (!server) return c.json({ error: 'No headless MCP server' }, 404)
    try {
      const result = await callHeadlessTool<{ content: Array<{ type: string; text: string }> }>(
        server,
        'page_execute',
        { pageId: id, formData: formData ?? {} },
      )
      const text = result.content?.[0]?.text
      if (!text) return c.json({ error: 'Execution failed' }, 500)
      return c.json(JSON.parse(text))
    } catch (err) {
      return c.json({ error: String(err) }, 502)
    }
  })

  return api
}
