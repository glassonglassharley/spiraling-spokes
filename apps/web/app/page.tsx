'use client';

import { useEffect, useRef, useState } from 'react';
import { demoRoutePresets, mockChatMessages, mockLeaderboard, mockSceneLibrary, type MockScene } from '../../../shared/mock/demo';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8080/ws';
const TWITCH_CHANNEL = process.env.NEXT_PUBLIC_TWITCH_CHANNEL ?? 'axlelive';

interface ChatMsg { username: string; message: string; source: string; highlighted?: boolean; }
interface Vote { id: string; question: string; option_a: string; option_b: string; votes_a: number; votes_b: number; status: string; }

const MOCK_SPONSOR = { name: 'Trail Mix Co.', tagline: 'Fuel for every mile', state: 'New Mexico', link: '#' };

const initialVote: Vote = {
  id: 'mock-vote',
  question: 'What should AXLE pretend to investigate next?',
  option_a: 'Questionable diner',
  option_b: 'Suspiciously photogenic bridge',
  votes_a: 38, votes_b: 42, status: 'open',
};

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ padding: '12px 0' }}>
      <div style={{ fontSize: 11, letterSpacing: 3, color: 'rgba(255,255,255,.38)', fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function ChatLine({ msg }: { msg: ChatMsg }) {
  const color = msg.source === 'twitch' ? '#a78bfa' : msg.source === 'axle' ? '#5dc89a' : '#60a5fa';
  return (
    <div className={`py-1.5 px-3 text-sm leading-snug rounded ${msg.highlighted ? 'bg-yellow-400/10 border border-yellow-400/25' : 'hover:bg-white/[.03]'}`}>
      <span className="font-black mr-2 text-sm" style={{ color }}>{msg.username}</span>
      <span className="text-zinc-200">{msg.message}</span>
    </div>
  );
}

export default function CompanionSite() {
  const [scene, setScene] = useState<Partial<MockScene>>(mockSceneLibrary[0]);
  const [chat, setChat] = useState<ChatMsg[]>(mockChatMessages.slice(0, 8));
  const [vote, setVote] = useState<Vote>(initialVote);
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [streamOnline] = useState(false); // flip true in LIVE_MODE
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const route = demoRoutePresets[0];

  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat]);

  // Local mock fallback — advances scene every 6.5s if WS not connected
  const wsWorked = useRef(false);
  const indexRef = useRef(0);
  useEffect(() => {
    const fallback = setTimeout(() => {
      if (wsWorked.current) return;
      const id = setInterval(() => {
        indexRef.current = (indexRef.current + 1) % mockSceneLibrary.length;
        setScene(mockSceneLibrary[indexRef.current]);
        setChat((prev) => [...prev.slice(-40), mockChatMessages[indexRef.current % mockChatMessages.length]]);
      }, 6500);
      return () => clearInterval(id);
    }, 1200);
    return () => clearTimeout(fallback);
  }, []);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => setWsConnected(false);
    ws.onmessage = (e) => {
      wsWorked.current = true;
      const { type, payload } = JSON.parse(e.data) as { type: string; payload: Record<string, unknown> };
      if (type === 'NEW_FRAME') setScene((prev) => ({ ...prev, ...payload } as Partial<MockScene>));
      if (type === 'CHAT_MESSAGE' || type === 'CHAT_RESPONSE') setChat((prev) => [...prev.slice(-80), payload as unknown as ChatMsg]);
      if (type === 'VOTE_OPEN' || type === 'VOTE_UPDATE') setVote(payload as unknown as Vote);
      if (type === 'MILESTONE') {
        const name = String((payload as { name: string }).name);
        setChat((prev) => [...prev, { username: 'AXLE', message: `🏁 Milestone: ${name}`, source: 'axle', highlighted: true }]);
      }
    };
    return () => ws.close();
  }, []);

  const handleVote = async (choice: 'a' | 'b') => {
    setVote((v) => ({
      ...v,
      votes_a: v.votes_a + (choice === 'a' ? 1 : 0),
      votes_b: v.votes_b + (choice === 'b' ? 1 : 0),
    }));
    try {
      await fetch(`${API_URL}/api/votes/${vote.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice }),
      });
    } catch { /* offline, local update is enough */ }
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    try {
      await fetch(`${API_URL}/api/emails`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), source: 'companion_site' }),
      });
    } catch { /* store offline-first */ }
    setEmailSent(true);
  };

  const miles = Math.round(scene.miles ?? 0);
  const total = miles + Math.round(scene.milesRemaining ?? 0);
  const pct = total > 0 ? (miles / total) * 100 : 0;
  const voteTotal = Math.max(1, vote.votes_a + vote.votes_b);
  const pctA = Math.round((vote.votes_a / voteTotal) * 100);
  const pctB = 100 - pctA;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-zinc-950 text-white select-none" style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>

      {/* ── HEADER ── */}
      <header className="flex-none flex items-center justify-between px-6 py-3 border-b border-zinc-800/70" style={{ background: 'rgba(10,10,15,.95)', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center gap-4">
          <div className="text-xl font-black tracking-widest" style={{ color: '#5dc89a', letterSpacing: 6 }}>SPOKY</div>
          <div className="text-xs text-zinc-600 font-medium tracking-widest">SPIRALING SPOKES</div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: wsConnected ? '#5dc89a' : '#ef4444',
              display: 'inline-block',
              boxShadow: wsConnected ? '0 0 6px #5dc89a' : 'none',
            }} />
            {wsConnected ? 'Live data' : 'Mock data'}
          </div>
          <div className="rounded-full px-3 py-1 text-xs font-black tracking-widest" style={{ background: 'rgba(250,204,21,.12)', color: '#facc15', border: '1px solid rgba(250,204,21,.2)' }}>
            MOCK MODE
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      <div className="flex flex-1 min-h-0">

        {/* LEFT: stream player (60%) */}
        <div className="flex flex-col" style={{ width: '60%', flexShrink: 0, background: '#000' }}>

          {/* Video area */}
          <div className="relative flex-1 min-h-0 overflow-hidden">
            {streamOnline ? (
              <iframe
                src={`https://player.twitch.tv/?channel=${TWITCH_CHANNEL}&parent=axle.live&parent=localhost`}
                className="absolute inset-0 w-full h-full"
                style={{ border: 'none' }}
                allowFullScreen
              />
            ) : (
              /* Mock: scaled stream canvas */
              <StreamPreview scene={scene} pct={pct} />
            )}
          </div>

          {/* Stats bar below video */}
          <div className="flex-none border-t border-zinc-800/70 px-5 py-3" style={{ background: 'rgba(10,10,15,.98)' }}>
            <div className="flex items-center gap-6 overflow-x-auto">
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-zinc-500 tracking-widest font-bold">LOCATION</span>
                <span className="text-sm font-black text-white">{scene.city}, {scene.state}</span>
              </div>
              <div className="w-px h-5 bg-zinc-700" />
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-zinc-500 tracking-widest font-bold">MILE</span>
                <span className="text-sm font-black text-emerald-400">{miles.toLocaleString()}</span>
              </div>
              <div className="w-px h-5 bg-zinc-700" />
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-zinc-500 tracking-widest font-bold">WEATHER</span>
                <span className="text-sm text-zinc-300">{scene.weather}</span>
              </div>
              <div className="flex-1" />
              {/* Progress bar */}
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-zinc-600">{Math.round(pct)}%</span>
                <div className="w-32 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-400 transition-all duration-700" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-zinc-600">NYC→LA</span>
              </div>
            </div>
          </div>

          {/* Chat (below stats, fills remaining space) */}
          <div className="flex-1 flex flex-col min-h-0 border-t border-zinc-800/70" style={{ maxHeight: 260 }}>
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/50">
              <span className="text-xs font-black tracking-widest text-zinc-500">CHAT</span>
              <span className="text-xs text-zinc-600">Mirror of Twitch chat</span>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {chat.map((m, i) => <ChatLine key={`${m.username}-${i}`} msg={m} />)}
              <div ref={chatBottomRef} />
            </div>
          </div>
        </div>

        {/* RIGHT PANEL (40%) */}
        <div className="flex-1 flex flex-col overflow-y-auto border-l border-zinc-800/70 min-h-0" style={{ background: 'rgba(10,10,15,.6)' }}>

          {/* Live Stats */}
          <section className="border-b border-zinc-800/60 px-5 py-4">
            <div className="text-xs font-black tracking-widest text-zinc-500 mb-3">LIVE STATS</div>
            <div className="grid grid-cols-2 divide-x divide-y divide-zinc-800/60">
              <StatCard label="MILES TRAVELED" value={miles.toLocaleString()} sub={`${Math.round(scene.milesRemaining ?? 0).toLocaleString()} remaining`} />
              <div className="pl-4"><StatCard label="CURRENT ROAD" value={scene.roadName?.split(' ').slice(0, 3).join(' ') ?? '—'} sub={scene.sceneType} /></div>
              <StatCard label="HEADING" value={`${Math.round(scene.heading ?? 0)}°`} sub="compass direction" />
              <div className="pl-4"><StatCard label="CONDITIONS" value={scene.weather?.split(',')[0] ?? '—'} sub={scene.weather?.split(',').slice(1).join(',').trim()} /></div>
            </div>
          </section>

          {/* Vote */}
          {vote.status === 'open' && (
            <section className="border-b border-zinc-800/60 px-5 py-4">
              <div className="text-xs font-black tracking-widest text-zinc-500 mb-2">ROUTE VOTE</div>
              <div className="text-sm font-semibold mb-3 leading-snug">{vote.question}</div>
              {(['a', 'b'] as const).map((o) => {
                const label = o === 'a' ? vote.option_a : vote.option_b;
                const pct = o === 'a' ? pctA : pctB;
                return (
                  <button key={o} onClick={() => handleVote(o)}
                    className="w-full mb-2 rounded-lg overflow-hidden border border-zinc-700 hover:border-emerald-400/50 transition-colors text-left"
                  >
                    <div className="relative flex justify-between items-center px-4 py-3 text-sm">
                      <span className="absolute inset-y-0 left-0 rounded-lg"
                        style={{ width: `${pct}%`, background: 'rgba(93,200,154,.12)', transition: 'width .6s ease' }} />
                      <span className="relative font-semibold">{label}</span>
                      <span className="relative text-emerald-400 font-black text-sm">{pct}%</span>
                    </div>
                  </button>
                );
              })}
              <div className="mt-2 text-xs text-zinc-600 text-center">Or type <span className="text-zinc-400 font-mono">!votea</span> / <span className="text-zinc-400 font-mono">!voteb</span> in Twitch chat</div>
            </section>
          )}

          {/* Sponsor */}
          <section className="border-b border-zinc-800/60 px-5 py-4">
            <div className="text-xs font-black tracking-widest text-zinc-500 mb-3">CURRENT SPONSOR</div>
            <div className="rounded-xl border border-zinc-700/60 p-4" style={{ background: 'rgba(250,204,21,.04)' }}>
              <div className="text-base font-black text-yellow-300 mb-1">{MOCK_SPONSOR.name}</div>
              <div className="text-sm text-zinc-300 mb-2">{MOCK_SPONSOR.tagline}</div>
              <div className="text-xs text-zinc-500">Sponsoring SPOKY through {MOCK_SPONSOR.state}</div>
              <a href="/sponsors" className="mt-3 inline-block text-xs font-bold text-yellow-400/70 hover:text-yellow-300 transition-colors">
                Become a sponsor →
              </a>
            </div>
          </section>

          {/* Leaderboard */}
          <section className="border-b border-zinc-800/60 px-5 py-4">
            <div className="text-xs font-black tracking-widest text-zinc-500 mb-3">TOP SUPPORTERS</div>
            <div className="space-y-2">
              {mockLeaderboard.map((r, i) => (
                <div key={r.username} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3">
                    <span className="text-zinc-600 w-4 text-right">{i + 1}</span>
                    <span className="font-semibold text-zinc-200">{r.username}</span>
                  </div>
                  <span className="text-emerald-400 font-black tabular-nums">${(r.total_cents / 100).toFixed(0)}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Email capture */}
          <section className="px-5 py-4">
            <div className="text-xs font-black tracking-widest text-zinc-500 mb-2">GET STATE ALERTS</div>
            <div className="text-xs text-zinc-500 mb-3">Know the moment SPOKY crosses into a new state.</div>
            {emailSent ? (
              <div className="text-sm font-bold text-emerald-400">✓ You're on the list.</div>
            ) : (
              <form onSubmit={handleEmail} className="flex gap-2">
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com" required
                  className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-emerald-400/50 transition-colors placeholder:text-zinc-600"
                />
                <button type="submit"
                  className="rounded-lg px-4 py-2 text-sm font-black text-black transition-colors"
                  style={{ background: '#5dc89a' }}
                >
                  Subscribe
                </button>
              </form>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// Scaled preview of the /stream canvas for when Twitch is offline
function StreamPreview({ scene, pct }: { scene: Partial<MockScene>; pct: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setScale(Math.min(width / 1920, height / 1080));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden" style={{ background: '#000' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 1920, height: 1080, transformOrigin: 'top left', transform: `scale(${scale})` }}>
        <img
          src={scene.image ?? '/mock/route/01-city.svg'}
          alt="SPOKY route"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        {/* Gradient overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg,rgba(2,6,23,.72) 0%,rgba(2,6,23,.05) 30%,rgba(2,6,23,.72) 100%)',
        }} />
        {/* HUD */}
        <div style={{ position: 'absolute', top: 40, left: 48, right: 48 }}>
          <div style={{ fontSize: 38, fontWeight: 950, color: '#fff' }}>{scene.city}, <span style={{ color: 'rgba(255,255,255,.65)' }}>{scene.state}</span></div>
          <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 17, marginTop: 6 }}>{scene.roadName} · {scene.sceneType}</div>
          <div style={{ marginTop: 16, height: 4, background: 'rgba(255,255,255,.12)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: '#5dc89a', transition: 'width .8s ease' }} />
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: '#5dc89a', opacity: 0.8, width: `${pct}%` }} />
      </div>
    </div>
  );
}
