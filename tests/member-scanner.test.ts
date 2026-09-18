import { describe, expect, it } from 'vitest'
import { decodeMemberScan, idTypes } from '../src/domain/member-creation'
const lines = [
  'DAQ0000123',
  'DCSGUEST',
  'DACJANE',
  'DADMIDDLE',
  'DCUJR',
  'DBB01021990',
  'DAJTX',
  'DBA01012020',
  'DCGUSA',
]
describe('US ID scanner decoding', () => {
  it.each(idTypes.filter((type) => /^[A-Z]{2}$/.test(type.value)).map((type) => type.value))(
    'accepts the standard address-state field for %s',
    (state) => {
      expect(
        decodeMemberScan(lines.join('\n').replace('DAJTX', 'DAJ' + state)).draft.governmentIdType,
      ).toBe(state)
    },
  )
  it.each(['DL', 'ID'])('handles %s ANSI headers, current suffix and expired-ID review', (kind) => {
    const scan = decodeMemberScan(
      `@\n\x1e\rANSI 636000100102${kind}00410278ZV03190008${kind}${lines.join('\r\n')}`,
    )
    expect(scan.draft).toMatchObject({
      firstName: 'JANE',
      birthDate: '1990-01-02',
      governmentId: '0000123',
      suffix: 'JR.',
    })
    expect(scan.warnings.some((w) => w.includes('expired'))).toBe(true)
    expect(scan.warnings.some((w) => w.includes('address state'))).toBe(true)
  })
  it.each(['\n', '\r', '\r\n', '\t', '\x1e'])(
    'handles preserved scanner separators %j',
    (separator) => {
      expect(decodeMemberScan(lines.join(separator)).draft.governmentId).toBe('0000123')
    },
  )
  it('rejects conflicting, concatenated, oversized and non-US scans without guessing', () => {
    for (const raw of [
      lines.join(''),
      lines.join('\n') + '\nDAQOTHER',
      'A'.repeat(16385),
      lines.join('\n').replace('DCGUSA', 'DCGCAN'),
      lines.join('\n').replace('01021990', '02301990'),
    ])
      expect(() => decodeMemberScan(raw)).toThrow()
  })
  it('warns about truncated names and never returns unrelated ID fields or raw payload', () => {
    const scan = decodeMemberScan(lines.join('\n') + '\nDDET\nDAGPRIVATE STREET')
    expect(scan.warnings.some((w) => w.includes('shortened'))).toBe(true)
    expect(JSON.stringify(scan)).not.toContain('PRIVATE STREET')
  })
})
