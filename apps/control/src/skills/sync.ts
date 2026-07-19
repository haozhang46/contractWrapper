import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { installSkillsDir } from './catalog.ts'

export function copySkillDir(sourceDir: string, destDir: string): void {
  if (existsSync(destDir)) {
    rmSync(destDir, { recursive: true, force: true })
  }
  mkdirSync(destDir, { recursive: true })
  cpSync(sourceDir, destDir, { recursive: true })
}

export function writeInstalledSkillMd(
  workspaceRoot: string,
  id: string,
  skillMd: string,
): void {
  const destDir = join(installSkillsDir(workspaceRoot), id)
  if (existsSync(destDir)) {
    rmSync(destDir, { recursive: true, force: true })
  }
  mkdirSync(destDir, { recursive: true })
  writeFileSync(join(destDir, 'SKILL.md'), skillMd, 'utf-8')
}

export function removeInstalledSkill(
  workspaceRoot: string,
  id: string,
): void {
  const destDir = join(installSkillsDir(workspaceRoot), id)
  if (existsSync(destDir)) {
    rmSync(destDir, { recursive: true, force: true })
  }
}
