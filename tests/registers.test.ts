import { describe, expect, it } from 'vitest'
import {
  cashTotal,
  emptyCashCounts,
  registerFromData,
  validCashCounts,
} from '../src/domain/registers'
import {
  closeRegisterCommit,
  isRegisterCommit,
  openRegisterCommit,
} from '../src/shared/register-policy'
import { allowFirebaseRequest } from '../src/shared/firebase-policy'

const id = '20000000-0000-4000-8000-000000000001'
const counts = () => ({
  ...emptyCashCounts(),
  bill20: 5,
  bill2: 3,
  coin100: 2,
  coin50: 1,
  coin25: 2,
  coin10: 1,
  coin5: 1,
  coin1: 3,
})
describe('register denomination accounting', () => {
  it('totals all denominations in integer cents, including uncommon bills and coins', () => {
    expect(cashTotal(counts())).toBe(10918)
    expect(cashTotal(emptyCashCounts())).toBe(0)
    const all = Object.fromEntries(Object.keys(emptyCashCounts()).map((key) => [key, 1]))
    expect(cashTotal(all as ReturnType<typeof emptyCashCounts>)).toBe(18991)
  })
  it('rejects negative, fractional, oversized, missing, extra and nonnumeric counts', () => {
    for (const value of [-1, 0.5, 10001, NaN, Infinity, '2', null])
      expect(validCashCounts({ ...emptyCashCounts(), coin1: value })).toBe(false)
    const missing: any = emptyCashCounts()
    delete missing.bill2
    expect(validCashCounts(missing)).toBe(false)
    expect(validCashCounts({ ...emptyCashCounts(), extra: 0 })).toBe(false)
  })
  it('validates stored totals and keeps opening and closing counts separate', () => {
    const record = {
      schemaVersion: 1,
      status: 'closed',
      ownerUid: 'staff',
      ownerName: 'Staff',
      openingCounts: counts(),
      openingTotalCents: 10918,
      openedAt: { toMillis: () => 1000 },
      closingCounts: emptyCashCounts(),
      closingTotalCents: 0,
      closedAt: { toMillis: () => 2000 },
      closeNote: 'Counted empty',
    }
    expect(registerFromData(id, record)).toMatchObject({
      openedAt: 1000,
      closedAt: 2000,
      openingTotalCents: 10918,
      closingTotalCents: 0,
    })
    expect(() => registerFromData(id, { ...record, closingTotalCents: 1 })).toThrow('unsupported')
    expect(() => registerFromData(id, { ...record, closedAt: { toMillis: () => 0 } })).toThrow(
      'unsupported',
    )
  })
})
describe('register network boundary', () => {
  it('allows only scoped opening/closing shapes in the named database', () => {
    for (const payload of [
      openRegisterCommit('dev', id, 'staff', 'Staff', counts(), false),
      openRegisterCommit('club-a', id, 'staff', 'Staff', counts(), true),
      closeRegisterCommit('club-a', id, emptyCashCounts(), 'Closed'),
    ]) {
      const body = JSON.stringify(payload)
      expect(isRegisterCommit(body)).toBe(true)
      const endpoint =
        'https://firestore.googleapis.com/v1/projects/cerms-7af24/databases/cerms/documents:commit'
      expect(allowFirebaseRequest(endpoint, 'POST', body)).toBe(true)
      expect(allowFirebaseRequest(endpoint.replace('/cerms/', '/(default)/'), 'POST', body)).toBe(
        false,
      )
    }
  })
  it('rejects partial opens, arbitrary fields, count mismatches, profile writes and unsafe preconditions', () => {
    for (const mutate of [
      (p: any) => p.writes.pop(),
      (p: any) => (p.writes[0].update.fields.openingTotalCents.integerValue = '0'),
      (p: any) =>
        (p.writes[0].update.fields.openingCounts.mapValue.fields.coin1.integerValue = '-1'),
      (p: any) => (p.writes[0].update.fields.extra = { stringValue: 'bad' }),
      (p: any) => (p.writes[0].currentDocument.exists = true),
      (p: any) =>
        (p.writes[1].update.name = p.writes[1].update.name.replace(
          '/registerOwners/staff',
          '/registerOwners/other',
        )),
      (p: any) => (p.writes[1].update.fields.registerId.stringValue = 'different'),
      (p: any) =>
        (p.writes[0].update.name = p.writes[0].update.name.replace('/cerms/', '/(default)/')),
      (p: any) =>
        (p.writes[0].update.name = p.writes[0].update.name.replace('/registers/', '/products/')),
      (p: any) => p.writes.push({ update: { name: 'users/staff', fields: {} } }),
      (p: any) => (p.writes[0].updateTransforms[0].fieldPath = 'ownerUid'),
    ]) {
      const payload = openRegisterCommit('club-a', id, 'staff', 'Staff', counts(), false)
      mutate(payload)
      expect(isRegisterCommit(JSON.stringify(payload))).toBe(false)
    }
  })
  it('cannot reopen, rewrite opening values, delete, or change ownership through a close', () => {
    for (const mutate of [
      (p: any) => (p.writes[0].update.fields.status.stringValue = 'open'),
      (p: any) => p.writes[0].updateMask.fieldPaths.push('openingCounts'),
      (p: any) => (p.writes[0].update.fields.ownerUid = { stringValue: 'staff' }),
      (p: any) => (p.writes[0].delete = p.writes[0].update.name),
      (p: any) => (p.writes[0].update.fields.closeNote.stringValue = 'x'.repeat(2001)),
    ]) {
      const payload = closeRegisterCommit('club-a', id, counts(), '')
      mutate(payload)
      expect(isRegisterCommit(JSON.stringify(payload))).toBe(false)
    }
  })
})
