import { describe, expect, test } from 'bun:test'
import { randomId } from '../randomId'

describe('randomId', () => {
  test('returns a uuid-shaped string', () => {
    const id = randomId()
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  test('returns unique values', () => {
    const a = randomId()
    const b = randomId()
    expect(a).not.toBe(b)
  })
})
