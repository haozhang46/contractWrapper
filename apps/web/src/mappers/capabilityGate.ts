import {
  CAPABILITY_LEVELS,
  DEFAULT_GATE_CONFIG,
  type CapabilityGateConfig,
  type CapabilityLevel,
  type LayerDecision,
} from '../types/onion'

export interface ToolRow {
  name: string
  level: CapabilityLevel
}

function isCapabilityLevel(v: unknown): v is CapabilityLevel {
  return v === 'L1' || v === 'L2' || v === 'L3'
}

function isLayerDecision(v: unknown): v is LayerDecision {
  return v === 'allow' || v === 'ask' || v === 'deny'
}

export function flattenTools(
  tools: Record<CapabilityLevel, string[]>,
): ToolRow[] {
  const rows: ToolRow[] = []
  const seen = new Set<string>()
  for (const level of CAPABILITY_LEVELS) {
    for (const name of tools[level]) {
      if (seen.has(name)) continue
      seen.add(name)
      rows.push({ name, level })
    }
  }
  return rows
}

export function nestTools(
  rows: ToolRow[],
): Record<CapabilityLevel, string[]> {
  const tools: Record<CapabilityLevel, string[]> = {
    L1: [],
    L2: [],
    L3: [],
  }
  const seen = new Set<string>()
  for (const row of rows) {
    const name = row.name.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    tools[row.level].push(name)
  }
  return tools
}

/** Fill missing fields from factory defaults for local edit state. */
export function normalizeGateConfig(
  raw: Record<string, unknown>,
): CapabilityGateConfig {
  const levels = { ...DEFAULT_GATE_CONFIG.levels }
  if (raw.levels && typeof raw.levels === 'object') {
    const obj = raw.levels as Record<string, unknown>
    for (const level of CAPABILITY_LEVELS) {
      if (isLayerDecision(obj[level])) levels[level] = obj[level]
    }
  }

  const hasTools =
    raw.tools &&
    typeof raw.tools === 'object' &&
    CAPABILITY_LEVELS.some(l =>
      Array.isArray((raw.tools as Record<string, unknown>)[l]),
    )

  const tools: Record<CapabilityLevel, string[]> = hasTools
    ? { L1: [], L2: [], L3: [] }
    : {
        L1: [...DEFAULT_GATE_CONFIG.tools.L1],
        L2: [...DEFAULT_GATE_CONFIG.tools.L2],
        L3: [...DEFAULT_GATE_CONFIG.tools.L3],
      }

  if (hasTools) {
    const obj = raw.tools as Record<string, unknown>
    for (const level of CAPABILITY_LEVELS) {
      const v = obj[level]
      tools[level] = Array.isArray(v)
        ? v.filter((t): t is string => typeof t === 'string')
        : []
    }
  }

  const defaultLevel = isCapabilityLevel(raw.defaultLevel)
    ? raw.defaultLevel
    : DEFAULT_GATE_CONFIG.defaultLevel

  return { levels, tools, defaultLevel }
}
