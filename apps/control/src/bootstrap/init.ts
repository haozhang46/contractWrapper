import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_ONION_CONTRACT } from '@harness/onion'

const HARNESS_DIR = '.harness'

const SKELETON_DIRS = [
  'audit',
  'chat',
  'skills',
  'memory',
  'fusion',
  'workflows',
  'onions',
]

const DEFAULT_CHARTER = `# Workspace Charter

## Identity
This workspace is managed by the Harness Control Console.

## Purpose
[TBD: Define the primary purpose of this workspace]

## Content Policy
- Follow the contract onion rules defined in contract-onion.json
- All tool calls are subject to capability gates and audit
`

const DEFAULT_MANIFEST: Record<string, unknown> = {
  version: '1.0.0',
  harness: 'harness-console',
  createdAt: new Date().toISOString(),
}

export function initHarnessDir(workspaceRoot: string): void {
  const harnessDir = join(workspaceRoot, HARNESS_DIR)

  if (!existsSync(harnessDir)) {
    mkdirSync(harnessDir, { recursive: true })
  }

  for (const dir of SKELETON_DIRS) {
    const fullPath = join(harnessDir, dir)
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true })
    }
  }

  const charterPath = join(harnessDir, 'charter.md')
  if (!existsSync(charterPath)) {
    writeFileSync(charterPath, DEFAULT_CHARTER, 'utf-8')
  }

  const onionPath = join(harnessDir, 'contract-onion.json')
  if (!existsSync(onionPath)) {
    writeFileSync(
      onionPath,
      JSON.stringify(DEFAULT_ONION_CONTRACT, null, 2),
      'utf-8',
    )
  }

  const manifestPath = join(harnessDir, 'manifest.json')
  if (!existsSync(manifestPath)) {
    writeFileSync(
      manifestPath,
      JSON.stringify(DEFAULT_MANIFEST, null, 2),
      'utf-8',
    )
  }
}
