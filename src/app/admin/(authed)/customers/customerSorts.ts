// Shared sort options for the customer list. Kept in a PLAIN module (no
// 'use client') so the server page can read CUSTOMER_SORTS at render time —
// importing a value from a 'use client' module turns it into a client-reference
// proxy on the server, which throws.
export type CustomerSort = 'recent' | 'spent' | 'bookings' | 'name' | 'newest'

export const CUSTOMER_SORTS: { value: CustomerSort; label: string }[] = [
  { value: 'recent', label: 'Recently visited' },
  { value: 'spent', label: 'Most spent' },
  { value: 'bookings', label: 'Most bookings' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'newest', label: 'Newest' },
]
