import { parsePhoneNumberFromString } from 'libphonenumber-js/max'

/** Empty is allowed; nonempty numbers use US defaults or an explicit country code. */
export function normalizePhone(value: string): string {
  const text = value.trim()
  if (!text) return ''
  const phone =
    text.length <= 64 && /^[+\d\s().-]+$/.test(text)
      ? parsePhoneNumberFromString(text, { defaultCountry: 'US', extract: false })
      : undefined
  if (!phone || phone.ext || !phone.isValid())
    throw new Error(
      'Enter a valid phone number. For international numbers, include + and the country code.',
    )
  return phone.number
}

export function phoneLabel(value?: string): string {
  if (!value?.trim()) return 'Not recorded'
  try {
    const phone = parsePhoneNumberFromString(normalizePhone(value))!
    return phone.countryCallingCode === '1' ? phone.formatNational() : phone.formatInternational()
  } catch {
    return value
  }
}
