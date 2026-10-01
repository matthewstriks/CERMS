import { catalogFields, membershipProduct } from './fixtures/catalog.mjs'
export async function productImageRuleChecks({ base, seed, check, fields, str, owner }) {
  await seed('users/' + owner, { ...fields(owner), access: str('club-a') })
  await seed('system/club-a', { businessName: str('Synthetic') })
  await seed('system/club-a/categories/images', { name: str('Images') })
  const imagePath = 'cerms5/catalog/club-a/products/image-product/' + 'a'.repeat(64) + '.webp'
  const data = { ...membershipProduct(), cat: 'images', imagePath, updatedBy: owner }
  const commit = (d) => ({
    uid: owner,
    method: 'POST',
    body: {
      writes: [
        {
          update: {
            name: base + '/system/club-a/products/image-product',
            fields: catalogFields(d),
          },
          updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
        },
      ],
    },
  })
  await check(
    'Product image attaches within business and product',
    base + ':commit',
    commit(data),
    true,
  )
  await check(
    'Product image foreign path denied',
    base + ':commit',
    commit({ ...data, version: 2, imagePath: imagePath.replace('club-a', 'club-b') }),
    false,
  )
  await check(
    'Product image other product denied',
    base + ':commit',
    commit({ ...data, version: 2, imagePath: imagePath.replace('/image-product/', '/other/') }),
    false,
  )
  await check(
    'Product image removal supported',
    base + ':commit',
    commit({ ...data, version: 2, imagePath: null }),
    true,
  )
}
