export type CapabilityLevel = 'L1' | 'L2' | 'L3'

export type OnionLayerType =
  | 'audit'
  | 'capability-gate'
  | 'require-confirm'
  | 'path-sandbox'
  | 'network-allowlist'
  | 'deny-pattern'
  | 'custom'

export interface OnionLayerConfig {
  id: string
  type: OnionLayerType
  name: string
  enabled: boolean
  priority: number
  config: Record<string, unknown>
}

export interface ContractOnion {
  version: 1
  layers: OnionLayerConfig[]
}

export interface CapabilityGateConfig {
  level: CapabilityLevel
  allowedTools?: string[]
  disallowedTools?: string[]
}

export interface AuthorizeRequest {
  toolName: string
  input: Record<string, unknown>
  sessionId: string
  /** optional display hint */
  description?: string
}

export type AuthorizeDecision = 'allow' | 'deny' | 'needs_confirm'

export interface AuthorizeResult {
  decision: AuthorizeDecision
  requestId?: string
  message?: string
  reason?: string
}

export interface WaitResolveRequest {
  requestId: string
  /** ms; default 60000 on server */
  timeoutMs?: number
}

export interface WaitResolveResult {
  decision: 'allow' | 'deny'
  reason?: string
}

export function isAuthorizeResult(v: unknown): v is AuthorizeResult {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  if (o.decision !== 'allow' && o.decision !== 'deny' && o.decision !== 'needs_confirm') {
    return false
  }
  if (o.decision === 'needs_confirm' && typeof o.requestId !== 'string') {
    return false
  }
  return true
}
