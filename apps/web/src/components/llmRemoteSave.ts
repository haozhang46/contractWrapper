export type RemoteSaveInput = {
  baseUrl: string
  model: string
  apiKey: string
}

export type RemoteSavePatch = {
  endpointMode: 'ollama-remote'
  provider: 'openai'
  baseUrl: string
  model: string
  apiKey: string
}

export function buildRemoteSavePatch(input: RemoteSaveInput): RemoteSavePatch {
  const baseUrl = input.baseUrl.trim()
  const model = input.model.trim()
  const trimmedKey = input.apiKey.trim()

  return {
    endpointMode: 'ollama-remote',
    provider: 'openai',
    baseUrl,
    model,
    apiKey: trimmedKey === '' ? 'ollama' : trimmedKey,
  }
}

export function canSaveRemote(input: RemoteSaveInput): boolean {
  return input.baseUrl.trim() !== '' && input.model.trim() !== ''
}
