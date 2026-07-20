export type Capability =
  | 'chat'
  | 'deep_solve'
  | 'deep_question'
  | 'deep_research'
  | 'visualize'
  | 'math_animator'
  | 'mastery_path'

export type RunInput = {
  capability: Capability
  message: string
  session?: string
  kb?: string | string[]
  tool?: string[]
  language?: string
  config?: Record<string, string | number | boolean>
}

export type StatusResult = {
  cli_ok: boolean
  version: string | null
  web_ok: boolean | null
  web_url: string
  error: { code: string; message: string } | null
}

export type RunResult = {
  ok: boolean
  text: string
  session_id?: string
  exit_code?: number
  error?: { code: string; message: string }
}
