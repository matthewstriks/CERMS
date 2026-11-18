import { catalogFields } from './fixtures/catalog.mjs'
import { registerOpen } from './fixtures/registers.mjs'
export async function staffRuleChecks({ base, seed, check, fields, str, owner }) {
  const uid = 'permission-staff',
    club = 'club-a'
  await seed('users/' + owner, { ...fields(owner), access: str(club) })
  await seed('users/' + uid, fields(uid))
  const permissions = {
    editMembers: false,
    deleteMembers: false,
    manageProducts: false,
    openRegisters: false,
    closeRegisters: false,
  }
  const permissionPath = `${base}/system/${club}/staffPermissions/${uid}`
  const permissionWrite = (data = permissions, target = uid) => ({
    writes: [
      {
        update: {
          name: `${base}/system/${club}/staffPermissions/${target}`,
          fields: {
            permissions: { mapValue: { fields: catalogFields(data) } },
            updatedBy: str(owner),
          },
        },
        updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
      },
    ],
  })
  const commit = (body, actor = owner) => ({ uid: actor, method: 'POST', body })
  await check(
    'Owner lists business staff',
    base + ':runQuery',
    {
      uid: owner,
      method: 'POST',
      body: {
        structuredQuery: {
          from: [{ collectionId: 'users' }],
          where: { fieldFilter: { field: { fieldPath: 'access' }, op: 'EQUAL', value: str(club) } },
          limit: 50,
        },
      },
    },
    true,
  )
  await check(
    'Owner cannot list foreign staff',
    base + ':runQuery',
    {
      uid: owner,
      method: 'POST',
      body: {
        structuredQuery: {
          from: [{ collectionId: 'users' }],
          where: {
            fieldFilter: { field: { fieldPath: 'access' }, op: 'EQUAL', value: str('club-b') },
          },
          limit: 50,
        },
      },
    },
    false,
  )
  await check('Owner saves staff permissions', base + ':commit', commit(permissionWrite()), true)
  await check(
    'Owner grants product waiver permission',
    base + ':commit',
    commit(permissionWrite({ ...permissions, waiveProducts: true })),
    true,
  )
  await check(
    'Waiver permission rejects nonboolean values',
    base + ':commit',
    commit(permissionWrite({ ...permissions, waiveProducts: 'yes' })),
    false,
  )
  await check(
    'Staff cannot grant waiver permission',
    base + ':commit',
    commit(permissionWrite({ ...permissions, waiveProducts: true }), uid),
    false,
  )
  await check(
    'Owner grants independent note removal admin permission',
    base + ':commit',
    commit(permissionWrite({ ...permissions, removeMemberNotes: true })),
    true,
  )
  await check(
    'Owner retains compatible older permission shape',
    base + ':commit',
    commit(permissionWrite()),
    true,
  )
  await check(
    'Owner grants separate staff management rights',
    base + ':commit',
    commit(permissionWrite({ ...permissions, editStaffProfiles: true, removeStaffAccounts: true })),
    true,
  )
  await check(
    'Staff management rights must be boolean',
    base + ':commit',
    commit(permissionWrite({ ...permissions, editStaffProfiles: 'yes' })),
    false,
  )
  await check(
    'Delegated staff cannot grant staff management rights',
    base + ':commit',
    commit(permissionWrite({ ...permissions, editStaffProfiles: true }), uid),
    false,
  )
  await check(
    'Staff management requires callable for profile edits',
    base + ':commit',
    commit(
      {
        writes: [
          {
            update: { name: base + '/users/' + uid, fields: { displayName: str('Changed') } },
            updateMask: { fieldPaths: ['displayName'] },
          },
        ],
      },
      uid,
    ),
    false,
  )
  await check(
    'Staff management requires callable for removal',
    base + '/users/' + uid,
    { uid, method: 'DELETE' },
    false,
  )
  await check(
    'Owner grants optional independent refund permission',
    base + ':commit',
    commit(permissionWrite({ ...permissions, processRefunds: true })),
    true,
  )
  await check(
    'Refund permission must be boolean',
    base + ':commit',
    commit(permissionWrite({ ...permissions, processRefunds: 'yes' })),
    false,
  )
  await check(
    'Staff cannot grant refund permission',
    base + ':commit',
    commit(permissionWrite({ ...permissions, processRefunds: true }), uid),
    false,
  )
  await check(
    'Refund state remains server only',
    base + '/system/' + club + '/saleRefunds/receipt',
    { uid, method: 'DELETE' },
    false,
  )
  await check(
    'Owner grants code management without catalog writes',
    base + ':commit',
    commit(permissionWrite({ ...permissions, manageDiscountCodes: true })),
    true,
  )
  await seed('system/' + club + '/products/read-only', catalogFields({ membership: false }))
  await check(
    'Discount managers read current-business products',
    base + '/system/' + club + '/products/read-only',
    { uid },
    true,
  )
  await check(
    'Discount managers cannot edit products',
    base + '/system/' + club + '/products/read-only',
    { uid, method: 'DELETE' },
    false,
  )
  await check(
    'Discount management flag must be boolean',
    base + ':commit',
    commit(permissionWrite({ ...permissions, manageDiscountCodes: 'yes' })),
    false,
  )
  await check(
    'Staff cannot grant code management',
    base + ':commit',
    commit(permissionWrite({ ...permissions, manageDiscountCodes: true }), uid),
    false,
  )
  await check(
    'Discount codes stay server written',
    base + '/system/' + club + '/discountCodes/SAVE',
    { uid, method: 'DELETE' },
    false,
  )
  await check('Staff reads own permissions', permissionPath, { uid }, true)
  await check('Other staff permissions private', permissionPath, { uid: 'staff' }, false)
  await check(
    'Staff cannot grant own permissions',
    base + ':commit',
    commit(permissionWrite({ ...permissions, editMembers: true }), uid),
    false,
  )
  await check(
    'Owner role cannot be edited',
    base + ':commit',
    commit(permissionWrite(permissions, owner)),
    false,
  )
  await check(
    'Unknown permissions rejected',
    base + ':commit',
    commit(permissionWrite({ ...permissions, owner: true })),
    false,
  )
  await seed('users/permission-foreign', { ...fields('permission-foreign'), access: str('club-b') })
  await check(
    'Cross-business grants rejected',
    base + ':commit',
    commit(permissionWrite(permissions, 'permission-foreign')),
    false,
  )
  const register = registerOpen(base, club, uid, '20000000-0000-4000-8000-000000000098')
  await check(
    'Register opening revoked by permission',
    base + ':commit',
    commit(register, uid),
    false,
  )
  const member = {
    access: club,
    fname: 'Synthetic',
    mname: '',
    lname: 'Guest',
    suffix: '',
    name: 'Synthetic Guest',
    dob: '1990-01-01',
    idnum: 'TEST-ID',
    idstate: 'TX',
    email: '',
    phone: '',
    membership_type: 'Legacy',
    id_expiration: 2000000000,
    dna: false,
    tag: false,
    searchFirst: 'synthetic',
    searchLast: 'guest',
    searchName: 'synthetic guest',
    searchId: 'TEST-ID',
    searchEmail: '',
  }
  await seed('members/permission-member', catalogFields(member))
  const edit = {
    writes: [
      {
        update: {
          name: base + '/members/permission-member',
          fields: catalogFields({ phone: '+12105550123', updatedBy: uid }),
        },
        updateMask: { fieldPaths: ['phone', 'updatedBy'] },
        updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
      },
    ],
  }
  await check('Member edit denied before grant', base + ':commit', commit(edit, uid), false)
  await check(
    'Grant editing only',
    base + ':commit',
    commit(permissionWrite({ ...permissions, editMembers: true })),
    true,
  )
  await check('Assigned member edit works', base + ':commit', commit(edit, uid), true)
  await check(
    'Edit right does not grant deletion',
    base + '/members/permission-member',
    { uid, method: 'DELETE' },
    false,
  )
  await seed('system/club-a/products/permission-product', catalogFields({ membership: true }))
  await check(
    'Edit member right does not grant catalog writes',
    base + '/system/club-a/products/permission-product',
    { uid, method: 'DELETE' },
    false,
  )
  await check(
    'Grant catalog and deletion',
    base + ':commit',
    commit(
      permissionWrite({
        ...permissions,
        manageProducts: true,
        deleteProducts: true,
        deleteMembers: true,
        openRegisters: true,
      }),
    ),
    true,
  )
  await check(
    'Assigned member delete works',
    base + '/members/permission-member',
    { uid, method: 'DELETE' },
    true,
  )
  await check(
    'Assigned catalog delete works',
    base + '/system/club-a/products/permission-product',
    { uid, method: 'DELETE' },
    true,
  )
  await seed('system/club-a/staffPermissions/' + uid, {
    permissions: { mapValue: { fields: catalogFields({ ...permissions, manageProducts: true }) } },
    updatedBy: str(owner),
  })
  await seed('system/club-a/products/delete-retail', catalogFields({ membership: false }))
  await check(
    'Edit products does not grant deletion',
    base + '/system/club-a/products/delete-retail',
    { uid, method: 'DELETE' },
    false,
  )
  await seed('system/club-a/staffPermissions/' + uid, {
    permissions: {
      mapValue: {
        fields: catalogFields({ ...permissions, deleteProducts: true, openRegisters: true }),
      },
    },
    updatedBy: str(owner),
  })
  await check(
    'Delete-only staff can read products',
    base + '/system/club-a/products/delete-retail',
    { uid },
    true,
  )
  await check(
    'Delete-only staff can delete retail',
    base + '/system/club-a/products/delete-retail',
    { uid, method: 'DELETE' },
    true,
  )
  await check(
    'Delete-only staff cannot delete categories',
    base + '/system/club-a/categories/retail',
    { uid, method: 'DELETE' },
    false,
  )
  await check('Assigned register open works', base + ':commit', commit(register, uid), true)
}
