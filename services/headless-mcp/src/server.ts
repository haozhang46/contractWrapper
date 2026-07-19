import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js'
import { pageRegistry } from './pages/registry.ts'
import { builtinPages } from './pages/builtin-pages.ts'
import type { PageSchema } from './pages/types.ts'

/**
 * Create the Headless MCP Server.
 *
 * Exposes tools for listing and interacting with headless pages.
 * Pages describe UI capabilities with form schemas, prompts, and request mappings.
 */
export function createHeadlessMcpServer(): Server {
  // Register built-in pages
  pageRegistry.register(...builtinPages)

  const server = new Server(
    { name: 'harness-headless-service', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'headless.list_pages',
        description: 'List all available headless pages with summaries.',
        inputSchema: {
          type: 'object' as const,
          properties: {},
          required: [],
        },
      },
      {
        name: 'headless.get_page_detail',
        description: 'Get detailed information about a specific headless page, including its form schema.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            id: {
              type: 'string',
              description: 'The page identifier to retrieve',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'headless.submit_page_action',
        description: 'Submit form data for a headless page action. Processes the submission and returns a result.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            pageId: {
              type: 'string',
              description: 'The page identifier to submit to',
            },
            data: {
              type: 'object',
              description: 'Form data to submit, key-value pairs matching the page schema',
              additionalProperties: true,
            },
          },
          required: ['pageId', 'data'],
        },
      },
    ],
  }))

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request): Promise<CallToolResult> => {
      const { name, arguments: args } = request.params

      try {
        switch (name) {
          case 'headless.list_pages': {
            const pages = pageRegistry.list()
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(pages, null, 2),
                },
              ],
            }
          }

          case 'headless.get_page_detail': {
            const id = typeof args?.id === 'string' ? args.id : ''
            if (!id) {
              return {
                content: [{ type: 'text', text: 'Missing required field: id' }],
                isError: true,
              }
            }
            const page = pageRegistry.get(id)
            if (!page) {
              return {
                content: [{ type: 'text', text: `Page not found: ${id}` }],
                isError: true,
              }
            }
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(page, null, 2),
                },
              ],
            }
          }

          case 'headless.submit_page_action': {
            const pageId = typeof args?.pageId === 'string' ? args.pageId : ''
            const data =
              args?.data && typeof args.data === 'object' && !Array.isArray(args.data)
                ? (args.data as Record<string, unknown>)
                : {}

            if (!pageId) {
              return {
                content: [{ type: 'text', text: 'Missing required field: pageId' }],
                isError: true,
              }
            }

            const page = pageRegistry.get(pageId)
            if (!page) {
              return {
                content: [{ type: 'text', text: `Page not found: ${pageId}` }],
                isError: true,
              }
            }

            // Validate required fields
            if (page.schema?.required) {
              const missing = page.schema.required.filter(
                (field) => data[field] === undefined || data[field] === '',
              )
              if (missing.length > 0) {
                return {
                  content: [
                    {
                      type: 'text',
                      text: `Missing required fields: ${missing.join(', ')}`,
                    },
                  ],
                  isError: true,
                }
              }
            }

            // Build request payload from body mapping
            let payload: Record<string, unknown> = {}
            if (page.request?.bodyMapping) {
              for (const [reqKey, formKey] of Object.entries(
                page.request.bodyMapping,
              )) {
                payload[reqKey] = data[formKey]
              }
            } else {
              payload = data
            }

            const result = {
              pageId,
              status: 'ok',
              request: page.request
                ? {
                    method: page.request.method,
                    url: page.request.url,
                    body: payload,
                  }
                : undefined,
              message: `Page "${page.description}" action submitted successfully`,
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            }
          }

          default:
            return {
              content: [{ type: 'text', text: `Unknown tool: ${name}` }],
              isError: true,
            }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return {
          content: [{ type: 'text', text: `Error: ${message}` }],
          isError: true,
        }
      }
    },
  )

  return server
}

/**
 * Start the headless MCP server using stdio transport.
 */
export async function startHeadlessServer(): Promise<void> {
  const server = createHeadlessMcpServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
