export function normalizeOpenAiBaseUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error('Invalid OpenAI base URL: empty input')
  }

  const withScheme = trimmed.includes('://') ? trimmed : `http://${trimmed}`

  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new Error(`Invalid OpenAI base URL: ${input}`)
  }

  let pathname = url.pathname.replace(/\/+$/, '') || ''

  if (pathname.endsWith('/chat/completions')) {
    pathname = pathname.slice(0, -'/chat/completions'.length)
  }

  if (pathname === '' || pathname === '/') {
    pathname = '/v1'
  } else if (!pathname.endsWith('/v1') && !pathname.includes('/v1/')) {
    pathname = `${pathname}/v1`
  }

  url.pathname = pathname
  return url.toString()
}
