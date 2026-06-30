// /admin/bookings/new — admin invites a customer to a booking (card-less).
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import InviteBookingForm from './InviteBookingForm'

export default async function NewBookingPage() {
  try {
    await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) redirect('/admin/login')
    throw err
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/bookings"
          className="telemetry-text text-xs text-pit-gray hover:text-grid-white"
        >
          ← Back to bookings
        </Link>
        <h1 className="racing-headline text-3xl text-grid-white mt-2">Invite to a Booking</h1>
        <p className="telemetry-text text-sm text-pit-gray mt-1">
          Put a session on the books for a customer — no card needed. They get an
          email, it lands on the calendar, and they&apos;re reminded the day before.
        </p>
      </div>

      <InviteBookingForm />
    </div>
  )
}
