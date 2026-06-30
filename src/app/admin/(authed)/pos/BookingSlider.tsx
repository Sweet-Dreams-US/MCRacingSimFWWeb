'use client'

// Booking selector for the POS. One markup, two layouts:
//   - mobile (<lg): a horizontal scroller across the top (flex-row, overflow-x)
//   - desktop (lg+): a vertical list down the side (flex-col, overflow-y)
// Tapping a card prefills the sale form (time, customer, price) in the parent.

export interface BookingHit {
  id: string
  sessionDate: string
  startTime: string
  endTime: string
  durationHours: number
  racerCount: number
  sessionPriceCents: number
  noShowFeeCents: number
  status: string
  source: string
  cardOnFile: boolean
  customer: { id: string; name: string; email: string | null; phone: string | null } | null
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function formatTime(t: string): string {
  // "14:30:00" → "2:30 PM"
  const [hStr, mStr] = t.split(':')
  let h = parseInt(hStr, 10)
  const period = h >= 12 ? 'PM' : 'AM'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return `${h}:${mStr} ${period}`
}

function formatDayLabel(dateStr: string, today: string): string {
  if (dateStr === today) return 'Today'
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function BookingSlider({
  bookings,
  selectedId,
  onSelect,
  loading,
  today,
}: {
  bookings: BookingHit[]
  selectedId: string | null
  onSelect: (b: BookingHit) => void
  loading: boolean
  today: string
}) {
  return (
    <div className="bg-asphalt-dark border border-white/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="racing-headline text-sm text-grid-white uppercase tracking-wider">
          Bookings
        </h2>
        <span className="telemetry-text text-xs text-pit-gray">
          {loading ? '…' : `${bookings.length}`}
        </span>
      </div>

      {loading ? (
        <p className="telemetry-text text-xs text-pit-gray py-4">Loading bookings…</p>
      ) : bookings.length === 0 ? (
        <p className="telemetry-text text-xs text-pit-gray py-4">
          No upcoming bookings. Use the form to charge a walk-in.
        </p>
      ) : (
        <div
          className="flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-y-auto lg:max-h-[calc(100vh-16rem)] pb-2 lg:pb-0 -mx-1 px-1"
          role="listbox"
          aria-label="Select a booking"
        >
          {bookings.map((b) => {
            const isSelected = b.id === selectedId
            return (
              <button
                key={b.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => onSelect(b)}
                className={`flex-shrink-0 w-[220px] lg:w-auto text-left p-3 border transition-colors ${
                  isSelected
                    ? 'border-telemetry-cyan bg-telemetry-cyan/10'
                    : 'border-white/10 bg-asphalt hover:border-telemetry-cyan/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="telemetry-text text-xs text-telemetry-cyan uppercase tracking-wider">
                    {formatDayLabel(b.sessionDate, today)} · {formatTime(b.startTime)}
                  </span>
                  <span className="racing-headline text-sm text-grid-white">
                    {formatDollars(b.sessionPriceCents)}
                  </span>
                </div>
                <p className="telemetry-text text-sm text-grid-white mt-1 truncate">
                  {b.customer?.name ?? 'No customer'}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="telemetry-text text-[11px] text-pit-gray">
                    {b.racerCount} racer{b.racerCount > 1 ? 's' : ''} · {b.durationHours}h
                  </span>
                  {b.cardOnFile && (
                    <span className="telemetry-text text-[10px] px-1 py-0.5 bg-white/5 text-pit-gray border border-white/10 uppercase">
                      Card
                    </span>
                  )}
                  <span className="telemetry-text text-[10px] text-pit-gray uppercase ml-auto">
                    {b.id}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
