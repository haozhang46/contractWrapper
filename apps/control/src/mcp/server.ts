import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js'
import type { OnionRuntime } from '@harness/onion'
import type { PendingStore } from '../pending/store.ts'
import { handleAuthorize, handleWaitResolve } from './handlers.ts'

export interface ControlMcpDeps {
  workspaceRoot: string
  onionRuntime: OnionRuntime
  pendingStore: PendingStore
}

export function createControlMcpServer(deps: ControlMcpDeps): Server {
  const { workspaceRoot, onionRuntime, pendingStore } = deps

  const server = new Server(
    { name: 'harness-control', version: '0.0.1' },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'onion.authorize',
        description:
          'Evaluate a tool call against the onion contract; may return needs_confirm with a requestId.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            toolName: { type: 'string', description: 'Tool name to authorize' },
            input: {
              type: 'object',
              description: 'Tool input payload',
              additionalProperties: true,
            },
            sessionId: {
              type: 'string',
              description: 'Session identifier for pending confirm UI',
            },
            description: {
              type: 'string',
              description: 'Optional display hint for confirm UI',
            },
          },
          required: ['toolName', 'input', 'sessionId'],
        },
      },
      {
        name: 'onion.wait_resolve',
        description:
          'Block until a pending authorize request is confirmed, denied, or times out.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            requestId: {
              type: 'string',
              description: 'requestId from needs_confirm authorize result',
            },
            timeoutMs: {
              type: 'number',
              description: 'Wait timeout in milliseconds (default 60000)',
            },
          },
          required: ['requestId'],
        },
      },
    ],
  }))

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request): Promise<CallToolResult> => {
      const { name, arguments: args } = request.params

      switch (name) {
        case 'onion.authorize': {
          const toolName =
            typeof args?.toolName === 'string' ? args.toolName : ''
          const sessionId =
            typeof args?.sessionId === 'string' ? args.sessionId : ''
          const input =
            args?.input && typeof args.input === 'object' && !Array.isArray(args.input)
              ? (args.input as Record<string, unknown>)
              : {}

          if (!toolName || !sessionId) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Missing required fields: toolName, sessionId',
                },
              ],
              isError: true,
            }
          }

          const result = await handleAuthorize(
            onionRuntime,
            pendingStore,
            { toolName, input, sessionId },
            { workspaceRoot },
          )

          return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
          }
        }

        case 'onion.wait_resolve': {
          const requestId =
            typeof args?.requestId === 'string' ? args.requestId : ''
          const timeoutMs =
            typeof args?.timeoutMs === 'number' ? args.timeoutMs : undefined

          if (!requestId) {
            return {
              content: [
                { type: 'text', text: 'Missing required field: requestId' },
              ],
              isError: true,
            }
          }

          const result = await handleWaitResolve(
            pendingStore,
            requestId,
            timeoutMs,
          )

          return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
          }
        }

        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true,
          }
      }
    },
  )

  return server
}

export async function startControlMcpServer(deps: ControlMcpDeps): Promise<void> {
  const server = createControlMcpServer(deps)
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[control] MCP stdio connected')
}
