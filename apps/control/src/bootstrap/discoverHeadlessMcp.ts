import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { controlLog } from './controlLog.ts'

const MCP_CONFIG_FILE = '.mcp.json'
const HEADLESS_MCP_NAME = 'harness-headless'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

interface McpConfigFile {
  mcpServers: Record<
    string,
    { command: string; args?: string[]; env?: Record<string, string> }
  >
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

function writeMcpConfig(workspaceRoot: string, config: McpConfigFile): void {
  const filePath = join(workspaceRoot, MCP_CONFIG_FILE)
  writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n')
}

/**
 * Auto-discover the harness-headless-connect MCP server entry point and
 * register it as a stdio MCP server in `.mcp.json` at workspace root.
 *
 * Looks in, in order:
 *   1. `<workspaceRoot>/libs/harness-headless-connect/src/mcp-server.ts`
 *   2. Relative to this file (for monorepo layouts)
 *   3. `$HEADLESS_MCP_PATH` env var
 *
 * Skips silently if the entry point is not found. Skips if the name
 * `harness-headless` is already registered.
 */
export function discoverAndRegisterHeadlessMcp(workspaceRoot: string): void {
  const config = readMcpConfig(workspaceRoot)

  if (config.mcpServers[HEADLESS_MCP_NAME]) {
    controlLog(
      workspaceRoot,
      `MCP server "${HEADLESS_MCP_NAME}" already registered, skipping`,
    )
    return
  }

  const candidatePaths = [
    join(
      workspaceRoot,
      'libs',
      'harness-headless-connect',
      'src',
      'mcp-server.ts',
    ),
    join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'libs',
      'harness-headless-connect',
      'src',
      'mcp-server.ts',
    ),
  ]

  if (process.env.HEADLESS_MCP_PATH) {
    candidatePaths.push(process.env.HEADLESS_MCP_PATH)
  }

  const entryPath = candidatePaths.find(existsSync)

  if (!entryPath) {
    controlLog(
      workspaceRoot,
      'headless MCP server not found, skipping discovery',
    )
    return
  }

  config.mcpServers[HEADLESS_MCP_NAME] = {
    command: 'bun',
    args: ['run', entryPath],
  }

  writeMcpConfig(workspaceRoot, config)
  controlLog(
    workspaceRoot,
    `registered MCP server "${HEADLESS_MCP_NAME}" at ${entryPath}`,
  )
}
