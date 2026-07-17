import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { AuditEntry } from '@harness/onion'

const AUDIT_DIR = '.harness/audit'
const AUDIT_FILE = 'audit.ndjson'

export async function writeAudit(
  workspaceRoot: string,
  auditTrail: AuditEntry[],
): Promise<void> {
  if (auditTrail.length === 0) return

  const dir = join(workspaceRoot, AUDIT_DIR)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const filePath = join(dir, AUDIT_FILE)
  const lines = auditTrail.map(entry => `${JSON.stringify(entry)}\n`).join('')
  appendFileSync(filePath, lines, 'utf-8')
}
