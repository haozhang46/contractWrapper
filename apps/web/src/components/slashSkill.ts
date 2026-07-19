export type SlashQuery = {
  active: boolean
  filter: string
}

export type SlashSkillItem = {
  name: string
  description: string
}

/** Detect a leading `/` slash-command draft (no args yet). */
export function parseSlashQuery(input: string): SlashQuery | null {
  if (!input.startsWith('/')) return null
  const after = input.slice(1)
  if (/\s/.test(after)) return null
  return { active: true, filter: after }
}

/** Case-insensitive match on name or description. */
export function filterSkills(
  skills: SlashSkillItem[],
  filter: string,
): SlashSkillItem[] {
  const q = filter.trim().toLowerCase()
  if (!q) return skills
  return skills.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q),
  )
}

/** Replace the first `/token` with `/name`, preserving trailing args. */
export function applySlashInsert(input: string, name: string): string {
  const match = /^\/\S*/.exec(input)
  if (!match) return `/${name}`
  return `/${name}${input.slice(match[0].length)}`
}
