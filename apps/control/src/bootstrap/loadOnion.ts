import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ContractOnion, OnionLayerConfig } from '@harness/protocol'
import { onionRuntime } from '../onionSingleton.ts'

const ONION_PATH = '.harness/contract-onion.json'

export function loadOnion(workspaceRoot: string): ContractOnion | null {
  const fullPath = join(workspaceRoot, ONION_PATH)
  if (!existsSync(fullPath)) {
    onionRuntime.load(null)
    return null
  }

  try {
    const raw = readFileSync(fullPath, 'utf-8')
    const contract = JSON.parse(raw) as ContractOnion
    onionRuntime.load(contract)
    return contract
  } catch {
    onionRuntime.load(null)
    return null
  }
}

export function saveOnion(
  workspaceRoot: string,
  layers: OnionLayerConfig[],
): void {
  const fullPath = join(workspaceRoot, ONION_PATH)
  onionRuntime.updateLayers(layers)
  const contract = onionRuntime.toContract()
  writeFileSync(fullPath, JSON.stringify(contract, null, 2), 'utf-8')
}
