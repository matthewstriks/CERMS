export const posEndpoints = {
  updateRental: 'https://us-central1-cerms-7af24.cloudfunctions.net/updateRental',
  completeSale: 'https://us-central1-cerms-7af24.cloudfunctions.net/completeSale',
  savePosSettings: 'https://us-central1-cerms-7af24.cloudfunctions.net/savePosSettings',
} as const
export function isPosRequest(url: string, body?: string): boolean {
  try {
    if (!body || body.length > 500000) return false
    const p = JSON.parse(body),
      d = p.data
    if (
      Object.keys(p).join() !== 'data' ||
      !d ||
      typeof d.business !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(d.business)
    )
      return false
    if (url === posEndpoints.updateRental)
      return (
        Object.keys(d).sort().join() ===
          'assignedRoom,business,expectedRevision,inside,notes,visitId,waiting' &&
        typeof d.visitId === 'string' &&
        /^[a-zA-Z0-9_-]{1,260}$/.test(d.visitId) &&
        Number.isSafeInteger(d.expectedRevision) &&
        d.expectedRevision >= 0 &&
        typeof d.assignedRoom === 'string' &&
        !!d.assignedRoom.trim() &&
        d.assignedRoom.length <= 120 &&
        typeof d.notes === 'string' &&
        d.notes.length <= 1000 &&
        typeof d.inside === 'boolean' &&
        typeof d.waiting === 'boolean'
      )
    if (url === posEndpoints.savePosSettings)
      return (
        Object.keys(d).sort().join() ===
          'business,receiptAddress,receiptFooter,receiptName,taxRateBps' &&
        Number.isInteger(d.taxRateBps) &&
        d.taxRateBps >= 0 &&
        d.taxRateBps <= 10000 &&
        ['receiptName', 'receiptAddress', 'receiptFooter'].every(
          (k) => typeof d[k] === 'string' && d[k].length <= 500,
        )
      )
    return (
      url === posEndpoints.completeSale &&
      Object.keys(d)
        .filter(
          (k) =>
            k !== 'member' &&
            k !== 'rentals' &&
            k !== 'pendingMembers' &&
            k !== 'membershipAssignments',
        )
        .sort()
        .join() === 'business,customerName,lines,note,payments,registerId,requestId,taxRateBps' &&
      (d.member === undefined ||
        (!!d.member &&
          typeof d.member.id === 'string' &&
          /^[a-zA-Z0-9_-]{1,128}$/.test(d.member.id) &&
          typeof d.member.name === 'string' &&
          d.member.name.length <= 200)) &&
      (d.pendingMembers === undefined ||
        (Array.isArray(d.pendingMembers) &&
          d.pendingMembers.length <= 20 &&
          d.pendingMembers.every(
            (m: { id: string; name: string; draft: { membershipProductId: string } }) =>
              m &&
              typeof m.id === 'string' &&
              /^[a-f0-9-]{36}$/.test(m.id) &&
              typeof m.name === 'string' &&
              m.name.length <= 200 &&
              m.draft &&
              typeof m.draft === 'object' &&
              typeof m.draft.membershipProductId === 'string',
          ))) &&
      (d.membershipAssignments === undefined ||
        (Array.isArray(d.membershipAssignments) &&
          d.membershipAssignments.length <= 100 &&
          d.membershipAssignments.every(
            (a: { id: string; productId: string; memberId: string; mode: string }) =>
              a &&
              Object.keys(a).sort().join() === 'id,memberId,mode,productId' &&
              typeof a.id === 'string' &&
              /^[a-f0-9-]{36}$/.test(a.id) &&
              typeof a.productId === 'string' &&
              /^[a-zA-Z0-9_-]{1,128}$/.test(a.productId) &&
              typeof a.memberId === 'string' &&
              /^[a-zA-Z0-9_-]{1,128}$/.test(a.memberId) &&
              ['restart', 'extend'].includes(a.mode),
          ))) &&
      (d.rentals === undefined ||
        (Array.isArray(d.rentals) &&
          d.rentals.length <= 100 &&
          d.rentals.every(
            (r: {
              renewalVisitId?: string
              id?: string
              memberId?: string
              productId: string
              assignedRoom: string
            }) =>
              r &&
              (r.renewalVisitId === undefined ||
                (typeof r.renewalVisitId === 'string' &&
                  /^[a-zA-Z0-9_-]{1,260}$/.test(r.renewalVisitId))) &&
              (r.id === undefined || (typeof r.id === 'string' && /^[a-f0-9-]{36}$/.test(r.id))) &&
              (r.memberId === undefined ||
                (typeof r.memberId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(r.memberId))) &&
              typeof r.productId === 'string' &&
              /^[a-zA-Z0-9_-]{1,128}$/.test(r.productId) &&
              typeof r.assignedRoom === 'string' &&
              !!r.assignedRoom.trim() &&
              r.assignedRoom.length <= 120,
          ))) &&
      typeof d.requestId === 'string' &&
      /^[a-f0-9-]{36}$/.test(d.requestId) &&
      typeof d.registerId === 'string' &&
      /^[a-f0-9-]{36}$/.test(d.registerId) &&
      Array.isArray(d.lines) &&
      d.lines.length > 0 &&
      d.lines.length <= 100 &&
      Array.isArray(d.payments) &&
      d.payments.length <= 12
    )
  } catch {
    return false
  }
}
