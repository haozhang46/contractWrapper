export type SkillSource = 'runtime' | 'factory'
export type SkillZone = 'staging' | 'published'

export type SkillRegistryEntry = {
  id: string
  source: SkillSource
  zone?: SkillZone
  enabled: boolean
  updatedAt: string
}

export type SkillRegistry = {
  version: 1
  entries: SkillRegistryEntry[]
}

export type SkillListItem = {
  id: string
  name: string
  description: string
  source: SkillSource
  zone?: SkillZone
  enabled: boolean
  installed: boolean
}

export type SkillDetail = SkillListItem & {
  skillMd: string
}

export type FactoryTools = {
  assetsRoot: string
  skillList: (assetsRoot: string) => Array<{ id: string; zone: SkillZone }>
  skillGet: (
    assetsRoot: string,
    id: string,
    zone?: SkillZone,
  ) => { id: string; zone: SkillZone; skillMd: string }
}

export class SkillConflictError extends Error {
  readonly code = 'CONFLICT' as const

  constructor(message = 'Skill already enabled from another source') {
    super(message)
    this.name = 'SkillConflictError'
  }
}

export class SkillNotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const

  constructor(id: string) {
    super(`Skill not found: ${id}`)
    this.name = 'SkillNotFoundError'
  }
}
