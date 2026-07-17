import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

export interface ChatSessionMessage {
  role: string
  content: string
}

export interface ChatSessionMeta {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface ChatSession extends ChatSessionMeta {
  messages: ChatSessionMessage[]
}

const CHAT_DIR = '.harness/chat'

function chatDir(workspaceRoot: string): string {
  return join(workspaceRoot, CHAT_DIR)
}

function sessionPath(workspaceRoot: string, id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, '_')
  return join(chatDir(workspaceRoot), `${safe}.json`)
}

function ensureChatDir(workspaceRoot: string): void {
  const dir = chatDir(workspaceRoot)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

export function listChatSessions(workspaceRoot: string): ChatSessionMeta[] {
  const dir = chatDir(workspaceRoot)
  if (!existsSync(dir)) return []

  const sessions: ChatSessionMeta[] = []
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue
    try {
      const raw = JSON.parse(
        readFileSync(join(dir, file), 'utf-8'),
      ) as ChatSession
      sessions.push({
        id: raw.id,
        title: raw.title,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
      })
    } catch {
      // skip corrupt files
    }
  }

  return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getChatSession(
  workspaceRoot: string,
  id: string,
): ChatSession | null {
  const path = sessionPath(workspaceRoot, id)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as ChatSession
  } catch {
    return null
  }
}

export function saveChatSession(
  workspaceRoot: string,
  input: {
    id: string
    title: string
    messages: ChatSessionMessage[]
  },
): ChatSession {
  ensureChatDir(workspaceRoot)
  const now = new Date().toISOString()
  const existing = getChatSession(workspaceRoot, input.id)
  const session: ChatSession = {
    id: input.id,
    title: input.title,
    messages: input.messages,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  writeFileSync(
    sessionPath(workspaceRoot, input.id),
    JSON.stringify(session, null, 2),
    'utf-8',
  )
  return session
}

export function deleteChatSession(
  workspaceRoot: string,
  id: string,
): boolean {
  const path = sessionPath(workspaceRoot, id)
  if (!existsSync(path)) return false
  unlinkSync(path)
  return true
}
