'use client'

// Expense entry form with optional receipt photo upload. The flow is:
//   1. Pick a category, type the amount (always positive — we negate server-side)
//   2. Optionally choose a receipt file; we upload it FIRST to
//      /api/admin/expenses/upload-receipt and stash the returned path
//   3. POST /api/admin/expenses with the path so the transaction row stores
//      a relative storage path (not a public URL — receipts bucket is private)
//
// Two-step upload pattern keeps the JSON API small and lets us validate file
// type / size in one place (the upload route).
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { getTodayEastern, type PaymentMethod } from '@/lib/accounting'

const METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'stripe_online', label: 'Stripe / Card' },
  { value: 'stripe_terminal', label: 'In-Person Card' },
  { value: 'other', label: 'Other' },
  { value: 'internal', label: 'Internal' },
]

interface ExpenseFormProps {
  categories: { id: string; name: string; scheduleCLine: string | null }[]
}

export default function ExpenseForm({ categories }: ExpenseFormProps) {
  const router = useRouter()
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [occurredOn, setOccurredOn] = useState(getTodayEastern())
  const [vendor, setVendor] = useState('')
  const [description, setDescription] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [uploadingReceipt, setUploadingReceipt] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const busy = submitting || uploadingReceipt || isPending

  function reset() {
    setAmount('')
    setVendor('')
    setDescription('')
    setReceiptFile(null)
    setOccurredOn(getTodayEastern())
    // Clear the file input by resetting the form element via ref-free trick:
    // findable via the name attribute below; not strictly necessary but tidy.
    const fileInput = document.getElementById(
      'receiptFile'
    ) as HTMLInputElement | null
    if (fileInput) fileInput.value = ''
  }

  async function uploadReceipt(file: File): Promise<string> {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/admin/expenses/upload-receipt', {
      method: 'POST',
      body: fd,
    })
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean
      error?: string
      path?: string
    }
    if (!res.ok || !json.success || !json.path) {
      throw new Error(json.error ?? `Upload failed (${res.status})`)
    }
    return json.path
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!categoryId) {
      setError('Pick a category.')
      return
    }
    if (!amount.trim() || !description.trim()) {
      setError('Amount and description are required.')
      return
    }

    try {
      let receiptPath: string | null = null
      if (receiptFile) {
        setUploadingReceipt(true)
        try {
          receiptPath = await uploadReceipt(receiptFile)
        } finally {
          setUploadingReceipt(false)
        }
      }

      setSubmitting(true)
      const res = await fetch('/api/admin/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId,
          amount,
          occurredOn,
          description: description.trim(),
          vendor: vendor.trim() || null,
          paymentMethod,
          receiptPath,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean
        error?: string
      }
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `Request failed (${res.status})`)
      }
      setSuccess('Expense recorded.')
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
      <Field label="Category" htmlFor="categoryId">
        <select
          id="categoryId"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="form-input"
          required
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.scheduleCLine ? ` — Sched C ${c.scheduleCLine}` : ''}
            </option>
          ))}
        </select>
      </Field>

      <FieldRow>
        <Field label="Amount ($)" htmlFor="amount">
          <input
            id="amount"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="125.00"
            className="form-input"
            required
          />
        </Field>
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
      </FieldRow>

      <FieldRow>
        <Field label="Vendor (optional)" htmlFor="vendor">
          <input
            id="vendor"
            type="text"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="e.g. Home Depot"
            className="form-input"
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
          placeholder="e.g. Drywall + paint for racing wall"
          rows={3}
          className="form-input resize-y"
          required
        />
      </Field>

      <Field
        label="Receipt photo (optional)"
        htmlFor="receiptFile"
        hint="JPG, PNG, HEIC, WebP, or PDF — up to 10MB."
      >
        <input
          id="receiptFile"
          type="file"
          accept="image/jpeg,image/png,image/heic,image/webp,application/pdf"
          onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
          className="form-input"
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
              {uploadingReceipt ? 'Uploading receipt…' : 'Saving…'}
            </>
          ) : (
            'Record Expense'
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
