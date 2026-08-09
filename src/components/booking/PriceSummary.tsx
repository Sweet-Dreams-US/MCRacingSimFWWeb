'use client'

import {
  calculatePrice,
  calculateNoShowFeeCents,
  formatDate,
  getDayType,
  extraRacers,
  extraRacerChargeDollars,
  SIM_COUNT,
  EXTRA_RACER_RATE_PER_HOUR,
} from '@/lib/pricing'

interface PriceSummaryProps {
  date: string | null
  duration: number
  racerCount: number
  startTime: string | null
}

export default function PriceSummary({ date, duration, racerCount, startTime }: PriceSummaryProps) {
  if (!date) {
    return (
      <div className="bg-asphalt-dark p-6 border border-white/10">
        <p className="telemetry-text text-pit-gray text-center">
          Select a date to see pricing
        </p>
      </div>
    )
  }

  const { price, isWeekend } = calculatePrice(date, duration, racerCount)
  const dayType = getDayType(date)
  const extras = extraRacers(racerCount)
  const extraCharge = extraRacerChargeDollars(racerCount, duration)

  // Calculate end time. Works in MINUTES so half-hour sessions land correctly
  // (a 1.5h session from 7:00 PM ends at 8:30 PM, not 8:00).
  let endTime = ''
  if (startTime) {
    const [time, period] = startTime.split(' ')
    const [hours, minutes] = time.split(':').map(Number)
    let hour24 = hours
    if (period === 'PM' && hours !== 12) hour24 += 12
    if (period === 'AM' && hours === 12) hour24 = 0

    const endMinutesRaw = hour24 * 60 + minutes + Math.round(duration * 60)
    const endHour24 = Math.floor(endMinutesRaw / 60) % 24
    const endMin = endMinutesRaw % 60
    const endPeriod = endHour24 >= 12 ? 'PM' : 'AM'
    const displayEndHour = endHour24 % 12 || 12
    endTime = `${displayEndHour}:${String(endMin).padStart(2, '0')} ${endPeriod}`
  }

  return (
    <div className="bg-asphalt-dark p-6 border border-apex-red/30">
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="telemetry-text text-xs text-pit-gray uppercase tracking-wider">
            Your Session
          </p>
          <p className="racing-headline text-xl text-grid-white">
            {formatDate(date)}
          </p>
        </div>
        <div className="text-right">
          <span className={`telemetry-text text-xs uppercase tracking-wider px-2 py-1 ${
            isWeekend
              ? 'bg-apex-red/20 text-apex-red'
              : 'bg-telemetry-cyan/20 text-telemetry-cyan'
          }`}>
            {dayType === 'closed' ? 'CLOSED' : isWeekend ? 'Weekend' : 'Weekday'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="telemetry-text text-xs text-pit-gray">Racers</p>
          <p className="telemetry-text text-grid-white font-bold">{racerCount}</p>
        </div>
        <div>
          <p className="telemetry-text text-xs text-pit-gray">Duration</p>
          <p className="telemetry-text text-grid-white font-bold">{duration} hour{duration > 1 ? 's' : ''}</p>
        </div>
        {startTime && (
          <>
            <div>
              <p className="telemetry-text text-xs text-pit-gray">Start</p>
              <p className="telemetry-text text-grid-white font-bold">{startTime}</p>
            </div>
            <div>
              <p className="telemetry-text text-xs text-pit-gray">End</p>
              <p className="telemetry-text text-grid-white font-bold">{endTime}</p>
            </div>
          </>
        )}
      </div>

      <div className="border-t border-white/10 pt-4 space-y-3">
        {/* Big groups: show where the number comes from, so the flat add-on for
            racers past the sims doesn't look like a surprise markup. */}
        {extras > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <p className="telemetry-text text-xs text-pit-gray">
                {SIM_COUNT}-racer session ({duration}h)
              </p>
              <p className="telemetry-text text-xs text-grid-white">${price - extraCharge}</p>
            </div>
            <div className="flex justify-between items-center">
              <p className="telemetry-text text-xs text-pit-gray">
                +{extras} extra racer{extras > 1 ? 's' : ''} × ${EXTRA_RACER_RATE_PER_HOUR}/hr
              </p>
              <p className="telemetry-text text-xs text-grid-white">${extraCharge}</p>
            </div>
          </div>
        )}
        <div className="flex justify-between items-center">
          <p className="telemetry-text text-pit-gray">Session Price</p>
          <p className="racing-headline text-4xl text-apex-red">${price}</p>
        </div>
        <p className="telemetry-text text-xs text-pit-gray">
          Paid in person at your session — cash or card.
        </p>
        <div className="bg-telemetry-cyan/5 border border-telemetry-cyan/20 p-3 mt-2">
          <p className="telemetry-text text-xs text-telemetry-cyan font-bold mb-1">
            CARD HELD ON FILE
          </p>
          <p className="telemetry-text text-xs text-pit-gray leading-relaxed">
            We save your card at booking but only charge it if you no-show
            (<span className="text-grid-white">${(calculateNoShowFeeCents(racerCount) / 100).toFixed(0)}</span>{' '}
            — $20 per sim held, max {SIM_COUNT}). Cancel 24+ hours in advance for free.
          </p>
        </div>
      </div>
    </div>
  )
}
