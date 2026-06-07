'use client';
import { useEffect, useRef, useState } from 'react';

interface PovViewerProps {
  lat: number;
  lng: number;
  heading: number;
  isAdvancing: boolean;
}

export default function PovViewer({ lat, lng, heading, isAdvancing }: PovViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const [userHeading, setUserHeading] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.google?.maps) { setLoaded(true); return; }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&v=weekly`;
    script.async = true;
    script.onload = () => setLoaded(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!loaded || !containerRef.current) return;

    panoramaRef.current = new window.google.maps.StreetViewPanorama(
      containerRef.current,
      {
        position: { lat, lng },
        pov: { heading, pitch: -10 },
        zoom: 0,
        addressControl: false,
        showRoadLabels: false,
        zoomControl: false,
        panControl: false,
        fullscreenControl: false,
        motionTracking: false,
        motionTrackingControl: false,
        clickToGo: false,
        scrollwheel: false,
        disableDoubleClickZoom: true,
        linksControl: false,
      }
    );

    panoramaRef.current.addListener('pov_changed', () => {
      if (!panoramaRef.current) return;
      const pov = panoramaRef.current.getPov();
      setUserHeading(pov.heading - heading);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  useEffect(() => {
    if (!panoramaRef.current || !loaded) return;

    if (isAdvancing) {
      const startHeading = panoramaRef.current.getPov().heading;
      const targetHeading = heading;
      const duration = 800;
      const start = Date.now();

      const animate = () => {
        const progress = Math.min((Date.now() - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = startHeading + (targetHeading - startHeading) * eased;
        panoramaRef.current?.setPov({ heading: current, pitch: -10 });
        if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }

    panoramaRef.current.setPosition({ lat, lng });
  }, [lat, lng, heading, isAdvancing, loaded]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <BikeFrameOverlay />
      <CompassRose heading={userHeading} />
      {isAdvancing && <AdvancingOverlay />}
      <DragHint />
    </div>
  );
}

function BikeFrameOverlay() {
  return (
    <svg
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        width: '100%',
        height: '120px',
        pointerEvents: 'none',
      }}
      viewBox="0 0 1920 120"
      preserveAspectRatio="xMidYMax meet"
    >
      <path
        d="M760,120 L760,80 Q760,60 800,55 L900,50 Q960,48 960,48
           Q960,48 1020,50 L1120,55 Q1160,60 1160,80 L1160,120"
        fill="rgba(0,0,0,0.85)"
        stroke="none"
      />
      <rect x="740" y="75" width="40" height="12" rx="6" fill="rgba(0,0,0,0.9)" />
      <rect x="1140" y="75" width="40" height="12" rx="6" fill="rgba(0,0,0,0.9)" />
      <rect x="955" y="48" width="10" height="40" rx="3" fill="rgba(0,0,0,0.85)" />
      <rect x="0" y="100" width="1920" height="20" fill="rgba(0,0,0,0.6)" />
    </svg>
  );
}

function CompassRose({ heading }: { heading: number }) {
  const offset = ((heading % 360) + 360) % 360;
  const label =
    offset < 30 || offset > 330 ? '↑ FORWARD' :
    offset < 120 ? '→ RIGHT' :
    offset < 240 ? '↓ BEHIND' : '← LEFT';
  const isForward = offset < 30 || offset > 330;

  return (
    <div style={{
      position: 'absolute',
      top: 80,
      right: 20,
      background: 'rgba(0,0,0,0.6)',
      border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: '50%',
      width: 64,
      height: 64,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
    }}>
      <div style={{
        fontSize: 20,
        transform: `rotate(${offset}deg)`,
        transition: 'transform 0.1s',
        color: isForward ? '#4ade80' : '#fff',
      }}>↑</div>
      <div style={{
        fontSize: 8,
        color: '#9ca3af',
        marginTop: 2,
        letterSpacing: 0.5,
      }}>{label}</div>
    </div>
  );
}

function AdvancingOverlay() {
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
      background: 'rgba(0,0,0,0.15)',
    }}>
      <div style={{
        background: 'rgba(0,0,0,0.7)',
        color: '#4ade80',
        padding: '8px 16px',
        borderRadius: 4,
        fontSize: 12,
        letterSpacing: 2,
        fontFamily: 'DM Mono, monospace',
      }}>
        SPOKY IS ROLLING...
      </div>
    </div>
  );
}

function DragHint() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div style={{
      position: 'absolute',
      bottom: 140,
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,0.7)',
      color: '#fff',
      padding: '8px 16px',
      borderRadius: 20,
      fontSize: 13,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      pointerEvents: 'none',
      animation: 'fadeOut 1s ease 4s forwards',
    }}>
      <span>↔</span>
      <span>Drag to look around · SPOKY moves every 8s</span>
    </div>
  );
}
