import { describe, expect, test } from 'bun:test'
import { buildRunArgs } from '../args.ts'

describe('buildRunArgs', () => {
  test('minimal chat', () => {
    expect(
      buildRunArgs({ capability: 'chat', message: 'Explain Fourier' }),
    ).toEqual(['run', 'chat', 'Explain Fourier', '--format', 'json'])
  })

  test('kb string, tools, session, language, config', () => {
    expect(
      buildRunArgs({
        capability: 'deep_solve',
        message: 'Solve x^2=4',
        session: 'abc',
        kb: 'textbook',
        tool: ['rag', 'reason'],
        language: 'zh',
        config: { depth: 'standard', n: 2 },
      }),
    ).toEqual([
      'run',
      'deep_solve',
      'Solve x^2=4',
      '--session',
      'abc',
      '--kb',
      'textbook',
      '--tool',
      'rag',
      '--tool',
      'reason',
      '--language',
      'zh',
      '--config',
      'depth=standard',
      '--config',
      'n=2',
      '--format',
      'json',
    ])
  })

  test('kb array expands to repeated --kb', () => {
    expect(
      buildRunArgs({
        capability: 'chat',
        message: 'hi',
        kb: ['a', 'b'],
      }),
    ).toEqual([
      'run',
      'chat',
      'hi',
      '--kb',
      'a',
      '--kb',
      'b',
      '--format',
      'json',
    ])
  })
})
