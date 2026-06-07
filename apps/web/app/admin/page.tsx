'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  demoRoutePresets,
  mockChatMessages,
  mockSceneLibrary,
  type MockScene,
} from '../../../../shared/mock/demo';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8080/ws';

interface State {
  current_city: string | null;
  current_state: string | null;
  current_waypoint_index: number;
  miles_traveled: number;
  is_paused: boolean;
  pause_reason: string | null;
  speed_multiplier: number;
  started_at: string | null;
}

function stateFromScene(scene: MockScene, index: number, paused: boolean, speed: number): State {
  return {
    current_city: scene.city,
    current_state: scene.state,
    current_waypoint_index: index,
    miles_traveled: scene.miles,
    is_paused: paused,
    pause_reason: paused ? 'manual' : null,
    speed_multiplier: speed,
    started_at: new Date().toISOString(),
  };
}

function WsDot({ connected }: { connected: boolean }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: connected ? '#4ade80' : '#ef4444',
        boxShadow: connected ? '0 0 6px #4ade80' : 'none',
        marginRight: 6,
        verticalAlign: 'middle',
      }}
    />
  );
}

export default function AdminPage() {
  const [routeId, setRouteId] = useState('nyc-la');
  const route = useMemo(
    () => demoRoutePresets.find((r) => r.id === routeId) ?? demoRoutePresets[0],
    [routeId]
  );
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [wsConnected, setWsConnected] = useState(false);
  const [log, setLog] = useState<string[]>([
    'Mock admin loaded. LIVE_MODE=false; no external APIs will be called.',
  ]);

  const scene = route.scenes[index % route.scenes.length] ?? mockSceneLibrary[0];
  const state = stateFromScene(scene, index, paused, speed);

  const addLog = (msg: string) =>
    setLog((l) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...l.slice(0, 70)]);

  // WebSocket — receive live server events into the event log
  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => { setWsConnected(true); addLog('WebSocket connected to server'); };
    ws.onclose = () => { setWsConnected(false); addLog('WebSocket disconnected'); };
    ws.onerror = () => setWsConnected(false);

    ws.onmessage = (e) => {
      try {
        const { type, payload } = JSON.parse(e.data) as { type: string; payload: Record<string, unknown> };
        if (type === 'NEW_FRAME') {
          const p = payload as { city?: string; state?: string; miles?: number };
          addLog(`Frame → ${p.city ?? '?'}, ${p.state ?? '?'} · mile ${Math.round(Number(p.miles ?? 0))}`);
          setIndex((i) => (i + 1) % route.scenes.length);
        }
        if (type === 'RIDER_PAUSED') { setPaused(true); addLog('Server: rider paused'); }
        if (type === 'RIDER_RESUMED') { setPaused(false); addLog('Server: rider resumed'); }
        if (type === 'MILESTONE') addLog(`Milestone: ${(payload as { name: string }).name}`);
        if (type === 'COMMENTARY') {
          const text = (payload as { text?: string }).text ?? '';
          addLog(`Commentary: ${text.slice(0, 70)}${text.length > 70 ? '…' : ''}`);
        }
        if (type === 'CHAT_MESSAGE') {
          const p = payload as { username: string; message: string };
          addLog(`Chat: ${p.username}: ${p.message.slice(0, 45)}`);
        }
        if (type === 'VOTE_OPEN') addLog('Vote opened by server');
        if (type === 'VIEWER_COUNT') addLog(`Viewers: ${(payload as { count: number }).count}`);
      } catch {
        // ignore malformed frames
      }
    };

    return () => ws.close();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // API call helpers
  async function apiPost(path: string, body?: Record<string, unknown>) {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
  }

  const handlePause = async () => {
    try {
      await apiPost('/api/admin/pause');
      addLog('Sent pause → server');
    } catch {
      setPaused(true);
      addLog('Pause (local only — server unreachable)');
    }
  };

  const handleResume = async () => {
    try {
      await apiPost('/api/admin/resume');
      addLog('Sent resume → server');
    } catch {
      setPaused(false);
      addLog('Resume (local only — server unreachable)');
    }
  };

  const handleSkip = async () => {
    try {
      await apiPost('/api/admin/skip');
      addLog('Sent skip → server');
    } catch {
      const next = (index + speed) % route.scenes.length;
      setIndex(next);
      addLog(`Skip (local only) → waypoint ${next}: ${route.scenes[next].city}`);
    }
  };

  const handleSpeed = async (s: number) => {
    setSpeed(s);
    try {
      await apiPost('/api/admin/speed', { multiplier: s });
      addLog(`Speed set to ${s}x → server`);
    } catch {
      addLog(`Speed set to ${s}x (local only)`);
    }
  };

  const triggerMilestone = async () => {
    try {
      await apiPost('/api/admin/mock-event', { type: 'milestone' });
      addLog('Triggered mock milestone → server');
    } catch {
      addLog(`Mock milestone (local): ${scene.milestoneName ?? `Mile ${Math.round(scene.miles)}`}`);
    }
  };

  const triggerVote = async () => {
    try {
      await apiPost('/api/admin/mock-event', { type: 'vote' });
      addLog('Opened mock vote → server');
    } catch {
      addLog('Mock vote: questionable diner vs scenic bridge (local)');
    }
  };

  const triggerTip = async () => {
    try {
      await apiPost('/api/admin/mock-event', { type: 'shoutout' });
      addLog('Triggered mock shoutout → server');
    } catch {
      addLog(`Mock $5 shoutout from mock_tip_bot near ${scene.city} (local)`);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 p-8 font-mono text-white">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-emerald-300">AXLE Admin</h1>
          <p className="mt-1 text-sm text-zinc-500">Mock/local control panel. Safe without API keys.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center text-xs text-zinc-400">
            <WsDot connected={wsConnected} />
            {wsConnected ? 'Server connected' : 'Server offline'}
          </div>
          <div className="rounded-full bg-yellow-300 px-4 py-2 text-xs font-black tracking-widest text-zinc-950">
            MOCK MODE · LIVE_MODE=false
          </div>
        </div>
      </div>

      <section className="mb-6 rounded border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-500">Current State</div>
        <div className="grid gap-3 text-sm md:grid-cols-3">
          <div><span className="text-zinc-500">Location:</span> {state.current_city}, {state.current_state}</div>
          <div><span className="text-zinc-500">Waypoint:</span> {state.current_waypoint_index}</div>
          <div><span className="text-zinc-500">Miles:</span> {state.miles_traveled.toFixed(1)}</div>
          <div><span className="text-zinc-500">Speed:</span> {state.speed_multiplier}x</div>
          <div>
            <span className="text-zinc-500">Status:</span>{' '}
            {state.is_paused ? (
              <span className="text-red-400">PAUSED ({state.pause_reason})</span>
            ) : (
              <span className="text-emerald-400">ROLLING</span>
            )}
          </div>
          <div><span className="text-zinc-500">Scene:</span> {scene.sceneType}</div>
        </div>
      </section>

      <section className="mb-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-500">Controls</div>
          <div className="mb-5 flex flex-wrap gap-3">
            <button
              onClick={handlePause}
              className="rounded bg-red-800 px-4 py-2 text-sm hover:bg-red-700"
            >
              Pause
            </button>
            <button
              onClick={handleResume}
              className="rounded bg-emerald-400 px-4 py-2 text-sm font-black text-black"
            >
              Resume
            </button>
            <button
              onClick={handleSkip}
              className="rounded bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700"
            >
              Skip waypoint
            </button>
            <button
              onClick={triggerMilestone}
              className="rounded bg-yellow-300 px-4 py-2 text-sm font-black text-black"
            >
              Trigger milestone
            </button>
            <button
              onClick={triggerVote}
              className="rounded bg-sky-700 px-4 py-2 text-sm hover:bg-sky-600"
            >
              Trigger vote
            </button>
            <button
              onClick={triggerTip}
              className="rounded bg-fuchsia-700 px-4 py-2 text-sm hover:bg-fuchsia-600"
            >
              Trigger tip/shoutout
            </button>
          </div>

          <div className="mb-5">
            <div className="mb-2 text-xs text-zinc-500">Speed multiplier</div>
            <div className="flex gap-2">
              {[1, 2, 5, 10].map((s) => (
                <button
                  key={s}
                  onClick={() => handleSpeed(s)}
                  className={`rounded px-4 py-2 text-sm ${speed === s ? 'bg-zinc-200 text-black' : 'bg-zinc-800 hover:bg-zinc-700'}`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs text-zinc-500">Demo route preset</div>
            <select
              value={routeId}
              onChange={(e) => {
                setRouteId(e.target.value);
                setIndex(0);
                addLog(`Loaded preset: ${e.target.value}`);
              }}
              className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-sm"
            >
              {demoRoutePresets.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} — {r.totalMiles} mi sample
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-zinc-500">{route.description}</p>
          </div>
        </div>

        <div className="rounded border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-500">
            Current mock frame
          </div>
          <img
            src={scene.image}
            alt="current mock frame"
            className="mb-3 aspect-video w-full rounded object-cover"
          />
          <div className="text-sm font-bold">
            {scene.city}, {scene.state}
          </div>
          <div className="text-xs text-zinc-400">
            {scene.roadName} · heading {Math.round(scene.heading)}°
          </div>
          <div className="mt-2 text-xs text-sky-200">{scene.weather}</div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">Event Log</div>
            <button
              onClick={() => setLog(['Log cleared.'])}
              className="text-xs text-zinc-600 hover:text-zinc-400"
            >
              clear
            </button>
          </div>
          <div className="max-h-72 space-y-1 overflow-y-auto text-xs text-zinc-400">
            {log.map((l, i) => (
              <div key={i} className={l.includes('Frame') ? 'text-emerald-400' : l.includes('Commentary') ? 'text-sky-400' : ''}>
                {l}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-500">
            Mock chat seeds
          </div>
          <div className="space-y-2 text-sm">
            {mockChatMessages.slice(0, 6).map((m) => (
              <div key={m.username}>
                <b className="text-sky-300">{m.username}</b>{' '}
                <span className="text-zinc-300">{m.message}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sponsor Management */}
      <SponsorPanel apiUrl={API_URL} addLog={addLog} />

      {/* Email List */}
      <EmailPanel apiUrl={API_URL} />
    </div>
  );
}

function SponsorPanel({ apiUrl, addLog }: { apiUrl: string; addLog: (m: string) => void }) {
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [triggerType, setTriggerType] = useState('STATE_ENTRY');
  const [triggerValue, setTriggerValue] = useState('');
  const [saved, setSaved] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await fetch(`${apiUrl}/api/sponsors`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, tagline, trigger_type: triggerType, trigger_value: triggerValue }),
      });
      const data = await r.json() as { ok?: boolean };
      if (data.ok) { setSaved(true); addLog(`Sponsor added: ${name} (${triggerType}:${triggerValue})`); setTimeout(() => setSaved(false), 2000); }
    } catch { addLog('Sponsor add failed — server unreachable'); }
  };

  return (
    <section className="mt-6 rounded border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-500">Sponsor Management</div>
      <form onSubmit={handleAdd} className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sponsor name" required
          className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" />
        <input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Tagline"
          className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" />
        <div className="flex gap-2">
          <select value={triggerType} onChange={(e) => setTriggerType(e.target.value)}
            className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm">
            <option value="STATE_ENTRY">State entry</option>
            <option value="CITY">Near city</option>
            <option value="DISTANCE">Every N miles</option>
            <option value="TIME">Every N minutes</option>
          </select>
          <input value={triggerValue} onChange={(e) => setTriggerValue(e.target.value)} placeholder="Value (e.g. TX)"
            className="w-20 rounded border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm" />
        </div>
        <button type="submit"
          className={`rounded px-4 py-2 text-sm font-black transition-colors ${saved ? 'bg-emerald-400 text-black' : 'bg-zinc-200 text-black hover:bg-white'}`}>
          {saved ? '✓ Saved' : 'Add sponsor'}
        </button>
      </form>
    </section>
  );
}

function EmailPanel({ apiUrl }: { apiUrl: string }) {
  const [emails, setEmails] = useState<{ email: string; source: string; created_at: string }[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    try {
      const r = await fetch(`${apiUrl}/api/admin/emails`);
      const data = await r.json() as { email: string; source: string; created_at: string }[];
      setEmails(Array.isArray(data) ? data : []);
      setLoaded(true);
    } catch { setLoaded(true); }
  };

  const exportCsv = () => {
    const csv = `email,source,created_at\n${emails.map((e) => `${e.email},${e.source},${e.created_at}`).join('\n')}`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'axle-emails.csv';
    a.click();
  };

  return (
    <section className="mt-6 rounded border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">Email List</div>
        <div className="flex gap-2">
          {loaded && emails.length > 0 && (
            <button onClick={exportCsv} className="rounded bg-zinc-800 px-3 py-1 text-xs hover:bg-zinc-700">Export CSV</button>
          )}
          <button onClick={load} className="rounded bg-zinc-800 px-3 py-1 text-xs hover:bg-zinc-700">
            {loaded ? `Loaded (${emails.length})` : 'Load list'}
          </button>
        </div>
      </div>
      {loaded && (
        <div className="max-h-48 overflow-y-auto space-y-1">
          {emails.length === 0 ? (
            <div className="text-xs text-zinc-600">No emails captured yet.</div>
          ) : (
            emails.map((e, i) => (
              <div key={i} className="flex justify-between text-xs text-zinc-400">
                <span className="text-zinc-200">{e.email}</span>
                <span className="text-zinc-600">{e.source}</span>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
