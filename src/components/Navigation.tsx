'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

const navLinks = [
  { href: '/', label: 'Home', shortLabel: 'Home' },
  { href: '/pricing', label: 'Pricing', shortLabel: 'Pricing' },
  { href: '/memberships', label: 'Memberships', shortLabel: 'Members' },
  { href: '/leagues', label: 'Leaderboard', shortLabel: 'Leaderboard' },
  { href: '/pit-lane', label: 'Parties', shortLabel: 'Parties' },
  { href: '/location', label: 'About Us', shortLabel: 'About' },
  { href: '/contact', label: 'Contact', shortLabel: 'Contact' },
]

export default function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Admin panel renders its own sidebar chrome — hide the public nav on /admin/*.
  if (pathname?.startsWith('/admin')) {
    return null
  }

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        isScrolled
          ? 'bg-asphalt-dark/95 backdrop-blur-md py-3 shadow-lg shadow-black/50'
          : 'bg-transparent py-6'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="block">
          <Image
            src="/assets/mclogoSHADOW.png"
            alt="MC Racing Sim Fort Wayne"
            width={180}
            height={50}
            className="h-10 w-auto sm:h-12"
            priority
          />
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden lg:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`relative telemetry-text text-sm uppercase tracking-widest transition-colors duration-300 hover:text-apex-red ${
                pathname === link.href ? 'text-apex-red' : 'text-grid-white'
              }`}
            >
              {link.label}
              {pathname === link.href && (
                <span className="absolute -bottom-2 left-0 right-0 h-0.5 bg-apex-red"></span>
              )}
            </Link>
          ))}
          <Link href="/book" className="btn-primary text-sm">
            Book Here
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="lg:hidden relative w-10 h-10 flex flex-col items-center justify-center gap-1.5"
          aria-label="Toggle menu"
        >
          <span
            className={`w-6 h-0.5 bg-grid-white transition-all duration-300 ${
              isMobileMenuOpen ? 'rotate-45 translate-y-2' : ''
            }`}
          ></span>
          <span
            className={`w-6 h-0.5 bg-grid-white transition-all duration-300 ${
              isMobileMenuOpen ? 'opacity-0' : ''
            }`}
          ></span>
          <span
            className={`w-6 h-0.5 bg-grid-white transition-all duration-300 ${
              isMobileMenuOpen ? '-rotate-45 -translate-y-2' : ''
            }`}
          ></span>
        </button>
      </div>

      {/* Mobile Menu */}
      <div
        className={`lg:hidden absolute top-full left-0 right-0 bg-asphalt-dark/98 backdrop-blur-lg transition-all duration-500 ${
          isMobileMenuOpen
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 -translate-y-4 pointer-events-none'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className={`racing-headline text-2xl transition-colors ${
                pathname === link.href ? 'text-apex-red' : 'text-grid-white'
              }`}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/book"
            onClick={() => setIsMobileMenuOpen(false)}
            className="btn-primary text-center mt-4"
          >
            Book Here
          </Link>
          <a
            href="tel:+18082202600"
            onClick={() => setIsMobileMenuOpen(false)}
            className="telemetry-text text-sm text-pit-gray text-center"
          >
            or call (808) 220-2600
          </a>
        </div>
      </div>
    </nav>
  )
}
