// /admin/contact — inbox of public contact-form inquiries, sorted by reason
// and status. New inquiries surface first; staff mark them handled.
import { redirect } from 'next/navigation'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import ContactInbox, { type InquiryRow } from './ContactInbox'

export default async function ContactInboxPage() {
  try {
    await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) redirect('/admin/login')
    throw err
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('contact_inquiries')
    .select(
      'id, reason, name, email, phone, message, preferred_date, group_size, status, created_at'
    )
    // Most recent first; the inbox defaults to the "new" filter so open items
    // surface without needing a status-first sort.
    .order('created_at', { ascending: false })
    .limit(300)

  if (error) {
    return (
      <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-5xl mx-auto">
        <div className="bg-apex-red/10 border border-apex-red/30 p-4">
          <p className="telemetry-text text-apex-red">Failed to load inquiries: {error.message}</p>
        </div>
      </div>
    )
  }

  const rows = (data ?? []) as InquiryRow[]

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-5xl mx-auto space-y-6">
      <div>
        <p className="telemetry-text text-xs text-apex-red uppercase tracking-widest mb-2">// Inbox</p>
        <h1 className="racing-headline text-3xl text-grid-white">Contact Inquiries</h1>
        <p className="telemetry-text text-sm text-pit-gray mt-1">
          Parties, corporate events, and questions from the contact form.
        </p>
      </div>

      <ContactInbox initial={rows} />
    </div>
  )
}
