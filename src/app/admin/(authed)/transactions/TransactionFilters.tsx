'use client'

// Filter bar for the transactions list. Mutates the URL search params via
// router.replace so the parent server component re-runs its query. Search
// input is debounced at 250ms to match the customers list pattern; the
// dropdowns and date inputs commit on change for snappy feedback.
//
// We accept arrays of options as props so a pre-filtered list (e.g. expenses)
// can hide the type dropdown by passing an empty array.
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { TransactionType, PaymentMethod } from '@/lib/accounting'
import { formatTransactionType } from '@/lib/accounting'

interface TransactionFiltersProps {
  initialType: TransactionType | ''
  initialPaymentMethod: PaymentMethod | ''
  initialFrom: string
  initialTo: string
  initialQ: string
  typeOptions?: TransactionType[]
  paymentMethodOptions?: PaymentMethod[]
  // If true, render the type dropdown disabled with a hidden value (used by
  // /expenses to pin type=expense without confusing the user).
  hideType?: boolean
}

const DEFAULT_TYPE_OPTIONS: TransactionType[] = [
  'booking_income',
  'no_show_fee',
  'in_person_sale',
  'other_income',
  'expense',
  'owner_payout',
  'employee_payout',
  'marketing_payout',
  'cash_deposit',
  'cash_withdrawal',
  'refund',
  'adjustment',
]

const DEFAULT_METHOD_OPTIONS: PaymentMethod[] = [
  'stripe_online',
  'stripe_terminal',
  'cash',
  'other',
  'internal',
]

function paymentMethodLabel(m: PaymentMethod): string {
  switch (m) {
    case 'stripe_online': return 'Stripe Online'
    case 'stripe_terminal': return 'In-Person Card'
    case 'cash': return 'Cash'
    case 'other': return 'Other'
    case 'internal': return 'Internal'
  }
}

export default function TransactionFilters({
  initialType,
  initialPaymentMethod,
  initialFrom,
  initialTo,
  initialQ,
  typeOptions = DEFAULT_TYPE_OPTIONS,
  paymentMethodOptions = DEFAULT_METHOD_OPTIONS,
  hideType = false,
}: TransactionFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(initialQ)

  // Debounced search → URL. Other controls go through updateParam directly.
  useEffect(() => {
    if (search === initialQ) return
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (search.trim()) params.set('q', search.trim())
      else params.delete('q')
      params.delete('page') // reset pagination on filter change
      router.replace(`?${params.toString()}`)
    }, 250)
    return () => clearTimeout(timer)
  }, [search, initialQ, router, searchParams])

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    params.delete('page')
    router.replace(`?${params.toString()}`)
  }

  function clearAll() {
    router.replace('?')
    setSearch('')
  }

  const activeFilters = [
    !hideType && initialType ? { key: 'type', label: formatTransactionType(initialType) } : null,
    initialPaymentMethod ? { key: 'paymentMethod', label: paymentMethodLabel(initialPaymentMethod) } : null,
    initialFrom ? { key: 'from', label: `From ${initialFrom}` } : null,
    initialTo ? { key: 'to', label: `To ${initialTo}` } : null,
    initialQ ? { key: 'q', label: `"${initialQ}"` } : null,
  ].filter(Boolean) as { key: string; label: string }[]

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {!hideType && (
          <select
            value={initialType}
            onChange={(e) => updateParam('type', e.target.value)}
            className="bg-asphalt-dark border border-white/10 text-grid-white telemetry-text text-sm px-3 py-2 focus:border-telemetry-cyan focus:outline-none"
            aria-label="Filter by transaction type"
          >
            <option value="">All Types</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>
                {formatTransactionType(t)}
              </option>
            ))}
          </select>
        )}

        <select
          value={initialPaymentMethod}
          onChange={(e) => updateParam('paymentMethod', e.target.value)}
          className="bg-asphalt-dark border border-white/10 text-grid-white telemetry-text text-sm px-3 py-2 focus:border-telemetry-cyan focus:outline-none"
          aria-label="Filter by payment method"
        >
          <option value="">All Methods</option>
          {paymentMethodOptions.map((m) => (
            <option key={m} value={m}>
              {paymentMethodLabel(m)}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={initialFrom}
          onChange={(e) => updateParam('from', e.target.value)}
          className="bg-asphalt-dark border border-white/10 text-grid-white telemetry-text text-sm px-3 py-2 focus:border-telemetry-cyan focus:outline-none"
          aria-label="From date"
        />
        <input
          type="date"
          value={initialTo}
          onChange={(e) => updateParam('to', e.target.value)}
          className="bg-asphalt-dark border border-white/10 text-grid-white telemetry-text text-sm px-3 py-2 focus:border-telemetry-cyan focus:outline-none"
          aria-label="To date"
        />

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search description..."
          className="bg-asphalt-dark border border-white/10 text-grid-white telemetry-text text-sm px-3 py-2 focus:border-telemetry-cyan focus:outline-none"
          aria-label="Search description"
        />
      </div>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="telemetry-text text-xs text-pit-gray uppercase tracking-wider">
            Filters:
          </span>
          {activeFilters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => updateParam(f.key, '')}
              className="inline-flex items-center gap-1.5 telemetry-text text-xs px-2 py-1 bg-telemetry-cyan/10 text-telemetry-cyan border border-telemetry-cyan/30 hover:bg-telemetry-cyan/20"
              title="Clear this filter"
            >
              {f.label}
              <span aria-hidden="true">×</span>
            </button>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="telemetry-text text-xs text-pit-gray uppercase tracking-wider hover:text-apex-red ml-2"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}
