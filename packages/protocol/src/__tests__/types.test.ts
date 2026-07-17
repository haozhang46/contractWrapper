import { describe, expect, test } from 'bun:test'
import {
  isAuthorizeResult,
  type AuthorizeResult,
} from '../index.ts'

describe('isAuthorizeResult', () => {
  test('accepts allow', () => {
    const r: AuthorizeResult = { decision: 'allow' }
    expect(isAuthorizeResult(r)).toBe(true)
  })

  test('accepts needs_confirm with requestId', () => {
    expect(
      isAuthorizeResult({
        decision: 'needs_confirm',
        requestId: 'req_1',
        message: 'Confirm Bash',
      }),
    ).toBe(true)
  })

  test('rejects needs_confirm without requestId', () => {
    expect(isAuthorizeResult({ decision: 'needs_confirm' })).toBe(false)
  })
})
