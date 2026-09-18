import { normalizePhone } from '../domain/phone'
import { dateOnlyMillis, type MemberDraft, type MembershipOption } from '../domain/member-creation'

/** The only encoder for the legacy member schema. Keep migration changes here. */
export function encodeLegacyMember(
  draft: MemberDraft,
  product: MembershipOption,
  context: { club: string; staffName: string; now: Date; number: number },
) {
  if (
    product.id !== draft.membershipProductId ||
    !product.name ||
    !Number.isFinite(product.durationSeconds) ||
    product.durationSeconds <= 0
  )
    throw new Error('This membership product has no valid duration.')
  const creationMillis =
    draft.importExisting && draft.createdDate
      ? dateOnlyMillis(draft.createdDate)
      : context.now.getTime()
  // Legacy normal creation starts the duration at purchase time; import dates are UTC midnight.
  const expiration =
    draft.importExisting && draft.expiresDate
      ? dateOnlyMillis(draft.expiresDate) / 1000
      : Math.floor(context.now.getTime() / 1000) + product.durationSeconds
  const phone = normalizePhone(draft.phone)
  return {
    access: context.club,
    notes: draft.notes
      ? [`${context.staffName} [${context.now.toLocaleString('en-US')}]: ${draft.notes}`]
      : [],
    name: `${draft.firstName} ${draft.lastName}`,
    fname: draft.firstName,
    lname: draft.lastName,
    mname: draft.middleName,
    suffix: draft.suffix,
    dna: false,
    id_number: context.number,
    waiver_status: false,
    id_expiration: expiration,
    dob: draft.birthDate,
    // The storage adapter turns this Date into a Firestore Timestamp/server timestamp.
    creation_time: new Date(creationMillis),
    membership_type: product.name,
    checkedIn: false,
    idnum: draft.governmentId,
    idstate: draft.governmentIdType,
    email: draft.email,
    ...(phone ? { phone } : {}),
  }
}
