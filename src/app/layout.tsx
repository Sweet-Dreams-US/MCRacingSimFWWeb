import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'
import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'
import ScrollToTop from '@/components/ScrollToTop'

const siteUrl = 'https://mcracingfortwayne.com'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'MC Racing Sim Fort Wayne | Professional Sim Racing & RC Track',
    template: '%s | MC Racing Sim Fort Wayne',
  },
  description: 'Fort Wayne\'s only professional-grade Sim Racing & RC Lounge. Experience real physics with no consequences on our $15k simulator rigs. Located at 1205 W Main St, Fort Wayne, IN 46808. Call 1(808) 220-2600 to book.',
  keywords: [
    'sim racing Fort Wayne',
    'racing simulator Indiana',
    'RC track Fort Wayne',
    'iRacing',
    'racing simulator',
    'birthday party Fort Wayne',
    'corporate events Fort Wayne',
    'team building Fort Wayne',
    'sim racing near me',
    'professional racing simulator',
    'RC car racing',
    'indoor RC track',
    'Fort Wayne entertainment',
    'Fort Wayne activities',
    'racing experience',
    'things to do Fort Wayne',
    'family entertainment Fort Wayne',
    'kids activities Fort Wayne',
  ],
  authors: [{ name: 'MC Racing Sim Fort Wayne' }],
  creator: 'MC Racing Sim Fort Wayne',
  publisher: 'MC Racing Sim Fort Wayne',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    title: 'MC Racing Sim Fort Wayne | Real Physics. No Consequences.',
    description: 'Fort Wayne\'s premier sim racing destination. Professional-grade simulators, indoor RC track, birthday parties & corporate events. Call 1(808) 220-2600.',
    url: siteUrl,
    siteName: 'MC Racing Sim Fort Wayne',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: '/assets/WideTwoRacingBays.webp',
        width: 1200,
        height: 630,
        alt: 'MC Racing Sim Fort Wayne - Professional Racing Simulators',
        type: 'image/webp',
      },
      {
        url: '/assets/SimRacer.webp',
        width: 1200,
        height: 630,
        alt: 'Racing simulator experience at MC Racing Sim',
        type: 'image/webp',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MC Racing Sim Fort Wayne',
    description: 'Real Physics. No Consequences. Fort Wayne\'s premier sim racing destination.',
    images: ['/assets/WideTwoRacingBays.webp'],
    creator: '@mcracingsim',
    site: '@mcracingsim',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: siteUrl,
  },
  category: 'entertainment',
  verification: {
    google: 'G-ED0JD995SP',
    other: {
      'msvalidate.01': 'ED0A5F8D6CC2B48EDB8BBCE53D976FDF',
    },
  },
  other: {
    'geo.region': 'US-IN',
    'geo.placename': 'Fort Wayne',
    'geo.position': '41.0793;-85.1494',
    'ICBM': '41.0793, -85.1494',
  },
}

export const viewport: Viewport = {
  themeColor: '#1A1A1A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

// JSON-LD structured data for local business
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'AmusementPark',
  name: 'MC Racing Sim Fort Wayne',
  description: 'Professional-grade sim racing and RC track lounge in Fort Wayne, Indiana.',
  url: siteUrl,
  telephone: '+1-808-220-2600',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '1205 W Main St',
    addressLocality: 'Fort Wayne',
    addressRegion: 'IN',
    postalCode: '46808',
    addressCountry: 'US',
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: 41.0793,
    longitude: -85.1494,
  },
  openingHoursSpecification: [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Tuesday', 'Wednesday', 'Thursday'],
      opens: '12:00',
      closes: '00:00',
    },
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Friday', 'Saturday'],
      opens: '12:00',
      closes: '02:00',
    },
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Sunday'],
      opens: '12:00',
      closes: '00:00',
    },
  ],
  priceRange: '$$',
  image: `${siteUrl}/og-image.jpg`,
  sameAs: [
    'https://www.facebook.com/mcracingsim',
    'https://www.instagram.com/mcracingsim',
  ],
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'Racing Sessions',
    itemListElement: [
      {
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: 'Sprint Session (1 Hour)',
          description: 'One hour of professional sim racing',
        },
        price: '55.00',
        priceCurrency: 'USD',
      },
      {
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: 'Grand Prix Session (2 Hours)',
          description: 'Two hours of professional sim racing',
        },
        price: '99.00',
        priceCurrency: 'USD',
      },
      {
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: 'Endurance Session (3 Hours)',
          description: 'Three hours of professional sim racing',
        },
        price: '135.00',
        priceCurrency: 'USD',
      },
    ],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link rel="canonical" href={siteUrl} />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/* Google Analytics */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-ED0JD995SP"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-ED0JD995SP');
          `}
        </Script>
        {/* Metricool */}
        <Script id="metricool" strategy="afterInteractive">
          {`
            function loadScript(a){var b=document.getElementsByTagName("head")[0],c=document.createElement("script");c.type="text/javascript",c.src="https://tracker.metricool.com/resources/be.js",c.onreadystatechange=a,c.onload=a,b.appendChild(c)}loadScript(function(){beTracker.t({hash:"fa23261686729ffd45af39050f3cf830"})});
          `}
        </Script>
      </head>
      <body className="min-h-screen bg-asphalt text-grid-white antialiased">
        <Navigation />
        <main>{children}</main>
        <Footer />
        <ScrollToTop />
      </body>
    </html>
  )
}
