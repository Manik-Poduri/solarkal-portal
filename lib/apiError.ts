// Turns an Anthropic API failure into a short, safe reason the team can act on.
export function describeApiError(e: unknown): string {
  const err = e as { status?: number; message?: string } | null
  const status = err?.status
  const msg = String(err?.message ?? '').toLowerCase()
  if (msg.includes('credit balance')) return 'Anthropic credit balance is too low or sits in a different workspace than this API key'
  if (status === 401) return 'the Anthropic API key was rejected'
  if (status === 403) return 'the Anthropic API key is not allowed to do this'
  if (status === 404) return 'the Claude model was not found'
  if (status === 429) return 'Anthropic rate limit reached, try again in a minute'
  if (status && status >= 500) return 'Anthropic is having trouble, try again shortly'
  return status ? `Anthropic returned error ${status}` : 'could not reach Anthropic'
}
