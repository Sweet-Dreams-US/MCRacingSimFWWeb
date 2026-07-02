// /unsubscribe?token=... — public unsubscribe confirmation page (the footer
// link target). Unsubscribes on load, then offers a one-tap resubscribe in case
// of a misclick. The `resubscribed` flag prevents the resubscribe redirect from
// immediately re-unsubscribing the person.
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  unsubscribeByToken,
  resubscribeByToken,
} from '@/lib/marketing/unsubscribe'

export const dynamic = 'force-dynamic'

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; resubscribed?: string }>
}) {
  const { token = '', resubscribed } = await searchParams

  async function resubscribe(formData: FormData) {
    'use server'
    const t = String(formData.get('token') || '')
    await resubscribeByToken(t)
    // Trailing slash BEFORE the query — trailingSlash:true would otherwise
    // 308-redirect a slashless path and cost an extra hop.
    redirect(`/unsubscribe/?token=${encodeURIComponent(t)}&resubscribed=1`)
  }

  let heading = ''
  let body: React.ReactNode = null

  if (!token) {
    heading = 'Invalid link'
    body = (
      <p className="text-gray-600">
        This unsubscribe link is missing its code. If you keep getting emails you
        don&apos;t want, reply to one and we&apos;ll remove you right away.
      </p>
    )
  } else if (resubscribed === '1') {
    heading = 'You’re back on the list 🏁'
    body = (
      <p className="text-gray-600">
        Welcome back — you&apos;ll keep getting our occasional deals and updates.
      </p>
    )
  } else {
    const result = await unsubscribeByToken(token)
    if (!result.ok) {
      heading = 'That link didn’t work'
      body = (
        <p className="text-gray-600">
          We couldn&apos;t process that unsubscribe link. Reply to any of our
          emails and we&apos;ll take you off the list manually.
        </p>
      )
    } else {
      heading = 'You’re unsubscribed'
      body = (
        <>
          <p className="text-gray-600">
            {result.email ? (
              <>
                <span className="font-semibold text-gray-800">{result.email}</span>{' '}
                will no longer receive marketing emails from us.
              </>
            ) : (
              <>You will no longer receive marketing emails from us.</>
            )}{' '}
            You&apos;ll still get booking confirmations and receipts.
          </p>
          <form action={resubscribe} className="mt-6">
            <input type="hidden" name="token" value={token} />
            <button
              type="submit"
              className="text-sm text-gray-500 underline hover:text-gray-800"
            >
              Unsubscribed by mistake? Resubscribe
            </button>
          </form>
        </>
      )
    }
  }

  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4 py-16 bg-white">
      <div className="max-w-md w-full text-center">
        <div className="inline-block bg-[#0D0D0D] px-5 py-3 mb-8 border-b-4 border-[#E62322]">
          <span className="text-white font-bold tracking-wide uppercase text-lg">
            MC <span className="text-[#E62322]">Racing Sim</span>
          </span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">{heading}</h1>
        <div className="text-base leading-relaxed">{body}</div>
        <div className="mt-10">
          <Link href="/" className="text-sm text-[#E62322] font-semibold hover:underline">
            ← Back to mcracingfortwayne.com
          </Link>
        </div>
      </div>
    </main>
  )
}
