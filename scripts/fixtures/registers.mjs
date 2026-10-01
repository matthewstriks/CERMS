export const emptyCounts = () =>
  Object.fromEntries(
    [
      'bill100',
      'bill50',
      'bill20',
      'bill10',
      'bill5',
      'bill2',
      'bill1',
      'coin100',
      'coin50',
      'coin25',
      'coin10',
      'coin5',
      'coin1',
    ].map((key) => [key, 0]),
  )
export const encode = (value) =>
  Object.fromEntries(
    Object.entries(value).map(([key, value]) => [
      key,
      value === null
        ? { nullValue: null }
        : typeof value === 'string'
          ? { stringValue: value }
          : typeof value === 'number'
            ? { integerValue: String(value) }
            : { mapValue: { fields: encode(value) } },
    ]),
  )
export const registerOpen = (base, club, uid, id, prior = false) => ({
  writes: [
    {
      update: {
        name: `${base}/system/${club}/registers/${id}`,
        fields: encode({
          schemaVersion: 1,
          status: 'open',
          ownerUid: uid,
          ownerName: 'Synthetic Staff',
          openingCounts: { ...emptyCounts(), bill20: 5 },
          openingTotalCents: 10000,
          closingCounts: null,
          closingTotalCents: null,
          closedAt: null,
          closeNote: '',
        }),
      },
      currentDocument: { exists: false },
      updateTransforms: [{ fieldPath: 'openedAt', setToServerValue: 'REQUEST_TIME' }],
    },
    {
      update: {
        name: `${base}/system/${club}/registerOwners/${uid}`,
        fields: encode({ registerId: id }),
      },
      currentDocument: { exists: prior },
    },
  ],
})
export const registerClose = (base, club, id) => ({
  writes: [
    {
      update: {
        name: `${base}/system/${club}/registers/${id}`,
        fields: encode({
          status: 'closed',
          closingCounts: { ...emptyCounts(), bill20: 6, coin1: 3 },
          closingTotalCents: 12003,
          closeNote: 'Synthetic closing count',
        }),
      },
      currentDocument: { exists: true },
      updateMask: { fieldPaths: ['status', 'closingCounts', 'closingTotalCents', 'closeNote'] },
      updateTransforms: [{ fieldPath: 'closedAt', setToServerValue: 'REQUEST_TIME' }],
    },
  ],
})
