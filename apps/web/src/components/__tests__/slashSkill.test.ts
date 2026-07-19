import { describe, expect, test } from 'bun:test'
import {
  applySlashInsert,
  filterSkills,
  parseSlashQuery,
} from '../slashSkill'

describe('parseSlashQuery', () => {
  test('`/` → active with empty filter', () => {
    expect(parseSlashQuery('/')).toEqual({ active: true, filter: '' })
  })

  test('`/com` → active with filter `com`', () => {
    expect(parseSlashQuery('/com')).toEqual({ active: true, filter: 'com' })
  })

  test('`hello` → null', () => {
    expect(parseSlashQuery('hello')).toBeNull()
  })
})

describe('applySlashInsert', () => {
  test('replaces slash token', () => {
    expect(applySlashInsert('/com', 'commit')).toBe('/commit')
  })

  test('replaces first token only, keeps rest', () => {
    expect(applySlashInsert('/com extra', 'commit')).toBe('/commit extra')
  })
})

describe('filterSkills', () => {
  const skills = [
    { name: 'commit', description: 'Create a git commit' },
    { name: 'review', description: 'Review pull request' },
    { name: 'deploy', description: 'Ship to production' },
  ]

  test('matches name case-insensitively', () => {
    expect(filterSkills(skills, 'COM').map((s) => s.name)).toEqual(['commit'])
  })

  test('matches description case-insensitively', () => {
    expect(filterSkills(skills, 'pull').map((s) => s.name)).toEqual(['review'])
  })

  test('empty filter returns all', () => {
    expect(filterSkills(skills, '')).toEqual(skills)
  })
})
