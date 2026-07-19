'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export interface AdminRow {
  id: string
  full_name: string
  email: string
  role: string
  active: boolean
  created_at: string
}

const ROLE_OPTIONS = [
  { value: 'owner', label: 'Owner — full access' },
  { value: 'staff', label: 'Staff — bookings, no-shows, POS' },
  { value: 'sweet_dreams', label: 'Sweet Dreams — revenue + payout' },
  { value: 'readonly', label: 'Read-only — view only' },
]

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  staff: 'Staff',
  sweet_dreams: 'Sweet Dreams',
  readonly: 'Read-only',
}

export default function TeamManager({
  admins,
  currentAdminId,
  canEdit,
}: {
  admins: AdminRow[]
  currentAdminId: string
  canEdit: boolean
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function patch(id: string, body: { role?: string; active?: boolean }) {
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/settings/team/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Update failed')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-apex-red/10 border border-apex-red/30 p-3">
          <p className="telemetry-text text-sm text-apex-red">{error}</p>
        </div>
      )}

      <div className="bg-asphalt-dark border border-white/5 overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-white/10">
            <tr className="text-left">
              <th className="p-4 telemetry-text text-xs text-pit-gray uppercase tracking-wider">Name</th>
              <th className="p-4 telemetry-text text-xs text-pit-gray uppercase tracking-wider">Role</th>
              <th className="p-4 telemetry-text text-xs text-pit-gray uppercase tracking-wider">Status</th>
              {canEdit && <th className="p-4" />}
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => {
              const isSelf = a.id === currentAdminId
              const editable = canEdit && !isSelf
              return (
                <tr key={a.id} className="border-b border-white/5 last:border-b-0">
                  <td className="p-4">
                    <p className="telemetry-text text-grid-white">
                      {a.full_name}
                      {isSelf && <span className="text-pit-gray"> (you)</span>}
                    </p>
                    <p className="telemetry-text text-xs text-pit-gray">{a.email}</p>
                  </td>
                  <td className="p-4">
                    {editable ? (
                      <select
                        value={a.role}
                        onChange={(e) => patch(a.id, { role: e.target.value })}
                        disabled={busyId === a.id}
                        className="bg-asphalt border border-white/15 text-grid-white telemetry-text text-sm px-2 py-1.5"
                      >
                        {ROLE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="telemetry-text text-sm text-grid-white">
                        {ROLE_LABEL[a.role] ?? a.role}
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    {a.active ? (
                      <span className="telemetry-text text-xs px-2 py-1 bg-green-500/10 text-green-400 border border-green-500/30 uppercase">
                        Active
                      </span>
                    ) : (
                      <span className="telemetry-text text-xs px-2 py-1 bg-white/5 text-pit-gray border border-white/10 uppercase">
                        Disabled
                      </span>
                    )}
                  </td>
                  {canEdit && (
                    <td className="p-4 text-right">
                      {editable ? (
                        <button
                          type="button"
                          onClick={() => patch(a.id, { active: !a.active })}
                          disabled={busyId === a.id}
                          className="telemetry-text text-xs uppercase tracking-wider text-pit-gray hover:text-apex-red disabled:opacity-50"
                        >
                          {busyId === a.id ? '…' : a.active ? 'Deactivate' : 'Activate'}
                        </button>
                      ) : (
                        <span className="telemetry-text text-xs text-pit-gray/50">—</span>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <p className="telemetry-text text-xs text-pit-gray">
          To add a new team member, they first need to be invited to the Supabase project — reach out to your
          developer to provision the login, then set their role here.
        </p>
      )}
    </div>
  )
}
