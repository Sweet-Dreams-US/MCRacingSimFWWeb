'use client'

import EmailSuggestInput, { type PrefillCustomer } from '@/components/EmailSuggestInput'

interface CustomerInfo {
  firstName: string
  lastName: string
  phone: string
  email: string
  birthday: string
  howHeard: string
}

interface CustomerInfoFormProps {
  value: CustomerInfo
  onChange: (info: CustomerInfo) => void
  errors?: Partial<Record<keyof CustomerInfo, string>>
}

const howHeardOptions = [
  'Google Search',
  'Facebook',
  'Instagram',
  'TikTok',
  'Radio',
  'Friend/Family',
  'Drove By',
  'Event/Show',
  'Other',
]

export default function CustomerInfoForm({ value, onChange, errors }: CustomerInfoFormProps) {
  const handleChange = (field: keyof CustomerInfo, fieldValue: string) => {
    onChange({ ...value, [field]: fieldValue })
  }

  return (
    <div className="space-y-4">
      <h3 className="racing-headline text-xl text-grid-white">
        Your <span className="text-apex-red">Info</span>
      </h3>

      <div className="bg-asphalt-dark border border-white/10 p-4 space-y-4">
        {/* Name Row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block telemetry-text text-xs text-pit-gray mb-1">
              First Name <span className="text-apex-red">*</span>
            </label>
            <input
              type="text"
              value={value.firstName}
              onChange={(e) => handleChange('firstName', e.target.value)}
              className={`w-full bg-asphalt border ${
                errors?.firstName ? 'border-apex-red' : 'border-white/20'
              } px-3 py-2 text-white telemetry-text focus:border-telemetry-cyan focus:outline-none placeholder:text-pit-gray`}
              placeholder="John"
            />
            {errors?.firstName && (
              <p className="telemetry-text text-xs text-apex-red mt-1">{errors.firstName}</p>
            )}
          </div>
          <div>
            <label className="block telemetry-text text-xs text-pit-gray mb-1">
              Last Name <span className="text-apex-red">*</span>
            </label>
            <input
              type="text"
              value={value.lastName}
              onChange={(e) => handleChange('lastName', e.target.value)}
              className={`w-full bg-asphalt border ${
                errors?.lastName ? 'border-apex-red' : 'border-white/20'
              } px-3 py-2 text-white telemetry-text focus:border-telemetry-cyan focus:outline-none placeholder:text-pit-gray`}
              placeholder="Doe"
            />
            {errors?.lastName && (
              <p className="telemetry-text text-xs text-apex-red mt-1">{errors.lastName}</p>
            )}
          </div>
        </div>

        {/* Contact Row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block telemetry-text text-xs text-pit-gray mb-1">
              Phone <span className="text-apex-red">*</span>
            </label>
            <input
              type="tel"
              value={value.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              className={`w-full bg-asphalt border ${
                errors?.phone ? 'border-apex-red' : 'border-white/20'
              } px-3 py-2 text-white telemetry-text focus:border-telemetry-cyan focus:outline-none placeholder:text-pit-gray`}
              placeholder="(555) 123-4567"
            />
            {errors?.phone && (
              <p className="telemetry-text text-xs text-apex-red mt-1">{errors.phone}</p>
            )}
          </div>
          <div>
            <label className="block telemetry-text text-xs text-pit-gray mb-1">
              Email <span className="text-apex-red">*</span>
            </label>
            <EmailSuggestInput
              value={value.email}
              onChange={(email) => handleChange('email', email)}
              // Returning customer picked their email → fill whatever they
              // haven't typed yet (never clobber fields they already filled).
              onPickCustomer={(c: PrefillCustomer) =>
                onChange({
                  ...value,
                  email: value.email,
                  firstName: value.firstName || c.firstName || '',
                  lastName: value.lastName || c.lastName || '',
                  phone: value.phone || c.phone || '',
                  birthday: value.birthday || c.birthday || '',
                })
              }
              className={`w-full bg-asphalt border ${
                errors?.email ? 'border-apex-red' : 'border-white/20'
              } px-3 py-2 text-white telemetry-text focus:border-telemetry-cyan focus:outline-none placeholder:text-pit-gray`}
              placeholder="john@example.com"
            />
            {errors?.email && (
              <p className="telemetry-text text-xs text-apex-red mt-1">{errors.email}</p>
            )}
          </div>
        </div>

        {/* Birthday */}
        <div>
          <label className="block telemetry-text text-xs text-pit-gray mb-1">
            Birthday <span className="text-apex-red">*</span>
          </label>
          <input
            type="date"
            value={value.birthday}
            onChange={(e) => handleChange('birthday', e.target.value)}
            className={`w-full bg-asphalt border ${
              errors?.birthday ? 'border-apex-red' : 'border-white/20'
            } px-3 py-2 text-white telemetry-text focus:border-telemetry-cyan focus:outline-none [color-scheme:dark]`}
          />
          {errors?.birthday && (
            <p className="telemetry-text text-xs text-apex-red mt-1">{errors.birthday}</p>
          )}
        </div>

        {/* How Did You Hear */}
        <div>
          <label className="block telemetry-text text-xs text-pit-gray mb-1">
            How did you hear about us? <span className="text-apex-red">*</span>
          </label>
          <select
            value={value.howHeard}
            onChange={(e) => handleChange('howHeard', e.target.value)}
            className={`w-full bg-asphalt border ${
              errors?.howHeard ? 'border-apex-red' : 'border-white/20'
            } px-3 py-2 text-white telemetry-text focus:border-telemetry-cyan focus:outline-none`}
          >
            <option value="">Select an option...</option>
            {howHeardOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {errors?.howHeard && (
            <p className="telemetry-text text-xs text-apex-red mt-1">{errors.howHeard}</p>
          )}
        </div>
      </div>
    </div>
  )
}
