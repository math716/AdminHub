'use client';

import { SessionProvider } from 'next-auth/react';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/sonner';
import { ThemeSync } from '@/components/theme-sync';
import { useState, useEffect } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <SessionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem={false}
        disableTransitionOnChange
      >
        <ThemeSync />
        {!mounted ? <div style={{ visibility: 'hidden' }}>{children}</div> : children}
        <Toaster position="bottom-right" richColors />
      </ThemeProvider>
    </SessionProvider>
  );
}
