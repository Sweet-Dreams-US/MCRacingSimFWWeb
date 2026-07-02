'use client'

// Admin chrome — sidebar on desktop, top bar with hamburger on mobile.
// Server-rendered admin pages pass in the logged-in admin's name/role so the
// sidebar can show who's signed in without re-fetching.
import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import SignOutButton from './SignOutButton'

type AdminRole = 'owner' | 'staff' | 'sweet_dreams' | 'readonly'

interface AdminSidebarProps {
  fullName: string
  role: AdminRole
}

type NavItem = {
  href: string
  label: string
  // Icon is a render function so each item can ship its own SVG without an icon library.
  icon: (props: { className?: string }) => JSX.Element
}

const navItems: NavItem[] = [
  {
    href: '/admin',
    label: 'Dashboard',
    icon: ({ className }) => (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V9.5z" />
      </svg>
    ),
  },
  {
    href: '/admin/bookings',
    label: 'Bookings',
    icon: ({ className }) => (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 9h18M8 3v4M16 3v4" />
      </svg>
    ),
  },
  {
    href: '/admin/customers',
    label: 'Customers',
    icon: ({ className }) => (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
      </svg>
    ),
  },
  {
    href: '/admin/discounts',
    label: 'Discount Codes',
    icon: ({ className }) => (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 9h.01M15 15h.01M16 8l-8 8" />
        <path d="M3 8.5V5a2 2 0 0 1 2-2h3.5a2 2 0 0 1 1.4.6l9.5 9.5a2 2 0 0 1 0 2.8l-4.6 4.6a2 2 0 0 1-2.8 0L3.6 10a2 2 0 0 1-.6-1.5z" />
      </svg>
    ),
  },
  {
    href: '/admin/marketing',
    label: 'Email Marketing',
    icon: ({ className }) => (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 7l9 6 9-6" />
      </svg>
    ),
  },
  {
    href: '/admin/pos',
    label: 'Point of Sale',
    icon: ({ className }) => (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20M6 15h4" />
      </svg>
    ),
  },
  {
    href: '/admin/transactions',
    label: 'Transactions',
    icon: ({ className }) => (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
        <path d="M14 2v6h6M8 13h8M8 17h5" />
      </svg>
    ),
  },
  {
    href: '/admin/expenses',
    label: 'Expenses',
    icon: ({ className }) => (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="6" width="20" height="13" rx="2" />
        <path d="M2 10h20M6 15h4" />
      </svg>
    ),
  },
  {
    href: '/admin/payouts',
    label: 'Payouts',
    icon: ({ className }) => (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-1" />
        <path d="M16 12h5v4h-5a2 2 0 0 1 0-4z" />
      </svg>
    ),
  },
  {
    href: '/admin/payouts/marketing',
    label: 'Marketing',
    icon: ({ className }) => (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="3 17 9 11 13 15 21 7" />
        <polyline points="14 7 21 7 21 14" />
      </svg>
    ),
  },
  {
    href: '/admin/reports',
    label: 'Reports',
    icon: ({ className }) => (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 3v18h18" />
        <path d="M7 15l4-4 3 3 5-6" />
      </svg>
    ),
  },
  {
    href: '/admin/settings',
    label: 'Settings',
    icon: ({ className }) => (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </svg>
    ),
  },
]

// Pretty-print the role enum for display.
function roleLabel(role: AdminRole): string {
  switch (role) {
    case 'owner':
      return 'Owner'
    case 'staff':
      return 'Pit Crew'
    case 'sweet_dreams':
      return 'Sweet Dreams'
    case 'readonly':
      return 'Bookkeeper'
  }
}

export default function AdminSidebar({ fullName, role }: AdminSidebarProps) {
  const pathname = usePathname()
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  // /admin is the dashboard; treat sub-routes as belonging to their own item.
  // Without this, "Dashboard" would stay highlighted on every /admin/* page.
  //
  // We also need to make sure that a parent route (e.g. /admin/payouts) doesn't
  // light up when a more specific sibling item (e.g. /admin/payouts/marketing)
  // is the better match. Pick the longest matching href and only highlight that.
  const matchedHref = (() => {
    let best: string | null = null
    for (const item of navItems) {
      const matches =
        item.href === '/admin'
          ? pathname === '/admin'
          : pathname === item.href || pathname.startsWith(`${item.href}/`)
      if (matches && (best === null || item.href.length > best.length)) {
        best = item.href
      }
    }
    return best
  })()

  const isActive = (href: string): boolean => href === matchedHref

  return (
    <>
      {/* Mobile top bar — only visible below lg breakpoint */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-asphalt-dark border-b border-white/10">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/admin" className="flex items-center gap-3">
            <Image
              src="/assets/mclogoSHADOW.png"
              alt="MC Racing Sim"
              width={120}
              height={32}
              className="h-8 w-auto"
              priority
            />
            <span className="racing-headline text-sm text-apex-red">Pit Crew</span>
          </Link>
          <button
            type="button"
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            className="w-10 h-10 flex flex-col items-center justify-center gap-1.5"
            aria-label="Toggle admin menu"
            aria-expanded={isMobileOpen}
          >
            <span className={`w-6 h-0.5 bg-grid-white transition-all duration-300 ${isMobileOpen ? 'rotate-45 translate-y-2' : ''}`} />
            <span className={`w-6 h-0.5 bg-grid-white transition-all duration-300 ${isMobileOpen ? 'opacity-0' : ''}`} />
            <span className={`w-6 h-0.5 bg-grid-white transition-all duration-300 ${isMobileOpen ? '-rotate-45 -translate-y-2' : ''}`} />
          </button>
        </div>

        {/* Mobile drawer */}
        <div
          className={`absolute top-full left-0 right-0 bg-asphalt-dark border-b border-white/10 transition-all duration-300 ${
            isMobileOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
          }`}
        >
          <nav className="flex flex-col py-2">
            {navItems.map((item) => {
              const Icon = item.icon
              const active = isActive(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileOpen(false)}
                  className={`flex items-center gap-3 px-6 py-3 telemetry-text text-sm uppercase tracking-wider transition-colors ${
                    active
                      ? 'text-apex-red bg-apex-red/10 border-l-2 border-apex-red'
                      : 'text-grid-white hover:bg-asphalt-light hover:text-apex-red'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
          <div className="border-t border-white/10 px-6 py-4">
            <p className="telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1">
              Signed in
            </p>
            <p className="telemetry-text text-sm text-grid-white">{fullName}</p>
            <p className="telemetry-text text-xs text-telemetry-cyan uppercase mb-3">
              {roleLabel(role)}
            </p>
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed top-0 left-0 bottom-0 w-64 bg-asphalt-dark border-r border-white/10 flex-col z-40">
        {/* Brand */}
        <div className="px-6 py-6 border-b border-white/10">
          <Link href="/admin" className="flex items-center gap-3">
            <Image
              src="/assets/mclogoSHADOW.png"
              alt="MC Racing Sim"
              width={140}
              height={40}
              className="h-10 w-auto"
              priority
            />
          </Link>
          <p className="racing-headline text-sm text-apex-red mt-3">Pit Crew Console</p>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-4">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-6 py-3 telemetry-text text-sm uppercase tracking-wider transition-colors ${
                  active
                    ? 'text-apex-red bg-apex-red/10 border-l-2 border-apex-red'
                    : 'text-grid-white border-l-2 border-transparent hover:bg-asphalt-light hover:text-apex-red'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* User block */}
        <div className="border-t border-white/10 px-6 py-4">
          <p className="telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1">
            Signed in
          </p>
          <p className="telemetry-text text-sm text-grid-white truncate" title={fullName}>
            {fullName}
          </p>
          <p className="telemetry-text text-xs text-telemetry-cyan uppercase mb-3">
            {roleLabel(role)}
          </p>
          <SignOutButton />
        </div>
      </aside>
    </>
  )
}
