'use client'

// The campaign composer: subject, preheader, message, optional CTA button, with
// a live inbox preview and merge-field helpers. Used in "create" mode on
// /admin/marketing/new and "edit" mode on a draft's detail page.
//
// Saving creates (or updates) the draft. Test-send and full-send live on the
// detail page because they need a saved campaign id.
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export interface ComposerInitial {
  name: string
  subject: string
  preheader: string
  bodyText: string
  ctaLabel: string
  ctaUrl: string
}

interface Props {
  mode: 'create' | 'edit'
  campaignId?: string
  audienceCount: number
  initial?: ComposerInitial
}

const MERGE_FIELDS = [
  { token: '{{firstName}}', label: 'First name' },
  { token: '{{lastName}}', label: 'Last name' },
  { token: '{{fullName}}', label: 'Full name' },
]

// Mirror of the server's sample values so the preview matches a real send.
function applySample(s: string): string {
  return s
    .replace(/\{\{\s*firstName\s*\}\}/gi, 'Alex')
    .replace(/\{\{\s*lastName\s*\}\}/gi, 'Driver')
    .replace(/\{\{\s*fullName\s*\}\}/gi, 'Alex Driver')
}

export default function CampaignComposer({
  mode,
  campaignId,
  audienceCount,
  initial,
}: Props) {
  const router = useRouter()
  const [name, setName] = useState(initial?.name ?? '')
  const [subject, setSubject] = useState(initial?.subject ?? '')
  const [preheader, setPreheader] = useState(initial?.preheader ?? '')
  const [bodyText, setBodyText] = useState(initial?.bodyText ?? '')
  const [ctaLabel, setCtaLabel] = useState(initial?.ctaLabel ?? '')
  const [ctaUrl, setCtaUrl] = useState(initial?.ctaUrl ?? '')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const messageRef = useRef<HTMLTextAreaElement>(null)

  // Insert a merge token at the cursor in the message textarea.
  function insertToken(token: string) {
    const el = messageRef.current
    if (!el) {
      setBodyText((b) => b + token)
      return
    }
    const start = el.selectionStart ?? bodyText.length
    const end = el.selectionEnd ?? bodyText.length
    const next = bodyText.slice(0, start) + token + bodyText.slice(end)
    setBodyText(next)
    // Restore focus + caret just after the inserted token.
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + token.length
      el.setSelectionRange(pos, pos)
    })
  }

  async function handleSave() {
    setError(null)
    if (!name.trim() || !subject.trim() || !bodyText.trim()) {
      setError('Name, subject, and message are all required.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        subject: subject.trim(),
        preheader: preheader.trim() || null,
        bodyText: bodyText.trim(),
        ctaLabel: ctaLabel.trim() || null,
        ctaUrl: ctaUrl.trim() || null,
      }
      const url =
        mode === 'create'
          ? '/api/admin/marketing/campaigns'
          : `/api/admin/marketing/campaigns/${campaignId}`
      const res = await fetch(url, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Save failed')
      }
      if (mode === 'create') {
        router.push(`/admin/marketing/${data.id}`)
      } else {
        setSavedAt(Date.now())
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const previewParas = applySample(bodyText)
    .replace(/\r\n/g, '\n')
    .trim()
    .split(/\n{2,}/)
    .filter(Boolean)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      {/* ---- Editor ---- */}
      <div className="space-y-5">
        <Field label="Campaign name" hint="Internal only — your customers never see this.">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. October Weeknight Special"
            className="composer-input"
          />
        </Field>

        <Field label="Subject line" hint="Keep it short and specific. {{firstName}} works here too.">
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. {{firstName}}, your next race is on us 🏁"
            className="composer-input"
          />
        </Field>

        <Field
          label="Preview text"
          hint="The grey snippet shown in the inbox next to the subject. Optional but boosts opens."
        >
          <input
            type="text"
            value={preheader}
            onChange={(e) => setPreheader(e.target.value)}
            placeholder="e.g. Book a weeknight session and bring a friend free"
            className="composer-input"
          />
        </Field>

        <Field label="Message">
          <div className="flex flex-wrap gap-2 mb-2">
            {MERGE_FIELDS.map((f) => (
              <button
                key={f.token}
                type="button"
                onClick={() => insertToken(f.token)}
                className="telemetry-text text-xs px-2 py-1 bg-telemetry-cyan/10 text-telemetry-cyan border border-telemetry-cyan/30 hover:bg-telemetry-cyan/20 transition-colors"
              >
                + {f.label}
              </button>
            ))}
          </div>
          <textarea
            ref={messageRef}
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            rows={9}
            placeholder={
              'Hey {{firstName}},\n\nWe miss seeing you at the track! This week only, book any weeknight session and your second racer is free.\n\nSee you soon,\nMark'
            }
            className="composer-input resize-y"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Button text" hint="Optional">
            <input
              type="text"
              value={ctaLabel}
              onChange={(e) => setCtaLabel(e.target.value)}
              placeholder="Book Now"
              className="composer-input"
            />
          </Field>
          <Field label="Button link" hint="Optional">
            <input
              type="url"
              value={ctaUrl}
              onChange={(e) => setCtaUrl(e.target.value)}
              placeholder="https://www.mcracingfortwayne.com/book"
              className="composer-input"
            />
          </Field>
        </div>

        {error && (
          <div className="bg-apex-red/10 border border-apex-red/30 p-3">
            <p className="telemetry-text text-sm text-apex-red">{error}</p>
          </div>
        )}

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="racing-headline text-sm uppercase tracking-wider bg-apex-red hover:bg-apex-red-dark disabled:opacity-50 text-grid-white px-6 py-3 transition-colors"
          >
            {saving ? 'Saving…' : mode === 'create' ? 'Save Draft →' : 'Save Changes'}
          </button>
          {savedAt && (
            <span className="telemetry-text text-sm text-green-400">Saved ✓</span>
          )}
          {mode === 'create' && (
            <span className="telemetry-text text-xs text-pit-gray">
              You&rsquo;ll send a test &amp; review before it goes out.
            </span>
          )}
        </div>
      </div>

      {/* ---- Live preview ---- */}
      <div className="lg:sticky lg:top-6">
        <p className="telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-2">
          Inbox preview
          <span className="text-telemetry-cyan ml-2 normal-case tracking-normal">
            (sample: Alex Driver)
          </span>
        </p>

        {/* Inbox row */}
        <div className="bg-asphalt border border-white/10 p-3 mb-3">
          <p className="telemetry-text text-sm text-grid-white font-bold truncate">
            {applySample(subject) || 'Your subject line'}
          </p>
          <p className="telemetry-text text-xs text-pit-gray truncate">
            {applySample(preheader) || 'Your preview text shows here…'}
          </p>
        </div>

        {/* Rendered email */}
        <div className="bg-[#f2f2f2] p-4 rounded">
          <div className="mx-auto max-w-[600px] bg-white rounded-lg overflow-hidden shadow">
            <div className="bg-[#0D0D0D] px-6 py-5 border-b-4 border-[#E62322]">
              <span className="text-white font-bold tracking-wide uppercase text-lg">
                MC <span className="text-[#E62322]">Racing Sim</span>
              </span>
            </div>
            <div className="px-6 py-6">
              {previewParas.length === 0 ? (
                <p className="text-gray-400 text-sm italic">
                  Your message will appear here…
                </p>
              ) : (
                previewParas.map((p, i) => (
                  <p
                    key={i}
                    className="text-[#1a1a1a] text-[15px] leading-relaxed mb-4 whitespace-pre-line"
                  >
                    {p}
                  </p>
                ))
              )}
              {ctaLabel.trim() && ctaUrl.trim() && (
                <div className="my-5">
                  <span className="inline-block bg-[#E62322] text-white font-bold uppercase tracking-wide text-sm px-7 py-3.5 rounded">
                    {ctaLabel}
                  </span>
                </div>
              )}
            </div>
            <div className="px-6 py-4 bg-[#f7f7f7] border-t border-[#e5e5e5]">
              <p className="text-[#666] text-xs leading-relaxed mb-1">
                <strong className="text-[#1a1a1a]">MC Racing Sim Fort Wayne</strong>
                <br />
                1205 W Main St, Fort Wayne, IN 46808
              </p>
              <p className="text-[#888] text-[11px]">
                You&rsquo;re receiving this because you&rsquo;ve visited or booked
                with us. <span className="underline">Unsubscribe</span> anytime.
              </p>
            </div>
          </div>
        </div>

        <p className="telemetry-text text-xs text-pit-gray mt-3">
          This campaign will reach{' '}
          <span className="text-grid-white font-bold">{audienceCount}</span>{' '}
          {audienceCount === 1 ? 'inbox' : 'inboxes'}. Every email includes a
          one-click unsubscribe and your business address — the rules that keep
          you out of spam.
        </p>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="telemetry-text text-xs text-pit-gray/70 mt-1">{hint}</p>}
    </div>
  )
}
