'use client'

// Payout entry form. Owner draws and employee pay records. Like the other
// forms in this module, the amount is entered as a positive value and we
// negate it server-side so the ledger sum continues to equal net P&L.
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { getTodayEastern, type PaymentMethod } from '@/lib/accounting'

type PayoutType = 'owner_payout' | 'employee_payout'

const TYPE_OPTIONS: { value: PayoutType; label: string }[] = [
  { value: 'owner_payout', label: 'Owner Draw' },
  { value: 'employee_payout', label: 'Employee Pay' },
]

const METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'stripe_online', label: 'Bank Transfer / ACH' },
  { value: 'other', label: 'Other' },
  { value: 'internal', label: 'Internal' },
]

export default function PayoutForm() {
  const router = useRouter()
  const [type, setType] = useState<PayoutType>('owner_payout')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [occurredOn, setOccurredOn] = useState(getTodayEastern())
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [notes, setNotes] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const busy = submitting || isPending

  function reset() {
    setRecipient('')
    setAmount('')
    setOccurredOn(getTodayEastern())
    setPeriodStart('')
    setPeriodEnd('')
    setNotes('')
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!recipient.trim()) {
      setError('Recipient name is required.')
      return
    }
    if (!amount.trim()) {
      setError('Amount is required.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          recipient: recipient.trim(),
          amount,
          occurredOn,
          periodStart: periodStart || null,
          periodEnd: periodEnd || null,
          paymentMethod,
          notes: notes.trim() || null,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean
        error?: string
      }
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `Request failed (${res.status})`)
      }
      setSuccess('Payout recorded.')
      reset()
      startTransition(() => router.refresh())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 card-dark p-6">
      <FieldRow>
        <Field label="Type" htmlFor="type">
          <select
            id="type"
            value={type}
            onChange={(e) => setType(e.target.value as PayoutType)}
            className="form-input"
            required
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Recipient" htmlFor="recipient">
          <input
            id="recipient"
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="e.g. Mark Cox"
            className="form-input"
            required
          />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Amount ($)" htmlFor="amount">
          <input
            id="amount"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="500.00"
            className="form-input"
            required
          />
        </Field>
        <Field label="Date paid" htmlFor="occurredOn">
          <input
            id="occurredOn"
            type="date"
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
            className="form-input"
            required
          />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Period start (optional)" htmlFor="periodStart">
          <input
            id="periodStart"
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="form-input"
          />
        </Field>
        <Field label="Period end (optional)" htmlFor="periodEnd">
          <input
            id="periodEnd"
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="form-input"
          />
        </Field>
      </FieldRow>

      <Field label="Payment Method" htmlFor="paymentMethod">
        <select
          id="paymentMethod"
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
          className="form-input"
          required
        >
          {METHOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Notes (optional)" htmlFor="notes">
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Q2 owner draw"
          rows={3}
          className="form-input resize-y"
        />
      </Field>

      {error && (
        <div
          role="alert"
          className="bg-apex-red/10 border border-apex-red/30 px-4 py-3"
        >
          <p className="telemetry-text text-sm text-apex-red">{error}</p>
        </div>
      )}
      {success && (
        <div
          role="status"
          className="bg-green-500/10 border border-green-500/30 px-4 py-3"
        >
          <p className="telemetry-text text-sm text-green-400">{success}</p>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 racing-headline text-sm uppercase tracking-wider bg-apex-red text-grid-white hover:bg-apex-red/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? (
            <>
              <span
                aria-hidden="true"
                className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"
              />
              Saving…
            </>
          ) : (
            'Record Payout'
          )}
        </button>
      </div>

      <style jsx>{`
        :global(.form-input) {
          width: 100%;
          background: #0d0d0d;
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #f5f5f5;
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 0.875rem;
          padding: 0.625rem 0.75rem;
          outline: none;
          transition: border-color 0.15s;
        }
        :global(.form-input:focus) {
          border-color: #00aeef;
        }
      `}</style>
    </form>
  )
}

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider"
      >
        {label}
      </label>
      {children}
    </div>
  )
}
