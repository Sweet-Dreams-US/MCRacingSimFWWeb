'use client'

interface AdditionalRacer {
  name: string
  phone: string
  email: string
}

interface AdditionalRacerFormProps {
  racerCount: 2 | 3
  racers: AdditionalRacer[]
  onChange: (racers: AdditionalRacer[]) => void
  errors?: { [key: number]: Partial<Record<keyof AdditionalRacer, string>> }
}

export default function AdditionalRacerForm({
  racerCount,
  racers,
  onChange,
  errors,
}: AdditionalRacerFormProps) {
  const handleChange = (index: number, field: keyof AdditionalRacer, value: string) => {
    const updated = [...racers]
    updated[index] = { ...updated[index], [field]: value }
    onChange(updated)
  }

  const racersToShow = racerCount - 1 // Primary booker is racer 1

  return (
    <div className="space-y-4">
      <h3 className="racing-headline text-xl text-grid-white">
        Additional <span className="text-telemetry-cyan">Racers</span>
      </h3>

      <p className="telemetry-text text-sm text-pit-gray">
        Tell us who&apos;s coming with you. Their email is optional — if you add it,
        we&apos;ll send them a friendly heads-up that you&apos;ve booked them in.
      </p>

      <div className="space-y-4">
        {Array.from({ length: racersToShow }).map((_, index) => {
          const racer = racers[index] || { name: '', phone: '', email: '' }
          const racerErrors = errors?.[index] || {}
          const racerNumber = index + 2 // Racer 2 or Racer 3

          return (
            <div
              key={index}
              className="bg-asphalt-dark border border-white/10 p-4 space-y-4"
            >
              <div className="flex items-center gap-2 pb-2 border-b border-white/10">
                <span className="w-8 h-8 flex items-center justify-center bg-telemetry-cyan/20 text-telemetry-cyan racing-headline">
                  {racerNumber}
                </span>
                <span className="telemetry-text text-grid-white">Racer {racerNumber}</span>
              </div>

              {/* Name — required, so we know who's coming */}
              <div>
                <label className="block telemetry-text text-xs text-pit-gray mb-1">
                  Full Name <span className="text-apex-red">*</span>
                </label>
                <input
                  type="text"
                  value={racer.name}
                  onChange={(e) => handleChange(index, 'name', e.target.value)}
                  className={`w-full bg-asphalt border ${
                    racerErrors.name ? 'border-apex-red' : 'border-white/20'
                  } px-3 py-2 text-white telemetry-text focus:border-telemetry-cyan focus:outline-none placeholder:text-pit-gray`}
                  placeholder="Jane Doe"
                />
                {racerErrors.name && (
                  <p className="telemetry-text text-xs text-apex-red mt-1">{racerErrors.name}</p>
                )}
              </div>

              {/* Phone + Email — both optional */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block telemetry-text text-xs text-pit-gray mb-1">
                    Phone <span className="text-pit-gray/60">(optional)</span>
                  </label>
                  <input
                    type="tel"
                    value={racer.phone}
                    onChange={(e) => handleChange(index, 'phone', e.target.value)}
                    className={`w-full bg-asphalt border ${
                      racerErrors.phone ? 'border-apex-red' : 'border-white/20'
                    } px-3 py-2 text-white telemetry-text focus:border-telemetry-cyan focus:outline-none placeholder:text-pit-gray`}
                    placeholder="(555) 123-4567"
                  />
                  {racerErrors.phone && (
                    <p className="telemetry-text text-xs text-apex-red mt-1">{racerErrors.phone}</p>
                  )}
                </div>
                <div>
                  <label className="block telemetry-text text-xs text-pit-gray mb-1">
                    Email <span className="text-pit-gray/60">(optional — for FYI)</span>
                  </label>
                  <input
                    type="email"
                    value={racer.email}
                    onChange={(e) => handleChange(index, 'email', e.target.value)}
                    className={`w-full bg-asphalt border ${
                      racerErrors.email ? 'border-apex-red' : 'border-white/20'
                    } px-3 py-2 text-white telemetry-text focus:border-telemetry-cyan focus:outline-none placeholder:text-pit-gray`}
                    placeholder="jane@example.com"
                  />
                  {racerErrors.email && (
                    <p className="telemetry-text text-xs text-apex-red mt-1">{racerErrors.email}</p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <p className="telemetry-text text-xs text-pit-gray">
        <span className="text-telemetry-cyan">Note:</span> Waivers are signed at the front desk
        on arrival — please show up 10 minutes early so everyone is checked in by session time.
      </p>
    </div>
  )
}
