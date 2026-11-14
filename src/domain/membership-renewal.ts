export type MembershipRenewalMode = 'restart' | 'extend'

export function membershipRenewalPreview(
  expiresAtMillis: number | null,
  durationSeconds: number,
  nowMillis: number,
  units = 1,
) {
  if (!Number.isSafeInteger(units) || units < 1 || units > 100)
    throw new Error('Invalid membership quantity.')
  const active =
    expiresAtMillis !== null && Number.isFinite(expiresAtMillis) && expiresAtMillis > nowMillis
  const duration = durationSeconds * units
  const restartExpiresAt = membershipRenewalExpiry(null, duration, 'restart', nowMillis) * 1000
  return {
    active,
    units,
    remainingMillis: active ? expiresAtMillis - nowMillis : 0,
    restartExpiresAt,
    extendExpiresAt: active
      ? membershipRenewalExpiry(Math.floor(expiresAtMillis / 1000), duration, 'extend', nowMillis) *
        1000
      : restartExpiresAt,
  }
}

export function membershipRenewalExpiry(
  currentExpiration: unknown,
  durationSeconds: number,
  mode: MembershipRenewalMode,
  nowMillis: number,
): number {
  if (
    !['restart', 'extend'].includes(mode) ||
    !Number.isSafeInteger(durationSeconds) ||
    durationSeconds <= 0 ||
    !Number.isFinite(nowMillis)
  )
    throw new Error('Invalid membership renewal duration or mode.')
  const now = Math.floor(nowMillis / 1000)
  const current = Number(currentExpiration)
  if (
    mode === 'extend' &&
    (currentExpiration == null || !Number.isSafeInteger(current) || current < 0)
  )
    throw new Error('Existing expiration is unavailable. Choose Start from today.')
  const expiration = (mode === 'restart' ? now : Math.max(now, current)) + durationSeconds
  if (!Number.isSafeInteger(expiration) || expiration * 1000 > 8640000000000000)
    throw new Error('Membership expiration exceeds the supported range.')
  return expiration
}
