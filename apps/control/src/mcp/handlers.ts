import type { AuthorizeRequest, AuthorizeResult } from '@harness/protocol'
import type { EvaluateResult } from '@harness/onion'
import { writeAudit } from '../audit/write.ts'
import { loadHeadlessSettings } from '../bootstrap/loadHeadless.ts'
import type { PendingStore } from '../pending/store.ts'

export async function handleAuthorize(
  runtime: {
    evaluate: (
      tool: string,
      input: Record<string, unknown>,
      opts?: { onionId?: string },
    ) => Promise<EvaluateResult>
  },
  pending: PendingStore,
  req: AuthorizeRequest,
  opts: { workspaceRoot: string },
): Promise<AuthorizeResult> {
  const result = await runtime.evaluate(req.toolName, req.input, {
    onionId: req.onionId,
  })
  await writeAudit(opts.workspaceRoot, result.auditTrail)

  if (result.decision === 'ask') {
    if (loadHeadlessSettings(opts.workspaceRoot).autoAllow) {
      return { decision: 'allow' }
    }
    const message = result.message ?? `Confirm tool ${req.toolName}`
    const { requestId } = pending.create({
      toolName: req.toolName,
      input: req.input,
      sessionId: req.sessionId,
      message,
    })
    return { decision: 'needs_confirm', requestId, message }
  }

  if (result.decision === 'deny') {
    return { decision: 'deny', reason: result.message ?? 'denied by onion' }
  }

  return { decision: 'allow' }
}

export async function handleWaitResolve(
  pending: PendingStore,
  requestId: string,
  timeoutMs?: number,
): Promise<{ decision: 'allow' | 'deny'; reason?: string }> {
  return pending.wait(requestId, timeoutMs)
}
