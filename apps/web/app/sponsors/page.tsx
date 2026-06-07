'use client';

import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';
const SPONSOR_EMAIL = process.env.NEXT_PUBLIC_SPONSOR_EMAIL ?? 'sponsors@axle.live';

const TIERS = [
  {
    id: 'mile-marker',
    name: 'Mile Marker',
    price: '$99',
    period: 'per 100 miles',
    color: '#60a5fa',
    tagline: 'Get your brand into the ride',
    features: [
      'Logo on stream overlay for 100 miles',
      'Name in AXLE commentary (1 mention)',
      'Companion site sponsor card for the segment',
      'Clip highlight when your segment ends',
    ],
  },
  {
    id: 'state-sponsor',
    name: 'State Sponsor',
    price: '$499',
    period: 'per state',
    color: '#5dc89a',
    tagline: 'Own an entire state crossing',
    highlight: true,
    features: [
      'Everything in Mile Marker',
      'State crossing overlay moment with your brand',
      '"Entering Texas, presented by [You]" on stream',
      '3 commentary mentions across the state',
      'Companion site feature card for the full state',
      'Dedicated social post when AXLE enters the state',
    ],
  },
  {
    id: 'title-sponsor',
    name: 'Title Sponsor',
    price: '$2,499',
    period: 'per month',
    color: '#facc15',
    tagline: 'Your name is part of the show',
    features: [
      'Everything in State Sponsor',
      '"Spiraling Spokes presented by [Brand]" — everywhere',
      'Stream title includes your brand name',
      'Weekly shoutouts in SPOKY commentary',
      'Top placement on companion site',
      'Monthly milestone moments branded to you',
      'Your logo on all social share cards',
      'Direct contact with the Spiraling Spokes team',
    ],
  },
];

function ContactForm({ tier }: { tier: string }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // In production: send to a form service or backend endpoint
    setSent(true);
  };

  if (sent) return (
    <div className="text-center py-8">
      <div className="text-2xl font-black text-emerald-400 mb-2">Message sent.</div>
      <div className="text-zinc-400 text-sm">We'll reach out within 24 hours.</div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {tier && <div className="text-xs font-black tracking-widest text-zinc-500 mb-2">INQUIRING ABOUT: <span className="text-emerald-400">{tier.toUpperCase()}</span></div>}
      <div className="grid grid-cols-2 gap-4">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm outline-none focus:border-emerald-400/50 placeholder:text-zinc-600" />
        <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company / brand"
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm outline-none focus:border-emerald-400/50 placeholder:text-zinc-600" />
      </div>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" type="email" required
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm outline-none focus:border-emerald-400/50 placeholder:text-zinc-600" />
      <button type="submit"
        className="w-full rounded-lg py-3 font-black text-black tracking-wider transition-all hover:brightness-110"
        style={{ background: '#5dc89a' }}
      >
        Send inquiry →
      </button>
      <p className="text-xs text-zinc-600 text-center">Or email directly: <a href={`mailto:${SPONSOR_EMAIL}`} className="text-zinc-400 hover:text-white">{SPONSOR_EMAIL}</a></p>
    </form>
  );
}

export default function SponsorsPage() {
  const [activeTier, setActiveTier] = useState('');

  return (
    <div className="min-h-screen bg-zinc-950 text-white" style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>

      {/* Hero */}
      <div className="relative overflow-hidden" style={{ background: 'linear-gradient(180deg,rgba(2,6,23,.98) 0%,rgba(10,18,42,.95) 100%)' }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#5dc89a 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        <div className="relative max-w-5xl mx-auto px-6 py-24 text-center">
          <div className="inline-block mb-8 px-4 py-2 rounded-full text-xs font-black tracking-widest" style={{ background: 'rgba(93,200,154,.1)', border: '1px solid rgba(93,200,154,.25)', color: '#5dc89a' }}>
            SPIRALING SPOKES · SPONSOR PROGRAM
          </div>
          <h1 className="text-6xl font-black mb-6 leading-tight tracking-tight">
            Put your brand<br />
            <span style={{ color: '#5dc89a' }}>in SPOKY's path.</span>
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed mb-4">
            SPOKY is an AI that bikes across America, live, 24/7. Thousands of viewers watch every mile.
            Your brand moves with the rider — literally.
          </p>
          <p className="text-sm text-zinc-500">Spiraling Spokes — a journey less traveled</p>
          <div className="mt-10 flex justify-center gap-12">
            {[['24/7', 'Always live'], ['3,100 mi', 'NYC to LA'], ['Real viewers', 'Not bots']].map(([stat, label]) => (
              <div key={stat} className="text-center">
                <div className="text-3xl font-black text-white">{stat}</div>
                <div className="text-xs tracking-widest text-zinc-500 mt-1">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* What sponsors get */}
      <div className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-black mb-3 tracking-tight">What you get</h2>
        <p className="text-zinc-400 mb-10">Not banner ads. Your brand is part of the story.</p>
        <div className="grid grid-cols-3 gap-6">
          {[
            { icon: '📺', title: 'Stream overlay', desc: 'Your logo lives on the 1920×1080 OBS canvas. Every viewer, every moment.' },
            { icon: '🎙️', title: 'SPOKY mentions you', desc: 'SPOKY works your brand into commentary naturally. "Riding through New Mexico, sponsored by Trail Mix Co." That kind of thing.' },
            { icon: '📍', title: 'Companion site', desc: 'Your card on spiralingspokes.vercel.app — visible to everyone following the trip alongside the stream.' },
            { icon: '🏁', title: 'State crossing moments', desc: 'Each state line is a cinematic event. State sponsors own theirs completely.' },
            { icon: '📸', title: 'Share cards', desc: 'Auto-generated images for milestones include your logo. Twitter/Discord/Instagram friendly.' },
            { icon: '📧', title: 'Audience data', desc: 'We grow an email list of engaged viewers. State sponsors get a post-campaign segment report.' },
          ].map((item) => (
            <div key={item.title} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <div className="text-2xl mb-3">{item.icon}</div>
              <div className="text-sm font-black mb-2">{item.title}</div>
              <div className="text-xs text-zinc-400 leading-relaxed">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Pricing */}
      <div className="max-w-5xl mx-auto px-6 py-8 pb-20">
        <h2 className="text-2xl font-black mb-3 tracking-tight">Pricing</h2>
        <p className="text-zinc-400 mb-10">No long-term contracts. Pay per segment, state, or month.</p>
        <div className="grid grid-cols-3 gap-6 mb-16">
          {TIERS.map((tier) => (
            <div
              key={tier.id}
              className={`rounded-2xl border p-6 flex flex-col cursor-pointer transition-all ${tier.highlight ? 'scale-[1.02]' : ''}`}
              style={{
                borderColor: activeTier === tier.id ? tier.color : tier.highlight ? `${tier.color}40` : 'rgba(255,255,255,.08)',
                background: tier.highlight ? 'rgba(93,200,154,.04)' : 'rgba(255,255,255,.02)',
                boxShadow: activeTier === tier.id ? `0 0 0 2px ${tier.color}50` : tier.highlight ? `0 0 30px ${tier.color}15` : 'none',
              }}
              onClick={() => setActiveTier(tier.id === activeTier ? '' : tier.id)}
            >
              {tier.highlight && (
                <div className="mb-4 text-xs font-black tracking-widest px-3 py-1 rounded-full self-start"
                  style={{ background: `${tier.color}18`, color: tier.color }}>MOST POPULAR</div>
              )}
              <div className="text-sm font-black tracking-widest mb-1" style={{ color: tier.color }}>{tier.name.toUpperCase()}</div>
              <div className="text-4xl font-black mb-1">{tier.price}</div>
              <div className="text-xs text-zinc-500 mb-3">{tier.period}</div>
              <div className="text-sm text-zinc-400 mb-6 leading-relaxed">{tier.tagline}</div>
              <ul className="space-y-2 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
                    <span style={{ color: tier.color }} className="mt-0.5 shrink-0">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                className="mt-6 w-full rounded-xl py-3 text-sm font-black tracking-wide transition-all hover:brightness-110"
                style={{ background: activeTier === tier.id ? tier.color : `${tier.color}20`, color: activeTier === tier.id ? '#000' : tier.color }}
                onClick={(e) => { e.stopPropagation(); setActiveTier(tier.name); }}
              >
                {activeTier === tier.name ? 'Selected ✓' : 'Select this tier'}
              </button>
            </div>
          ))}
        </div>

        {/* Contact form */}
        <div className="max-w-xl mx-auto rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8">
          <h3 className="text-xl font-black mb-1">Get in touch</h3>
          <p className="text-sm text-zinc-400 mb-6">We respond within 24 hours. No sales pressure.</p>
          <ContactForm tier={activeTier} />
        </div>
      </div>
    </div>
  );
}
