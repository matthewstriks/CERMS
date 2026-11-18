/** One mailbox only: never accept recipient lists, display names or mail headers. */
export function validReceiptEmail(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 254 &&
    /^[^\s@<>(),;:"\\[\]]+@[^\s@<>(),;:"\\[\]]+\.[^\s@<>(),;:"\\[\]]+$/.test(value)
  )
}
