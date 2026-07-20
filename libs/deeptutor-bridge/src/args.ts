import type { RunInput } from './types.ts'

export function buildRunArgs(input: RunInput): string[] {
  const args: string[] = ['run', input.capability, input.message]
  if (input.session) args.push('--session', input.session)
  const kbs = input.kb == null ? [] : Array.isArray(input.kb) ? input.kb : [input.kb]
  for (const kb of kbs) args.push('--kb', kb)
  for (const t of input.tool ?? []) args.push('--tool', t)
  if (input.language) args.push('--language', input.language)
  if (input.config) {
    for (const [k, v] of Object.entries(input.config)) {
      args.push('--config', `${k}=${v}`)
    }
  }
  args.push('--format', 'json')
  return args
}
