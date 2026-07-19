import { Hono } from 'hono'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { McpServerConfig } from '@modelcontextprotocol/sdk/types.js'

const MCP_CONFIG_FILE = '.mcp.json'

interface McpConfigFile {
  mcpServers: Record<string, McpServerConfig>
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

function writeMcpConfig(
  workspaceRoot: string,
  config: McpConfigFile,
): void {
  const filePath = join(workspaceRoot, MCP_CONFIG_FILE)
  writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n')
}

export function createMcpRoutes(
  workspaceRoot: string,
  reloadFn?: () => void,
): Hono {
  const api = new Hono()

  /**
   * List all registered MCP servers.
   */
  api.get('/', c => {
    const config = readMcpConfig(workspaceRoot)
    return c.json(config.mcpServers)
  })

  /**
   * Register a new MCP server.
   * Body: { name: string, type: 'stdio', command: string, args?: string[], env?: Record<string, string> }
   */
  api.post('/register', async c => {
    const body = await c.req.json<{
      name: string
      command: string
      args?: string[]
      env?: Record<string, string>
    }>()

    const { name, command, args, env } = body

    if (!name || !command) {
      return c.json({ error: 'name and command are required' }, 400)
    }

    // Validate name format (must match CCB's MCP naming rules)
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      return c.json(
        { error: 'name must match [a-zA-Z0-9_-]' },
        400,
      )
    }

    const config = readMcpConfig(workspaceRoot)

    if (config.mcpServers[name]) {
      return c.json({ error: `MCP server "${name}" already exists` }, 409)
    }

    config.mcpServers[name] = {
      command,
      args: args ?? [],
      env: env ?? {},
    }

    writeMcpConfig(workspaceRoot, config)
    reloadFn?.()

    return c.json({ name, registered: true })
  })

  /**
   * Remove a registered MCP server.
   */
  api.delete('/:name', c => {
    const { name } = c.req.param()
    const config = readMcpConfig(workspaceRoot)

    if (!config.mcpServers[name]) {
      return c.json({ error: `MCP server "${name}" not found` }, 404)
    }

    delete config.mcpServers[name]
    writeMcpConfig(workspaceRoot, config)
    reloadFn?.()

    return c.json({ name, removed: true })
  })

  return api
}
