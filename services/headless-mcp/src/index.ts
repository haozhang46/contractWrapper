#!/usr/bin/env bun
/**
 * Headless MCP Server — entry point.
 *
 * A standalone MCP server that exposes headless UI pages via MCP tools.
 * Each page describes a form schema for rendering, a prompt for AI context,
 * and optional backend request mappings.
 *
 * Usage:
 *   bun src/index.ts           # Start MCP server (stdio)
 *   HEADLESS_PORT=3000 bun src/index.ts  # Start HTTP mode (future)
 */

import { startHeadlessServer } from './server.ts'

async function main(): Promise<void> {
  // In the future, support HTTP-based transport with a port option
  const port = process.env.HEADLESS_PORT
  if (port) {
    console.error(`[headless] HTTP mode requested but not yet implemented (port ${port})`)
    console.error('[headless] Falling back to stdio transport')
  }

  console.error('[headless] Starting MCP server (stdio)...')
  await startHeadlessServer()
}

main().catch((err) => {
  console.error('[headless] Fatal error:', err)
  process.exit(1)
})
