import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Hono } from 'hono'
import {
  listMemoryEntries,
  loadMemoryConfig,
  saveMemoryConfig,
  storeMemoryEntry,
  type MemoryConfig,
} from '../../memory/store.ts'

function loadLLMSettings(workspaceRoot: string): {
  model: string
  baseUrl: string
  apiKey: string
} | null {
  const path = join(workspaceRoot, '.harness', 'llm.json')
  if (!existsSync(path)) return null
  try {
    const llm = JSON.parse(readFileSync(path, 'utf-8')) as {
      apiKey?: string
      model?: string
      baseUrl?: string
    }
    if (!llm.apiKey || !llm.model || !llm.baseUrl) return null
    return {
      apiKey: llm.apiKey,
      model: llm.model,
      baseUrl: llm.baseUrl,
    }
  } catch {
    return null
  }
}

export function createMemoryRoutes(workspaceRoot: string): Hono {
  const api = new Hono()

  api.get('/', c => {
    return c.json({ config: loadMemoryConfig(workspaceRoot) })
  })

  api.put('/', async c => {
    const body = await c.req.json<Partial<MemoryConfig>>()
    const config = saveMemoryConfig(workspaceRoot, {
      ...loadMemoryConfig(workspaceRoot),
      ...body,
    })
    return c.json({ config })
  })

  api.get('/entries', c => {
    return c.json({ entries: listMemoryEntries(workspaceRoot) })
  })

  api.post('/extract', async c => {
    const body = await c.req.json<{
      messages?: Array<{ role: string; content: string }>
    }>()
    const llm = loadLLMSettings(workspaceRoot)
    if (!llm || !body.messages?.length) {
      return c.json({ extracted: [] })
    }

    const conversation = body.messages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n')
    const baseUrl = llm.baseUrl.replace(/\/+$/, '')

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${llm.apiKey}`,
        },
        body: JSON.stringify({
          model: llm.model,
          messages: [
            {
              role: 'system',
              content:
                'Extract key facts, decisions, and user preferences from the conversation. Return a JSON array of objects with "type" ("fact"|"preference"|"decision") and "content" (concise statement). Example: [{"type":"fact","content":"Project uses TypeScript"},{"type":"preference","content":"User prefers dark theme"}]. Return ONLY valid JSON array, no markdown, no other text.',
            },
            { role: 'user', content: conversation.slice(-3000) },
          ],
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(15000),
      })

      if (!response.ok) return c.json({ extracted: [] })
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      const text = data.choices?.[0]?.message?.content ?? ''
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) return c.json({ extracted: [] })

      const items = JSON.parse(jsonMatch[0]) as Array<{
        type?: string
        content?: string
      }>
      const stored = []
      for (const item of items) {
        if (item.type && item.content) {
          stored.push(
            storeMemoryEntry(workspaceRoot, {
              type: item.type,
              content: item.content,
            }),
          )
        }
      }
      return c.json({ extracted: stored })
    } catch {
      return c.json({ extracted: [] })
    }
  })

  return api
}
