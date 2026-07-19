import { describe, test, expect, afterAll } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createHeadlessMcpServer } from '../server.ts'
import { pageRegistry } from '../pages/registry.ts'

describe('Headless MCP Server', () => {
  const server = createHeadlessMcpServer()

  async function createConnectedClient() {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client(
      { name: 'test-client', version: '0.0.1' },
      { capabilities: {} },
    )
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ])
    return client
  }

  test('list_pages returns all registered pages', async () => {
    const client = await createConnectedClient()

    const result = await client.listTools()

    expect(result.tools).toBeDefined()
    expect(result.tools.length).toBeGreaterThanOrEqual(3)

    const toolNames = result.tools.map((t: { name: string }) => t.name)
    expect(toolNames).toContain('headless.list_pages')
    expect(toolNames).toContain('headless.get_page_detail')
    expect(toolNames).toContain('headless.submit_page_action')

    await client.close()
  })

  test('headless.list_pages tool returns page summaries', async () => {
    const client = await createConnectedClient()

    const result = await client.callTool({
      name: 'headless.list_pages',
      arguments: {},
    })

    expect(result.content).toBeDefined()
    expect(result.content[0]).toBeDefined()
    expect(result.content[0].type).toBe('text')

    const pages = JSON.parse(result.content[0].text as string)
    expect(Array.isArray(pages)).toBe(true)
    expect(pages.length).toBeGreaterThanOrEqual(3)

    // Verify page list shape (no schema in list)
    for (const page of pages) {
      expect(page.id).toBeDefined()
      expect(page.pageid).toBeDefined()
      expect(page.description).toBeDefined()
      expect(page.schema).toBeUndefined() // schema not in list
    }

    await client.close()
  })

  test('headless.get_page_detail returns full page with schema', async () => {
    const client = await createConnectedClient()

    const result = await client.callTool({
      name: 'headless.get_page_detail',
      arguments: { id: 'deploy' },
    })

    expect(result.content[0].type).toBe('text')
    const page = JSON.parse(result.content[0].text as string)
    expect(page.id).toBe('deploy')
    expect(page.pageid).toBe('ops.deploy')
    expect(page.description).toBeDefined()
    expect(page.schema).toBeDefined()
    expect(page.schema.properties).toBeDefined()
    expect(page.schema.properties.appName).toBeDefined()
    expect(page.schema.properties.environment).toBeDefined()
    expect(page.schema.properties.version).toBeDefined()

    await client.close()
  })

  test('headless.get_page_detail returns error for unknown page', async () => {
    const client = await createConnectedClient()

    const result = await client.callTool({
      name: 'headless.get_page_detail',
      arguments: { id: 'nonexistent' },
    })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('not found')

    await client.close()
  })

  test('headless.submit_page_action validates required fields', async () => {
    const client = await createConnectedClient()

    const result = await client.callTool({
      name: 'headless.submit_page_action',
      arguments: {
        pageId: 'deploy',
        data: {},
      },
    })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Missing required fields')

    await client.close()
  })

  test('headless.submit_page_action succeeds with valid data', async () => {
    const client = await createConnectedClient()

    const result = await client.callTool({
      name: 'headless.submit_page_action',
      arguments: {
        pageId: 'configure',
        data: {
          logLevel: 'info',
          maxRetries: 5,
          enableTelemetry: false,
        },
      },
    })

    expect(result.isError).toBeUndefined()
    const response = JSON.parse(result.content[0].text as string)
    expect(response.status).toBe('ok')
    expect(response.pageId).toBe('configure')
    expect(response.request.body).toEqual({
      log_level: 'info',
      max_retries: 5,
      telemetry: false,
    })

    await client.close()
  })

  test('unknown tool returns error', async () => {
    const client = await createConnectedClient()

    const result = await client.callTool({
      name: 'headless.nonexistent',
      arguments: {},
    })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Unknown tool')

    await client.close()
  })
})

afterAll(() => {
  // Clean up registry between test runs
  ;['status', 'configure', 'deploy', 'inspect-logs'].forEach((id) =>
    pageRegistry.unregister(id),
  )
})
