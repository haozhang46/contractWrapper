import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import type {
  ContractOnion,
  NamedOnion,
  OnionListItem,
} from '@harness/protocol'
import { isDefaultOnionId, toBuiltinLayer } from '@harness/protocol'
import { compileJsLayer } from './compileJsLayer.ts'
import { DEFAULT_ONION_LAYERS } from './defaultLayers.ts'
import { OnionRuntime } from './runtime.ts'
import type { EvaluateResult } from './types.ts'

const ONIONS_DIR = '.harness/onions'
const LEGACY_CONTRACT = '.harness/contract-onion.json'

function onionsDir(workspaceRoot: string): string {
  return join(workspaceRoot, ONIONS_DIR)
}

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function onionPath(workspaceRoot: string, id: string): string {
  return join(onionsDir(workspaceRoot), `${safeId(id)}.json`)
}

function ensureOnionsDir(workspaceRoot: string): void {
  const dir = onionsDir(workspaceRoot)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function defaultNamedOnion(): NamedOnion {
  return {
    version: 1,
    id: 'default',
    name: 'Default',
    layers: DEFAULT_ONION_LAYERS,
  }
}

function migrateLegacyContract(workspaceRoot: string): NamedOnion | null {
  const legacyPath = join(workspaceRoot, LEGACY_CONTRACT)
  const defaultPath = onionPath(workspaceRoot, 'default')
  if (!existsSync(legacyPath) || existsSync(defaultPath)) {
    return null
  }

  const raw = JSON.parse(readFileSync(legacyPath, 'utf-8')) as ContractOnion
  const onion: NamedOnion = {
    version: 1,
    id: 'default',
    name: 'Default',
    layers: (raw.layers ?? []).map(toBuiltinLayer),
  }
  writeFileSync(defaultPath, JSON.stringify(onion, null, 2))
  return onion
}

function parseNamedOnion(raw: unknown): NamedOnion | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.name !== 'string') return null
  if (!Array.isArray(o.layers)) return null
  return {
    version: 1,
    id: o.id,
    name: o.name,
    layers: o.layers as NamedOnion['layers'],
  }
}

export class OnionRegistry {
  private readonly workspaceRoot: string
  private readonly onions = new Map<string, NamedOnion>()
  private readonly runtimes = new Map<string, OnionRuntime>()

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot
  }

  bootstrap(): void {
    ensureOnionsDir(this.workspaceRoot)
    migrateLegacyContract(this.workspaceRoot)

    this.onions.clear()
    this.runtimes.clear()

    const dir = onionsDir(this.workspaceRoot)
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json')) continue
      try {
        const raw = JSON.parse(readFileSync(join(dir, file), 'utf-8'))
        const onion = parseNamedOnion(raw)
        if (!onion) continue
        this.loadOnion(onion)
      } catch {
        // skip corrupt files
      }
    }

    if (!this.onions.has('default')) {
      const def = defaultNamedOnion()
      this.writeOnionFile(def)
      this.loadOnion(def)
    }
  }

  list(): OnionListItem[] {
    return [...this.onions.values()].map(o => ({
      id: o.id,
      name: o.name,
      layerCount: o.layers.length,
      isDefault: isDefaultOnionId(o.id),
    }))
  }

  get(id: string): NamedOnion | null {
    return this.onions.get(id) ?? null
  }

  save(onion: NamedOnion): void {
    for (const layer of onion.layers) {
      if (layer.kind === 'js') {
        compileJsLayer(layer.source)
      }
    }
    this.writeOnionFile(onion)
    this.loadOnion(onion)
  }

  delete(id: string): void {
    if (isDefaultOnionId(id)) {
      throw new Error('Cannot delete the default onion')
    }
    const path = onionPath(this.workspaceRoot, id)
    if (existsSync(path)) {
      unlinkSync(path)
    }
    this.onions.delete(id)
    this.runtimes.delete(id)
  }

  async evaluate(
    toolName: string,
    input: Record<string, unknown>,
    opts?: { onionId?: string },
  ): Promise<EvaluateResult> {
    const requested = opts?.onionId?.trim() || 'default'
    let unknownFallback = false
    let runtime = this.runtimes.get(requested)
    if (!runtime) {
      if (requested !== 'default') {
        unknownFallback = true
      }
      runtime = this.runtimes.get('default')
    }
    if (!runtime) {
      const rt = new OnionRuntime()
      rt.loadNamed(null)
      runtime = rt
    }

    const result = await runtime.evaluate(toolName, input)
    if (unknownFallback) {
      result.auditTrail = [
        ...result.auditTrail,
        {
          timestamp: new Date().toISOString(),
          layerId: 'registry',
          layerType: 'custom',
          toolName,
          decision: 'allow',
          detail: `unknown onionId ${requested}, fell back to default`,
        },
      ]
    }
    return result
  }

  private loadOnion(onion: NamedOnion): void {
    const rt = new OnionRuntime()
    rt.loadNamed(onion)
    this.onions.set(onion.id, onion)
    this.runtimes.set(onion.id, rt)
  }

  private writeOnionFile(onion: NamedOnion): void {
    ensureOnionsDir(this.workspaceRoot)
    writeFileSync(
      onionPath(this.workspaceRoot, onion.id),
      JSON.stringify(onion, null, 2),
    )
  }
}
