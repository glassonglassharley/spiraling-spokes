'use client';

export default function StreamError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{
      width: 1920, height: 1080, background: '#020617', color: '#fff',
      fontFamily: 'Inter, monospace', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 64,
    }}>
      <div style={{ color: '#f87171', fontSize: 28, fontWeight: 900, letterSpacing: 3, marginBottom: 24 }}>
        STREAM CANVAS ERROR
      </div>
      <pre style={{
        background: '#0f1728', border: '1px solid rgba(248,113,113,.3)',
        padding: 24, borderRadius: 12, maxWidth: 1400, overflow: 'auto',
        fontSize: 14, lineHeight: 1.6, color: '#fca5a5', whiteSpace: 'pre-wrap',
      }}>
        {error.message}
        {'\n\n'}
        {error.stack}
      </pre>
      <button
        onClick={reset}
        style={{
          marginTop: 32, background: '#5dc89a', color: '#000', border: 'none',
          padding: '12px 28px', borderRadius: 6, fontWeight: 900, fontSize: 16,
          cursor: 'pointer', letterSpacing: 2,
        }}
      >
        RETRY
      </button>
    </div>
  );
}
