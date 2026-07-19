import { controlLog } from './controlLog.ts'

function formatReason(reason: unknown): string {
  if (reason instanceof Error) {
    return `${reason.name}: ${reason.message}\n${reason.stack ?? ''}`
  }
  return String(reason)
}

/** Register process-level error hooks that append to `.harness/control.log`. */
export function installProcessErrorHandlers(workspaceRoot: string): void {
  process.on('uncaughtException', error => {
    controlLog(workspaceRoot, 'uncaughtException', formatReason(error))
    console.error('[control] uncaughtException', error)
  })

  process.on('unhandledRejection', reason => {
    controlLog(workspaceRoot, 'unhandledRejection', formatReason(reason))
    console.error('[control] unhandledRejection', reason)
  })
}
