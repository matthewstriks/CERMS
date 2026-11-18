import type { HelpArticle } from '../shared/ai-support'

// Only curated, customer-facing guides are bundled. Never ingest operational docs,
// remote pages, business records or credentials into the local support model.
const guides = import.meta.glob<string>('../../docs/help/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
})
export const supportArticles: HelpArticle[] = Object.entries(guides).map(([path, source]) => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n\s*# ([^\r\n]+)\r?\n([\s\S]*)$/.exec(source)
  const id = /^id: ([a-z0-9-]+)$/m.exec(match?.[1] ?? '')?.[1]
  const keywords = /^keywords: (.+)$/m.exec(match?.[1] ?? '')?.[1]
  if (!match || !id || !keywords) throw new Error(`Invalid bundled help guide: ${path}`)
  return {
    id,
    title: match[2]!,
    keywords,
    // Plain text preserves numbered steps/paragraphs in both the chat prompt and UI.
    text: match[3]!.replace(/^## /gm, '').trim(),
  }
})
const ignored = new Set(
  'the and for with how can does this that have from into what when where why help please cerms problem issue work working my your our their its are was were will would should could need want about also just has had did not cant cannot dont using use get give tell show to of in on it is as at an be by do if me or so'.split(
    ' ',
  ),
)
const aliases: Record<string, string> = {
  creating: 'create',
  editing: 'edit',
  changing: 'edit',
  change: 'edit',
  deleting: 'delete',
  removing: 'remove',
  removal: 'remove',
  uploading: 'upload',
  downloading: 'download',
  installing: 'install',
  installation: 'install',
  updating: 'update',
  printing: 'print',
  emailing: 'email',
  sending: 'send',
  receiving: 'receive',
  renewing: 'renew',
  renewal: 'renew',
  returning: 'return',
  refunding: 'refund',
  opening: 'open',
  closing: 'close',
  verifying: 'verify',
  verification: 'verify',
  searching: 'search',
  finding: 'find',
  configuring: 'configure',
  configuration: 'configure',
  saving: 'save',
  saved: 'save',
  taking: 'take',
  attaching: 'attach',
  attachment: 'attach',
  recipet: 'receipt',
  recipets: 'receipt',
  coupon: 'discount',
  promo: 'discount',
  birthday: 'dob',
  identification: 'id',
  photograph: 'photo',
}
function terms(text: string): string[] {
  const tokens =
    text
      .toLowerCase()
      .replace(/(?:log|sign)[ -]?in/g, 'login')
      .replace(/check[ -]?out/g, 'checkout')
      .replace(/check[ -]?in/g, 'checkin')
      .match(/[a-z0-9]{2,}/g) ?? []
  return [
    ...new Set(
      tokens
        .filter((t) => !ignored.has(t))
        .map((t) => {
          const singular =
            t.length > 4 && t.endsWith('ies')
              ? t.slice(0, -3) + 'y'
              : t.length > 4 && t.endsWith('s') && !t.endsWith('ss')
                ? t.slice(0, -1)
                : t
          return aliases[singular] ?? singular
        }),
    ),
  ]
}
const indexed = supportArticles.map((article) => ({
  article,
  title: new Set(terms(article.title)),
  keys: new Set(terms(article.keywords)),
  body: new Set(terms(article.text)),
}))
const frequency = new Map<string, number>()
for (const entry of indexed)
  for (const term of new Set([...entry.title, ...entry.keys, ...entry.body]))
    frequency.set(term, (frequency.get(term) ?? 0) + 1)
const weight = (term: string) => 1 + Math.log(1 + indexed.length / (1 + (frequency.get(term) ?? 0)))
function score(entry: (typeof indexed)[number], query: string[]) {
  return query.reduce(
    (sum, term) =>
      sum +
      weight(term) *
        ((entry.title.has(term) ? 4 : 0) +
          (entry.keys.has(term) ? 3 : 0) +
          (entry.body.has(term) ? 0.5 : 0)),
    0,
  )
}
export const maxSupportArticleContext = 6000
export function findSupportArticles(question: string, previousQuestion = ''): HelpArticle[] {
  const query = terms(question),
    previous = terms(previousQuestion)
  const ranked = indexed
    // At least one current-topic title/keyword must match; body coincidences alone
    // never turn an unknown question into a confidently documented answer.
    .filter((entry) => query.some((t) => entry.title.has(t) || entry.keys.has(t)))
    .map((entry) => ({
      article: entry.article,
      score: score(entry, query) + Math.min(2, score(entry, previous) * 0.15),
    }))
    .sort((a, b) => b.score - a.score || a.article.id.localeCompare(b.article.id))
  const result: HelpArticle[] = []
  let length = 0
  for (const { article } of ranked) {
    const size = article.title.length + article.text.length + 2
    if (length + size > maxSupportArticleContext) continue
    result.push(article)
    length += size
    if (result.length === 3) break
  }
  return result
}
