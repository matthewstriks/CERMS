const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export type ReferenceKind = 'order' | 'register'

/** A stable search/display alias. UUIDs remain the authoritative record keys. */
export function displayReference(kind: ReferenceKind, id: string): string {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) return id
  // FNV-1a over the entire canonical UUID, then encode 40 bits in eight symbols.
  let value = 14695981039346656037n
  for (const char of id.toLowerCase())
    value = BigInt.asUintN(64, (value ^ BigInt(char.charCodeAt(0))) * 1099511628211n)
  let code = ''
  for (let i = 0; i < 8; i++) {
    code = alphabet[Number(value & 31n)] + code
    value >>= 5n
  }
  return `${kind === 'order' ? 'O' : 'R'}-${code.slice(0, 4)}-${code.slice(4)}`
}

export function matchesDisplayReference(kind: ReferenceKind, id: string, search: string): boolean {
  const normalized = (value: string) => value.toUpperCase().replace(/[\s-]/g, '')
  const term = normalized(search)
  return !!term && normalized(displayReference(kind, id)).includes(term)
}
