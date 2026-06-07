'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  commentaryForScene,
  demoRoutePresets,
  mockChatMessages,
  mockSceneLibrary,
  type MockScene,
} from '../../../../shared/mock/demo';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8080/ws';
const MOCK_SPONSOR = { name: 'Trail Mix Co.', tagline: 'Fuel for every mile' };
const GMAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

type FramePayload = MockScene & { frameUrl?: string | null; roadName?: string | null; lat?: number; lng?: number };
interface ChatMsg { username: string; message: string; source: string; }

function useWordReveal(text: string, msPerWord = 80) {
  const [revealed, setRevealed] = useState('');
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    setRevealed('');
    text.split(' ').forEach((word, i) => {
      timers.push(setTimeout(() => setRevealed((p) => (p ? `${p} ${word}` : word)), i * msPerWord));
    });
    return () => timers.forEach(clearTimeout);
  }, [text, msPerWord]);
  return revealed;
}

function LiveBadge({ count }: { count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 10, height: 10, borderRadius: '50%', background: '#ef4444',
          display: 'inline-block', boxShadow: '0 0 0 0 rgba(239,68,68,.7)',
          animation: 'pulse-live 1.8s ease infinite',
        }} />
        <span style={{ fontWeight: 900, letterSpacing: 3, fontSize: 14 }}>LIVE</span>
      </div>
      <span style={{ color: 'rgba(255,255,255,.65)', fontSize: 15 }}>
        {count.toLocaleString()} watching
      </span>
    </div>
  );
}

function MiniMap({ pct, scene }: { pct: number; scene: Partial<FramePayload> }) {
  const miles = Math.round(scene.miles ?? 0);
  const lat = scene.lat;
  const lng = scene.lng;

  // Real Google Maps Static map when we have coordinates and a key
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
    ].map((s) => `style=${encodeURIComponent(s)}`).join('&');

    const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?`
      + `center=${lat},${lng}&zoom=9&size=400x220&maptype=roadmap`
      + `&markers=color:0xfacc15|size:small|${lat},${lng}`
      + `&${styles}`
      + `&key=${GMAPS_KEY}`;

    return (
      <div style={{
        width: 280, borderRadius: 14, overflow: 'hidden',
        border: '1px solid rgba(93,200,154,.22)',
        boxShadow: '0 24px 56px rgba(0,0,0,.7)',
        background: 'rgba(2,6,23,.95)',
      }}>
        <img src={mapUrl} alt="Route map" width={280} style={{ display: 'block', width: '100%' }} />
        <div style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10, letterSpacing: 3, color: '#5dc89a', fontWeight: 900 }}>ROUTE PROGRESS</span>
          <span style={{ fontSize: 12, color: '#facc15', fontWeight: 700 }}>Mile {miles.toLocaleString()}</span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,.4)' }}>{Math.round(pct)}%</span>
        </div>
      </div>
    );
  }

  // SVG mock map fallback (mock mode or no key)
  const dotX = 16 + pct * 1.98;
  const dotY = 72 - Math.sin((pct / 100) * Math.PI) * 40;
  return (
    <div style={{
      width: 280, borderRadius: 14,
      background: 'linear-gradient(135deg,rgba(2,6,23,.95),rgba(10,18,42,.95))',
      border: '1px solid rgba(93,200,154,.22)',
      padding: '16px 18px',
      boxShadow: '0 24px 56px rgba(0,0,0,.7)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 10, letterSpacing: 3, color: '#5dc89a', fontWeight: 900 }}>ROUTE PROGRESS</span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>{Math.round(pct)}%</span>
      </div>
      <svg viewBox="0 0 230 80" width="100%" style={{ overflow: 'visible' }}>
        <path d="M16 72 C48 22 80 58 112 36 S170 12 214 44"
          fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="5" strokeLinecap="round" />
        <path d="M16 72 C48 22 80 58 112 36 S170 12 214 44"
          fill="none" stroke="#5dc89a" strokeWidth="5" strokeLinecap="round"
          strokeDasharray={`${Math.max(0, pct * 2.26)} 240`} />
        <circle cx={8} cy={72} r={4} fill="rgba(255,255,255,.4)" />
        <circle cx={214} cy={44} r={4} fill="rgba(255,255,255,.4)" />
        <circle cx={dotX} cy={dotY} r={7} fill="#facc15" style={{ filter: 'drop-shadow(0 0 4px rgba(250,204,21,.8))' }} />
      </svg>
      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,.5)' }}>
        <span>NY</span>
        <span style={{ color: '#facc15', fontWeight: 700 }}>Mile {miles.toLocaleString()}</span>
        <span>CA</span>
      </div>
      <div style={{ marginTop: 6, textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,.35)' }}>
        {Math.round(scene.milesRemaining ?? 0).toLocaleString()} mi remaining
      </div>
    </div>
  );
}

function CommentaryBox({ text, thinking }: { text: string; thinking: boolean }) {
  const revealed = useWordReveal(thinking ? '' : text, 80);
  return (
    <div style={{
      maxWidth: 860, background: 'rgba(2,6,23,.82)',
      borderLeft: '4px solid #5dc89a', borderRadius: '0 12px 12px 0',
      padding: '16px 22px', backdropFilter: 'blur(4px)',
    }}>
      <div style={{ fontSize: 10, letterSpacing: 4, color: '#5dc89a', fontWeight: 900, marginBottom: 8 }}>
        {thinking ? 'SPOKY · THINKING' : 'SPOKY · SPEAKING'}
      </div>
      <div style={{
        fontSize: 24, lineHeight: 1.5, fontStyle: 'italic',
        minHeight: 72, maxHeight: 108, overflow: 'hidden',
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
      } as React.CSSProperties}>
        {thinking
          ? <span style={{ color: 'rgba(255,255,255,.35)' }}>looking at the road, professionally...</span>
          : revealed
        }
      </div>
    </div>
  );
}

export default function StreamCanvas() {
  const [frame, setFrame] = useState<Partial<FramePayload>>(mockSceneLibrary[0]);
  const [prevImage, setPrevImage] = useState<string | null>(null);
  const [image, setImage] = useState(mockSceneLibrary[0].image);
  const [commentary, setCommentary] = useState(commentaryForScene(mockSceneLibrary[0], mockChatMessages, 0));
  const [isThinking, setIsThinking] = useState(false);
  const [chat, setChat] = useState<ChatMsg[]>(mockChatMessages.slice(0, 6));
  const [viewerCount, setViewerCount] = useState(148);
  const [milestone, setMilestone] = useState<{ name: string; desc?: string } | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [dayCount] = useState(14);
  const [milesToday] = useState(89);

  const indexRef = useRef(0);
  const wsWorked = useRef(false);
  const isPausedRef = useRef(false);
  const currentImageRef = useRef(mockSceneLibrary[0].image);

  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

  const pct = frame.miles != null && frame.milesRemaining != null
    ? (frame.miles / (frame.miles + frame.milesRemaining)) * 100 : 0;

  const applyScene = useCallback((scene: MockScene, i: number) => {
    setPrevImage(currentImageRef.current);
    currentImageRef.current = scene.image;
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
    if (i % 2 === 0) setChat((prev) => [...prev.slice(-7), mockChatMessages[i % mockChatMessages.length]]);
    setViewerCount((n) => Math.max(80, n + ((i % 3) - 1) * 7 + 11));
  }, []);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    const fallbackTimer = setTimeout(() => {
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
      const { type, payload } = JSON.parse(e.data) as { type: string; payload: Record<string, unknown> };
      if (type === 'NEW_FRAME') {
        const p = payload as Partial<FramePayload>;
        const scene = mockSceneLibrary.find((s) => s.image === p.frameUrl) ??
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
        setChat((prev) => [...prev.slice(-7), payload as unknown as ChatMsg]);
      if (type === 'VIEWER_COUNT') setViewerCount(Number((payload as { count: number }).count));
      if (type === 'RIDER_PAUSED') { setIsPaused(true); isPausedRef.current = true; }
      if (type === 'RIDER_RESUMED') { setIsPaused(false); isPausedRef.current = false; }
      if (type === 'MILESTONE') setMilestone({ name: String((payload as { name: string }).name) });
    };

    return () => {
      clearTimeout(fallbackTimer);
      ws.close();
      const g = window as unknown as { __axleMockInterval?: ReturnType<typeof setInterval> };
      if (g.__axleMockInterval) { clearInterval(g.__axleMockInterval); g.__axleMockInterval = undefined; }
    };
  }, [applyScene]);

  const heading = Math.round(frame.heading ?? 0);

  return (
    <div id="stream-root" style={{
      width: 1920, height: 1080, position: 'relative', overflow: 'hidden',
      background: '#020617', color: '#fff',
      fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
    }}>
      {/* Background frames */}
      {prevImage && (
        <img src={prevImage} alt="" style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', opacity: 0.45,
        }} />
      )}
      <img src={image} alt="AXLE route frame" style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        objectFit: 'cover', animation: 'frameIn .7s cubic-bezier(.4,0,.2,1) both',
      }} />

      {/* Cinematic gradient overlays */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, rgba(2,6,23,.78) 0%, rgba(2,6,23,.1) 28%, rgba(2,6,23,.05) 55%, rgba(2,6,23,.72) 100%)',
        pointerEvents: 'none',
      }} />
      {/* Side vignettes */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at center, transparent 55%, rgba(2,6,23,.55) 100%)',
        pointerEvents: 'none',
      }} />

      {/* ── TOP BAR ── */}
      <div style={{ position: 'absolute', top: 32, left: 40, right: 40, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {/* Left: location */}
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            background: 'rgba(2,6,23,.72)', border: '1px solid rgba(93,200,154,.28)',
            borderRadius: 999, padding: '8px 18px', backdropFilter: 'blur(8px)',
            marginBottom: 14,
          }}>
            <span style={{ fontSize: 11, letterSpacing: 3, color: '#5dc89a', fontWeight: 900 }}>SPIRALING SPOKES</span>
          </div>
          <div style={{ fontSize: 42, fontWeight: 950, letterSpacing: -1, lineHeight: 1.1, textShadow: '0 2px 20px rgba(0,0,0,.8)' }}>
            {frame.city}, <span style={{ color: 'rgba(255,255,255,.72)' }}>{frame.state}</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 17, color: 'rgba(255,255,255,.58)', letterSpacing: 0.5 }}>
            {frame.roadName} &nbsp;·&nbsp; heading {heading}° &nbsp;·&nbsp; {frame.sceneType}
          </div>
          <div style={{ marginTop: 5, fontSize: 14, color: '#93c5fd' }}>{frame.weather}</div>
        </div>

        {/* Right: day counter + live badge */}
        <div style={{ textAlign: 'right' }}>
          <LiveBadge count={viewerCount} />
          <div style={{ marginTop: 18, display: 'flex', gap: 20, justifyContent: 'flex-end' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 950, lineHeight: 1 }}>DAY {dayCount}</div>
              <div style={{ fontSize: 11, letterSpacing: 2, color: 'rgba(255,255,255,.45)', marginTop: 2 }}>OF TRIP</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 950, lineHeight: 1 }}>{milesToday}</div>
              <div style={{ fontSize: 11, letterSpacing: 2, color: 'rgba(255,255,255,.45)', marginTop: 2 }}>MI TODAY</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── BOTTOM LEFT: commentary + miles ── */}
      <div style={{ position: 'absolute', left: 40, bottom: 40 }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: '#5dc89a', letterSpacing: 5, fontWeight: 900, marginBottom: 6 }}>SPOKY</div>
          <div style={{ fontSize: 58, fontWeight: 950, lineHeight: 1, tabularNums: 'true' } as React.CSSProperties}>
            {Math.round(frame.miles ?? 0).toLocaleString()}
          </div>
          <div style={{ fontSize: 12, letterSpacing: 3, color: 'rgba(255,255,255,.4)', marginTop: 4 }}>MILES · NYC → LA</div>
        </div>
        <CommentaryBox text={commentary} thinking={isThinking} />
      </div>

      {/* ── BOTTOM RIGHT: chat + mini map ── */}
      <div style={{ position: 'absolute', right: 40, bottom: 40, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 16 }}>
        <MiniMap pct={pct} scene={frame} />

        {/* Chat ticker */}
        <div style={{
          width: 340, background: 'rgba(2,6,23,.72)',
          border: '1px solid rgba(255,255,255,.08)', borderRadius: 12,
          padding: '12px 14px', backdropFilter: 'blur(8px)',
        }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: 'rgba(255,255,255,.4)', fontWeight: 900, marginBottom: 10 }}>LIVE CHAT</div>
          {chat.slice(-6).map((m, i) => (
            <div key={`${m.username}-${i}`} style={{ marginBottom: 7, fontSize: 15, lineHeight: 1.35 }}>
              <span style={{
                fontWeight: 700, marginRight: 6,
                color: m.source === 'twitch' ? '#a78bfa' : m.source === 'axle' ? '#5dc89a' : '#60a5fa',
              }}>
                {m.username}
              </span>
              <span style={{ color: 'rgba(255,255,255,.8)' }}>{m.message}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── SPONSOR BUG (bottom center) ── */}
      <div style={{
        position: 'absolute', bottom: 48, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(2,6,23,.72)', border: '1px solid rgba(255,255,255,.1)',
        borderRadius: 999, padding: '8px 24px',
        backdropFilter: 'blur(6px)', whiteSpace: 'nowrap',
      }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', letterSpacing: 2 }}>PRESENTED BY </span>
        <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: 2, color: '#facc15' }}>{MOCK_SPONSOR.name}</span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginLeft: 8 }}>{MOCK_SPONSOR.tagline}</span>
      </div>

      {/* ── PROGRESS BAR (very bottom) ── */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'rgba(255,255,255,.08)' }}>
        <div style={{
          height: '100%', background: '#5dc89a',
          width: `${pct}%`, transition: 'width 900ms ease',
          boxShadow: '0 0 8px rgba(93,200,154,.8)',
        }} />
      </div>

      {/* ── MILESTONE OVERLAY ── */}
      {milestone && (
        <div style={{
          position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
          background: 'rgba(2,6,23,.65)', animation: 'fadeIn .5s ease both',
          zIndex: 100,
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 13, letterSpacing: 8, color: '#5dc89a', fontWeight: 900, marginBottom: 20 }}>MILESTONE REACHED</div>
            <div style={{ fontSize: 92, fontWeight: 1000, lineHeight: 1.05, textShadow: '0 16px 64px rgba(0,0,0,.9)', maxWidth: 1400, textAlign: 'center' }}>
              {milestone.name}
            </div>
            {milestone.desc && <div style={{ fontSize: 28, color: 'rgba(255,255,255,.62)', marginTop: 16 }}>{milestone.desc}</div>}
          </div>
        </div>
      )}

      {/* ── PAUSE OVERLAY ── */}
      {isPaused && (
        <div style={{
          position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
          background: 'rgba(2,6,23,.88)', zIndex: 100,
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 72 }}>⏸</div>
            <div style={{ fontSize: 44, fontWeight: 900, marginTop: 16 }}>SPOKY is taking a break</div>
            <div style={{ fontSize: 18, color: 'rgba(255,255,255,.45)', marginTop: 10 }}>Back soon — probably just admiring something</div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes frameIn { from { opacity: .05; transform: scale(1.012) } to { opacity: 1; transform: scale(1) } }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes pulse-live {
          0% { box-shadow: 0 0 0 0 rgba(239,68,68,.7) }
          70% { box-shadow: 0 0 0 8px rgba(239,68,68,0) }
          100% { box-shadow: 0 0 0 0 rgba(239,68,68,0) }
        }
      `}</style>
    </div>
  );
}
