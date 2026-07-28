import type {
  CapabilityGateConfig,
  CapabilityLevel,
  LayerDecision,
  OnionLayerConfig,
} from '@harness/protocol'
import type { OnionMiddleware } from '../types.ts'

const DEFAULT_LEVELS: Record<CapabilityLevel, LayerDecision> = {
  L1: 'allow',
  L2: 'ask',
  L3: 'deny',
}

const DEFAULT_TOOLS: Record<CapabilityLevel, string[]> = {
  L1: [],
  L2: [],
  L3: [],
}

const LEVELS: CapabilityLevel[] = ['L1', 'L2', 'L3']
const DECISIONS: LayerDecision[] = ['allow', 'ask', 'deny']

function isCapabilityLevel(v: unknown): v is CapabilityLevel {
  return v === 'L1' || v === 'L2' || v === 'L3'
}

function isLayerDecision(v: unknown): v is LayerDecision {
  return v === 'allow' || v === 'ask' || v === 'deny'
}

function parseLevels(
  raw: unknown,
): Record<CapabilityLevel, LayerDecision> {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_LEVELS }
  }
  const obj = raw as Record<string, unknown>
  const result = { ...DEFAULT_LEVELS }
  for (const level of LEVELS) {
    const v = obj[level]
    if (isLayerDecision(v)) {
      result[level] = v
    }
  }
  return result
}

function parseTools(
  raw: unknown,
): Record<CapabilityLevel, string[]> {
  if (!raw || typeof raw !== 'object') {
    return {
      L1: [...DEFAULT_TOOLS.L1],
      L2: [...DEFAULT_TOOLS.L2],
      L3: [...DEFAULT_TOOLS.L3],
    }
  }
  const obj = raw as Record<string, unknown>
  const result: Record<CapabilityLevel, string[]> = {
    L1: [],
    L2: [],
    L3: [],
  }
  for (const level of LEVELS) {
    const v = obj[level]
    result[level] = Array.isArray(v)
      ? v.filter((t): t is string => typeof t === 'string')
      : []
  }
  return result
}

export function parseCapabilityGateConfig(
  raw: Record<string, unknown>,
): CapabilityGateConfig {
  const defaultLevel = isCapabilityLevel(raw.defaultLevel)
    ? raw.defaultLevel
    : 'L2'
  return {
    levels: parseLevels(raw.levels),
    tools: parseTools(raw.tools),
    defaultLevel,
  }
}

/** Classify tool against config lists; conflicts prefer L3 > L1 > L2. */
export function classifyToolCapability(
  toolName: string,
  config: CapabilityGateConfig,
): CapabilityLevel {
  if (config.tools.L3.includes(toolName)) return 'L3'
  if (config.tools.L1.includes(toolName)) return 'L1'
  if (config.tools.L2.includes(toolName)) return 'L2'
  return config.defaultLevel
}

export function decisionForLevel(
  level: CapabilityLevel,
  config: CapabilityGateConfig,
): LayerDecision {
  const d = config.levels[level]
  return DECISIONS.includes(d) ? d : DEFAULT_LEVELS[level]
}

export function createCapabilityGateMiddleware(
  layer: OnionLayerConfig,
): OnionMiddleware {
  const config = parseCapabilityGateConfig(layer.config)
  return async (ctx, next) => {
    const level = classifyToolCapability(ctx.toolName, config)
    const decision = decisionForLevel(level, config)

    if (decision === 'allow') {
      await next()
      return
    }

    ctx.decision = decision
    if (decision === 'ask') {
      ctx.message = `The operation "${ctx.toolName}" requires your explicit confirmation before execution.`
    } else {
      ctx.message = `Permission denied: ${ctx.toolName} is classified as ${level}.`
    }
  }
}
