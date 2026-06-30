'use client'

import { useState, useEffect } from 'react'
import { isMonday, isWeekend } from '@/lib/pricing'

interface DayAvailability {
  date: string
  available: boolean
  isWeekend: boolean
  slotsAvailable?: number
  reason?: string
}

interface BookingCalendarProps {
  value: string | null
  onChange: (date: string) => void
  duration: 1 | 2 | 3
  racerCount: 1 | 2 | 3
}

export default function BookingCalendar({ value, onChange, duration, racerCount }: BookingCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [availability, setAvailability] = useState<DayAvailability[]>([])
  const [loading, setLoading] = useState(false)

  const [year, month] = currentMonth.split('-').map(Number)
  const firstDayOfMonth = new Date(year, month - 1, 1)
  const lastDayOfMonth = new Date(year, month, 0)
  const daysInMonth = lastDayOfMonth.getDate()
  const startDayOfWeek = firstDayOfMonth.getDay()

  const monthName = firstDayOfMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' })

  // Generate local availability (used as fallback or when no API)
  const generateLocalAvailability = (): DayAvailability[] => {
    const localAvailability: DayAvailability[] = []
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${currentMonth}-${String(day).padStart(2, '0')}`
      const dateObj = new Date(year, month - 1, day)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const isPast = dateObj < today

      localAvailability.push({
        date: dateStr,
        available: !isMonday(dateStr) && !isPast,
        isWeekend: isWeekend(dateStr),
        reason: isMonday(dateStr) ? 'closed' : isPast ? 'past' : undefined,
      })
    }
    return localAvailability
  }

  // Availability is computed locally: open Tue–Sun, closed Mondays, no past
  // dates. (We migrated off the old Google Apps Script — bookings now live in
  // Supabase. Real per-day sim-capacity checking against existing bookings is
  // a future enhancement; for now the venue's 3 simulators comfortably absorb
  // overlapping bookings, so every open day is selectable.)
  useEffect(() => {
    setAvailability(generateLocalAvailability())
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth, daysInMonth, year, month])

  const goToPreviousMonth = () => {
    const date = new Date(year, month - 2, 1)
    setCurrentMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`)
  }

  const goToNextMonth = () => {
    const date = new Date(year, month, 1)
    setCurrentMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`)
  }

  const canGoPrevious = () => {
    const now = new Date()
    const currentMonthDate = new Date(year, month - 1, 1)
    return currentMonthDate > new Date(now.getFullYear(), now.getMonth(), 1)
  }

  const getDayAvailability = (day: number): DayAvailability | undefined => {
    const dateStr = `${currentMonth}-${String(day).padStart(2, '0')}`
    return availability.find((a) => a.date === dateStr)
  }

  const isDatePast = (day: number): boolean => {
    const date = new Date(year, month - 1, day)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return date < today
  }

  const isDateSelected = (day: number): boolean => {
    const dateStr = `${currentMonth}-${String(day).padStart(2, '0')}`
    return value === dateStr
  }

  const handleDayClick = (day: number) => {
    const dayAvail = getDayAvailability(day)
    if (!dayAvail?.available || isDatePast(day)) return

    const dateStr = `${currentMonth}-${String(day).padStart(2, '0')}`
    onChange(dateStr)
  }

  return (
    <div className="space-y-4">
      <h3 className="racing-headline text-xl text-grid-white">
        Pick a <span className="text-apex-red">Date</span>
      </h3>

      <div className="bg-asphalt-dark border border-white/10 p-4">
        {/* Month Navigation */}
        <div className="flex justify-between items-center mb-4">
          <button
            type="button"
            onClick={goToPreviousMonth}
            disabled={!canGoPrevious()}
            className="p-2 text-pit-gray hover:text-grid-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="racing-headline text-lg text-grid-white">{monthName}</span>
          <button
            type="button"
            onClick={goToNextMonth}
            className="p-2 text-pit-gray hover:text-grid-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Day of Week Headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div
              key={day}
              className={`text-center telemetry-text text-xs py-2 ${
                day === 'Mon' ? 'text-apex-red/50' : 'text-pit-gray'
              }`}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1">
          {/* Empty cells for days before the first of the month */}
          {Array.from({ length: startDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} className="p-2" />
          ))}

          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1
            const dayAvail = getDayAvailability(day)
            const isPast = isDatePast(day)
            const isAvailable = dayAvail?.available && !isPast
            const isSelected = isDateSelected(day)
            const isClosed = dayAvail?.reason === 'closed'
            const isWeekendDay = dayAvail?.isWeekend

            return (
              <button
                key={day}
                type="button"
                onClick={() => handleDayClick(day)}
                disabled={!isAvailable || loading}
                className={`
                  p-2 text-center transition-all relative
                  ${isSelected ? 'bg-apex-red text-white' : ''}
                  ${!isSelected && isAvailable ? 'hover:bg-white/10 cursor-pointer' : ''}
                  ${!isAvailable ? 'opacity-30 cursor-not-allowed' : ''}
                  ${isClosed ? 'bg-apex-red/10' : ''}
                  ${isWeekendDay && !isSelected && isAvailable ? 'text-telemetry-cyan' : 'text-grid-white'}
                `}
              >
                <span className="telemetry-text text-sm">{day}</span>
                {isAvailable && dayAvail?.slotsAvailable !== undefined && dayAvail.slotsAvailable < 10 && (
                  <span className="absolute bottom-0 right-0 text-[8px] text-pit-gray">
                    {dayAvail.slotsAvailable}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-apex-red/10 border border-apex-red/30" />
            <span className="telemetry-text text-xs text-pit-gray">Closed (Mon)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 border border-white/30" />
            <span className="telemetry-text text-xs text-pit-gray">Weekday</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 border border-telemetry-cyan/50" />
            <span className="telemetry-text text-xs text-telemetry-cyan">Weekend</span>
          </div>
        </div>
      </div>
    </div>
  )
}
