import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export type HeadlessSettings = {
  /** When true, onion `ask` is auto-allowed (no Confirm UI / wait_resolve). */
  autoAllow: boolean
}

const DEFAULT: HeadlessSettings = { autoAllow: false }

function headlessPath(workspaceRoot: string): string {
  return join(workspaceRoot, '.harness', 'headless.json')
}

export function loadHeadlessSettings(workspaceRoot: string): HeadlessSettings {
  if (
    process.env.HARNESS_AUTO_ALLOW === '1' ||
    process.env.HARNESS_HEADLESS === '1'
  ) {
    return { autoAllow: true }
  }

  const path = headlessPath(workspaceRoot)
  if (!existsSync(path)) return { ...DEFAULT }

  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as Partial<HeadlessSettings>
    return {
      autoAllow: Boolean(raw.autoAllow),
    }
  } catch {
    return { ...DEFAULT }
  }
}

export function saveHeadlessSettings(
  workspaceRoot: string,
  settings: HeadlessSettings,
): HeadlessSettings {
  const dir = join(workspaceRoot, '.harness')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const next: HeadlessSettings = { autoAllow: Boolean(settings.autoAllow) }
  writeFileSync(headlessPath(workspaceRoot), JSON.stringify(next, null, 2), 'utf-8')
  return next
}
