// Fixed local-only model; no paid/cloud model selector or renderer-supplied endpoint.
export const supportModel = 'qwen2.5:1.5b'
export const assistantName = 'CERMS Assistant'
export const supportModelDownload = 'Approximately 1 GB, plus the Ollama installation'
export interface AssistantUser {
  uid: string
  name: string
  email: string
  business: string
}
export function validAssistantUser(value: unknown): value is AssistantUser {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const u = value as AssistantUser
  return (
    Object.keys(u).sort().join() === 'business,email,name,uid' &&
    typeof u.uid === 'string' &&
    /^[a-zA-Z0-9_-]{1,128}$/.test(u.uid) &&
    typeof u.business === 'string' &&
    /^[a-zA-Z0-9_-]{1,128}$/.test(u.business) &&
    typeof u.name === 'string' &&
    !!u.name.trim() &&
    u.name.length <= 256 &&
    typeof u.email === 'string' &&
    u.email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email) &&
    !/[\x00-\x1f\x7f]/.test(u.name + u.email)
  )
}
export interface HelpArticle {
  id: string
  title: string
  text: string
  keywords: string
}
export interface SupportTurn {
  role: 'user' | 'assistant'
  text: string
  sources?: HelpArticle[]
}
export interface AiSupportState {
  runtime: 'unknown' | 'missing' | 'available' | 'unsupported'
  modelReady: boolean
  busy: 'checking' | 'download' | 'answer' | 'remove' | null
  message: string
  error?: string
  emailError?: string
  percent?: number
  completed?: number
  total?: number
  turns: SupportTurn[]
}
export function redactSupportSecrets(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [redacted]')
    .replace(/\b(?:github_pat_[A-Za-z0-9_]+|gh[pousr]_[A-Za-z0-9]+)\b/g, '[redacted token]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted token]')
    .replace(/((?:password|access_token|refresh_token|idToken)\s*[=:]\s*)\S+/gi, '$1[redacted]')
}
export function supportTranscript(turns: SupportTurn[], version: string): string {
  return (
    `CERMS ${version} — CERMS Assistant conversation\nAssistant suggestions may be incorrect; no actions were performed.\n\n` +
    turns
      .map(
        (t) =>
          `${t.role === 'user' ? 'Staff' : 'AI'}: ${redactSupportSecrets(t.text)}${t.sources?.length ? '\nHelp articles: ' + t.sources.map((s) => s.title).join('; ') : ''}`,
      )
      .join('\n\n')
  )
}
