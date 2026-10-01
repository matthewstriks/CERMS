import { catalogFields } from './fixtures/catalog.mjs'
export async function posRuleChecks({ base, seed, check, fields, str, owner }) {
  const club = 'club-a',
    uid = 'pos-staff',
    path = `${base}/system/${club}`
  await seed('users/pos-other', { ...fields('pos-other'), access: str('club-b') })
  await seed('users/' + uid, fields(uid))
  await seed('users/' + owner, { ...fields(owner), access: str(club) })
  await seed(`system/${club}/sales/synthetic-sale`, {
    totalCents: { integerValue: '1234' },
    createdAt: { timestampValue: '2026-10-01T12:00:00Z' },
  })
  await seed(`system/${club}/registerTotals/synthetic-register`, {
    expectedCashCents: { integerValue: '1234' },
  })
  await seed(`system/${club}/posSettings/default`, { taxRateBps: { integerValue: '800' } })
  for (const p of [
    'sales/synthetic-sale',
    'registerTotals/synthetic-register',
    'posSettings/default',
  ]) {
    await check('POS scoped read ' + p, `${path}/${p}`, { uid }, true)
    await check('POS other business denied ' + p, `${path}/${p}`, { uid: 'pos-other' }, false)
    await check(
      'POS client mutations denied ' + p,
      base + ':commit',
      {
        uid: owner,
        method: 'POST',
        body: { writes: [{ update: { name: `${path}/${p}`, fields: { forged: str('value') } } }] },
      },
      false,
    )
  }
  const permissions = {
    processSales: true,
    editMembers: false,
    deleteMembers: false,
    manageProducts: false,
    openRegisters: true,
    closeRegisters: true,
  }
  await check(
    'Owner can assign POS permission',
    base + ':commit',
    {
      uid: owner,
      method: 'POST',
      body: {
        writes: [
          {
            update: {
              name: `${path}/staffPermissions/${uid}`,
              fields: {
                permissions: { mapValue: { fields: catalogFields(permissions) } },
                updatedBy: str(owner),
              },
            },
            updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
          },
        ],
      },
    },
    true,
  )
  await check(
    'Cashier can list catalog',
    path + ':runQuery',
    {
      uid,
      method: 'POST',
      body: { structuredQuery: { from: [{ collectionId: 'products' }], limit: 100 } },
    },
    true,
  )
  await check(
    'Staff can list bounded sales history',
    path + ':runQuery',
    {
      uid,
      method: 'POST',
      body: {
        structuredQuery: {
          from: [{ collectionId: 'sales' }],
          orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
          limit: 50,
        },
      },
    },
    true,
  )
  await check(
    'Sales history must be bounded',
    path + ':runQuery',
    { uid, method: 'POST', body: { structuredQuery: { from: [{ collectionId: 'sales' }] } } },
    false,
  )
}
