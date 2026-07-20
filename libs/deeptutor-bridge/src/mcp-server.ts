#!/usr/bin/env bun
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { probeStatus, runCapability } from './spawn.ts'
import type { Capability, RunInput } from './types.ts'

const CAPABILITIES: Capability[] = [
  'chat',
  'deep_solve',
  'deep_question',
  'deep_research',
  'visualize',
  'math_animator',
  'mastery_path',
]

const server = new Server(
  { name: 'deeptutor', version: '0.1.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'status',
      description:
        'Probe whether the local deeptutor CLI is available and optionally whether the Web UI responds.',
      inputSchema: {
        type: 'object',
        properties: {
          check_web: {
            type: 'boolean',
            description: 'If true (default), HTTP-probe DEEPTUTOR_WEB_URL',
          },
        },
      },
    },
    {
      name: 'run',
      description:
        'Run one DeepTutor capability via `deeptutor run … --format json` and return aggregated text.',
      inputSchema: {
        type: 'object',
        required: ['capability', 'message'],
        properties: {
          capability: { type: 'string', enum: CAPABILITIES },
          message: { type: 'string' },
          session: { type: 'string' },
          kb: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
          },
          tool: { type: 'array', items: { type: 'string' } },
          language: { type: 'string' },
          config: {
            type: 'object',
            additionalProperties: {
              oneOf: [
                { type: 'string' },
                { type: 'number' },
                { type: 'boolean' },
              ],
            },
          },
        },
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name
  const args = (req.params.arguments ?? {}) as Record<string, unknown>
  if (name === 'status') {
    const result = await probeStatus({
      check_web: args.check_web !== false,
    })
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    }
  }
  if (name === 'run') {
    const capability = String(args.capability ?? '') as Capability
    if (!CAPABILITIES.includes(capability)) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error: { code: 'BAD_ARGS', message: 'invalid capability' },
            }),
          },
        ],
        isError: true,
      }
    }
    const message = String(args.message ?? '')
    if (!message) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error: { code: 'BAD_ARGS', message: 'message required' },
            }),
          },
        ],
        isError: true,
      }
    }
    const input: RunInput = {
      capability,
      message,
      session: args.session != null ? String(args.session) : undefined,
      kb: args.kb as RunInput['kb'],
      tool: Array.isArray(args.tool)
        ? args.tool.map(String)
        : undefined,
      language: args.language != null ? String(args.language) : undefined,
      config: args.config as RunInput['config'],
    }
    const result = await runCapability(input)
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      isError: !result.ok,
    }
  }
  return {
    content: [{ type: 'text', text: `Unknown tool: ${name}` }],
    isError: true,
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('[deeptutor-bridge] MCP server started')
