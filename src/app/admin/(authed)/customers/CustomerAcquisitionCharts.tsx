'use client'

import React, { useState } from 'react'

interface CustomerStat {
  how_heard: string | null
  total_spent_cents: number
  total_bookings: number
}

interface CustomerAcquisitionChartsProps {
  customers: CustomerStat[]
}

interface ChannelData {
  name: string
  count: number
  bookings: number
  spentCents: number
  color: string
}

// Define stable colors matching the dashboard design system
const CHANNEL_COLORS: Record<string, string> = {
  'Friend/Family': '#00AEEF', // Telemetry Cyan
  'Facebook': '#6366F1',       // Indigo
  'Google Search': '#F59E0B',  // Amber
  'TikTok': '#10B981',         // Emerald Green
  'Instagram': '#EC4899',      // Rose Pink
  'Drove By': '#8B5CF6',       // Purple
  'Event/Show': '#E62322',     // Apex Red
  'Other': '#6B7280',          // Slate Gray
  'Not Specified': '#475569',  // Cool Gray
}

const COLOR_PALETTE = [
  '#00AEEF', // Telemetry Cyan
  '#6366F1', // Indigo
  '#F59E0B', // Amber
  '#10B981', // Emerald
  '#EC4899', // Rose
  '#8B5CF6', // Purple
  '#E62322', // Apex Red
  '#14B8A6', // Teal
  '#F43F5E', // Pink
  '#6B7280', // Slate
]

// Normalize categories from DB to align with official options
function normalizeChannel(raw: string | null | undefined): string {
  if (!raw) return 'Not Specified'
  const val = raw.trim()
  const lower = val.toLowerCase()
  if (lower.includes('friend') || lower.includes('family')) return 'Friend/Family'
  if (lower.includes('google')) return 'Google Search'
  if (lower.includes('facebook')) return 'Facebook'
  if (lower.includes('instagram')) return 'Instagram'
  if (lower.includes('tiktok')) return 'TikTok'
  if (lower.includes('drive') || lower.includes('drove')) return 'Drove By'
  if (lower.includes('event') || lower.includes('show') || lower.includes('fair') || lower.includes('festival')) return 'Event/Show'
  if (lower.includes('other')) return 'Other'
  
  // Return formatted name
  return val.charAt(0).toUpperCase() + val.slice(1)
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

// Polar to cartesian coordinate helper for SVG arcs
function polarToCartesian(cx: number, cy: number, r: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0
  return {
    x: cx + r * Math.cos(angleInRadians),
    y: cy + r * Math.sin(angleInRadians),
  }
}

// Generates hollow donut slice path
function getDonutSlicePath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startAngle: number,
  endAngle: number
): string {
  const outerStart = polarToCartesian(cx, cy, outerR, startAngle)
  const outerEnd = polarToCartesian(cx, cy, outerR, endAngle)
  const innerStart = polarToCartesian(cx, cy, innerR, startAngle)
  const innerEnd = polarToCartesian(cx, cy, innerR, endAngle)

  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1'

  return [
    `M ${innerStart.x} ${innerStart.y}`,
    `L ${outerStart.x} ${outerStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerR} ${innerR} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ')
}

export default function CustomerAcquisitionCharts({ customers }: CustomerAcquisitionChartsProps) {
  const [hoveredCustomerIndex, setHoveredCustomerIndex] = useState<number | null>(null)
  const [hoveredRevenueIndex, setHoveredRevenueIndex] = useState<number | null>(null)
  const [hoveredRowIndex, setHoveredRowIndex] = useState<number | null>(null)

  // 1. Process customer stats
  const channelsMap: Record<string, { count: number; bookings: number; spentCents: number }> = {}

  customers.forEach((c) => {
    const channel = normalizeChannel(c.how_heard)
    if (!channelsMap[channel]) {
      channelsMap[channel] = { count: 0, bookings: 0, spentCents: 0 }
    }
    channelsMap[channel].count += 1
    channelsMap[channel].bookings += c.total_bookings ?? 0
    channelsMap[channel].spentCents += c.total_spent_cents ?? 0
  })

  // Convert to array and assign stable colors
  const channels: ChannelData[] = Object.keys(channelsMap).map((name, index) => {
    const color = CHANNEL_COLORS[name] || COLOR_PALETTE[index % COLOR_PALETTE.length]
    return {
      name,
      count: channelsMap[name].count,
      bookings: channelsMap[name].bookings,
      spentCents: channelsMap[name].spentCents,
      color,
    }
  })

  // Sort by customer count desc
  channels.sort((a, b) => b.count - a.count)

  const totalCustomers = channels.reduce((sum, c) => sum + c.count, 0)
  const totalRevenue = channels.reduce((sum, c) => sum + c.spentCents, 0)
  const totalBookings = channels.reduce((sum, c) => sum + c.bookings, 0)

  // Calculate angles for Customer Count Donut
  let cumulativeCountAngle = 0
  const countSlices = channels.map((c) => {
    const pct = totalCustomers > 0 ? c.count / totalCustomers : 0
    const angle = pct * 360
    const startAngle = cumulativeCountAngle
    const endAngle = cumulativeCountAngle + angle
    cumulativeCountAngle = endAngle
    return { name: c.name, count: c.count, pct, startAngle, endAngle, color: c.color }
  })

  // Calculate angles for Revenue Donut
  let cumulativeRevenueAngle = 0
  const revenueSlices = channels.map((c) => {
    const pct = totalRevenue > 0 ? c.spentCents / totalRevenue : 0
    const angle = pct * 360
    const startAngle = cumulativeRevenueAngle
    const endAngle = cumulativeRevenueAngle + angle
    cumulativeRevenueAngle = endAngle
    return { name: c.name, spentCents: c.spentCents, pct, startAngle, endAngle, color: c.color }
  })

  // Donut chart sizing constants
  const cx = 100
  const cy = 100
  const innerR = 55
  const outerR = 80

  const activeCustomerSlice = hoveredCustomerIndex !== null ? countSlices[hoveredCustomerIndex] : null
  const activeRevenueSlice = hoveredRevenueIndex !== null ? revenueSlices[hoveredRevenueIndex] : null

  return (
    <div className="space-y-6">
      {/* Visual Header */}
      <div className="border border-white/5 bg-asphalt-dark/50 backdrop-blur-sm p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="telemetry-text text-xs text-telemetry-cyan uppercase tracking-widest mb-1">
            // Acquisition Telemetry
          </p>
          <h2 className="racing-headline text-xl text-grid-white">
            Customer Source & Acquisition Channel Insights
          </h2>
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="border-l border-white/10 pl-4">
            <p className="telemetry-text text-xs text-pit-gray uppercase">Total Customers</p>
            <p className="racing-headline text-2xl text-grid-white">{totalCustomers}</p>
          </div>
          <div className="border-l border-white/10 pl-4">
            <p className="telemetry-text text-xs text-pit-gray uppercase">Total Bookings</p>
            <p className="racing-headline text-2xl text-grid-white">{totalBookings}</p>
          </div>
          <div className="border-l border-white/10 pl-4">
            <p className="telemetry-text text-xs text-pit-gray uppercase">Total Revenue</p>
            <p className="racing-headline text-2xl text-telemetry-cyan">{formatDollars(totalRevenue)}</p>
          </div>
        </div>
      </div>

      {/* Grid for two Donut Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Chart 1: Customer Count */}
        <div className="card-dark p-6 flex flex-col items-center justify-between relative min-h-[300px]">
          <div className="w-full flex items-baseline justify-between mb-4">
            <h3 className="racing-headline text-md text-grid-white">Volume (Customer Count)</h3>
            <span className="telemetry-text text-xs text-pit-gray uppercase font-semibold">Distribution</span>
          </div>

          {totalCustomers === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="telemetry-text text-sm text-pit-gray">No customer channel data recorded yet.</p>
            </div>
          ) : (
            <div className="relative w-full flex flex-col items-center justify-center my-2">
              <div className="relative w-48 h-48">
                <svg viewBox="0 0 200 200" className="w-full h-full overflow-visible">
                  <g className="cursor-pointer">
                    {countSlices.map((slice, index) => {
                      if (slice.pct === 0) return null
                      const isHovered = hoveredCustomerIndex === index || hoveredRowIndex === index
                      const sliceOuterR = isHovered ? outerR + 4 : outerR
                      const sliceInnerR = isHovered ? innerR - 2 : innerR

                      // Handle 100% case
                      if (slice.pct >= 0.999) {
                        const midR = (sliceInnerR + sliceOuterR) / 2
                        const strokeW = sliceOuterR - sliceInnerR
                        return (
                          <circle
                            key={slice.name}
                            cx={cx}
                            cy={cy}
                            r={midR}
                            fill="none"
                            stroke={slice.color}
                            strokeWidth={strokeW}
                            onMouseEnter={() => setHoveredCustomerIndex(index)}
                            onMouseLeave={() => setHoveredCustomerIndex(null)}
                            style={{
                              transition: 'all 0.2s ease-out',
                              filter: isHovered ? `drop-shadow(0 0 8px ${slice.color}40)` : 'none',
                            }}
                          />
                        )
                      }

                      const pathData = getDonutSlicePath(
                        cx,
                        cy,
                        sliceInnerR,
                        sliceOuterR,
                        slice.startAngle,
                        slice.endAngle
                      )

                      return (
                        <path
                          key={slice.name}
                          d={pathData}
                          fill={slice.color}
                          onMouseEnter={() => setHoveredCustomerIndex(index)}
                          onMouseLeave={() => setHoveredCustomerIndex(null)}
                          style={{
                            transition: 'all 0.2s ease-out',
                            opacity:
                              hoveredCustomerIndex === null && hoveredRowIndex === null
                                ? 0.85
                                : isHovered
                                ? 1
                                : 0.4,
                            filter: isHovered ? `drop-shadow(0 0 8px ${slice.color}60)` : 'none',
                            transform: isHovered ? 'scale(1.02)' : 'scale(1)',
                            transformOrigin: `${cx}px ${cy}px`,
                          }}
                        />
                      )
                    })}
                  </g>
                </svg>

                {/* Donut Hole Content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 pointer-events-none text-center">
                  {activeCustomerSlice || (hoveredRowIndex !== null && countSlices[hoveredRowIndex]) ? (
                    (() => {
                      const slice = activeCustomerSlice || countSlices[hoveredRowIndex!]
                      return (
                        <>
                          <span className="telemetry-text text-[10px] text-pit-gray uppercase tracking-wider truncate max-w-[130px]">
                            {slice.name}
                          </span>
                          <span className="racing-headline text-2xl text-grid-white mt-0.5">
                            {slice.count}
                          </span>
                          <span className="telemetry-text text-xs text-telemetry-cyan font-bold mt-0.5">
                            {(slice.pct * 100).toFixed(1)}%
                          </span>
                        </>
                      )
                    })()
                  ) : (
                    <>
                      <span className="telemetry-text text-[10px] text-pit-gray uppercase tracking-wider">
                        Overall
                      </span>
                      <span className="racing-headline text-3xl text-grid-white mt-0.5">
                        {totalCustomers}
                      </span>
                      <span className="telemetry-text text-[10px] text-pit-gray mt-0.5">
                        Customers
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Chart 2: Revenue Spent */}
        <div className="card-dark p-6 flex flex-col items-center justify-between relative min-h-[300px]">
          <div className="w-full flex items-baseline justify-between mb-4">
            <h3 className="racing-headline text-md text-grid-white">Value (Revenue Gen)</h3>
            <span className="telemetry-text text-xs text-pit-gray uppercase font-semibold">Acquisition Value</span>
          </div>

          {totalRevenue === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-4 border border-dashed border-white/5 bg-white/[0.01] w-full">
              <p className="telemetry-text text-sm text-pit-gray font-semibold mb-1">No Revenue Recorded</p>
              <p className="telemetry-text text-xs text-pit-gray/60 max-w-[280px] leading-relaxed">
                When customers book sessions and make purchases, this chart will populate dynamically.
              </p>
            </div>
          ) : (
            <div className="relative w-full flex flex-col items-center justify-center my-2">
              <div className="relative w-48 h-48">
                <svg viewBox="0 0 200 200" className="w-full h-full overflow-visible">
                  <g className="cursor-pointer">
                    {revenueSlices.map((slice, index) => {
                      if (slice.pct === 0) return null
                      const isHovered = hoveredRevenueIndex === index || hoveredRowIndex === index
                      const sliceOuterR = isHovered ? outerR + 4 : outerR
                      const sliceInnerR = isHovered ? innerR - 2 : innerR

                      // Handle 100% case
                      if (slice.pct >= 0.999) {
                        const midR = (sliceInnerR + sliceOuterR) / 2
                        const strokeW = sliceOuterR - sliceInnerR
                        return (
                          <circle
                            key={slice.name}
                            cx={cx}
                            cy={cy}
                            r={midR}
                            fill="none"
                            stroke={slice.color}
                            strokeWidth={strokeW}
                            onMouseEnter={() => setHoveredRevenueIndex(index)}
                            onMouseLeave={() => setHoveredRevenueIndex(null)}
                            style={{
                              transition: 'all 0.2s ease-out',
                              filter: isHovered ? `drop-shadow(0 0 8px ${slice.color}40)` : 'none',
                            }}
                          />
                        )
                      }

                      const pathData = getDonutSlicePath(
                        cx,
                        cy,
                        sliceInnerR,
                        sliceOuterR,
                        slice.startAngle,
                        slice.endAngle
                      )

                      return (
                        <path
                          key={slice.name}
                          d={pathData}
                          fill={slice.color}
                          onMouseEnter={() => setHoveredRevenueIndex(index)}
                          onMouseLeave={() => setHoveredRevenueIndex(null)}
                          style={{
                            transition: 'all 0.2s ease-out',
                            opacity:
                              hoveredRevenueIndex === null && hoveredRowIndex === null
                                ? 0.85
                                : isHovered
                                ? 1
                                : 0.4,
                            filter: isHovered ? `drop-shadow(0 0 8px ${slice.color}60)` : 'none',
                            transform: isHovered ? 'scale(1.02)' : 'scale(1)',
                            transformOrigin: `${cx}px ${cy}px`,
                          }}
                        />
                      )
                    })}
                  </g>
                </svg>

                {/* Donut Hole Content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 pointer-events-none text-center">
                  {activeRevenueSlice || (hoveredRowIndex !== null && revenueSlices[hoveredRowIndex]) ? (
                    (() => {
                      const slice = activeRevenueSlice || revenueSlices[hoveredRowIndex!]
                      return (
                        <>
                          <span className="telemetry-text text-[10px] text-pit-gray uppercase tracking-wider truncate max-w-[130px]">
                            {slice.name}
                          </span>
                          <span className="racing-headline text-lg text-grid-white mt-0.5 font-bold">
                            {formatDollars(slice.spentCents)}
                          </span>
                          <span className="telemetry-text text-xs text-telemetry-cyan font-bold mt-0.5">
                            {(slice.pct * 100).toFixed(1)}%
                          </span>
                        </>
                      )
                    })()
                  ) : (
                    <>
                      <span className="telemetry-text text-[10px] text-pit-gray uppercase tracking-wider">
                        Total spent
                      </span>
                      <span className="racing-headline text-xl text-grid-white mt-0.5 truncate max-w-[140px]">
                        {formatDollars(totalRevenue)}
                      </span>
                      <span className="telemetry-text text-[10px] text-pit-gray mt-0.5">
                        LTV Revenue
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detail Breakdown Table */}
      <div className="bg-asphalt-dark border border-white/5 overflow-hidden">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="racing-headline text-sm text-grid-white">Channel Comparison Grid</h3>
          <span className="telemetry-text text-[10px] text-pit-gray">HOVER ROWS TO HIGHLIGHT IN CHARTS</span>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.01]">
              <th className="p-3 telemetry-text text-[11px] text-pit-gray uppercase tracking-wider">Channel</th>
              <th className="p-3 telemetry-text text-[11px] text-pit-gray uppercase tracking-wider text-right">Customers</th>
              <th className="p-3 telemetry-text text-[11px] text-pit-gray uppercase tracking-wider text-right">Share (%)</th>
              <th className="p-3 telemetry-text text-[11px] text-pit-gray uppercase tracking-wider text-right">Bookings</th>
              <th className="p-3 telemetry-text text-[11px] text-pit-gray uppercase tracking-wider text-right">Total Spent</th>
              <th className="p-3 telemetry-text text-[11px] text-pit-gray uppercase tracking-wider text-right">ARPU</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((chan, index) => {
              const countPct = totalCustomers > 0 ? (chan.count / totalCustomers) * 100 : 0
              const arpu = chan.count > 0 ? chan.spentCents / chan.count : 0
              const isHovered = hoveredRowIndex === index || hoveredCustomerIndex === index || hoveredRevenueIndex === index

              return (
                <tr
                  key={chan.name}
                  className="border-b border-white/5 last:border-b-0 transition-colors"
                  style={{
                    backgroundColor: isHovered ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
                  }}
                  onMouseEnter={() => setHoveredRowIndex(index)}
                  onMouseLeave={() => setHoveredRowIndex(null)}
                >
                  <td className="p-3 flex items-center gap-2">
                    <span
                      className="w-3 h-3 block shrink-0"
                      style={{
                        backgroundColor: chan.color,
                        boxShadow: isHovered ? `0 0 6px ${chan.color}` : 'none',
                        transition: 'box-shadow 0.2s',
                      }}
                    />
                    <span className="telemetry-text text-sm text-grid-white font-medium">
                      {chan.name}
                    </span>
                  </td>
                  <td className="p-3 text-right telemetry-text text-sm text-grid-white">
                    {chan.count}
                  </td>
                  <td className="p-3 text-right telemetry-text text-sm text-telemetry-cyan">
                    {countPct.toFixed(1)}%
                  </td>
                  <td className="p-3 text-right telemetry-text text-sm text-grid-white">
                    {chan.bookings}
                  </td>
                  <td className="p-3 text-right telemetry-text text-sm text-grid-white">
                    {formatDollars(chan.spentCents)}
                  </td>
                  <td className="p-3 text-right telemetry-text text-sm text-pit-gray">
                    {formatDollars(arpu)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
