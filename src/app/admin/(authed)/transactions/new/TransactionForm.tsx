'use client'

// Client-side form that POSTs to /api/admin/transactions. The API does the
// real validation and sign-flipping (positive vs negative based on type);
// we keep the form simple — always show a positive dollar amount and let
// the server flip the sign.
//
// On success: show a toast, reset the form, and refresh the router so the
// list pages re-fetch. We don't auto-navigate so Mark can punch in several
// in a row.
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { getTodayEastern, type TransactionType, type PaymentMethod } from '@/lib/accounting'

const TYPE_OPTIONS: { value: TransactionType; label: string }[] = [
  { value: 'in_person_sale', label: 'In-Person Sale' },
  { value: 'booking_income', label: 'Booking Income' },
  { value: 'no_show_fee', label: 'No-Show Fee' },
  { value: 'other_income', label: 'Other Income' },
  { value: 'cash_deposit', label: 'Cash Deposit (to drawer)' },
  { value: 'expense', label: 'Expense' },
  { value: 'cash_withdrawal', label: 'Cash Withdrawal (from drawer)' },
  { value: 'refund', label: 'Refund' },
  { value: 'adjustment', label: 'Adjustment' },
]

const METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'stripe_online', label: 'Stripe Online' },
  { value: 'stripe_terminal', label: 'In-Person Card' },
  { value: 'other', label: 'Other' },
  { value: 'internal', label: 'Internal' },
]

export default function TransactionForm() {
  const router = useRouter()
  const [type, setType] = useState<TransactionType>('in_person_sale')
  const [amount, setAmount] = useState('')
  const [occurredOn, setOccurredOn] = useState(getTodayEastern())
  const [description, setDescription] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [customerEmail, setCustomerEmail] = useState('')
  const [receiptUrl, setReceiptUrl] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const busy = submitting || isPending

  function reset() {
    setAmount('')
    setDescription('')
    setCustomerEmail('')
    setReceiptUrl('')
    setOccurredOn(getTodayEastern())
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!amount.trim() || !description.trim()) {
      setError('Amount and description are required.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          amount,
          occurredOn,
          description: description.trim(),
          paymentMethod,
          customerEmail: customerEmail.trim() || null,
          receiptUrl: receiptUrl.trim() || null,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean
        error?: string
      }
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `Request failed (${res.status})`)
      }
      setSuccess('Transaction recorded.')
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
            onChange={(e) => setType(e.target.value as TransactionType)}
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
        <Field label="Amount ($)" htmlFor="amount">
          <input
            id="amount"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="45.00"
            className="form-input"
            required
          />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Date" htmlFor="occurredOn">
          <input
            id="occurredOn"
            type="date"
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
            className="form-input"
            required
          />
        </Field>
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
      </FieldRow>

      <Field label="Description" htmlFor="description">
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Walk-in 1-hour session, paid cash"
          rows={3}
          className="form-input resize-y"
          required
        />
      </Field>

      <FieldRow>
        <Field
          label="Customer email (optional)"
          htmlFor="customerEmail"
          hint="If known, links the transaction to a customer record."
        >
          <input
            id="customerEmail"
            type="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            placeholder="racer@example.com"
            className="form-input"
          />
        </Field>
        <Field
          label="Receipt URL (optional)"
          htmlFor="receiptUrl"
          hint="Link to a receipt image or invoice."
        >
          <input
            id="receiptUrl"
            type="url"
            value={receiptUrl}
            onChange={(e) => setReceiptUrl(e.target.value)}
            placeholder="https://..."
            className="form-input"
          />
        </Field>
      </FieldRow>

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
            'Record Transaction'
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
  hint,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
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
      {hint && (
        <p className="telemetry-text text-xs text-pit-gray/70">{hint}</p>
      )}
    </div>
  )
}
