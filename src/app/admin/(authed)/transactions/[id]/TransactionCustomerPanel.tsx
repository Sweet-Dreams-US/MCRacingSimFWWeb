'use client'

// Customer + email actions for a transaction. Two jobs:
//  1. Connect a customer — multiple ways: search & pick, or one-click "use the
//     linked booking's customer". Also detach.
//  2. Once a customer with an email is connected, resend a receipt or thank-you.
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Customer = { id: string; name: string; email: string | null }
type Hit = { id: string; name: string; email: string | null }

export default function TransactionCustomerPanel({
  transactionId,
  initialCustomer,
  bookingCustomer,
}: {
  transactionId: string
  initialCustomer: Customer | null
  bookingCustomer: Customer | null
}) {
  const router = useRouter()
  const [customer, setCustomer] = useState<Customer | null>(initialCustomer)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  // Search state
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Hit[]>([])

  // Optional one-off recipient — for when the payer isn't the customer on file
  // (a split, a gift, or simply a typo in the stored address).
  const [overrideEmail, setOverrideEmail] = useState('')

  async function search(q: string) {
    setQuery(q)
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    try {
      const res = await fetch(`/api/admin/customers/search?q=${encodeURIComponent(q.trim())}`)
      const data = await res.json()
      setResults(data.customers ?? [])
    } catch {
      setResults([])
    }
  }

  async function connect(next: Customer | null) {
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const res = await fetch(`/api/admin/transactions/${transactionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: next?.id ?? null }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Update failed')
      // Update local state directly — router.refresh() re-renders the server
      // component but does NOT re-seed this client component's useState, so the
      // panel would otherwise still show the old (un)connected customer.
      setCustomer(next)
      setResults([])
      setQuery('')
      router.refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  async function resend(kind: 'receipt' | 'thankyou') {
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const res = await fetch(`/api/admin/transactions/${transactionId}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, email: overrideEmail.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Send failed')
      setMsg(`${kind === 'thankyou' ? 'Thank-you' : 'Receipt'} sent to ${data.sentTo}.`)
      setOverrideEmail('')
      // Re-render the server component so the Receipts list above picks up the
      // row we just wrote — otherwise the operator sends and sees no change.
      router.refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setBusy(false)
    }
  }

  // Sending needs somewhere to send: a stored address or a typed one.
  const canSend = Boolean(customer?.email || overrideEmail.trim())

  return (
    <div className="bg-asphalt-dark border border-white/5 p-5 space-y-4">
      <h2 className="racing-headline text-sm text-grid-white uppercase tracking-wider">Customer</h2>

      {err && (
        <div className="bg-apex-red/10 border border-apex-red/30 p-3">
          <p className="telemetry-text text-sm text-apex-red">{err}</p>
        </div>
      )}
      {msg && (
        <div className="bg-green-500/10 border border-green-500/30 p-3">
          <p className="telemetry-text text-sm text-green-400">{msg}</p>
        </div>
      )}

      {customer ? (
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="telemetry-text text-grid-white font-medium">{customer.name}</p>
            <p className="telemetry-text text-xs text-pit-gray">
              {customer.email || 'No email on file'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => connect(null)}
            disabled={busy}
            className="telemetry-text text-xs text-pit-gray hover:text-apex-red disabled:opacity-40"
          >
            Detach
          </button>
        </div>
      ) : (
        <p className="telemetry-text text-sm text-pit-gray">
          No customer connected. Link one below, or send to a one-off address.
        </p>
      )}

      {/* Send actions. Deliberately NOT gated on a connected customer — a
          walk-in who paid cash may never be in the system, and staff still
          need to get them a receipt. A typed address wins over the stored one. */}
      <div className="border-t border-white/5 pt-4 space-y-3">
        <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider">
          Send to
        </label>
        <input
          type="email"
          value={overrideEmail}
          onChange={(e) => setOverrideEmail(e.target.value)}
          placeholder={customer?.email || 'name@email.com'}
          className="composer-input w-full"
        />
        <p className="telemetry-text text-xs text-pit-gray">
          {customer?.email
            ? `Leave blank to send to ${customer.email}.`
            : 'No address on file — enter one to send.'}
        </p>

        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => resend('receipt')}
            disabled={busy || !canSend}
            className="telemetry-text text-sm uppercase tracking-wider bg-telemetry-cyan/15 text-telemetry-cyan border border-telemetry-cyan/40 hover:bg-telemetry-cyan/25 disabled:opacity-40 px-4 py-2.5"
          >
            {busy ? '…' : 'Send Receipt'}
          </button>
          <button
            type="button"
            onClick={() => resend('thankyou')}
            disabled={busy || !canSend}
            className="telemetry-text text-sm uppercase tracking-wider bg-white/5 text-grid-white border border-white/15 hover:bg-white/10 disabled:opacity-40 px-4 py-2.5"
          >
            {busy ? '…' : 'Send Thank-You'}
          </button>
        </div>
      </div>

      {/* Connect / change: search picker + optional booking-customer shortcut */}
      <div className="border-t border-white/5 pt-4 space-y-3">
        <p className="telemetry-text text-xs text-pit-gray uppercase tracking-wider">
          {customer ? 'Change customer' : 'Connect a customer'}
        </p>

        {bookingCustomer && (
          <button
            type="button"
            onClick={() => connect(bookingCustomer)}
            disabled={busy}
            className="block w-full text-left telemetry-text text-sm text-grid-white bg-telemetry-cyan/5 border border-telemetry-cyan/20 hover:bg-telemetry-cyan/10 disabled:opacity-40 px-3 py-2.5"
          >
            Use the linked booking&apos;s customer:{' '}
            <span className="text-telemetry-cyan">{bookingCustomer.name}</span>
          </button>
        )}

        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder="Search a customer by name or email…"
            className="composer-input w-full"
          />
          {results.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-asphalt-dark border border-white/15 max-h-60 overflow-y-auto">
              {results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => connect(c)}
                  disabled={busy}
                  className="block w-full text-left px-3 py-2 telemetry-text text-sm text-grid-white hover:bg-telemetry-cyan/10 disabled:opacity-40"
                >
                  {c.name || '(no name)'} <span className="text-pit-gray">{c.email}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
