'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'

export default function PostersClient() {
  const searchParams = useSearchParams()
  const solo = searchParams.get('poster')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const nav = document.querySelector('nav')?.closest('header') || document.querySelector('nav')
    const footer = document.querySelector('footer')
    const scrollBtn = document.getElementById('scroll-to-top') || document.querySelector('[aria-label="Scroll to top"]')

    if (nav) (nav as HTMLElement).style.display = 'none'
    if (footer) (footer as HTMLElement).style.display = 'none'
    if (scrollBtn) (scrollBtn as HTMLElement).style.display = 'none'

    document.body.style.background = solo ? '#FFFFFF' : '#E8E8E8'
    setReady(true)

    return () => {
      if (nav) (nav as HTMLElement).style.display = ''
      if (footer) (footer as HTMLElement).style.display = ''
      if (scrollBtn) (scrollBtn as HTMLElement).style.display = ''
      document.body.style.background = ''
    }
  }, [solo])

  const show = (num: string) => !solo || solo === num

  const PosterChrome = () => (
    <>
      <div className="absolute top-0 left-0 right-0 h-3 bg-gradient-to-r from-apex-red to-telemetry-cyan z-10" />
      <div className="absolute bottom-0 left-0 right-0 h-3 bg-gradient-to-r from-telemetry-cyan to-apex-red z-10" />
      <div className="absolute top-5 left-5 w-10 h-10 border-t-[3px] border-l-[3px] border-apex-red z-10" />
      <div className="absolute top-5 right-5 w-10 h-10 border-t-[3px] border-r-[3px] border-telemetry-cyan z-10" />
      <div className="absolute bottom-5 left-5 w-10 h-10 border-b-[3px] border-l-[3px] border-telemetry-cyan z-10" />
      <div className="absolute bottom-5 right-5 w-10 h-10 border-b-[3px] border-r-[3px] border-apex-red z-10" />
      <div className="absolute inset-0 opacity-[0.04] z-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(0,0,0,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,1) 1px, transparent 1px)',
        backgroundSize: '50px 50px'
      }} />
    </>
  )

  const PosterHeader = ({ num }: { num: number }) => (
    <>
      <div className="flex items-center justify-between mb-2">
        <div className="w-[2.8in] relative h-[0.9in]">
          <Image src="/assets/mclogoSHADOW.png" alt="MC Racing Sim" fill className="object-contain object-left" />
        </div>
        <div className="font-oswald font-bold text-[120pt] leading-none text-apex-red/10">
          {num}
        </div>
      </div>
      <div className="w-full h-[3px] bg-gradient-to-r from-apex-red via-apex-red to-transparent mb-4" />
    </>
  )

  const DetailRow = ({ label, val, highlight }: { label: string; val: string; highlight?: boolean }) => (
    <div className="flex justify-between font-mono text-[22pt] font-bold border-b border-black/[0.06] pb-2 whitespace-nowrap">
      <span className="text-asphalt/70 font-bold">{label}</span>
      <span className={highlight ? 'text-apex-red font-black' : 'text-asphalt font-black'}>{val}</span>
    </div>
  )

  const handlePrint = (num?: string) => {
    if (num) {
      const url = `${window.location.pathname}?poster=${num}`
      const win = window.open(url, '_blank')
      if (win) {
        win.addEventListener('afterprint', () => win.close())
        win.onload = () => setTimeout(() => win.print(), 500)
      }
    } else {
      window.print()
    }
  }

  return (
    <div className="min-h-screen py-12" style={{ background: solo ? '#FFFFFF' : '#E8E8E8' }}>
      {/* Print Controls */}
      {!solo && (
        <div className="max-w-[1200px] mx-auto px-6 mb-10 print:hidden">
          <h1 className="font-oswald font-bold text-4xl text-asphalt uppercase tracking-wider mb-2">
            Printable Posters
          </h1>
          <p className="font-mono text-asphalt-light text-sm font-medium tracking-wide mb-6">
            Three posters designed for side-by-side display. Print all, or export individually.
          </p>

          <div className="font-oswald font-semibold text-lg text-asphalt uppercase tracking-wider mb-3">View All</div>
          <div className="flex gap-4 flex-wrap mb-6">
            <a href="#poster-1" className="px-5 py-2 bg-apex-red text-white font-oswald font-semibold uppercase tracking-wider text-sm hover:bg-apex-red-dark transition-colors">1 &mdash; Session Rates</a>
            <a href="#poster-2" className="px-5 py-2 bg-telemetry-cyan text-white font-oswald font-semibold uppercase tracking-wider text-sm hover:bg-telemetry-cyan-dark transition-colors">2 &mdash; Parties</a>
            <a href="#poster-3" className="px-5 py-2 bg-asphalt text-white font-oswald font-semibold uppercase tracking-wider text-sm hover:bg-asphalt-light transition-colors">3 &mdash; Memberships &amp; Leagues</a>
          </div>

          <div className="font-oswald font-semibold text-lg text-asphalt uppercase tracking-wider mb-3">Export Individual Posters</div>
          <div className="flex gap-4 flex-wrap mb-4">
            <button onClick={() => handlePrint('1')} className="px-5 py-2 border-2 border-apex-red text-apex-red font-oswald font-semibold uppercase tracking-wider text-sm hover:bg-apex-red hover:text-white transition-colors cursor-pointer">Print Poster 1</button>
            <button onClick={() => handlePrint('2')} className="px-5 py-2 border-2 border-telemetry-cyan text-telemetry-cyan font-oswald font-semibold uppercase tracking-wider text-sm hover:bg-telemetry-cyan hover:text-white transition-colors cursor-pointer">Print Poster 2</button>
            <button onClick={() => handlePrint('3')} className="px-5 py-2 border-2 border-asphalt text-asphalt font-oswald font-semibold uppercase tracking-wider text-sm hover:bg-asphalt hover:text-white transition-colors cursor-pointer">Print Poster 3</button>
            <button onClick={() => handlePrint()} className="px-5 py-2 bg-gradient-to-r from-apex-red to-telemetry-cyan text-white font-oswald font-semibold uppercase tracking-wider text-sm cursor-pointer">Print All 3</button>
          </div>

          <div className="flex gap-4 flex-wrap">
            <a href="/posters?poster=1" target="_blank" className="px-5 py-2 bg-apex-red/10 text-apex-red font-mono font-semibold text-sm hover:bg-apex-red/20 transition-colors">/posters?poster=1</a>
            <a href="/posters?poster=2" target="_blank" className="px-5 py-2 bg-telemetry-cyan/10 text-telemetry-cyan font-mono font-semibold text-sm hover:bg-telemetry-cyan/20 transition-colors">/posters?poster=2</a>
            <a href="/posters?poster=3" target="_blank" className="px-5 py-2 bg-asphalt/10 text-asphalt font-mono font-semibold text-sm hover:bg-asphalt/20 transition-colors">/posters?poster=3</a>
          </div>
          <p className="font-mono text-asphalt/50 text-xs mt-2">Open individually in new tab → Ctrl+P → Save as PDF</p>
        </div>
      )}

      {/* Solo mode: auto-print trigger */}
      {solo && ready && (
        <div className="fixed top-4 right-4 z-50 print:hidden">
          <button onClick={() => window.print()} className="px-6 py-3 bg-apex-red text-white font-oswald font-bold uppercase tracking-wider text-lg hover:bg-apex-red-dark transition-colors shadow-lg cursor-pointer">
            Save as PDF
          </button>
        </div>
      )}

      {/* ============================== */}
      {/* POSTER 1: SESSION RATES         */}
      {/* ============================== */}
      {show('1') && (
        <div id="poster-1" className="poster-page">
          <div className="poster-sheet">
            <PosterChrome />
            <div className="relative z-[1] p-[0.45in] flex flex-col h-full">
              <PosterHeader num={1} />

              <h3 className="font-oswald font-black italic text-[72pt] uppercase text-center -skew-x-[5deg] mb-4 leading-none text-asphalt">
                Session Rates
              </h3>

              <div className="flex gap-5 flex-1">
                {/* Weekday Pricing */}
                <div className="flex-1 border-2 border-telemetry-cyan rounded-xl p-5 flex flex-col"
                  style={{ boxShadow: '0 0 20px rgba(0,174,239,0.08)' }}>
                  <div className="text-center mb-3">
                    <div className="font-oswald font-black text-[40pt] uppercase tracking-wider text-telemetry-cyan leading-none">Weekday</div>
                    <div className="font-mono text-[20pt] font-bold text-asphalt/60 uppercase tracking-[0.1em] mt-1">Tuesday &ndash; Thursday</div>
                  </div>
                  <div className="border-t border-black/[0.08] pt-3">
                    <div className="flex font-mono text-[18pt] font-bold text-asphalt/50 uppercase tracking-[0.06em] mb-2">
                      <div className="w-[30%]"></div>
                      <div className="w-[23.3%] text-center">1 Hr</div>
                      <div className="w-[23.3%] text-center">2 Hrs</div>
                      <div className="w-[23.3%] text-center">3 Hrs</div>
                    </div>
                    <div className="flex items-center border-b border-black/[0.06] py-2">
                      <div className="w-[30%] font-mono text-[20pt] font-bold text-asphalt/70">1 Person</div>
                      <div className="w-[23.3%] text-center font-oswald font-black text-[28pt] text-telemetry-cyan">$45</div>
                      <div className="w-[23.3%] text-center font-oswald font-black text-[28pt] text-telemetry-cyan">$85</div>
                      <div className="w-[23.3%] text-center font-oswald font-black text-[28pt] text-telemetry-cyan">$115</div>
                    </div>
                    <div className="flex items-center border-b border-black/[0.06] py-2">
                      <div className="w-[30%] font-mono text-[20pt] font-bold text-asphalt/70">2 People</div>
                      <div className="w-[23.3%] text-center font-oswald font-black text-[28pt] text-telemetry-cyan">$90</div>
                      <div className="w-[23.3%] text-center font-oswald font-black text-[28pt] text-telemetry-cyan">$160</div>
                      <div className="w-[23.3%] text-center font-oswald font-black text-[28pt] text-telemetry-cyan">$220</div>
                    </div>
                    <div className="flex items-center py-2">
                      <div className="w-[30%] font-mono text-[20pt] font-bold text-asphalt/70">3 People</div>
                      <div className="w-[23.3%] text-center font-oswald font-black text-[28pt] text-telemetry-cyan">$130</div>
                      <div className="w-[23.3%] text-center font-oswald font-black text-[28pt] text-telemetry-cyan">$245</div>
                      <div className="w-[23.3%] text-center font-oswald font-black text-[28pt] text-telemetry-cyan">$340</div>
                    </div>
                  </div>
                </div>

                {/* Weekend Pricing */}
                <div className="flex-1 border-2 border-apex-red rounded-xl p-5 flex flex-col"
                  style={{ boxShadow: '0 0 30px rgba(230,35,34,0.15)' }}>
                  <div className="text-center mb-3">
                    <div className="font-oswald font-black text-[40pt] uppercase tracking-wider text-apex-red leading-none">Weekend</div>
                    <div className="font-mono text-[20pt] font-bold text-asphalt/60 uppercase tracking-[0.1em] mt-1">Friday &ndash; Sunday</div>
                  </div>
                  <div className="border-t border-black/[0.08] pt-3">
                    <div className="flex font-mono text-[18pt] font-bold text-asphalt/50 uppercase tracking-[0.06em] mb-2">
                      <div className="w-[30%]"></div>
                      <div className="w-[23.3%] text-center">1 Hr</div>
                      <div className="w-[23.3%] text-center">2 Hrs</div>
                      <div className="w-[23.3%] text-center">3 Hrs</div>
                    </div>
                    <div className="flex items-center border-b border-black/[0.06] py-2">
                      <div className="w-[30%] font-mono text-[20pt] font-bold text-asphalt/70">1 Person</div>
                      <div className="w-[23.3%] text-center font-oswald font-black text-[28pt] text-apex-red">$50</div>
                      <div className="w-[23.3%] text-center font-oswald font-black text-[28pt] text-apex-red">$95</div>
                      <div className="w-[23.3%] text-center font-oswald font-black text-[28pt] text-apex-red">$135</div>
                    </div>
                    <div className="flex items-center border-b border-black/[0.06] py-2">
                      <div className="w-[30%] font-mono text-[20pt] font-bold text-asphalt/70">2 People</div>
                      <div className="w-[23.3%] text-center font-oswald font-black text-[28pt] text-apex-red">$100</div>
                      <div className="w-[23.3%] text-center font-oswald font-black text-[28pt] text-apex-red">$180</div>
                      <div className="w-[23.3%] text-center font-oswald font-black text-[28pt] text-apex-red">$250</div>
                    </div>
                    <div className="flex items-center py-2">
                      <div className="w-[30%] font-mono text-[20pt] font-bold text-asphalt/70">3 People</div>
                      <div className="w-[23.3%] text-center font-oswald font-black text-[28pt] text-apex-red">$140</div>
                      <div className="w-[23.3%] text-center font-oswald font-black text-[28pt] text-apex-red">$275</div>
                      <div className="w-[23.3%] text-center font-oswald font-black text-[28pt] text-apex-red">$365</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Note */}
              <div className="p-3 text-center mt-4 border-2 border-black/[0.08] rounded-lg"
                style={{ background: 'linear-gradient(135deg, rgba(0,174,239,0.04), rgba(230,35,34,0.04))' }}>
                <div className="font-mono text-[22pt] font-bold text-asphalt">
                  All prices are <span className="text-apex-red font-black">per session</span>, not per person. Book a 3-person session and everyone races together.
                </div>
              </div>

              {/* Combo Deal */}
              <div className="p-3 text-center mt-3 border-2 border-apex-red/30 rounded-lg"
                style={{ background: 'linear-gradient(135deg, rgba(230,35,34,0.06), rgba(0,174,239,0.06))' }}>
                <div className="font-oswald font-black text-[36pt] uppercase bg-gradient-to-br from-apex-red to-telemetry-cyan bg-clip-text text-transparent">
                  RC Track Combo Deal
                </div>
                <div className="font-mono text-[24pt] font-bold text-asphalt mt-1">
                  Book any sim session &amp; get <span className="text-apex-red font-black text-[28pt]">50% OFF</span> RC track time
                </div>
              </div>

              {/* Requirements */}
              <div className="flex justify-center gap-10 mt-3">
                <div className="font-mono text-[22pt] font-bold text-asphalt/60 uppercase tracking-[0.06em]">
                  Age: <span className="text-asphalt font-black">12+</span>
                </div>
                <div className="font-mono text-[22pt] font-bold text-asphalt/60 uppercase tracking-[0.06em]">
                  Height: <span className="text-asphalt font-black">42&quot;+</span>
                </div>
                <div className="font-mono text-[22pt] font-bold text-asphalt/60 uppercase tracking-[0.06em]">
                  Rigs: <span className="text-asphalt font-black">3 Stations</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================== */}
      {/* POSTER 2: PARTIES               */}
      {/* ============================== */}
      {show('2') && (
        <div id="poster-2" className="poster-page">
          <div className="poster-sheet">
            <PosterChrome />
            <div className="relative z-[1] p-[0.45in] flex flex-col h-full">
              <PosterHeader num={2} />

              <h3 className="font-oswald font-black italic text-[72pt] uppercase text-center -skew-x-[5deg] mb-4 leading-none text-asphalt">
                Parties
              </h3>

              {/* Birthday Party Pricing Table */}
              <div className="border-2 border-telemetry-cyan rounded-xl p-5 flex-1 mb-4"
                style={{ boxShadow: '0 0 20px rgba(0,174,239,0.08)' }}>
                <div className="font-oswald font-black text-[32pt] uppercase tracking-[0.08em] text-asphalt mb-3 text-center">
                  Birthday Party Pricing
                </div>
                <div className="font-mono text-[18pt] font-bold text-asphalt/50 text-center mb-3">
                  3 Sims &mdash; Kids rotate in groups of 3
                </div>
                {/* Header */}
                <div className="flex font-mono text-[18pt] font-bold text-asphalt/50 uppercase tracking-[0.06em] border-b-2 border-black/[0.1] pb-2 mb-1">
                  <div className="w-[25%]">Duration</div>
                  <div className="w-[25%] text-center text-telemetry-cyan">Up to 6</div>
                  <div className="w-[25%] text-center text-apex-red">7&ndash;9 Kids</div>
                  <div className="w-[25%] text-center text-telemetry-cyan">10&ndash;12 Kids</div>
                </div>
                {/* 1.5 Hours */}
                <div className="flex items-center border-b border-black/[0.06] py-2">
                  <div className="w-[25%] font-mono text-[22pt] font-bold text-asphalt">1.5 Hrs</div>
                  <div className="w-[25%] text-center font-oswald font-black text-[30pt] text-telemetry-cyan">$300</div>
                  <div className="w-[25%] text-center font-oswald font-black text-[30pt] text-apex-red">$375</div>
                  <div className="w-[25%] text-center font-oswald font-black text-[30pt] text-telemetry-cyan">$450</div>
                </div>
                {/* 2 Hours */}
                <div className="flex items-center border-b border-black/[0.06] py-2">
                  <div className="w-[25%] font-mono text-[22pt] font-bold text-asphalt">2 Hrs</div>
                  <div className="w-[25%] text-center font-oswald font-black text-[30pt] text-telemetry-cyan">$400</div>
                  <div className="w-[25%] text-center font-oswald font-black text-[30pt] text-apex-red">$475</div>
                  <div className="w-[25%] text-center font-oswald font-black text-[30pt] text-telemetry-cyan">$550</div>
                </div>
                {/* 2.5 Hours */}
                <div className="flex items-center border-b border-black/[0.06] py-2">
                  <div className="w-[25%] font-mono text-[22pt] font-bold text-asphalt">2.5 Hrs</div>
                  <div className="w-[25%] text-center font-oswald font-black text-[30pt] text-telemetry-cyan">$475</div>
                  <div className="w-[25%] text-center font-oswald font-black text-[30pt] text-apex-red">$550</div>
                  <div className="w-[25%] text-center font-oswald font-black text-[30pt] text-telemetry-cyan">$650</div>
                </div>
                {/* 3 Hours */}
                <div className="flex items-center py-2">
                  <div className="w-[25%] font-mono text-[22pt] font-bold text-asphalt">3 Hrs</div>
                  <div className="w-[25%] text-center font-oswald font-black text-[30pt] text-telemetry-cyan">$550</div>
                  <div className="w-[25%] text-center font-oswald font-black text-[30pt] text-apex-red">$650</div>
                  <div className="w-[25%] text-center font-oswald font-black text-[30pt] text-telemetry-cyan">$750</div>
                </div>
              </div>

              {/* Per-Kid Breakdown */}
              <div className="border-2 border-black/[0.08] rounded-xl p-4 mb-4"
                style={{ background: 'linear-gradient(135deg, rgba(0,174,239,0.03), rgba(230,35,34,0.03))' }}>
                <div className="font-oswald font-black text-[24pt] uppercase tracking-[0.08em] text-asphalt/70 mb-2 text-center">Per-Kid Breakdown</div>
                <div className="flex font-mono text-[16pt] font-bold text-asphalt/50 uppercase tracking-[0.06em] border-b border-black/[0.08] pb-1 mb-1">
                  <div className="w-[25%]"></div>
                  <div className="w-[25%] text-center">6 Kids</div>
                  <div className="w-[25%] text-center">9 Kids</div>
                  <div className="w-[25%] text-center">12 Kids</div>
                </div>
                {[
                  { dur: '1.5 Hrs', costs: ['$50/kid', '$42/kid', '$38/kid'] },
                  { dur: '2 Hrs', costs: ['$67/kid', '$53/kid', '$46/kid'] },
                  { dur: '2.5 Hrs', costs: ['$79/kid', '$61/kid', '$54/kid'] },
                  { dur: '3 Hrs', costs: ['$92/kid', '$72/kid', '$63/kid'] },
                ].map((row, i, arr) => (
                  <div key={row.dur} className={`flex items-center py-1 ${i < arr.length - 1 ? 'border-b border-black/[0.04]' : ''}`}>
                    <div className="w-[25%] font-mono text-[18pt] font-bold text-asphalt/70">{row.dur}</div>
                    {row.costs.map((c, j) => (
                      <div key={j} className="w-[25%] text-center font-mono text-[18pt] font-bold text-telemetry-cyan">{c}</div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Corporate / Business Events */}
              <div className="border-2 border-apex-red rounded-xl p-5 mb-4 flex items-center gap-8"
                style={{ boxShadow: '0 0 20px rgba(230,35,34,0.08)' }}>
                <div className="flex-shrink-0 text-center">
                  <div className="font-oswald font-black text-[36pt] uppercase tracking-wider text-apex-red leading-tight">Corporate &amp;<br/>Business</div>
                  <div className="font-mono text-[20pt] font-bold text-asphalt/60 mt-1">Groups of 6&ndash;30</div>
                </div>
                <div className="flex-1 flex flex-wrap gap-x-8 gap-y-2">
                  {['Team Building', 'Holiday Parties', 'Client Events', 'Custom Packages'].map((item) => (
                    <div key={item} className="font-mono text-[22pt] font-bold text-asphalt pl-8 relative whitespace-nowrap">
                      <span className="absolute left-0 text-apex-red font-black">&#10003;</span>{item}
                    </div>
                  ))}
                </div>
              </div>

              {/* All parties include */}
              <div className="border-2 border-black/[0.08] rounded-lg p-4">
                <div className="font-oswald font-black text-[26pt] uppercase tracking-[0.08em] text-asphalt mb-3 text-center">All Birthday Parties Include</div>
                <div className="flex justify-center gap-8 flex-wrap">
                  {['Exclusive Facility', 'No Experience Needed', 'Bring Your Own Cake', 'Race Director Briefing'].map((item) => (
                    <div key={item} className="font-mono text-[20pt] font-bold text-asphalt pl-8 relative whitespace-nowrap">
                      <span className="absolute left-0 text-telemetry-cyan font-black">&#10003;</span>{item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================== */}
      {/* POSTER 3: MEMBERSHIPS & LEAGUES */}
      {/* ============================== */}
      {show('3') && (
        <div id="poster-3" className="poster-page">
          <div className="poster-sheet">
            <PosterChrome />
            <div className="relative z-[1] p-[0.45in] flex flex-col h-full">
              <PosterHeader num={3} />

              <h3 className="font-oswald font-black italic text-[64pt] uppercase text-center -skew-x-[5deg] mb-3 leading-none text-asphalt">
                Memberships &amp; Leagues
              </h3>

              {/* === MEMBERSHIPS === */}
              <div className="font-oswald font-black text-[28pt] uppercase tracking-[0.1em] text-asphalt mb-2 text-center">Memberships &mdash; 3-Month Commitment</div>

              <div className="flex gap-4 mb-3">
                {/* Solo */}
                <div className="flex-1 border-2 border-telemetry-cyan rounded-xl p-4 flex flex-col"
                  style={{ boxShadow: '0 0 20px rgba(0,174,239,0.08)' }}>
                  <div className="text-center mb-2">
                    <div className="font-oswald font-black text-[28pt] uppercase tracking-wider text-telemetry-cyan leading-none">Solo</div>
                  </div>
                  <div className="text-center py-2 border-t border-b border-black/[0.08] mb-2">
                    <div className="font-oswald font-black text-[44pt] text-telemetry-cyan leading-none">$150</div>
                    <div className="font-mono text-[16pt] font-bold text-asphalt/60 mt-1">per month</div>
                  </div>
                  <div className="space-y-2 flex-1">
                    <DetailRow label="Days" val="Tue-Fri 12-7pm" highlight />
                    <DetailRow label="Daily" val="2 hrs/day" />
                    <DetailRow label="Friends" val="1, 2x/mo" />
                    <DetailRow label="Upfront" val="$450/3mo" />
                  </div>
                </div>

                {/* Crew */}
                <div className="flex-1 border-2 border-apex-red rounded-xl p-4 flex flex-col"
                  style={{ boxShadow: '0 0 30px rgba(230,35,34,0.12)' }}>
                  <div className="text-center mb-2">
                    <div className="font-oswald font-black text-[28pt] uppercase tracking-wider text-apex-red leading-none">Crew</div>
                  </div>
                  <div className="text-center py-2 border-t border-b border-black/[0.08] mb-2">
                    <div className="font-oswald font-black text-[44pt] text-apex-red leading-none">$200</div>
                    <div className="font-mono text-[16pt] font-bold text-asphalt/60 mt-1">per month</div>
                  </div>
                  <div className="space-y-2 flex-1">
                    <DetailRow label="Days" val="Tue-Fri 12-7pm" highlight />
                    <DetailRow label="Daily" val="2 hrs/day" />
                    <DetailRow label="Friends" val="2, 3x/mo" />
                    <DetailRow label="Upfront" val="$600/3mo" />
                  </div>
                  <div className="text-center mt-2 bg-apex-red text-white font-oswald font-black text-[16pt] uppercase tracking-[0.1em] py-1 rounded whitespace-nowrap">
                    Most Popular
                  </div>
                </div>

                {/* VIP */}
                <div className="flex-1 border-2 border-telemetry-cyan rounded-xl p-4 flex flex-col"
                  style={{ boxShadow: '0 0 20px rgba(0,174,239,0.08)' }}>
                  <div className="text-center mb-2">
                    <div className="font-oswald font-black text-[28pt] uppercase tracking-wider text-telemetry-cyan leading-none">VIP</div>
                  </div>
                  <div className="text-center py-2 border-t border-b border-black/[0.08] mb-2">
                    <div className="font-oswald font-black text-[44pt] text-telemetry-cyan leading-none">$250</div>
                    <div className="font-mono text-[16pt] font-bold text-asphalt/60 mt-1">per month</div>
                  </div>
                  <div className="space-y-2 flex-1">
                    <DetailRow label="Days" val="Tue-Fri 12-7pm" highlight />
                    <DetailRow label="Daily" val="2 hrs/day" />
                    <DetailRow label="Friends" val="2+, 4x/mo" />
                    <DetailRow label="Upfront" val="$750/3mo" />
                  </div>
                </div>
              </div>

              {/* Duo Membership - Special Section */}
              <div className="border-2 border-apex-red/60 rounded-xl p-4 mb-3 flex items-center gap-6"
                style={{ boxShadow: '0 0 20px rgba(230,35,34,0.08)', background: 'linear-gradient(135deg, rgba(230,35,34,0.04), rgba(0,174,239,0.04))' }}>
                <div className="flex-shrink-0 text-center">
                  <div className="font-oswald font-black text-[32pt] uppercase tracking-wider text-apex-red leading-none">Duo</div>
                  <div className="font-mono text-[14pt] font-bold text-asphalt/60 mt-1">2 People</div>
                </div>
                <div className="flex-shrink-0 text-center px-5 border-l border-r border-black/[0.08]">
                  <div className="font-oswald font-black text-[44pt] text-apex-red leading-none">$300</div>
                  <div className="font-mono text-[16pt] font-bold text-asphalt/60 mt-1">per month</div>
                </div>
                <div className="flex-1 flex flex-wrap gap-x-6 gap-y-1">
                  <div className="font-mono text-[18pt] font-bold text-asphalt">2 hrs/day, Tue-Fri</div>
                  <div className="font-mono text-[18pt] font-bold text-asphalt">$150/person</div>
                  <div className="font-mono text-[18pt] font-bold text-asphalt">$900 / 3-month upfront</div>
                </div>
              </div>

              {/* Divider */}
              <div className="w-full h-[3px] bg-gradient-to-r from-transparent via-black/10 to-transparent mb-3" />

              {/* === LEAGUES === */}
              <div className="font-oswald font-black text-[28pt] uppercase tracking-[0.1em] text-asphalt mb-2 text-center">Leagues &mdash; 12-Week Season</div>

              <div className="flex gap-4 flex-1">
                {/* Local League */}
                <div className="flex-1 border-2 border-apex-red rounded-xl p-4 flex flex-col"
                  style={{ boxShadow: '0 0 20px rgba(230,35,34,0.08)' }}>
                  <div className="text-center mb-2">
                    <div className="font-oswald font-black text-[28pt] uppercase tracking-wider text-apex-red leading-none">Local League</div>
                    <div className="font-mono text-[14pt] font-bold text-asphalt/60 mt-1">3-Racer Heat Format</div>
                  </div>
                  <div className="text-center py-2 border-t border-b border-black/[0.08] mb-2">
                    <div className="font-oswald font-black text-[40pt] text-apex-red leading-none">$30</div>
                    <div className="font-mono text-[16pt] font-bold text-asphalt/60 mt-1">drop-in / night</div>
                  </div>
                  <div className="space-y-2 flex-1">
                    <DetailRow label="Season Pass" val="$240" highlight />
                    <DetailRow label="Per Night" val="$20" />
                    <DetailRow label="Finals" val="Week 12" />
                  </div>
                </div>

                {/* Online League */}
                <div className="flex-1 border-2 border-telemetry-cyan rounded-xl p-4 flex flex-col"
                  style={{ boxShadow: '0 0 20px rgba(0,174,239,0.08)' }}>
                  <div className="text-center mb-2">
                    <div className="font-oswald font-black text-[28pt] uppercase tracking-wider text-telemetry-cyan leading-none">Online League</div>
                    <div className="font-mono text-[14pt] font-bold text-asphalt/60 mt-1">Time Attack &mdash; Race Nationwide</div>
                  </div>
                  <div className="text-center py-2 border-t border-b border-black/[0.08] mb-2">
                    <div className="font-oswald font-black text-[40pt] text-telemetry-cyan leading-none">$30</div>
                    <div className="font-mono text-[16pt] font-bold text-asphalt/60 mt-1">drop-in / night</div>
                  </div>
                  <div className="space-y-2 flex-1">
                    <DetailRow label="Season Pass" val="$240" highlight />
                    <DetailRow label="Per Night" val="$20" />
                    <DetailRow label="Prize Pool" val="Included" highlight />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .poster-page {
          max-width: 1200px;
          margin: 0 auto 80px;
          padding: 0 24px;
        }
        .poster-sheet {
          position: relative;
          width: 100%;
          background: #FFFFFF;
          overflow: hidden;
          box-shadow: 0 4px 40px rgba(0,0,0,0.15), 0 0 1px rgba(0,0,0,0.2);
        }
        @page {
          size: letter portrait;
          margin: 0.25in;
        }
        @media print {
          .poster-page {
            page-break-after: always;
            margin: 0;
            padding: 0;
          }
          .poster-sheet {
            width: 1200px;
            transform-origin: top left;
            transform: scale(0.65);
            box-shadow: none;
          }
        }
      `}</style>
    </div>
  )
}
