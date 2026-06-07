'use client';

import { useEffect } from 'react';

export default function StreamLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.margin = '0';
    body.style.padding = '0';
    return () => {
      html.style.overflow = '';
      body.style.overflow = '';
      body.style.margin = '';
      body.style.padding = '';
    };
  }, []);
  return <>{children}</>;
}
