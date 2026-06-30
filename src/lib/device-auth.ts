// Device auth for the on-reader (S710) app's backend calls.
//
// The reader app has no admin session — it authenticates with a static device
// key (POS_DEVICE_KEY) sent as a Bearer token. Fails CLOSED: if the key isn't
// configured on the server, every device request is rejected.
import { NextRequest } from 'next/server'

export function isDeviceAuthorized(request: NextRequest): boolean {
  const key = process.env.POS_DEVICE_KEY
  if (!key) return false
  return request.headers.get('authorization') === `Bearer ${key}`
}
