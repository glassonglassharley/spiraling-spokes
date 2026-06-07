'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { commentaryForScene, demoRoutePresets, mockChatMessages, mockSceneLibrary, type MockScene } from '../../lib/demo';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8080/ws';
const GMAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

type FramePayload = MockScene & { frameUrl?: string | null; lat?: number; lng?: number };
interface ChatMsg { username: string; message: string; source: string; }

const G = '#4ade80';
const MONO = "'DM Mono', monospace";
const SANS = "'DM Sans', system-ui, sans-serif";
const DISPLAY = "'Playfair Display', serif";

// ── HOOKS ────────────────────────────────────────────────────────────────────

function useWordReveal(text: string, msPerWord = 80) {
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

// ── COMPONENTS ────────────────────────────────────────────────────────────────

function LiveBadge({ count }: { count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#ef4444', display: 'inline-block', boxShadow: '0 0 8px #ef4444', animation: 'pulse-live 1.8s ease infinite' }} />
        <span style={{ fontWeight: 800, letterSpacing: 3, fontSize: 13, fontFamily: MONO }}>LIVE</span>
      </div>
      <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, fontFamily: SANS }}>
        {count.toLocaleString()} watching
      </span>
    </div>
  );
}

function MiniMap({ pct, scene }: { pct: number; scene: Partial<FramePayload> }) {
  const miles = Math.round(scene.miles ?? 0);
  const { lat, lng } = scene;

  if (lat != null && lng != null && GMAPS_KEY) {
    const styles = [
      'feature:all|element:labels.text.fill|color:0x9ca3af',
      'feature:all|element:labels.text.stroke|color:0x020617',
      'feature:road|element:geometry|color:0x374151',
      'feature:road.highway|element:geometry|color:0x4b5563',
      'feature:water|element:geometry|color:0x0c1a2e',
      'feature:landscape|element:geometry|color:0x111827',
      'feature:poi|visibility:off',
      'feature:transit|visibility:off',
    ].map(s => `style=${encodeURIComponent(s)}`).join('&');
    const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=9&size=600x360&maptype=roadmap&markers=color:0xfacc15|size:small|${lat},${lng}&${styles}&key=${GMAPS_KEY}`;
    return (
      <div style={{ width: 300, borderRadius: 14, overflow: 'hidden', border: `1px solid rgba(74,222,128,.18)`, boxShadow: '0 20px 50px rgba(0,0,0,.7)', background: 'rgba(2,6,23,.95)' }}>
        <img src={mapUrl} alt="Route map" width={300} style={{ display: 'block', width: '100%' }} />
        <div style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 9, letterSpacing: 3, color: G, fontFamily: MONO, fontWeight: 600 }}>ROUTE PROGRESS</span>
          <span style={{ fontSize: 12, color: '#facc15', fontWeight: 700, fontFamily: MONO }}>Mile {miles.toLocaleString()}</span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,.38)', fontFamily: MONO }}>{Math.round(pct)}%</span>
        </div>
      </div>
    );
  }

  const dotX = 16 + pct * 1.96;
  const dotY = 72 - Math.sin((pct / 100) * Math.PI) * 38;
  return (
    <div style={{ width: 300, borderRadius: 14, background: 'linear-gradient(135deg,rgba(2,6,23,.95),rgba(10,18,42,.95))', border: `1px solid rgba(74,222,128,.18)`, padding: '16px 18px', boxShadow: '0 20px 50px rgba(0,0,0,.7)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 9, letterSpacing: 3, color: G, fontFamily: MONO, fontWeight: 600 }}>ROUTE PROGRESS</span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,.42)', fontFamily: MONO }}>{Math.round(pct)}%</span>
      </div>
      <svg viewBox="0 0 230 80" width="100%" style={{ overflow: 'visible' }}>
        <path d="M16 72 C48 22 80 58 112 36 S170 12 214 44" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M16 72 C48 22 80 58 112 36 S170 12 214 44" fill="none" stroke={G} strokeWidth="4.5" strokeLinecap="round" strokeDasharray={`${Math.max(0, pct * 2.26)} 240`} />
        <circle cx={8} cy={72} r={3.5} fill="rgba(255,255,255,.35)" />
        <circle cx={214} cy={44} r={3.5} fill="rgba(255,255,255,.35)" />
        <circle cx={dotX} cy={dotY} r={7} fill="#facc15" style={{ filter: 'drop-shadow(0 0 5px rgba(250,204,21,.8))' }} />
      </svg>
      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,.4)', fontFamily: MONO }}>
        <span>NY</span>
        <span style={{ color: '#facc15', fontWeight: 700 }}>Mile {miles.toLocaleString()}</span>
        <span>CA</span>
      </div>
    </div>
  );
}

function CommentaryBox({ text, thinking }: { text: string; thinking: boolean }) {
  const revealed = useWordReveal(thinking ? '' : text, 80);
  return (
    <div style={{ maxWidth: 860, borderLeft: `4px solid ${G}`, background: 'rgba(2,6,23,.8)', borderRadius: '0 12px 12px 0', padding: '16px 22px', backdropFilter: 'blur(6px)' }}>
      <div style={{ fontSize: 10, letterSpacing: 5, color: G, fontFamily: MONO, fontWeight: 700, marginBottom: 8 }}>
        {thinking ? 'SPOKY · THINKING' : 'SPOKY · SPEAKING'}
      </div>
      <div style={{ fontSize: 24, lineHeight: 1.5, fontStyle: 'italic', minHeight: 72, maxHeight: 108, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', fontFamily: SANS } as React.CSSProperties}>
        {thinking
          ? <span style={{ color: 'rgba(255,255,255,.3)' }}>looking at the road, professionally...</span>
          : revealed
        }
      </div>
    </div>
  );
}

// Pure-CSS confetti — 12 particles, varied colors + timing
function ConfettiParticles() {
  const particles = [
    { x: 15,  color: G,         delay: 0,    dur: 2.8 },
    { x: 28,  color: '#facc15', delay: 0.2,  dur: 2.4 },
    { x: 42,  color: '#60a5fa', delay: 0.05, dur: 3.1 },
    { x: 55,  color: '#f472b6', delay: 0.35, dur: 2.6 },
    { x: 65,  color: G,         delay: 0.15, dur: 2.9 },
    { x: 72,  color: '#facc15', delay: 0.4,  dur: 2.3 },
    { x: 30,  color: '#a78bfa', delay: 0.6,  dur: 3.2 },
    { x: 50,  color: '#f97316', delay: 0.1,  dur: 2.7 },
    { x: 80,  color: G,         delay: 0.45, dur: 2.5 },
    { x: 20,  color: '#60a5fa', delay: 0.3,  dur: 3.0 },
    { x: 60,  color: '#f472b6', delay: 0.55, dur: 2.4 },
    { x: 88,  color: '#facc15', delay: 0.25, dur: 2.8 },
  ];
  return (
    <>
      {particles.map((p, i) => (
        <div key={i} style={{
          position: 'absolute', top: 0, left: `${p.x}%`,
          width: 10, height: 10, borderRadius: 2, background: p.color,
          animation: `confettiFall ${p.dur}s ease-in ${p.delay}s both`,
          zIndex: 110,
        }} />
      ))}
    </>
  );
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

export default function StreamCanvas() {
  const [frame, setFrame]       = useState<Partial<FramePayload>>(mockSceneLibrary[0]);
  const [prevImage, setPrevImage] = useState<string | null>(null);
  const [image, setImage]       = useState(mockSceneLibrary[0].image);
  const [commentary, setCommentary] = useState(commentaryForScene(mockSceneLibrary[0], mockChatMessages, 0));
  const [isThinking, setIsThinking] = useState(false);
  const [chat, setChat]         = useState<ChatMsg[]>(mockChatMessages.slice(0, 6));
  const [viewerCount, setViewerCount] = useState(148);
  const [milestone, setMilestone] = useState<{ name: string; desc?: string } | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [dayCount]  = useState(14);
  const [milesToday] = useState(89);

  const indexRef    = useRef(0);
  const wsWorked    = useRef(false);
  const isPausedRef = useRef(false);
  const currentImg  = useRef(mockSceneLibrary[0].image);

  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

  const pct = frame.miles != null && frame.milesRemaining != null
    ? (frame.miles / (frame.miles + frame.milesRemaining)) * 100 : 0;

  const applyScene = useCallback((scene: MockScene, i: number) => {
    setPrevImage(currentImg.current);
    currentImg.current = scene.image;
    setImage(scene.image);
    setFrame(scene);
    setIsThinking(true);
    setTimeout(() => {
      setCommentary(commentaryForScene(scene, mockChatMessages, i));
      setIsThinking(false);
    }, 900);
    if (scene.isMilestone && scene.milestoneName) {
      setMilestone({ name: scene.milestoneName });
      setTimeout(() => setMilestone(null), 8000);
    }
    if (i % 2 === 0) setChat(prev => [...prev.slice(-7), mockChatMessages[i % mockChatMessages.length]]);
    setViewerCount(n => Math.max(80, n + ((i % 3) - 1) * 7 + 11));
  }, []);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    const fallback = setTimeout(() => {
      if (wsWorked.current) return;
      const id = setInterval(() => {
        if (isPausedRef.current) return;
        indexRef.current = (indexRef.current + 1) % mockSceneLibrary.length;
        applyScene(mockSceneLibrary[indexRef.current], indexRef.current);
      }, 5200);
      (window as unknown as { __axleMockInterval?: ReturnType<typeof setInterval> }).__axleMockInterval = id;
    }, 1400);

    ws.onmessage = (e) => {
      wsWorked.current = true;
      const { type, payload } = JSON.parse(e.data) as { type: string; payload: Record<string,unknown> };
      if (type === 'NEW_FRAME') {
        const p = payload as Partial<FramePayload>;
        const scene = mockSceneLibrary.find(s => s.image === p.frameUrl) ??
          ({ ...mockSceneLibrary[indexRef.current], ...p, image: String(p.frameUrl ?? mockSceneLibrary[indexRef.current].image) } as MockScene);
        applyScene(scene, Number(p.miles ?? indexRef.current));
        indexRef.current = (indexRef.current + 1) % mockSceneLibrary.length;
      }
      if (type === 'COMMENTARY') {
        const p = payload as { text?: string; thinking?: boolean };
        setIsThinking(!!p.thinking);
        if (p.text && !p.thinking) setCommentary(p.text);
      }
      if (type === 'CHAT_MESSAGE' || type === 'CHAT_RESPONSE')
        setChat(prev => [...prev.slice(-7), payload as unknown as ChatMsg]);
      if (type === 'VIEWER_COUNT') setViewerCount(Number((payload as { count: number }).count));
      if (type === 'RIDER_PAUSED')  { setIsPaused(true);  isPausedRef.current = true;  }
      if (type === 'RIDER_RESUMED') { setIsPaused(false); isPausedRef.current = false; }
      if (type === 'MILESTONE') setMilestone({ name: String((payload as { name: string }).name) });
    };

    return () => {
      clearTimeout(fallback);
      ws.close();
      const g = window as unknown as { __axleMockInterval?: ReturnType<typeof setInterval> };
      if (g.__axleMockInterval) { clearInterval(g.__axleMockInterval); g.__axleMockInterval = undefined; }
    };
  }, [applyScene]);

  const heading = Math.round(frame.heading ?? 0);

  return (
    <div id="stream-root" style={{ width: 1920, height: 1080, position: 'relative', overflow: 'hidden', background: '#020617', color: '#fff', fontFamily: SANS }}>

      {/* Background frames — crossfade */}
      {prevImage && (
        <img src={prevImage} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.3, zIndex: 0 }} />
      )}
      <img key={image} src={image} alt="SPOKY route frame" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 1, animation: 'frameIn .65s cubic-bezier(.4,0,.2,1) both' }} />

      {/* Cinematic overlays */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(2,6,23,.78) 0%, rgba(2,6,23,.08) 28%, rgba(2,6,23,.04) 55%, rgba(2,6,23,.74) 100%)' }} />
      <div style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none', background: 'radial-gradient(ellipse at center, transparent 52%, rgba(2,6,23,.52) 100%)' }} />

      {/* ── TOP BAR ── */}
      <div style={{ position: 'absolute', top: 32, left: 44, right: 44, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>

        {/* Left: wordmark */}
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 3, color: '#fff', fontFamily: DISPLAY, textTransform: 'uppercase', lineHeight: 1 }}>
            Spiraling Spokes
          </div>
          <div style={{ fontSize: 13, fontStyle: 'italic', color: 'rgba(255,255,255,0.42)', fontFamily: DISPLAY, marginTop: 4 }}>
            a journey less traveled
          </div>
        </div>

        {/* Center: current location (cinematic) */}
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', textAlign: 'center', top: 0 }}>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: 6, lineHeight: 1.1, textShadow: '0 2px 20px rgba(0,0,0,.85)', fontFamily: DISPLAY, textTransform: 'uppercase' }}>
            {frame.city} · <span style={{ color: 'rgba(255,255,255,.6)' }}>{frame.state}</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 14, color: 'rgba(255,255,255,.48)', letterSpacing: 2, fontFamily: MONO }}>
            {frame.roadName} · {heading}° · {frame.sceneType}
          </div>
          <div style={{ marginTop: 4, fontSize: 13, color: '#93c5fd', fontFamily: MONO }}>{frame.weather}</div>
        </div>

        {/* Right: live + counters */}
        <div style={{ textAlign: 'right' }}>
          <LiveBadge count={viewerCount} />
          <div style={{ marginTop: 18, display: 'flex', gap: 22, justifyContent: 'flex-end' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1, fontFamily: MONO }}>DAY {dayCount}</div>
              <div style={{ fontSize: 10, letterSpacing: 2, color: 'rgba(255,255,255,.4)', marginTop: 2, fontFamily: MONO }}>OF TRIP</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1, fontFamily: MONO }}>{milesToday}</div>
              <div style={{ fontSize: 10, letterSpacing: 2, color: 'rgba(255,255,255,.4)', marginTop: 2, fontFamily: MONO }}>MI TODAY</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── BOTTOM LEFT: SPOKY label + miles + commentary ── */}
      <div style={{ position: 'absolute', left: 44, bottom: 44, zIndex: 10 }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 10, color: G, letterSpacing: 6, fontFamily: MONO, fontWeight: 700, marginBottom: 6 }}>SPOKY</div>
          <div style={{ fontSize: 60, fontWeight: 900, lineHeight: 1, fontFamily: MONO }}>
            {Math.round(frame.miles ?? 0).toLocaleString()}
          </div>
          <div style={{ fontSize: 11, letterSpacing: 3, color: 'rgba(255,255,255,.38)', marginTop: 4, fontFamily: MONO }}>MILES · NYC → LA</div>
        </div>
        <CommentaryBox text={commentary} thinking={isThinking} />
      </div>

      {/* ── BOTTOM RIGHT: mini map + chat ── */}
      <div style={{ position: 'absolute', right: 44, bottom: 44, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 16 }}>
        <MiniMap pct={pct} scene={frame} />

        {/* Chat ticker */}
        <div style={{ width: 350, background: 'rgba(2,6,23,.72)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 12, padding: '12px 14px', backdropFilter: 'blur(8px)' }}>
          <div style={{ fontSize: 9, letterSpacing: 3, color: 'rgba(255,255,255,.35)', fontFamily: MONO, fontWeight: 600, marginBottom: 10 }}>LIVE CHAT</div>
          {chat.slice(-6).map((m, i) => (
            <div key={`${m.username}-${i}`} style={{ marginBottom: 7, fontSize: 15, lineHeight: 1.35 }}>
              <span style={{ fontWeight: 700, marginRight: 6, color: m.source === 'twitch' ? '#a78bfa' : m.source === 'axle' ? G : '#60a5fa', fontFamily: MONO }}>
                {m.username}
              </span>
              <span style={{ color: 'rgba(255,255,255,.75)' }}>{m.message}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── PROGRESS BAR ── */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'rgba(255,255,255,.06)', zIndex: 10 }}>
        <div style={{ height: '100%', background: G, width: `${pct}%`, transition: 'width 900ms ease', boxShadow: `0 0 10px ${G}90` }} />
      </div>

      {/* ── MILESTONE OVERLAY ── */}
      {milestone && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(2,6,23,.7)', animation: 'fadeIn-fast .5s ease both', zIndex: 100, overflow: 'hidden' }}>
          <ConfettiParticles />
          <div style={{ textAlign: 'center', position: 'relative', zIndex: 5 }}>
            <div style={{ fontSize: 12, letterSpacing: 10, color: G, fontFamily: MONO, fontWeight: 700, marginBottom: 24, animation: 'fadeIn-fast .6s ease .1s both' }}>MILESTONE REACHED</div>
            <div style={{ fontSize: 96, fontWeight: 900, lineHeight: 1.05, textShadow: '0 16px 72px rgba(0,0,0,.95)', maxWidth: 1400, textAlign: 'center', animation: 'milestoneIn .7s cubic-bezier(.34,1.56,.64,1) .15s both', fontFamily: DISPLAY }}>
              {milestone.name}
            </div>
            {milestone.desc && (
              <div style={{ fontSize: 28, color: 'rgba(255,255,255,.55)', marginTop: 20, animation: 'fadeIn-fast .5s ease .4s both' }}>{milestone.desc}</div>
            )}
          </div>
        </div>
      )}

      {/* ── PAUSE OVERLAY ── */}
      {isPaused && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(2,6,23,.9)', zIndex: 100 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 72 }}>⏸</div>
            <div style={{ fontSize: 44, fontWeight: 900, marginTop: 16, fontFamily: DISPLAY }}>SPOKY is taking a break</div>
            <div style={{ fontSize: 18, color: 'rgba(255,255,255,.42)', marginTop: 10, fontFamily: SANS }}>Back soon — probably just admiring something</div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes frameIn { from { opacity: .04; transform: scale(1.01) } to { opacity: 1; transform: scale(1) } }
        @keyframes fadeIn-fast { from { opacity: 0 } to { opacity: 1 } }
        @keyframes milestoneIn { from { opacity: 0; transform: scale(.88) } to { opacity: 1; transform: scale(1) } }
        @keyframes confettiFall { 0% { transform: translateY(-20px) rotate(0deg); opacity: 1; } 100% { transform: translateY(1200px) rotate(720deg); opacity: 0; } }
        @keyframes pulse-live { 0% { box-shadow: 0 0 0 0 rgba(239,68,68,.7) } 70% { box-shadow: 0 0 0 10px rgba(239,68,68,0) } 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0) } }
        @keyframes pulse-dot  { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
      `}</style>
    </div>
  );
}
