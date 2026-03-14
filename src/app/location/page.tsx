import { Metadata } from 'next'
import LocationClient from './LocationClient'

export const metadata: Metadata = {
  title: 'Location & Hours - The Paddock',
  description: 'Visit MC Racing Sim Fort Wayne at 1205 W Main St, Fort Wayne, IN 46808. Open Tue-Thu Noon-Midnight, Fri-Sat Noon-2AM, Sun Noon-Midnight. 4,000+ sq ft facility with free parking. Directions from I-69 and downtown Fort Wayne. Call 1(808) 220-2600.',
  keywords: [
    'MC Racing Sim location',
    'sim racing Fort Wayne address',
    'racing simulator near me',
    '1205 W Main St Fort Wayne',
    'Fort Wayne entertainment venue',
    'sim racing hours',
    'Fort Wayne activities',
  ],
  openGraph: {
    title: 'Location & Hours | MC Racing Sim Fort Wayne',
    description: '1205 W Main St, Fort Wayne, IN 46808. Open Tue-Thu Noon-Midnight, Fri-Sat Noon-2AM, Sun Noon-Midnight. 4,000+ sq ft facility with free parking.',
    url: 'https://mcracingfortwayne.com/location',
    images: ['/assets/WideTwoRacingBays.webp'],
  },
  alternates: {
    canonical: 'https://mcracingfortwayne.com/location',
  },
}

export default function LocationPage() {
  return <LocationClient />
}
