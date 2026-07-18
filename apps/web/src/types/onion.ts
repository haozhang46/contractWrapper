export type OnionLayerType =
  | 'audit'
  | 'capability-gate'
  | 'require-confirm'
  | 'path-sandbox'
  | 'network-allowlist'
  | 'deny-pattern'
  | 'custom'

export type OnionLayer =
  | {
      id: string
      name: string
      enabled: boolean
      priority: number
      kind: 'builtin'
      type: OnionLayerType
      config: Record<string, unknown>
    }
  | {
      id: string
      name: string
      enabled: boolean
      priority: number
      kind: 'js'
      source: string
    }

export interface NamedOnionDTO {
  version: 1
  id: string
  name: string
  layers: OnionLayer[]
}

export interface OnionListItem {
  id: string
  name: string
  layerCount: number
  isDefault: boolean
}

export const JS_LAYER_TEMPLATE = `async (ctx, next) => {
  // ctx.toolName, ctx.input, ctx.decision, ctx.message
  await next()
}`

export const DEFAULT_JS_LAYER_SOURCE = JS_LAYER_TEMPLATE

/** Builtin types users may add via the editor (runtime-implemented only). */
export const BUILTIN_LAYER_TYPES = [
  'capability-gate',
  'require-confirm',
] as const satisfies readonly OnionLayerType[]

export type AddableBuiltinLayerType = (typeof BUILTIN_LAYER_TYPES)[number]

/** @deprecated use NamedOnionDTO */
export type NamedOnion = NamedOnionDTO

export function isAuditLayer(layer: OnionLayer): boolean {
  return layer.kind === 'builtin' && layer.type === 'audit'
}

export function layerMetaLabel(layer: OnionLayer): string {
  if (layer.kind === 'js') {
    return `js · priority ${layer.priority}`
  }
  return `${layer.type} · priority ${layer.priority}`
}
