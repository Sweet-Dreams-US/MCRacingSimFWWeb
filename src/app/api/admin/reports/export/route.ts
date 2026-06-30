// GET /api/admin/reports/export
//   Date range form:  ?from=YYYY-MM-DD&to=YYYY-MM-DD   (preferred)
//   Legacy month form: ?year=YYYY&month=MM
//
// Returns a CSV of every non-soft-deleted transaction in the given range
// (Eastern timezone), joined to expense_categories for the category column.
// Owner + Sweet Dreams only — gated to match the Reports page that drives it,
// since this exports the same period the user is already viewing on screen.
// The Reports page feeds this the currently selected period's from/to; the
// year/month form is kept for back-compat.
//
// No CSV library because the column set is tiny and rules are clear:
//   - Wrap any field containing comma / quote / newline in double quotes
//   - Escape embedded quotes by doubling them
//   - End each line with \r\n for Excel friendliness
//   - Prefix with UTF-8 BOM so Excel treats it as UTF-8 by default
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  formatTransactionType,
  monthBounds,
  type PaymentMethod,
  type TransactionType,
} from '@/lib/accounting'
import { isValidDateString } from '@/lib/report-periods'

export const runtime = 'nodejs'

interface ExportRow {
  occurred_on: string
  type: TransactionType
  description: string
  payment_method: PaymentMethod
  amount_cents: number
  vendor: string | null
  receipt_url: string | null
  expense_category: { name: string } | null
}

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function paymentMethodLabel(m: PaymentMethod): string {
  switch (m) {
    case 'stripe_online': return 'Stripe Online'
    case 'stripe_terminal': return 'In-Person Card'
    case 'cash': return 'Cash'
    case 'other': return 'Other'
    case 'internal': return 'Internal'
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(['owner', 'sweet_dreams'])
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json(
        { success: false, error: err.message, code: err.code },
        { status: err.code === 'unauthenticated' ? 401 : 403 }
      )
    }
    throw err
  }

  const url = new URL(request.url)
  const fromParam = url.searchParams.get('from')
  const toParam = url.searchParams.get('to')

  // Resolve the date range. Prefer an explicit from/to range (used by the
  // Reports period filter); fall back to the legacy year/month form.
  let start: string
  let end: string
  let filenameTag: string

  if (fromParam || toParam) {
    if (!isValidDateString(fromParam) || !isValidDateString(toParam)) {
      return NextResponse.json(
        { success: false, error: 'from and to must be valid YYYY-MM-DD dates' },
        { status: 400 }
      )
    }
    // Swap if reversed so the query bounds are always start <= end.
    ;[start, end] = fromParam <= toParam ? [fromParam, toParam] : [toParam, fromParam]
    filenameTag = `${start}_${end}`
  } else {
    const year = parseInt(url.searchParams.get('year') ?? '', 10)
    const month = parseInt(url.searchParams.get('month') ?? '', 10)
    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      month < 1 ||
      month > 12 ||
      year < 2000 ||
      year > 2200
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'from/to or year/month query params required',
        },
        { status: 400 }
      )
    }
    const bounds = monthBounds(year, month)
    start = bounds.start
    end = bounds.end
    filenameTag = `${year}-${String(month).padStart(2, '0')}`
  }

  const supabase = createAdminClient()
  const { data: rawRows, error } = await supabase
    .from('transactions')
    .select(
      `occurred_on, type, description, payment_method, amount_cents,
       vendor, receipt_url,
       expense_category:expense_categories(name)`
    )
    .gte('occurred_on', start)
    .lte('occurred_on', end)
    .is('soft_deleted_at', null)
    .order('occurred_on', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(10000)

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }

  const rows: ExportRow[] = (rawRows ?? []).map((r) => ({
    ...r,
    expense_category: Array.isArray(r.expense_category)
      ? (r.expense_category[0] ?? null)
      : r.expense_category,
  })) as ExportRow[]

  const header = [
    'Date',
    'Type',
    'Category',
    'Description',
    'Payment Method',
    'Amount (USD)',
    'Vendor',
    'Receipt',
  ]

  const lines: string[] = [header.map(csvEscape).join(',')]
  for (const r of rows) {
    const dollars = (r.amount_cents / 100).toFixed(2)
    lines.push(
      [
        csvEscape(r.occurred_on),
        csvEscape(formatTransactionType(r.type)),
        csvEscape(r.expense_category?.name ?? ''),
        csvEscape(r.description),
        csvEscape(paymentMethodLabel(r.payment_method)),
        csvEscape(dollars),
        csvEscape(r.vendor ?? ''),
        csvEscape(r.receipt_url ?? ''),
      ].join(',')
    )
  }

  const body = '﻿' + lines.join('\r\n') + '\r\n'
  const filename = `mcracing-${filenameTag}.csv`

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
