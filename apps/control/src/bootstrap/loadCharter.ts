import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export function loadCharter(workspaceRoot: string): string | null {
  const charterPath = join(workspaceRoot, '.harness', 'charter.md')
  if (!existsSync(charterPath)) return null
  return readFileSync(charterPath, 'utf-8')
}

export function saveCharter(workspaceRoot: string, content: string): void {
  const charterPath = join(workspaceRoot, '.harness', 'charter.md')
  writeFileSync(charterPath, content, 'utf-8')
}
