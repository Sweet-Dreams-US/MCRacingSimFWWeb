'use client'

import { useState, useEffect, useMemo } from 'react'
import { getTimeSlots } from '@/lib/pricing'

interface TimeSlot {
  time: string
  available: boolean
  simsAvailable?: number
  /** Set when the slot is unavailable because of the 90-minute online cutoff. */
  withinCutoff?: boolean
}

interface TimeSlotPickerProps {
  date: string | null
  duration: 1 | 2 | 3
  racerCount: 1 | 2 | 3
  value: string | null
  onChange: (time: string) => void
}

// ---------------------------------------------------------------------------
// 90-minute online booking cutoff
// ---------------------------------------------------------------------------
// Compare slot's wall-clock start (in Eastern) to "now" in Eastern. If less
// than 90 minutes away, the slot can't be booked online — the customer must
// call the venue. This logic is wall-clock-only (no UTC conversion needed):
// we build both sides as if Eastern components were UTC, then diff.

function getEasternWallClockMinutes(d: Date): { year: number; month: number; day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10)
  // Intl returns hour=24 at midnight in some locales — coerce to 0
  let hour = get('hour')
  if (hour === 24) hour = 0
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    minutes: hour * 60 + get('minute'),
  }
}

function parseSlotTimeToMinutes(timeStr: string): number {
  const [time, period] = timeStr.split(' ')
  const [hStr, mStr] = time.split(':')
  let hour = parseInt(hStr, 10)
  const minute = parseInt(mStr, 10)
  if (period === 'PM' && hour !== 12) hour += 12
  if (period === 'AM' && hour === 12) hour = 0
  return hour * 60 + minute
}

const ONLINE_CUTOFF_MINUTES = 90

function isSlotWithinCutoff(slotDate: string, slotTime: string): boolean {
  const [slotYear, slotMonth, slotDay] = slotDate.split('-').map(Number)
  const eastern = getEasternWallClockMinutes(new Date())

  // If the slot is on a future day in Eastern, it's never within cutoff.
  // (Treating "future day" via Date.UTC comparison — both sides use Eastern
  // wall-clock components as if UTC, so the comparison is stable.)
  const slotEpoch = Date.UTC(slotYear, slotMonth - 1, slotDay, 0, 0)
  const easternEpoch = Date.UTC(eastern.year, eastern.month - 1, eastern.day, 0, 0)
  if (slotEpoch > easternEpoch) return false
  if (slotEpoch < easternEpoch) return true // past — also not bookable

  // Same day — compare wall-clock minutes
  const slotMinutes = parseSlotTimeToMinutes(slotTime)
  return slotMinutes - eastern.minutes < ONLINE_CUTOFF_MINUTES
}

export default function TimeSlotPicker({
  date,
  duration,
  racerCount,
  value,
  onChange,
}: TimeSlotPickerProps) {
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [loading, setLoading] = useState(false)

  // Memoize time slots so they don't cause re-renders
  const allTimeSlots = useMemo(() => getTimeSlots(), [])

  // Generate local slots (all available)
  const generateLocalSlots = (): TimeSlot[] => {
    return allTimeSlots.map((time) => ({
      time,
      available: true,
      simsAvailable: 3,
    }))
  }

  // Apply the 90-minute online cutoff on top of whatever the upstream source
  // returned. Cutoff slots get available=false + withinCutoff=true so the UI
  // can render a different visual + helpful copy.
  const applyCutoff = (rawSlots: TimeSlot[], slotDate: string): TimeSlot[] => {
    return rawSlots.map((slot) => {
      if (isSlotWithinCutoff(slotDate, slot.time)) {
        return { ...slot, available: false, withinCutoff: true }
      }
      return slot
    })
  }

  // Slots are computed locally (every operating-hours slot open), then the
  // 90-minute online cutoff is applied. We migrated off the old Google Apps
  // Script — real per-slot sim-capacity checking against Supabase bookings is
  // a future enhancement; the 3 simulators absorb overlapping bookings for now.
  useEffect(() => {
    if (!date) {
      setSlots([])
      return
    }
    setSlots(applyCutoff(generateLocalSlots(), date))
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, duration, racerCount])

  if (!date) {
    return (
      <div className="space-y-4">
        <h3 className="racing-headline text-xl text-grid-white">
          Pick a <span className="text-telemetry-cyan">Time</span>
        </h3>
        <div className="bg-asphalt-dark border border-white/10 p-6">
          <p className="telemetry-text text-pit-gray text-center">
            Select a date first to see available times
          </p>
        </div>
      </div>
    )
  }

  // Parse time to get hour in 24h format
  const getHour24 = (timeStr: string): number => {
    const [time, period] = timeStr.split(' ')
    let hour = parseInt(time.split(':')[0])
    if (period === 'PM' && hour !== 12) hour += 12
    if (period === 'AM' && hour === 12) hour = 0
    return hour
  }

  // Group slots by period
  const afternoonSlots = slots.filter((s) => {
    const hour = getHour24(s.time)
    return hour >= 12 && hour < 17 // 12pm - 5pm
  })

  const eveningSlots = slots.filter((s) => {
    const hour = getHour24(s.time)
    return hour >= 17 && hour < 24 // 5pm - midnight
  })

  const lateNightSlots = slots.filter((s) => {
    const hour = getHour24(s.time)
    return hour >= 0 && hour < 2 // midnight - 2am
  })

  const renderSlotGroup = (groupSlots: TimeSlot[], label: string) => {
    if (groupSlots.length === 0) return null

    return (
      <div className="space-y-2">
        <p className="telemetry-text text-xs text-pit-gray uppercase tracking-wider">{label}</p>
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {groupSlots.map((slot) => (
            <button
              key={slot.time}
              type="button"
              onClick={() => slot.available && onChange(slot.time)}
              disabled={!slot.available || loading}
              className={`
                py-2 px-3 text-center transition-all telemetry-text text-sm
                ${value === slot.time ? 'bg-telemetry-cyan text-asphalt-dark font-bold' : ''}
                ${value !== slot.time && slot.available ? 'border border-white/20 hover:border-telemetry-cyan/50 text-grid-white' : ''}
                ${!slot.available ? 'border border-white/5 text-pit-gray/50 cursor-not-allowed' : ''}
              `}
            >
              {slot.time.replace(':00', '').replace(':30', ':30').replace(' ', '')}
            </button>
          ))}
        </div>
      </div>
    )
  }

  const hasSlots = slots.length > 0
  const hasCutoffSlots = slots.some((s) => s.withinCutoff)

  return (
    <div className="space-y-4">
      <h3 className="racing-headline text-xl text-grid-white">
        Pick a <span className="text-telemetry-cyan">Time</span>
      </h3>

      <div className="bg-asphalt-dark border border-white/10 p-4 space-y-4">
        {/* 90-min cutoff callout — only shown when some slots are blocked by it */}
        {hasCutoffSlots && (
          <div className="bg-apex-red/10 border border-apex-red/30 p-3 flex items-start gap-3">
            <div className="text-apex-red text-lg leading-none mt-0.5">⚠</div>
            <div className="flex-1">
              <p className="telemetry-text text-sm text-grid-white font-bold mb-1">
                Need a time sooner than 90 minutes from now?
              </p>
              <p className="telemetry-text text-xs text-pit-gray">
                Online booking closes 90 minutes before session start. Call{' '}
                <a
                  href="tel:+18082202600"
                  className="text-apex-red font-bold hover:text-apex-red-glow underline"
                >
                  (808) 220-2600
                </a>{' '}
                to grab a last-minute slot.
              </p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin w-6 h-6 border-2 border-telemetry-cyan border-t-transparent rounded-full" />
          </div>
        ) : !hasSlots ? (
          <div className="py-8 text-center">
            <p className="telemetry-text text-pit-gray">No time slots available for this date</p>
          </div>
        ) : (
          <>
            {renderSlotGroup(afternoonSlots, 'Afternoon')}
            {renderSlotGroup(eveningSlots, 'Evening')}
            {renderSlotGroup(lateNightSlots, 'Late Night')}
          </>
        )}

        <p className="telemetry-text text-xs text-pit-gray border-t border-white/10 pt-3">
          <span className="text-apex-red">Hours:</span> Tue-Thu &amp; Sun Noon - Midnight • Fri-Sat Noon - 2:00 AM • Mon by reservation only
        </p>
      </div>
    </div>
  )
}
