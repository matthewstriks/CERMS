export const discountEndpoint = 'https://us-central1-cerms-7af24.cloudfunctions.net/discountCodes'
export type DiscountKind = 'percent' | 'amount'
export interface DiscountRule {
  code: string
  name: string
  description: string
  kind: DiscountKind
  value: number
  active: boolean
  productIds: string[]
  categoryIds: string[]
  productKinds: ('retail' | 'membership' | 'rental')[]
  startsAt: number | null
  endsAt: number | null
  minimumCents: number
  maxDiscountCents: number | null
  maxUses: number | null
  maxUsesPerMember: number | null
}
export interface DiscountRecord {
  rule: DiscountRule
  version: number
  usedCount: number
  archived: boolean
}
export interface DiscountSelection {
  code: string
  version: number
  expectedDiscountCents: number
}
export interface DiscountQuote extends DiscountSelection {
  name: string
  lineDiscounts: number[]
}
export interface DiscountLine {
  productId: string
  categoryId: string
  kind: 'retail' | 'membership' | 'rental'
  quantity: number
  unitPriceCents: number
  payout: boolean
  waived?: boolean
}
export const discountCode = (value: string) => value.trim().toUpperCase()
const id = (v: unknown) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(v)
const code = (v: unknown) => typeof v === 'string' && /^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(v)
const exact = (v: unknown, keys: string[]): v is Record<string, unknown> =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).sort().join() === keys.sort().join()
const amount = (v: unknown, min = 0) =>
  Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= 999999999
const limit = (v: unknown) =>
  v === null || (Number.isSafeInteger(v) && Number(v) > 0 && Number(v) <= 1000000000)
export function validDiscountRule(v: unknown): v is DiscountRule {
  if (
    !exact(v, [
      'code',
      'name',
      'description',
      'kind',
      'value',
      'active',
      'productIds',
      'categoryIds',
      'productKinds',
      'startsAt',
      'endsAt',
      'minimumCents',
      'maxDiscountCents',
      'maxUses',
      'maxUsesPerMember',
    ])
  )
    return false
  const ids = (x: unknown) =>
    Array.isArray(x) && x.length <= 100 && new Set(x).size === x.length && x.every(id)
  const date = (n: unknown) =>
    n === null || (Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) <= 8640000000000000)
  return (
    code(v.code) &&
    typeof v.name === 'string' &&
    !!v.name.trim() &&
    v.name.length <= 120 &&
    typeof v.description === 'string' &&
    v.description.length <= 500 &&
    ['percent', 'amount'].includes(v.kind as string) &&
    amount(v.value, 1) &&
    (v.kind !== 'percent' || Number(v.value) <= 10000) &&
    typeof v.active === 'boolean' &&
    ids(v.productIds) &&
    ids(v.categoryIds) &&
    Array.isArray(v.productKinds) &&
    v.productKinds.length <= 3 &&
    new Set(v.productKinds).size === v.productKinds.length &&
    v.productKinds.every((k) => ['retail', 'membership', 'rental'].includes(k)) &&
    date(v.startsAt) &&
    date(v.endsAt) &&
    (v.startsAt === null || v.endsAt === null || Number(v.endsAt) > Number(v.startsAt)) &&
    amount(v.minimumCents) &&
    (v.maxDiscountCents === null || amount(v.maxDiscountCents, 1)) &&
    limit(v.maxUses) &&
    limit(v.maxUsesPerMember)
  )
}
export function validDiscountSelection(v: unknown): v is DiscountSelection {
  return (
    exact(v, ['code', 'version', 'expectedDiscountCents']) &&
    code(v.code) &&
    Number.isSafeInteger(v.version) &&
    Number(v.version) > 0 &&
    amount(v.expectedDiscountCents, 1)
  )
}
export function validDiscountData(v: unknown): boolean {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const d = v as Record<string, unknown>
  if (!id(d.business)) return false
  if (d.action === 'list')
    return (
      exact(d, ['action', 'business', ...('cursor' in d ? ['cursor'] : [])]) &&
      (!('cursor' in d) || code(d.cursor))
    )
  if (d.action === 'save')
    return (
      exact(d, ['action', 'business', 'rule', 'expectedVersion']) &&
      validDiscountRule(d.rule) &&
      Number.isSafeInteger(d.expectedVersion) &&
      Number(d.expectedVersion) >= 0
    )
  if (d.action === 'archive')
    return (
      exact(d, ['action', 'business', 'code', 'expectedVersion']) &&
      code(d.code) &&
      Number.isSafeInteger(d.expectedVersion) &&
      Number(d.expectedVersion) > 0
    )
  return (
    d.action === 'quote' &&
    exact(d, ['action', 'business', 'code', 'memberId', 'lines']) &&
    code(d.code) &&
    (d.memberId === null || id(d.memberId)) &&
    Array.isArray(d.lines) &&
    d.lines.length > 0 &&
    d.lines.length <= 100 &&
    new Set(d.lines.map((l) => l?.productId)).size === d.lines.length &&
    d.lines.every(
      (l) =>
        exact(l, [
          'productId',
          'version',
          'quantity',
          'unitPriceCents',
          ...('waived' in l ? ['waived'] : []),
        ]) &&
        id(l.productId) &&
        Number.isSafeInteger(l.version) &&
        Number(l.version) > 0 &&
        Number.isSafeInteger(l.quantity) &&
        Number(l.quantity) > 0 &&
        Number(l.quantity) <= 1000 &&
        amount(l.unitPriceCents) &&
        (l.waived === undefined || typeof l.waived === 'boolean'),
    )
  )
}
export function isDiscountRequest(body?: string): boolean {
  try {
    if (!body || body.length > 50000) return false
    const d = JSON.parse(body)
    return exact(d, ['data']) && validDiscountData(d.data)
  } catch {
    return false
  }
}
export function priceDiscount(
  rule: DiscountRule,
  lines: DiscountLine[],
  now: number,
): { discountCents: number; lineDiscounts: number[] } {
  if (!validDiscountRule(rule) || !rule.active) throw Error('This discount is inactive.')
  if (rule.startsAt !== null && now < rule.startsAt)
    throw Error('This discount has not started yet.')
  if (rule.endsAt !== null && now >= rule.endsAt) throw Error('This discount has expired.')
  if (lines.some((l) => l.payout)) throw Error('Discount codes cannot be used on payout orders.')
  const eligible = lines.map((l) =>
    !l.waived &&
    (!rule.productKinds.length || rule.productKinds.includes(l.kind)) &&
    ((!rule.productIds.length && !rule.categoryIds.length) ||
      rule.productIds.includes(l.productId) ||
      rule.categoryIds.includes(l.categoryId))
      ? l.quantity * l.unitPriceCents
      : 0,
  )
  const subtotal = eligible.reduce((a, b) => a + b, 0)
  if (!amount(subtotal, 1))
    throw Error(
      'No eligible priced products for this discount, or the eligible subtotal is too large.',
    )
  if (subtotal < rule.minimumCents)
    throw Error('The eligible subtotal does not meet this code’s minimum spend.')
  const discountCents = Math.min(
    subtotal,
    rule.kind === 'percent' ? Math.round((subtotal * rule.value) / 10000) : rule.value,
    rule.maxDiscountCents ?? subtotal,
  )
  if (discountCents < 1) throw Error('This discount does not reduce the order total.')
  const allocated = eligible.map((n, index) => {
    const numerator = BigInt(n) * BigInt(discountCents)
    return {
      index,
      value: Number(numerator / BigInt(subtotal)),
      remainder: numerator % BigInt(subtotal),
    }
  })
  let left = discountCents - allocated.reduce((a, b) => a + b.value, 0)
  for (const a of [...allocated].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  )) {
    if (left <= 0) break
    if (eligible[a.index]! > 0) {
      a.value++
      left--
    }
  }
  return { discountCents, lineDiscounts: allocated.map((a) => a.value) }
}
