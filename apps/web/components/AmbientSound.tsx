'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export interface AmbientSoundRef {
  toggle: (on: boolean) => void;
}

interface Props { sceneType: string; }

const TRACKS = {
  road:   '/audio/road-ambient.mp3',
  desert: '/audio/desert-ambient.mp3',
  city:   '/audio/city-ambient.mp3',
} as const;

type TrackKey = keyof typeof TRACKS;

function trackKey(sceneType: string): TrackKey {
  const s = sceneType.toLowerCase();
  if (s.includes('city') || s.includes('urban') || s.includes('suburb') || s.includes('river city')) return 'city';
  if (s.includes('desert') || s.includes('plains') || s.includes('red rock') || s.includes('panhandle')) return 'desert';
  return 'road';
}

const FADE_STEPS = 40;
const FADE_INTERVAL_MS = 50;
const TARGET_VOLUME = 0.15;

const AmbientSound = forwardRef<AmbientSoundRef, Props>(({ sceneType }, ref) => {
  const audios = useRef<Partial<Record<TrackKey, HTMLAudioElement>>>({});
  const activeKey = useRef<TrackKey>('road');
  const isOn = useRef(false);
  const mainTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    (Object.entries(TRACKS) as [TrackKey, string][]).forEach(([key, src]) => {
      const a = new Audio(src);
      a.loop = true;
      a.volume = 0;
      audios.current[key] = a;
    });
    return () => {
      Object.values(audios.current).forEach(a => a?.pause());
    };
  }, []);

  // Crossfade to new track when terrain changes while sound is on
  useEffect(() => {
    if (!isOn.current) return;
    const next = trackKey(sceneType);
    if (next === activeKey.current) return;
    const out = audios.current[activeKey.current];
    const inp = audios.current[next];
    activeKey.current = next;
    if (inp) { inp.volume = 0; inp.play().catch(() => {}); }
    let step = 0;
    const iv = setInterval(() => {
      step++;
      const t = Math.min(1, step / FADE_STEPS);
      if (out) out.volume = TARGET_VOLUME * (1 - t);
      if (inp) inp.volume = TARGET_VOLUME * t;
      if (step >= FADE_STEPS) { clearInterval(iv); if (out) out.pause(); }
    }, FADE_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [sceneType]);

  useImperativeHandle(ref, () => ({
    toggle(on: boolean) {
      isOn.current = on;
      const key = trackKey(sceneType);
      activeKey.current = key;
      const audio = audios.current[key];
      if (!audio) return;
      if (mainTimer.current) clearInterval(mainTimer.current);
      if (on) {
        audio.play().catch(() => {});
        mainTimer.current = setInterval(() => {
          audio.volume = Math.min(TARGET_VOLUME, audio.volume + TARGET_VOLUME / FADE_STEPS);
          if (audio.volume >= TARGET_VOLUME) clearInterval(mainTimer.current!);
        }, FADE_INTERVAL_MS);
      } else {
        mainTimer.current = setInterval(() => {
          audio.volume = Math.max(0, audio.volume - TARGET_VOLUME / FADE_STEPS);
          if (audio.volume <= 0) { audio.pause(); clearInterval(mainTimer.current!); }
        }, FADE_INTERVAL_MS);
      }
    },
  }));

  return null;
});

AmbientSound.displayName = 'AmbientSound';
export default AmbientSound;
