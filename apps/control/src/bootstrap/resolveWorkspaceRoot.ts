import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'

function real(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

/**
 * Default workspace for Control (.harness/, LLM settings, chat).
 * `bun run --filter @harness/control` sets cwd to apps/control; the monorepo
 * root (two levels up) is where product `.harness` and `ccb/` live.
 */
export function resolveWorkspaceRoot(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string {
  const fromEnv = env.HARNESS_WORKSPACE?.trim()
  if (fromEnv) return real(fromEnv)

  const pkgPath = join(cwd, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
        name?: string
      }
      if (pkg.name === '@harness/control') {
        return real(resolve(cwd, '../..'))
      }
    } catch {
      // fall through to cwd
    }
  }
  return real(cwd)
}
