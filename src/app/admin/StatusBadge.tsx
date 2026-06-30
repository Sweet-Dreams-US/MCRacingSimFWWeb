// Reusable status badges for booking_status, charge_status, payment_method_type.
// Used in the bookings list, booking detail, transactions list, etc.
//
// Each variant maps to brand colors:
//   green   → success / completed / showed-up
//   cyan    → pending / awaiting action
//   amber   → partial / mixed
//   red     → failed / no-show / dispute
//   gray    → cancelled / dormant
import type { Database } from '@/lib/supabase/types'

type BookingStatus = Database['public']['Enums']['booking_status']
type ChargeStatus = Database['public']['Enums']['charge_status']
type PaymentMethod = Database['public']['Enums']['payment_method_type']

const baseClasses = 'inline-flex items-center gap-1.5 px-2 py-0.5 telemetry-text text-xs uppercase tracking-wider'

interface BadgeProps {
  label: string
  variant: 'green' | 'cyan' | 'amber' | 'red' | 'gray'
  showDot?: boolean
}

function Badge({ label, variant, showDot = true }: BadgeProps) {
  const variants = {
    green: 'bg-green-500/15 text-green-400 border border-green-500/30',
    cyan: 'bg-telemetry-cyan/15 text-telemetry-cyan border border-telemetry-cyan/30',
    amber: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
    red: 'bg-apex-red/15 text-apex-red border border-apex-red/30',
    gray: 'bg-white/5 text-pit-gray border border-white/10',
  } as const
  const dotColors = {
    green: 'bg-green-400',
    cyan: 'bg-telemetry-cyan',
    amber: 'bg-amber-400',
    red: 'bg-apex-red',
    gray: 'bg-pit-gray',
  } as const

  return (
    <span className={`${baseClasses} ${variants[variant]}`}>
      {showDot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />}
      {label}
    </span>
  )
}

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const map: Record<BookingStatus, { label: string; variant: BadgeProps['variant'] }> = {
    pending: { label: 'Pending Payment', variant: 'gray' },
    confirmed: { label: 'Confirmed', variant: 'cyan' },
    completed: { label: 'Completed', variant: 'green' },
    partial_noshow: { label: 'Partial No-Show', variant: 'amber' },
    noshow: { label: 'No-Show', variant: 'red' },
    cancelled: { label: 'Cancelled', variant: 'gray' },
  }
  const { label, variant } = map[status]
  return <Badge label={label} variant={variant} />
}

export function ChargeStatusBadge({ status }: { status: ChargeStatus }) {
  const map: Record<ChargeStatus, { label: string; variant: BadgeProps['variant'] }> = {
    pending: { label: 'Pending', variant: 'cyan' },
    succeeded: { label: 'Succeeded', variant: 'green' },
    failed: { label: 'Failed', variant: 'red' },
    requires_action: { label: 'Needs Action', variant: 'amber' },
    refunded: { label: 'Refunded', variant: 'gray' },
  }
  const { label, variant } = map[status]
  return <Badge label={label} variant={variant} />
}

export function PaymentMethodBadge({ method }: { method: PaymentMethod }) {
  const map: Record<PaymentMethod, { label: string; variant: BadgeProps['variant'] }> = {
    stripe_online: { label: 'Stripe Online', variant: 'cyan' },
    stripe_terminal: { label: 'In-Person', variant: 'cyan' },
    cash: { label: 'Cash', variant: 'green' },
    other: { label: 'Other', variant: 'gray' },
    internal: { label: 'Internal', variant: 'gray' },
  }
  const { label, variant } = map[method]
  return <Badge label={label} variant={variant} showDot={false} />
}
