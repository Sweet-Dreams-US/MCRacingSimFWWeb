'use client'

import { calculatePrice, calculateNoShowFeeCents, formatDate, getDayType } from '@/lib/pricing'

interface PriceSummaryProps {
  date: string | null
  duration: 1 | 2 | 3
  racerCount: 1 | 2 | 3
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

  // Calculate end time
  let endTime = ''
  if (startTime) {
    const [time, period] = startTime.split(' ')
    const [hours, minutes] = time.split(':').map(Number)
    let hour24 = hours
    if (period === 'PM' && hours !== 12) hour24 += 12
    if (period === 'AM' && hours === 12) hour24 = 0

    let endHour = hour24 + duration
    const endPeriod = endHour >= 12 && endHour < 24 ? 'PM' : 'AM'
    if (endHour >= 24) endHour -= 24
    const displayEndHour = endHour % 12 || 12
    endTime = `${displayEndHour}:${String(minutes).padStart(2, '0')} ${endPeriod}`
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
            — $20 per seat). Cancel 24+ hours in advance for free.
          </p>
        </div>
      </div>
    </div>
  )
}
