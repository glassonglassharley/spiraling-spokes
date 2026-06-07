'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { commentaryForScene, mockChatMessages, mockSceneLibrary, sceneImageUrl, type MockScene } from '../lib/demo';
import AmbientSound, { type AmbientSoundRef } from '../components/AmbientSound';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8080/ws';
const TWITCH_CHANNEL = process.env.NEXT_PUBLIC_TWITCH_CHANNEL ?? 'spiralingspokes';
const GMAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
const INITIAL_IMAGE = sceneImageUrl(mockSceneLibrary[0], GMAPS_KEY);

const G = '#4ade80';
const PANEL = 'rgba(10,10,10,0.88)';
const MONO = 'var(--font-dm-mono, monospace)';
const SANS = 'var(--font-dm-sans, system-ui, sans-serif)';
const DISPLAY = 'var(--font-playfair, serif)';

interface ChatMsg { username: string; message: string; source: string; highlighted?: boolean; }
interface Vote { id: string; question: string; option_a: string; option_b: string; votes_a: number; votes_b: number; status: string; }

const INITIAL_VOTE: Vote = {
  id: 'mock-vote',
  question: 'What should SPOKY investigate next?',
  option_a: 'Questionable diner',
  option_b: 'Suspiciously photogenic bridge',
  votes_a: 38, votes_b: 42, status: 'open',
};

const ROUTES = [
  { id: 'nyc-la',   name: 'NYC → LA',              status: 'active', detail: 'Day 14 · Mile 1,247' },
  { id: 'route66',  name: 'Route 66 Classic',       status: 'soon'  },
  { id: 'pch',      name: 'Pacific Coast Highway',  status: 'soon'  },
  { id: 'ley-line', name: 'The Ley Line Trail',     status: 'soon', note: 'Phase 4' },
];

// ── HOOKS ────────────────────────────────────────────────────────────────────

function useWordReveal(text: string, msPerWord = 75) {
  const [revealed, setRevealed] = useState('');
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    setRevealed('');
    text.split(' ').forEach((word, i) => {
      timers.push(setTimeout(() => setRevealed(p => p ? `${p} ${word}` : word), i * msPerWord));
    });
    return () => timers.forEach(clearTimeout);
  }, [text]);
  return revealed;
}

// ── SUB-COMPONENTS ────────────────────────────────────────────────────────────

function CommentaryBox({ text, thinking }: { text: string; thinking: boolean }) {
  const revealed = useWordReveal(thinking ? '' : text, 75);
  return (
    <div style={{ paddingLeft: 16, borderLeft: `3px solid ${G}` }}>
      <div style={{ fontSize: 10, letterSpacing: 4, color: G, fontWeight: 600, marginBottom: 8, fontFamily: MONO }}>
        {thinking ? 'SPOKY · THINKING' : 'SPOKY · SPEAKING'}
      </div>
      <div style={{
        fontSize: 16, lineHeight: 1.65, fontStyle: 'italic',
        color: 'rgba(255,255,255,0.88)', fontFamily: SANS,
        minHeight: 52,
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      } as React.CSSProperties}>
        {thinking
          ? <span style={{ color: 'rgba(255,255,255,0.28)' }}>observing the road, professionally...</span>
          : revealed
        }
      </div>
    </div>
  );
}

function ChatDrawer({ open, onClose, chat }: { open: boolean; onClose: () => void; chat: ChatMsg[] }) {
  const dotColor = (src: string) => src === 'twitch' ? '#a78bfa' : src === 'platform' ? G : '#f97316';
  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: '60px', width: 320, zIndex: 50,
        background: 'rgba(8,8,8,0.94)', backdropFilter: 'blur(20px)',
        borderLeft: '1px solid rgba(255,255,255,0.06)',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 18px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <span style={{ fontSize: 10, letterSpacing: 4, color: 'rgba(255,255,255,0.35)', fontFamily: MONO }}>LIVE CHAT</span>
          <button onClick={onClose} style={{ color: 'rgba(255,255,255,0.35)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: '0 4px', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
          {chat.map((m, i) => (
            <div key={`${m.username}-${i}`} style={{ padding: '7px 18px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor(m.source), flexShrink: 0, marginTop: 7 }} />
              <div style={{ fontSize: 13, lineHeight: 1.45 }}>
                <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginRight: 6, fontFamily: MONO, fontSize: 12 }}>{m.username}</span>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>{m.message}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: '12px 18px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <input
            placeholder="say something..."
            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#fff', outline: 'none', fontFamily: SANS }}
          />
        </div>
      </div>
    </>
  );
}

function VoteModal({ vote, onVote, onClose }: { vote: Vote; onVote: (c: 'a' | 'b') => void; onClose: () => void }) {
  const total = Math.max(1, vote.votes_a + vote.votes_b);
  const pctA = Math.round((vote.votes_a / total) * 100);
  const pctB = 100 - pctA;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '40px 48px', maxWidth: 520, width: '90%', animation: 'milestoneIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both' }}>
        <div style={{ fontSize: 10, letterSpacing: 5, color: G, fontFamily: MONO, marginBottom: 18 }}>ROUTE VOTE</div>
        <div style={{ fontSize: 26, fontWeight: 700, marginBottom: 32, lineHeight: 1.3, fontFamily: DISPLAY }}>{vote.question}</div>
        {(['a', 'b'] as const).map(o => {
          const label = o === 'a' ? vote.option_a : vote.option_b;
          const pct = o === 'a' ? pctA : pctB;
          return (
            <button key={o} onClick={() => onVote(o)} style={{ display: 'block', width: '100%', marginBottom: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '16px 20px', cursor: 'pointer', textAlign: 'left', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, background: `${G}16`, width: `${pct}%`, transition: 'width 0.6s ease' }} />
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 16, color: '#fff', fontFamily: SANS }}>{label}</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: G, fontFamily: MONO }}>{pct}%</span>
              </div>
            </button>
          );
        })}
        <p style={{ marginTop: 16, fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center', fontFamily: MONO }}>
          or type !votea / !voteb in Twitch chat
        </p>
      </div>
    </div>
  );
}

function RouteSelector() {
  const [open, setOpen] = useState(false);
  const [notifyRoute, setNotifyRoute] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  return (
    <div style={{ position: 'absolute', top: 76, left: 28, zIndex: 20 }}>
      <button onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: PANEL, backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: 10, letterSpacing: 3, fontFamily: MONO }}>
        SPOKY&apos;S ROUTES
        <span style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', fontSize: 7, opacity: 0.5, display: 'inline-block' }}>▼</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 8, background: 'rgba(8,8,8,0.95)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '8px 0', minWidth: 260, animation: 'fadeIn 0.18s ease' }}>
          {ROUTES.map(r => (
            <div key={r.id}>
              <div style={{ padding: '10px 16px', cursor: r.status === 'soon' ? 'pointer' : 'default' }} onClick={() => r.status === 'soon' && setNotifyRoute(r.id === notifyRoute ? '' : r.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: r.status === 'active' ? G : 'rgba(255,255,255,0.15)', boxShadow: r.status === 'active' ? `0 0 8px ${G}` : 'none' }} />
                  <span style={{ fontSize: 13, color: r.status === 'active' ? '#fff' : 'rgba(255,255,255,0.35)', fontFamily: SANS }}>
                    {r.name}
                    {r.note && <span style={{ marginLeft: 6, fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>— {r.note}</span>}
                  </span>
                </div>
                {r.status === 'active' && r.detail && (
                  <div style={{ marginLeft: 17, marginTop: 2, fontSize: 11, color: G, fontFamily: MONO }}>{r.detail}</div>
                )}
                {r.status === 'soon' && (
                  <div style={{ marginLeft: 17, marginTop: 2, fontSize: 10, color: 'rgba(255,255,255,0.22)' }}>coming soon · tap to get notified</div>
                )}
              </div>
              {notifyRoute === r.id && (
                <div style={{ padding: '8px 16px 14px 33px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  {emailSent ? (
                    <p style={{ fontSize: 12, color: G, fontFamily: MONO }}>You&apos;re on the list.</p>
                  ) : (
                    <form onSubmit={e => { e.preventDefault(); setEmailSent(true); }} style={{ display: 'flex', gap: 8 }}>
                      <input type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)} placeholder="your@email.com" required style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '7px 10px', fontSize: 12, color: '#fff', outline: 'none' }} />
                      <button type="submit" style={{ background: G, color: '#000', border: 'none', borderRadius: 6, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Notify me</button>
                    </form>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HoldingScreen() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const tick = () => {
      const pt = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
      const next = new Date(pt);
      next.setHours(6, 0, 0, 0);
      if (pt >= next) next.setDate(next.getDate() + 1);
      const diff = next.getTime() - pt.getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0a0a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: SANS }}>
      <svg width="380" height="56" viewBox="0 0 380 56" style={{ marginBottom: 52, opacity: 0.35 }}>
        <path d="M18 28 C70 8, 130 48, 190 28 S300 8, 362 28" fill="none" stroke={G} strokeWidth="1.5" strokeLinecap="round" strokeDasharray="360" strokeDashoffset="360" style={{ animation: 'drawRoute 3.5s ease both infinite' }} />
        <circle cx="18" cy="28" r="3.5" fill="rgba(255,255,255,0.3)" />
        <circle cx="362" cy="28" r="3.5" fill="rgba(255,255,255,0.3)" />
      </svg>
      <div style={{ fontSize: 11, letterSpacing: 7, color: G, fontFamily: MONO, marginBottom: 22 }}>SPIRALING SPOKES</div>
      <h1 style={{ fontSize: 52, fontWeight: 400, fontFamily: DISPLAY, letterSpacing: -0.5, marginBottom: 14, textAlign: 'center', lineHeight: 1.1 }}>
        SPOKY IS RESTING
      </h1>
      <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.42)', marginBottom: 10, fontFamily: SANS }}>
        Back on the road at sunrise · Pacific Time
      </p>
      <div style={{ fontSize: 38, fontWeight: 300, fontFamily: MONO, color: G, marginBottom: 52, letterSpacing: 2 }}>
        {timeLeft}
      </div>
      <div style={{ maxWidth: 420, width: '100%', padding: '0 24px' }}>
        {sent ? (
          <p style={{ textAlign: 'center', color: G, fontFamily: MONO, fontSize: 14 }}>You&apos;re on the list.</p>
        ) : (
          <form onSubmit={e => { e.preventDefault(); setSent(true); }} style={{ display: 'flex', gap: 8 }}>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Notify me when SPOKY wakes up" required style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '14px 18px', fontSize: 14, color: '#fff', outline: 'none', fontFamily: SANS }} />
            <button type="submit" style={{ background: G, color: '#000', border: 'none', borderRadius: 10, padding: '14px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Wake me</button>
          </form>
        )}
      </div>
    </div>
  );
}

const STATE_MARKERS = [
  { label: 'NY', pct: 0  }, { label: 'PA', pct: 3  }, { label: 'OH', pct: 15 },
  { label: 'MO', pct: 30 }, { label: 'OK', pct: 47 }, { label: 'TX', pct: 53 },
  { label: 'NM', pct: 59 }, { label: 'AZ', pct: 74 }, { label: 'CA', pct: 100 },
];

function BottomBar({ scene, pct, onVoteOpen }: { scene: Partial<MockScene>; pct: number; onVoteOpen: () => void }) {
  const miles = Math.round(scene.miles ?? 0);
  return (
    <div style={{ height: 60, background: 'rgba(8,8,8,0.98)', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 0, flexShrink: 0 }}>
      {/* Route progress track */}
      <div style={{ flex: 1, marginRight: 28, minWidth: 0 }}>
        <div style={{ position: 'relative', height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2 }}>
          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: G, borderRadius: 2, boxShadow: `0 0 8px ${G}50`, transition: 'width 1.2s ease' }} />
          <div style={{ position: 'absolute', top: '50%', left: `${pct}%`, transform: 'translate(-50%,-50%)', width: 9, height: 9, borderRadius: '50%', background: G, boxShadow: `0 0 0 2.5px #0a0a0a, 0 0 8px ${G}`, animation: 'pulse-dot 1.4s ease-in-out infinite' }} />
          {STATE_MARKERS.map(m => (
            <div key={m.label} style={{ position: 'absolute', top: 7, left: `${m.pct}%`, transform: 'translateX(-50%)', fontSize: 9, color: 'rgba(255,255,255,0.2)', fontFamily: MONO, whiteSpace: 'nowrap' }}>{m.label}</div>
          ))}
        </div>
      </div>

      {/* Quick stats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginRight: 24, whiteSpace: 'nowrap' }}>
        {[['DAY', '14'], ['MILE', miles.toLocaleString()], ['WEATHER', scene.weather?.split(',')[0] ?? '—']].map(([lbl, val]) => (
          <div key={lbl} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 8, letterSpacing: 2, color: 'rgba(255,255,255,0.28)', fontFamily: MONO }}>{lbl}</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#fff', fontFamily: MONO }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <a href="https://buymeacoffee.com" target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 7, padding: '6px 13px', fontSize: 12, color: 'rgba(255,255,255,0.6)', textDecoration: 'none', fontFamily: SANS, whiteSpace: 'nowrap' }}>☕ Buy SPOKY a coffee</a>
        <button onClick={onVoteOpen} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: `${G}14`, border: `1px solid ${G}35`, borderRadius: 7, padding: '6px 13px', fontSize: 12, color: G, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap' }}>🗳️ Vote</button>
        <a href="/sponsors" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 7, padding: '6px 13px', fontSize: 12, color: 'rgba(255,255,255,0.6)', textDecoration: 'none', fontFamily: SANS, whiteSpace: 'nowrap' }}>📍 Sponsor a mile</a>
      </div>
    </div>
  );
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

export default function CompanionSite() {
  const [scene, setScene]       = useState<Partial<MockScene>>(mockSceneLibrary[0]);
  const [image, setImage]       = useState(INITIAL_IMAGE);
  const [prevImage, setPrevImage] = useState<string | null>(null);
  const [prevOpacity, setPrevOpacity] = useState(0);
  const [commentary, setCommentary] = useState(commentaryForScene(mockSceneLibrary[0], mockChatMessages, 0));
  const [isThinking, setIsThinking] = useState(false);
  const [chat, setChat]         = useState<ChatMsg[]>([...mockChatMessages]);
  const [chatOpen, setChatOpen] = useState(false);
  const [voteOpen, setVoteOpen] = useState(false);
  const [vote, setVote]         = useState<Vote>(INITIAL_VOTE);
  const [soundOn, setSoundOn]   = useState(false);
  const [isResting]             = useState(false);

  const indexRef   = useRef(0);
  const wsWorked   = useRef(false);
  const currentImg = useRef(INITIAL_IMAGE);
  const soundRef   = useRef<AmbientSoundRef>(null);

  const pct = scene.miles != null && scene.milesRemaining != null
    ? (scene.miles / (scene.miles + scene.milesRemaining)) * 100 : 0;

  const headingLabel = (h: number) => h < 45 || h > 315 ? 'N' : h < 135 ? 'E' : h < 225 ? 'S' : 'W';

  const applyScene = useCallback((sc: MockScene, i: number) => {
    const nextImage = sceneImageUrl(sc, GMAPS_KEY);
    setPrevImage(currentImg.current);
    setPrevOpacity(1);
    setTimeout(() => setPrevOpacity(0), 40);
    currentImg.current = nextImage;
    setImage(nextImage);
    setScene(sc);
    setIsThinking(true);
    setTimeout(() => {
      setCommentary(commentaryForScene(sc, mockChatMessages, i));
      setIsThinking(false);
    }, 900);
    if (i % 2 === 0) {
      setChat(prev => [...prev.slice(-50), mockChatMessages[i % mockChatMessages.length]]);
    }
  }, []);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    const fallback = setTimeout(() => {
      if (wsWorked.current) return;
      const id = setInterval(() => {
        indexRef.current = (indexRef.current + 1) % mockSceneLibrary.length;
        applyScene(mockSceneLibrary[indexRef.current], indexRef.current);
      }, 8000);
      return () => clearInterval(id);
    }, 1200);
    ws.onmessage = (e) => {
      wsWorked.current = true;
      const { type, payload } = JSON.parse(e.data) as { type: string; payload: Record<string,unknown> };
      if (type === 'NEW_FRAME') {
        const p = payload as Partial<MockScene>;
        const sc = mockSceneLibrary.find(s => s.image === p.image) ?? { ...mockSceneLibrary[0], ...p } as MockScene;
        applyScene(sc, Number(p.miles ?? 0));
      }
      if (type === 'VOTE_OPEN' || type === 'VOTE_UPDATE') setVote(payload as unknown as Vote);
    };
    ws.onclose = ws.onerror = () => {};
    return () => { clearTimeout(fallback); ws.close(); };
  }, [applyScene]);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    soundRef.current?.toggle(next);
  };

  const handleVote = (choice: 'a' | 'b') => {
    setVote(v => ({ ...v, votes_a: v.votes_a + (choice === 'a' ? 1 : 0), votes_b: v.votes_b + (choice === 'b' ? 1 : 0) }));
    setVoteOpen(false);
  };

  if (isResting) return <HoldingScreen />;

  const heading = Math.round(scene.heading ?? 0);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0a0a', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <AmbientSound ref={soundRef} sceneType={scene.sceneType ?? ''} />

      {/* ── FRAME AREA ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>

        {/* Previous frame — crossfades out */}
        {prevImage && (
          <img src={prevImage} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: prevOpacity, transition: 'opacity 400ms ease', zIndex: 1 }} />
        )}

        {/* Current frame */}
        <img key={image} src={image} alt="SPOKY route" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 2, animation: 'crossfadeIn 400ms ease both' }} />

        {/* Vignette */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none', background: 'radial-gradient(ellipse at center, transparent 54%, rgba(0,0,0,0.26) 100%)' }} />

        {/* Top gradient (header legibility) */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '18%', zIndex: 3, pointerEvents: 'none', background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 100%)' }} />

        {/* Bottom gradient (overlay legibility) */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '42%', zIndex: 3, pointerEvents: 'none', background: 'linear-gradient(to top, rgba(0,0,0,0.74) 0%, rgba(0,0,0,0.36) 45%, transparent 100%)' }} />

        {/* ── FLOATING HEADER ── */}
        <header style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '22px 28px' }}>
          {/* Wordmark */}
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: 3, color: '#fff', fontFamily: DISPLAY, textTransform: 'uppercase', lineHeight: 1 }}>
              Spiraling Spokes
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', fontStyle: 'italic', fontFamily: DISPLAY, marginTop: 3 }}>
              a journey less traveled
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button onClick={toggleSound} style={{ background: 'none', border: 'none', cursor: 'pointer', color: soundOn ? G : 'rgba(255,255,255,0.38)', fontSize: 17, padding: '4px 6px', transition: 'color 0.2s' }} title={soundOn ? 'Mute ambient' : 'Play ambient'}>
              {soundOn ? '🔈' : '🔇'}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.4)', fontSize: 12, fontFamily: MONO }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', display: 'inline-block', animation: 'pulse-dot 1.8s ease-in-out infinite' }} />
              148
            </div>

            <button onClick={() => setChatOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: chatOpen ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', color: 'rgba(255,255,255,0.65)', fontSize: 13, fontFamily: SANS, transition: 'background 0.2s' }}>
              💬 <span style={{ fontFamily: MONO, fontSize: 12 }}>148</span>
            </button>

            <a href={`https://twitch.tv/${TWITCH_CHANNEL}`} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: G, color: '#000', borderRadius: 8, padding: '8px 18px', fontSize: 11, fontWeight: 700, letterSpacing: 1, textDecoration: 'none', fontFamily: SANS, whiteSpace: 'nowrap' }}>
              WATCH ON TWITCH →
            </a>
          </div>
        </header>

        {/* ── BOTTOM OVERLAY ── */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10, padding: '0 28px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24 }}>
          {/* Left: location + journey narrative */}
          <div style={{ flex: 1, maxWidth: 580 }}>
            <div style={{ fontSize: 10, letterSpacing: 6, color: G, fontFamily: MONO, fontWeight: 500, marginBottom: 10 }}>SPOKY IS IN</div>
            <div style={{ fontSize: 46, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1, fontFamily: DISPLAY, textShadow: '0 2px 28px rgba(0,0,0,0.9)', marginBottom: 9 }}>
              {scene.city},&nbsp;<span style={{ color: 'rgba(255,255,255,0.55)' }}>{scene.state}</span>
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontFamily: SANS, marginBottom: 4 }}>
              {scene.roadName} · Heading {headingLabel(heading)}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', fontFamily: MONO, marginBottom: 20 }}>
              {scene.weather}
            </div>
            {/* Progress */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 180, height: 2, background: 'rgba(255,255,255,0.1)', borderRadius: 1 }}>
                <div style={{ height: '100%', width: `${pct}%`, background: G, borderRadius: 1, boxShadow: `0 0 6px ${G}80`, transition: 'width 1.2s ease' }} />
              </div>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', fontFamily: MONO, whiteSpace: 'nowrap' }}>
                Mile {Math.round(scene.miles ?? 0).toLocaleString()} of 3,100 · Day 14
              </span>
            </div>
          </div>

          {/* Right: commentary */}
          <div style={{ maxWidth: 420, flexShrink: 0 }}>
            <CommentaryBox text={commentary} thinking={isThinking} />
          </div>
        </div>

        {/* Route selector */}
        <RouteSelector />

        {/* Chat drawer */}
        <ChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} chat={chat} />
      </div>

      {/* ── BOTTOM BAR ── */}
      <BottomBar scene={scene} pct={pct} onVoteOpen={() => setVoteOpen(true)} />

      {/* ── VOTE MODAL ── */}
      {voteOpen && <VoteModal vote={vote} onVote={handleVote} onClose={() => setVoteOpen(false)} />}
    </div>
  );
}
