import { createMemberNotes, type MemberNotesState } from '../../../data/firebase-member-notes'
import MemberNotesReview from './pos/MemberNotesReview'
import { isPosRequest, posEndpoints } from '../../../shared/pos-policy'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, ShoppingCart, Plus, Trash2 } from 'lucide-react'
import { useMembershipSession } from '../lib/membership-session'
import { createCatalog } from '../../../data/firebase-catalog'
import { createRegisters } from '../../../data/firebase-registers'
import { createPos } from '../../../data/firebase-pos'
import { hasStaffPermission, ownerUid } from '../../../domain/staff-permissions'
import {
  parsePrice,
  validProduct,
  type CatalogProduct,
  type CatalogCategory,
  type CatalogRecord,
} from '../../../domain/catalog'
import {
  cartTotals,
  paymentMethods,
  settlePayments,
  paymentAmountDue,
  type PaymentEntry,
  type CartLine,
  type PaymentMethod,
  type SaleRequest,
  type SaleReceipt,
  type PosSettings as Settings,
  type RegisterTotals,
  type OrderMember,
} from '../../../domain/pos'
import type { RegisterRecord } from '../../../domain/registers'
import { money } from '../lib/data'
import ReceiptDialog from './pos/ReceiptDialog'
import PosSettings from './pos/PosSettings'
import SalesHistory from './pos/SalesHistory'
import CreateMemberDialog from './members/CreateMemberDialog'
import OrderMemberPicker from './pos/OrderMemberPicker'
import PosCatalog from './pos/PosCatalog'
import MembershipPurchaseDialog from './pos/MembershipPurchaseDialog'
import type { MembershipRenewalMode } from '../../../domain/membership-renewal'
import { displayReference } from '../../../domain/display-reference'
import { canCreateDevMember } from '../../../shared/dev-member-policy'
import './pos/Pos.css'
type Tender = PaymentEntry
function readDraft(key: string): {
  cart: CartLine[]
  customerName: string
  note: string
  pending: SaleRequest | null
  member?: OrderMember
  pendingMembers?: OrderMember[]
  existingMembers?: OrderMember[]
  rentalsOnly?: boolean
  choosingRentals?: boolean
  promptMembership?: boolean
} {
  const empty = { cart: [], customerName: '', note: '', pending: null }
  let preservedPending: SaleRequest | null = null
  try {
    const d = JSON.parse(localStorage.getItem(key) || 'null')
    if (d?.pending && isPosRequest(posEndpoints.completeSale, JSON.stringify({ data: d.pending })))
      preservedPending = d.pending
    if (
      !d ||
      d.schemaVersion !== 1 ||
      !Array.isArray(d.cart) ||
      d.cart.length > 100 ||
      !d.cart.every(
        (l: CartLine) =>
          l &&
          validProduct(l.product?.data) &&
          Number.isInteger(l.quantity) &&
          l.quantity > 0 &&
          l.quantity <= 1000 &&
          Number.isSafeInteger(l.unitPriceCents) &&
          l.unitPriceCents >= 0,
      ) ||
      typeof d.customerName !== 'string' ||
      typeof d.note !== 'string' ||
      (d.member && (!d.member.id || typeof d.member.name !== 'string')) ||
      d.cart.some(
        (l: CartLine) =>
          l.assignedRoom !== undefined &&
          (typeof l.assignedRoom !== 'string' || l.assignedRoom.length > 120),
      ) ||
      (d.pendingMembers !== undefined &&
        (!Array.isArray(d.pendingMembers) ||
          d.pendingMembers.length > 20 ||
          !d.pendingMembers.every(
            (m: OrderMember) =>
              m &&
              typeof m.id === 'string' &&
              typeof m.name === 'string' &&
              m.draft &&
              typeof m.draft.membershipProductId === 'string',
          ))) ||
      (d.existingMembers !== undefined &&
        (!Array.isArray(d.existingMembers) ||
          d.existingMembers.length > 50 ||
          !d.existingMembers.every(
            (m: OrderMember) =>
              m && typeof m.id === 'string' && typeof m.name === 'string' && !m.draft,
          ))) ||
      d.cart.some(
        (l: CartLine) =>
          l.memberships !== undefined &&
          (!Array.isArray(l.memberships) ||
            l.memberships.length > l.quantity ||
            l.memberships.some(
              (a) =>
                !a ||
                typeof a.id !== 'string' ||
                typeof a.memberId !== 'string' ||
                !['restart', 'extend'].includes(a.mode),
            )),
      ) ||
      d.cart.some(
        (l: CartLine) =>
          l.rentals !== undefined &&
          (!Array.isArray(l.rentals) ||
            l.rentals.length !== l.quantity ||
            l.rentals.some(
              (r) =>
                !r ||
                typeof r.id !== 'string' ||
                typeof r.assignedRoom !== 'string' ||
                r.assignedRoom.length > 120 ||
                (r.memberId !== undefined && typeof r.memberId !== 'string'),
            )),
      ) ||
      (d.pending && !isPosRequest(posEndpoints.completeSale, JSON.stringify({ data: d.pending })))
    )
      return { ...empty, pending: preservedPending }
    const pendingMembers = d.pendingMembers ?? (d.member?.draft ? [d.member] : [])
    const member = d.member ? { id: d.member.id, name: d.member.name } : undefined
    return {
      ...d,
      member,
      pendingMembers,
      existingMembers:
        d.existingMembers ??
        (member && !pendingMembers.some((m: OrderMember) => m.id === member.id) ? [member] : []),
      cart: d.cart.map((l: CartLine) =>
        l.product.data.rental && !l.rentals
          ? { ...l, rentals: [{ id: crypto.randomUUID(), assignedRoom: l.assignedRoom ?? '' }] }
          : l,
      ),
    }
  } catch {
    return { ...empty, pending: preservedPending }
  }
}
export default function PointOfSale({ historyOnly = false }: { historyOnly?: boolean }) {
  const { reader } = useMembershipSession()
  const clients = useMemo(
    () =>
      reader
        ? {
            catalog: createCatalog(reader),
            registers: createRegisters(reader),
            pos: createPos(reader),
          }
        : null,
    [reader],
  )
  const key = `cerms.pos.${reader?.uid}.${reader?.club}`
  const initialDraft = useMemo(() => readDraft(key), [key])
  const [cart, setCart] = useState<CartLine[]>(initialDraft.cart),
    [products, setProducts] = useState<CatalogRecord<CatalogProduct>[]>([]),
    [categories, setCategories] = useState<CatalogRecord<CatalogCategory>[]>([]),
    [register, setRegister] = useState<RegisterRecord | null>(null),
    [registerTotals, setRegisterTotals] = useState<RegisterTotals | null>(null),
    [settings, setSettings] = useState<Settings | null>(null),
    [search, setSearch] = useState(''),
    [category, setCategory] = useState(''),
    [tab, setTab] = useState(historyOnly ? 'history' : 'sale'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [payments, setPayments] = useState<Tender[]>([]),
    [paying, setPaying] = useState(false),
    [customerName, setCustomerName] = useState(initialDraft.customerName),
    [note, setNote] = useState(initialDraft.note),
    [pending, setPending] = useState<SaleRequest | null>(initialDraft.pending),
    [receipt, setReceipt] = useState<SaleReceipt | null>(null)
  const [member, setMember] = useState<OrderMember | undefined>(initialDraft.member)
  const [pendingMembers, setPendingMembers] = useState<OrderMember[]>(
    initialDraft.pendingMembers ?? [],
  )
  const [existingMembers, setExistingMembers] = useState<OrderMember[]>(
    initialDraft.existingMembers ?? [],
  )
  const [addingMembership, setAddingMembership] = useState<{ productId?: string } | null>(null)
  const [membershipPurchase, setMembershipPurchase] = useState<{
    productId?: string
    renewalPrompt?: boolean
  } | null>(initialDraft.promptMembership === true ? { renewalPrompt: true } : null)
  const [catalogLoaded, setCatalogLoaded] = useState(false)
  const [pickingMember, setPickingMember] = useState<{ rentalId?: string } | null>(null)
  const orderMembers = [...existingMembers, ...pendingMembers]
  const canAddMembership = !!reader && canCreateDevMember(reader.uid, reader.club)
  const [rentalsOnly, setRentalsOnly] = useState(initialDraft.rentalsOnly ?? false)
  const [choosingRentals, setChoosingRentals] = useState(
    initialDraft.choosingRentals ?? initialDraft.rentalsOnly ?? false,
  )
  const [noteReviews, setNoteReviews] = useState<(MemberNotesState & { memberId: string })[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const [noteAcknowledgements, setNoteAcknowledgements] = useState<Record<string, number>>({})
  const notesLoadVersion = useRef(0)
  const participantIds = [
    ...new Set(
      [
        ...(member && !member.draft ? [member.id] : []),
        ...cart.flatMap((l) => [
          ...(l.rentals ?? []).map((r) => r.memberId ?? member?.id),
          ...(l.memberships ?? []).map((a) => a.memberId),
        ]),
      ].filter((id): id is string => !!id && !pendingMembers.some((m) => m.id === id)),
    ),
  ].sort()
  const participantKey = participantIds.join(',')
  async function verifyNotes() {
    if (!reader) return false
    const version = ++notesLoadVersion.current
    setNotesLoading(true)
    try {
      const states = await Promise.all(
        participantIds.map(async (memberId) => ({
          ...(await createMemberNotes(reader, memberId).list()),
          memberId,
        })),
      )
      if (version !== notesLoadVersion.current) return false
      const unread = states.filter(
        (m) => m.tagged && noteAcknowledgements[m.memberId] !== m.revision,
      )
      if (unread.length) {
        setNoteReviews(unread)
        return false
      }
      return true
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Member notes could not be loaded. Retry before continuing.',
      )
      return false
    } finally {
      if (version === notesLoadVersion.current) setNotesLoading(false)
    }
  }
  useEffect(() => {
    if (!pending && participantIds.length) void verifyNotes()
    if (!participantIds.length) {
      setNoteAcknowledgements({})
      setNoteReviews([])
      setNotesLoading(false)
    }
    return () => {
      notesLoadVersion.current++
    }
  }, [participantKey, reader])
  const saving = useRef(false),
    searchInput = useRef<HTMLInputElement>(null),
    paymentDialog = useRef<HTMLDialogElement>(null)
  const canSell = !!reader && hasStaffPermission(reader.uid, 'processSales', reader.permissions)
  useEffect(() => {
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          schemaVersion: 1,
          cart,
          customerName,
          note,
          pending,
          member,
          pendingMembers,
          existingMembers,
          rentalsOnly,
          choosingRentals,
          promptMembership: membershipPurchase?.renewalPrompt === true,
        }),
      )
    } catch {
      setError('Unable to save the local draft. Keep this window open until checkout is confirmed.')
    }
  }, [
    cart,
    customerName,
    note,
    pending,
    member,
    pendingMembers,
    existingMembers,
    rentalsOnly,
    choosingRentals,
    membershipPurchase?.renewalPrompt,
    key,
  ])
  async function refresh() {
    if (!clients) return
    setBusy(true)
    setError('')
    try {
      const [s, r] = await Promise.all([clients.pos.settings(), clients.registers.own()])
      setSettings(s)
      setRegister(r)
      setRegisterTotals(r ? await clients.pos.totals(r.id, r.openingTotalCents) : null)
      if (canSell) {
        const cats = await clients.catalog.categories()
        setCategories(cats)
        let page = await clients.catalog.products(true),
          all = page.rows
        while (page.more) {
          page = await clients.catalog.products()
          all.push(...page.rows)
          if (all.length > 10000) throw new Error('Catalog exceeds 10,000 products.')
        }
        setProducts(all)
        setCatalogLoaded(true)
        if (!pending)
          setCart((rows) =>
            rows.map((l) => {
              const latest = all.find((p) => p.id === l.product.id)
              return latest
                ? {
                    ...l,
                    product: latest,
                    unitPriceCents: latest.data.askforprice
                      ? l.unitPriceCents
                      : latest.data.priceCents,
                  }
                : l
            }),
          )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load point of sale.')
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    void refresh()
  }, [clients, canSell])
  useEffect(() => {
    if (paying) paymentDialog.current?.showModal()
    else paymentDialog.current?.close()
  }, [paying])
  const totals = cartTotals(cart, settings?.taxRateBps ?? null),
    locked = busy || !!pending || notesLoading || noteReviews.length > 0
  const permittedProducts = useMemo(
    () =>
      products.filter(
        (p) =>
          p.data.active &&
          (!choosingRentals || p.data.rental) &&
          (!p.data.restricted || p.data.restrictedUsers.includes(reader?.uid ?? '')),
      ),
    [products, choosingRentals, canAddMembership, reader?.uid],
  )
  const visible = useMemo(
    () =>
      permittedProducts.filter(
        (p) =>
          (!category || p.data.cat === category) &&
          (!search ||
            `${p.data.name} ${p.data.barcode}`.toLowerCase().includes(search.toLowerCase())),
      ),
    [permittedProducts, category, search],
  )
  const favorites = useMemo(
    () => permittedProducts.filter((p) => p.data.favorite),
    [permittedProducts],
  )
  function add(p: CatalogRecord<CatalogProduct>) {
    if (locked) return
    if (p.data.membership) {
      setMembershipPurchase({ productId: p.id })
      return
    }
    if (choosingRentals && !p.data.rental) {
      setError('Choose a rental, then continue to the order to add other items.')
      return
    }
    if (p.data.rental && !member) {
      setError('Choose an order member before adding rentals.')
      return
    }
    if (p.data.rental && cart.reduce((count, l) => count + (l.rentals?.length ?? 0), 0) >= 100) {
      setError('Use at most 100 rentals per order.')
      return
    }
    setCart((rows) => {
      const exists = rows.find((l) => l.product.id === p.id)
      if (exists)
        return rows.map((l) =>
          l === exists
            ? {
                ...l,
                quantity: Math.min(1000, l.quantity + 1),
                ...(p.data.rental
                  ? {
                      rentals: [
                        ...(l.rentals ?? []),
                        { id: crypto.randomUUID(), assignedRoom: '' },
                      ],
                    }
                  : {}),
              }
            : l,
        )
      if (rows.length >= 100) {
        setError('Use at most 100 products per sale.')
        return rows
      }
      return [
        ...rows,
        {
          product: p,
          quantity: 1,
          unitPriceCents: p.data.priceCents,
          ...(p.data.rental ? { rentals: [{ id: crypto.randomUUID(), assignedRoom: '' }] } : {}),
        },
      ]
    })
    setNotice('')
    searchInput.current?.focus()
  }
  function updateRental(
    rentalId: string,
    patch: Partial<NonNullable<CartLine['rentals']>[number]>,
  ) {
    setCart((rows) =>
      rows.map((l) => ({
        ...l,
        rentals: l.rentals?.map((r) => (r.id === rentalId ? { ...r, ...patch } : r)),
      })),
    )
  }
  function removeRental(rentalId: string) {
    setCart((rows) =>
      rows.flatMap((l) => {
        if (!l.rentals?.some((r) => r.id === rentalId)) return [l]
        const rentals = l.rentals.filter((r) => r.id !== rentalId)
        return rentals.length ? [{ ...l, rentals, quantity: rentals.length }] : []
      }),
    )
  }
  function removeMemberships(ids: string[]) {
    const remaining = pendingMembers.filter((m) => !ids.includes(m.id))
    setPendingMembers(remaining)
    setCart((rows) =>
      rows.flatMap((l) => {
        if (l.product.data.membership) {
          const quantity =
            remaining.filter((m) => m.draft?.membershipProductId === l.product.id).length +
            (l.memberships?.length ?? 0)
          return quantity ? [{ ...l, quantity }] : []
        }
        return [
          {
            ...l,
            rentals: l.rentals?.map((r) =>
              r.memberId && ids.includes(r.memberId) ? { ...r, memberId: '' } : r,
            ),
          },
        ]
      }),
    )
    if (member && ids.includes(member.id)) {
      setMember(undefined)
      setCustomerName('')
    }
  }
  function addMembership(m: OrderMember, product: CatalogRecord<CatalogProduct>) {
    if (locked || pendingMembers.length >= 20 || orderMembers.length >= 50)
      throw new Error('Use at most 20 new memberships per order.')
    if (
      pendingMembers.some(
        (p) =>
          p.draft?.governmentIdType === m.draft?.governmentIdType &&
          p.draft?.governmentId.trim().toUpperCase() ===
            m.draft?.governmentId.trim().toUpperCase() &&
          p.draft?.birthDate === m.draft?.birthDate,
      )
    )
      throw new Error('This member already has a pending membership in the order.')
    if (cart.length >= 100 && !cart.some((l) => l.product.id === product.id))
      throw new Error('Use at most 100 products per order.')
    setPendingMembers((rows) => [...rows, m])
    setCart((rows) => {
      const exists = rows.find((l) => l.product.id === product.id)
      return exists
        ? rows.map((l) => (l === exists ? { ...l, quantity: l.quantity + 1 } : l))
        : [...rows, { product, quantity: 1, unitPriceCents: product.data.priceCents }]
    })
    if (!member) {
      setMember({ id: m.id, name: m.name })
      setCustomerName(m.name)
    }
  }
  function assignMembership(
    m: OrderMember,
    product: CatalogRecord<CatalogProduct>,
    mode: MembershipRenewalMode,
  ) {
    if (locked) return
    if (cart.reduce((count, l) => count + (l.memberships?.length ?? 0), 0) >= 100)
      throw new Error('Use at most 100 existing-member membership units per order.')
    if (!existingMembers.some((p) => p.id === m.id) && orderMembers.length >= 50)
      throw new Error('Use at most 50 members per order.')
    if (cart.length >= 100 && !cart.some((l) => l.product.id === product.id))
      throw new Error('Use at most 100 products per order.')
    if (
      cart.some((l) =>
        l.memberships?.some((a) => a.memberId === m.id && l.product.id !== product.id),
      )
    )
      throw new Error('Use one membership product per existing member in an order.')
    const assignment = { id: crypto.randomUUID(), memberId: m.id, mode }
    setExistingMembers((rows) => (rows.some((p) => p.id === m.id) ? rows : [...rows, m]))
    setCart((rows) => {
      const exists = rows.find((l) => l.product.id === product.id)
      return exists
        ? rows.map((l) =>
            l === exists
              ? {
                  ...l,
                  quantity: l.quantity + 1,
                  memberships: [
                    ...(l.memberships ?? []).map((a) => (a.memberId === m.id ? { ...a, mode } : a)),
                    assignment,
                  ],
                }
              : l,
          )
        : [
            ...rows,
            {
              product,
              quantity: 1,
              unitPriceCents: product.data.priceCents,
              memberships: [assignment],
            },
          ]
    })
    if (!member) {
      setMember(m)
      setCustomerName(m.name)
    }
    setMembershipPurchase(null)
  }
  function removeAssignedMembership(id: string) {
    setCart((rows) =>
      rows.flatMap((l) => {
        if (!l.memberships?.some((a) => a.id === id)) return [l]
        const memberships = l.memberships.filter((a) => a.id !== id)
        const quantity = l.quantity - 1
        return quantity ? [{ ...l, memberships, quantity }] : []
      }),
    )
  }
  function scan() {
    const matches = products.filter(
      (p) =>
        p.data.active &&
        p.data.barcode === search.trim() &&
        (!p.data.restricted || p.data.restrictedUsers.includes(reader?.uid ?? '')),
    )
    if (matches.length === 1) {
      add(matches[0]!)
      setSearch('')
    } else if (matches.length > 1)
      setError('More than one product has this barcode. Select the correct product.')
    else if (visible.length === 1) add(visible[0]!)
    else setError('No unique matching barcode. Search or choose a product.')
  }
  let settlement = {
    remainingCents: Math.abs(totals.totalCents),
    changeCents: 0,
    payments: [] as SaleRequest['payments'],
  }
  let paymentError = ''
  try {
    settlement = settlePayments(totals.totalCents, payments)
  } catch (e) {
    paymentError = e instanceof Error ? e.message : 'Check payment amounts.'
  }
  async function submit(request: SaleRequest) {
    if (!clients || saving.current) return
    saving.current = true
    setBusy(true)
    setError('')
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          schemaVersion: 1,
          cart,
          customerName,
          note,
          pending: request,
          member,
          pendingMembers,
          existingMembers,
          rentalsOnly,
          choosingRentals,
        }),
      )
      setPending(request)
      const saved = await clients.pos.complete(request)
      if (!saved)
        throw new Error('Sale saved but receipt could not be loaded. Retry to retrieve it.')
      setReceipt(saved)
      setMember(undefined)
      setPendingMembers([])
      setExistingMembers([])
      setNoteAcknowledgements({})
      setRentalsOnly(false)
      setChoosingRentals(false)
      setCart([])
      setCustomerName('')
      setNote('')
      setPayments([])
      setPending(null)
      setPaying(false)
      localStorage.removeItem(key)
      setNotice(
        request.member
          ? 'Order completed. Linked member and rental details have been saved.'
          : 'Sale saved. Register totals and inventory have been updated.',
      )
      await refresh()
    } catch (e) {
      if (e && typeof e === 'object' && 'definitive' in e && e.definitive) {
        setPending(null)
      }
      setError(e instanceof Error ? e.message : 'Save not confirmed. Retry the same request.')
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  if (!reader || !clients) return null
  return (
    <>
      <div className="toolbar">
        <div className="tabs">
          <button className={tab === 'sale' ? 'selected' : ''} onClick={() => setTab('sale')}>
            New sale
          </button>
          <button className={tab === 'history' ? 'selected' : ''} onClick={() => setTab('history')}>
            Sales & payments
          </button>
          {reader.uid === ownerUid && (
            <button
              className={tab === 'settings' ? 'selected' : ''}
              onClick={() => setTab('settings')}
            >
              Tax & receipts
            </button>
          )}
        </div>
        <button disabled={busy || !!pending} onClick={() => void refresh()}>
          Refresh POS
        </button>
      </div>
      {error && !paying && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {pending && (
        <section className="panel pos-pending">
          <strong>Confirm the previous sale before continuing</strong>
          <p>
            The saved request will be retried with the same receipt ID, preventing a duplicate sale.
          </p>
          <button className="primary" disabled={busy} onClick={() => void submit(pending)}>
            Retry / retrieve saved receipt
          </button>
        </section>
      )}
      {tab === 'settings' && settings && (
        <PosSettings
          key={JSON.stringify(settings)}
          settings={settings}
          client={clients.pos}
          onSaved={() => {
            setNotice('Tax and receipt settings saved.')
            void refresh()
          }}
        />
      )}
      {tab === 'history' && <SalesHistory client={clients.pos} />}
      {tab === 'sale' &&
        (!canSell ? (
          <section className="panel">
            <h2>POS permission required</h2>
            <p>
              The owner can enable “Use point of sale” in Users & permissions. You can view existing
              receipts in Sales & payments.
            </p>
          </section>
        ) : (
          <>
            <section className="pos-register-strip">
              <span>
                {register ? (
                  <>
                    <strong>Your register is open</strong> ·{' '}
                    {displayReference('register', register.id)} · Expected cash{' '}
                    {money((registerTotals?.expectedCashCents ?? register.openingTotalCents) / 100)}{' '}
                    · Card {money((registerTotals?.netByMethod.card ?? 0) / 100)}
                  </>
                ) : (
                  <>
                    Open your register before checkout. <a href="#registers">Go to Registers</a>
                  </>
                )}
              </span>
              <span>
                Tax:{' '}
                {settings?.taxRateBps == null ? 'Not configured' : `${settings.taxRateBps / 100}%`}
              </span>
            </section>
            <div className="pos-layout">
              <section className="panel pos-catalog">
                <div className="pos-catalog-tools">
                  {choosingRentals && (
                    <div>
                      <h2>Select rentals for check-in</h2>
                      <p>
                        Select rentals and enter each Assigned Room/Number, then continue to
                        checkout.
                      </p>
                      <button
                        disabled={
                          locked ||
                          !cart.some((l) => l.product.data.rental) ||
                          cart.some(
                            (l) =>
                              l.product.data.rental &&
                              l.rentals?.some(
                                (r) => !r.assignedRoom.trim() || !(r.memberId ?? member?.id),
                              ),
                          )
                        }
                        onClick={() => setChoosingRentals(false)}
                      >
                        Continue to order
                      </button>
                    </div>
                  )}
                  <label className="pos-search">
                    <Search size={17} />
                    <input
                      ref={searchInput}
                      aria-label="Search or scan products"
                      placeholder="Search products or scan a barcode…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          scan()
                        }
                      }}
                    />
                  </label>
                  <select
                    aria-label="Product category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="">All categories</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.data.name}
                      </option>
                    ))}
                  </select>
                </div>
                <PosCatalog
                  client={clients.catalog}
                  rows={visible}
                  favorites={favorites}
                  categories={categories}
                  search={search}
                  category={category}
                  disabled={locked}
                  onAdd={add}
                />
                {busy && !products.length ? (
                  <p role="status">Loading products…</p>
                ) : (
                  !visible.length && <p className="empty">No matching active products.</p>
                )}
              </section>
              <section className="panel pos-cart">
                <div className="pos-cart-heading">
                  <h2>
                    <ShoppingCart size={19} /> Current sale
                  </h2>
                  <button
                    disabled={locked || (!cart.length && !member)}
                    onClick={() => {
                      if (window.confirm('Clear this unsaved cart?')) {
                        setCart([])
                        setCustomerName('')
                        setNote('')
                        setMember(undefined)
                        setPendingMembers([])
                        setExistingMembers([])
                        setRentalsOnly(false)
                        setChoosingRentals(false)
                        setPayments([])
                      }
                    }}
                  >
                    Clear
                  </button>
                </div>
                <section className="order-member-controls" aria-label="Order members">
                  <label>
                    Order linked to
                    <select
                      aria-label="Order linked to"
                      disabled={locked}
                      value={member?.id ?? ''}
                      onChange={(e) => {
                        const selected = orderMembers.find((m) => m.id === e.target.value)
                        setMember(selected ? { id: selected.id, name: selected.name } : undefined)
                        setCustomerName(selected?.name ?? '')
                      }}
                    >
                      <option value="">No linked member</option>
                      {orderMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                          {m.draft ? ' · Pending membership' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="member-row-actions">
                    <button
                      disabled={locked || orderMembers.length >= 50}
                      onClick={() => setPickingMember({})}
                    >
                      Find existing member
                    </button>
                    {canSell && (
                      <button
                        disabled={
                          locked || pendingMembers.length >= 20 || orderMembers.length >= 50
                        }
                        onClick={() => setMembershipPurchase({})}
                      >
                        Add membership
                      </button>
                    )}
                  </div>
                </section>
                <div className="pos-cart-lines">
                  {cart.map((l) => (
                    <div className="pos-cart-line" key={l.product.id}>
                      <div>
                        <strong>{l.product.data.name}</strong>
                        <small>
                          {money(l.unitPriceCents / 100)} each
                          {l.product.data.payout ? ' · Payout' : ''}
                        </small>
                        {l.product.data.membership &&
                          pendingMembers
                            .filter((m) => m.draft?.membershipProductId === l.product.id)
                            .map((m) => (
                              <div className="pos-membership-assignment" key={m.id}>
                                <span>
                                  Membership for <strong>{m.name}</strong> · Pending
                                </span>
                                <button
                                  disabled={locked}
                                  aria-label={`Remove membership for ${m.name}`}
                                  onClick={() => removeMemberships([m.id])}
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                        {l.memberships?.map((a) => (
                          <div className="pos-membership-assignment" key={a.id}>
                            <span>
                              Membership renewal for{' '}
                              <strong>
                                {existingMembers.find((m) => m.id === a.memberId)?.name ??
                                  a.memberId}
                              </strong>{' '}
                              ·{' '}
                              {a.mode === 'restart'
                                ? 'Start from today'
                                : 'Add to existing expiration'}
                            </span>
                            <button
                              disabled={locked}
                              aria-label={`Remove assigned membership ${a.id}`}
                              onClick={() => removeAssignedMembership(a.id)}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                        {l.product.data.rental &&
                          l.rentals?.map((r, index) => (
                            <div className="pos-rental-assignment" key={r.id}>
                              <label>
                                {r.renewalVisitId ? 'Renewal for' : 'Assigned to · Rental'}{' '}
                                {index + 1}
                                <select
                                  aria-label={`Assigned member for ${l.product.data.name} ${index + 1}`}
                                  value={r.memberId === '' ? '__unassigned' : (r.memberId ?? '')}
                                  disabled={locked || !!r.renewalVisitId}
                                  onChange={(e) =>
                                    e.target.value === '__find'
                                      ? setPickingMember({ rentalId: r.id })
                                      : updateRental(r.id, {
                                          memberId:
                                            e.target.value === '__unassigned'
                                              ? ''
                                              : e.target.value || undefined,
                                        })
                                  }
                                >
                                  <option value="">
                                    {member
                                      ? `Order member: ${member.name}`
                                      : 'Choose an order member'}
                                  </option>
                                  <option value="__unassigned" disabled>
                                    Select a member
                                  </option>
                                  {orderMembers.map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.name}
                                      {m.draft ? ' · Pending membership' : ''}
                                    </option>
                                  ))}
                                  <option value="__find" disabled={orderMembers.length >= 50}>
                                    Find another existing member…
                                  </option>
                                </select>
                              </label>
                              <label>
                                Assigned Room/Number
                                <input
                                  required
                                  maxLength={120}
                                  disabled={locked || !!r.renewalVisitId}
                                  value={r.assignedRoom}
                                  aria-label={
                                    l.rentals!.length === 1
                                      ? `Assigned Room/Number for ${l.product.data.name}`
                                      : `Assigned Room/Number for ${l.product.data.name} ${index + 1}`
                                  }
                                  onChange={(e) =>
                                    updateRental(r.id, { assignedRoom: e.target.value })
                                  }
                                />
                              </label>
                              <button
                                disabled={locked}
                                aria-label={`Remove rental ${l.product.data.name} ${index + 1}`}
                                onClick={() => removeRental(r.id)}
                              >
                                Remove rental
                              </button>
                            </div>
                          ))}
                      </div>
                      <div className="pos-line-controls">
                        <label>
                          Qty
                          <input
                            aria-label={`Quantity for ${l.product.data.name}`}
                            type="number"
                            min={1}
                            max={1000}
                            value={l.quantity}
                            disabled={locked || l.product.data.rental || l.product.data.membership}
                            onChange={(e) =>
                              setCart((rows) =>
                                rows.map((r) =>
                                  r === l
                                    ? {
                                        ...r,
                                        quantity: Math.min(
                                          1000,
                                          Math.max(1, Number(e.target.value) || 1),
                                        ),
                                      }
                                    : r,
                                ),
                              )
                            }
                          />
                        </label>
                        {l.product.data.askforprice && (
                          <label>
                            Price
                            <input
                              aria-label={`Price for ${l.product.data.name}`}
                              type="text"
                              inputMode="decimal"
                              value={l.priceInput ?? String(l.unitPriceCents / 100)}
                              disabled={locked}
                              onChange={(e) => {
                                const priceInput = e.target.value
                                let unitPriceCents = l.unitPriceCents
                                try {
                                  unitPriceCents = parsePrice(priceInput)
                                } catch {
                                  /* Preserve partial input until valid. */
                                }
                                setCart((rows) =>
                                  rows.map((r) =>
                                    r === l ? { ...r, priceInput, unitPriceCents } : r,
                                  ),
                                )
                              }}
                            />
                          </label>
                        )}
                        <strong>
                          {money(
                            (l.unitPriceCents * l.quantity * (l.product.data.payout ? -1 : 1)) /
                              100,
                          )}
                        </strong>
                        <button
                          disabled={locked}
                          aria-label={`Remove ${l.product.data.name}`}
                          onClick={() =>
                            l.product.data.membership
                              ? (() => {
                                  removeMemberships(
                                    pendingMembers
                                      .filter((m) => m.draft?.membershipProductId === l.product.id)
                                      .map((m) => m.id),
                                  )
                                  setCart((rows) =>
                                    rows.filter((r) => r.product.id !== l.product.id),
                                  )
                                })()
                              : setCart((rows) => rows.filter((r) => r !== l))
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {!cart.length && <p className="empty">Scan or choose a product to start.</p>}
                <label>
                  Customer name (optional)
                  <input
                    maxLength={200}
                    value={customerName}
                    disabled={locked || !!member}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </label>
                <label>
                  Receipt note (optional)
                  <input
                    maxLength={1000}
                    value={note}
                    disabled={locked}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                <dl className="pos-totals">
                  <div>
                    <dt>Subtotal</dt>
                    <dd>{money(totals.subtotalCents / 100)}</dd>
                  </div>
                  <div>
                    <dt>Tax</dt>
                    <dd>{money(totals.taxCents / 100)}</dd>
                  </div>
                  <div className="pos-grand-total">
                    <dt>{totals.totalCents < 0 ? 'Payout total' : 'Total'}</dt>
                    <dd>{money(totals.totalCents / 100)}</dd>
                  </div>
                </dl>
                {cart.some((l) => l.product.data.membership || l.product.data.rental) && (
                  <p className="muted">
                    Membership creation, rental check-in and renewal time are saved only after
                    successful checkout.
                  </p>
                )}
                {settings?.taxRateBps == null && cart.some((l) => l.product.data.taxable) && (
                  <p className="inline-error">
                    The owner must configure sales tax before checkout.
                  </p>
                )}
                <button
                  className="primary pos-pay-button"
                  disabled={
                    locked ||
                    !register ||
                    !settings ||
                    !cart.length ||
                    choosingRentals ||
                    (rentalsOnly && !cart.some((l) => l.product.data.rental)) ||
                    cart.some(
                      (l) =>
                        l.product.data.rental &&
                        l.rentals?.some(
                          (r) => !r.assignedRoom.trim() || !(r.memberId ?? member?.id),
                        ),
                    ) ||
                    pendingMembers.some(
                      (m) => !cart.some((l) => l.product.id === m.draft?.membershipProductId),
                    ) ||
                    cart.some(
                      (l) =>
                        l.product.data.membership &&
                        l.quantity !==
                          pendingMembers.filter(
                            (m) => m.draft?.membershipProductId === l.product.id,
                          ).length +
                            (l.memberships?.length ?? 0),
                    ) ||
                    cart.some(
                      (l) =>
                        !Number.isInteger(l.quantity) ||
                        (l.priceInput !== undefined &&
                          !/^\d{1,7}(\.\d{1,2})?$/.test(l.priceInput.trim())),
                    ) ||
                    (settings.taxRateBps === null && cart.some((l) => l.product.data.taxable))
                  }
                  onClick={async () => {
                    if (!(await verifyNotes())) return
                    setPayments(
                      totals.totalCents === 0
                        ? []
                        : [
                            {
                              method: 'cash',
                              amount: '',
                            },
                          ],
                    )
                    setError('')
                    setPaying(true)
                  }}
                >
                  {totals.totalCents < 0 ? 'Record payout' : 'Take payment'}
                </button>
              </section>
            </div>
          </>
        ))}
      <dialog
        ref={paymentDialog}
        className="member-dialog pos-payment-dialog"
        aria-label="Take payment"
        onCancel={(e) => {
          e.preventDefault()
          if (!locked) setPaying(false)
        }}
      >
        <h2>{totals.totalCents < 0 ? 'Record payout' : 'Take payment'}</h2>
        <p className="pos-payment-total">{money(Math.abs(totals.totalCents) / 100)}</p>
        <p>
          Double-click an amount to fill the remaining due. Enter cash received to calculate change.
        </p>
        <fieldset disabled={locked}>
          {payments.map((p, i) => (
            <div className="pos-tender" key={i}>
              <label>
                Method
                <select
                  aria-label={`Payment method ${i + 1}`}
                  value={p.method}
                  onChange={(e) => {
                    const method = e.target.value as PaymentMethod
                    setPayments((rows) => rows.map((r, j) => (j === i ? { ...r, method } : r)))
                  }}
                >
                  {Object.entries(paymentMethods).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Payment amount
                <input
                  aria-label={`Payment amount ${i + 1}`}
                  inputMode="decimal"
                  value={p.amount}
                  title="Double-click to fill the amount due"
                  onDoubleClick={() =>
                    setPayments((rows) =>
                      rows.map((r, j) =>
                        j === i
                          ? {
                              ...r,
                              amount: (paymentAmountDue(totals.totalCents, rows, i) / 100).toFixed(
                                2,
                              ),
                            }
                          : r,
                      ),
                    )
                  }
                  onChange={(e) => {
                    setPayments((rows) =>
                      rows.map((r, j) => (j === i ? { ...r, amount: e.target.value } : r)),
                    )
                  }}
                />
              </label>
              <button
                aria-label={`Remove payment ${i + 1}`}
                onClick={() => {
                  setPayments((rows) => rows.filter((_, j) => j !== i))
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button
            disabled={payments.length >= 12}
            onClick={() => {
              const remaining = settlement.remainingCents
              setPayments((rows) => [
                ...rows,
                {
                  method: rows.some((r) => r.method === 'cash') ? 'card' : 'cash',
                  amount: (remaining / 100).toFixed(2),
                },
              ])
            }}
          >
            <Plus size={16} /> Add payment method
          </button>
          <dl className="pos-totals">
            <div>
              <dt>Remaining balance</dt>
              <dd>{money(settlement.remainingCents / 100)}</dd>
            </div>
            <div className="pos-grand-total">
              <dt>Change to give</dt>
              <dd>{money(settlement.changeCents / 100)}</dd>
            </div>
          </dl>
          {paymentError && (
            <p role="alert" className="inline-error">
              {paymentError}
            </p>
          )}
        </fieldset>
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button disabled={locked} onClick={() => setPaying(false)}>
            Back to cart
          </button>
          {pending ? (
            <button disabled={busy} className="primary" onClick={() => void submit(pending)}>
              Retry same sale
            </button>
          ) : (
            <button
              className="primary"
              disabled={busy || !!paymentError || settlement.remainingCents !== 0}
              onClick={() => {
                if (!register) return
                try {
                  const request: SaleRequest = {
                    business: reader.club,
                    requestId: crypto.randomUUID(),
                    registerId: register.id,
                    taxRateBps: settings?.taxRateBps ?? 0,
                    customerName: customerName.trim(),
                    note: note.trim(),
                    ...(member ? { member } : {}),
                    pendingMembers,
                    noteAcknowledgements: participantIds
                      .filter((id) => noteAcknowledgements[id] !== undefined)
                      .map((memberId) => ({ memberId, revision: noteAcknowledgements[memberId]! })),
                    membershipAssignments: cart.flatMap((l) =>
                      (l.memberships ?? []).map((a) => ({ ...a, productId: l.product.id })),
                    ),
                    rentals: cart
                      .filter((l) => l.product.data.rental)
                      .flatMap((l) =>
                        (l.rentals ?? []).map((r) => ({
                          id: r.id,
                          ...(r.renewalVisitId ? { renewalVisitId: r.renewalVisitId } : {}),
                          productId: l.product.id,
                          assignedRoom: r.assignedRoom.trim(),
                          memberId: r.memberId ?? member!.id,
                        })),
                      ),
                    lines: cart.map((l) => ({
                      productId: l.product.id,
                      version: l.product.version,
                      quantity: l.quantity,
                      unitPriceCents: l.unitPriceCents,
                    })),
                    payments: settlement.payments,
                  }
                  void submit(request)
                } catch (e) {
                  setError(String(e))
                }
              }}
            >
              Complete sale
            </button>
          )}
        </div>
      </dialog>
      {membershipPurchase && catalogLoaded && !locked && (
        <MembershipPurchaseDialog
          reader={reader}
          products={permittedProducts.filter((p) => p.data.membership && !p.data.payout)}
          initialProductId={membershipPurchase.productId}
          renewalPrompt={membershipPurchase.renewalPrompt}
          initialMember={existingMembers.find((m) => m.id === member?.id)}
          members={existingMembers}
          assignments={cart.flatMap((l) =>
            (l.memberships ?? []).map((a) => ({ productId: l.product.id, memberId: a.memberId })),
          )}
          canCreate={canAddMembership && !membershipPurchase.renewalPrompt}
          onClose={() => setMembershipPurchase(null)}
          onCreate={(productId) => {
            setMembershipPurchase(null)
            setAddingMembership({ productId })
          }}
          onAssign={assignMembership}
        />
      )}
      {addingMembership && (
        <CreateMemberDialog
          uid={reader.uid}
          club={reader.club}
          reader={reader}
          initialProductId={addingMembership.productId}
          onClose={() => setAddingMembership(null)}
          onCreated={() => {}}
          onAddToOrder={addMembership}
          onViewMember={(m) => {
            setAddingMembership(null)
            setExistingMembers((rows) =>
              rows.some((p) => p.id === m.id) ? rows : [...rows, { id: m.id, name: m.name }],
            )
            setMember({ id: m.id, name: m.name })
            setCustomerName(m.name)
          }}
        />
      )}
      {pickingMember && (
        <OrderMemberPicker
          reader={reader}
          onClose={() => setPickingMember(null)}
          onSelect={(m) => {
            setExistingMembers((rows) => (rows.some((p) => p.id === m.id) ? rows : [...rows, m]))
            if (pickingMember.rentalId) updateRental(pickingMember.rentalId, { memberId: m.id })
            else {
              setMember(m)
              setCustomerName(m.name)
            }
            setPickingMember(null)
          }}
        />
      )}
      {noteReviews[0] && (
        <MemberNotesReview
          key={noteReviews[0].memberId}
          state={noteReviews[0]}
          onCancel={() => {
            setNoteReviews([])
            setError('Read and confirm member notes before continuing the order.')
            setPaying(false)
          }}
          onConfirm={() => {
            const current = noteReviews[0]!
            setNoteAcknowledgements((a) => ({ ...a, [current.memberId]: current.revision }))
            setNoteReviews((q) => q.slice(1))
            setError('')
          }}
        />
      )}
      {receipt && <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} />}
    </>
  )
}
