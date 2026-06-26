'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/sidebar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession() || {};
  const router   = useRouter();
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    setMounted(true);
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('sidebar-open');
    if (stored !== null) {
      setSidebarOpen(stored === '1');
    } else {
      setSidebarOpen(window.innerWidth >= 1024);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    window.localStorage.setItem('sidebar-open', sidebarOpen ? '1' : '0');

    const intervalId = window.setInterval(() => {
      window.dispatchEvent(new Event('resize'));
    }, 50);
    const timeoutId = window.setTimeout(() => {
      window.clearInterval(intervalId);
      window.dispatchEvent(new Event('resize'));
    }, 450);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [sidebarOpen, mounted]);

  useEffect(() => {
    if (mounted && status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router, mounted]);

  if (!mounted || status === 'loading') {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center"
        style={{ background: 'var(--bg-card)' }}
      >
        <div className="flex flex-col items-center gap-5">
          <img
            src="/logo.png"
            alt="AdminHub"
            className="w-32 h-auto object-contain"
          />
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#60A5FA', animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#60A5FA', animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#60A5FA', animationDelay: '300ms' }} />
          </div>
          <p className="text-[11px] tracking-[0.18em] uppercase" style={{ color: 'var(--tint-35)' }}>
            Carregando
          </p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null;
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-page)' }}>
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} />
      <main className={`transition-[padding] duration-300 ease-out ${sidebarOpen ? 'lg:pl-[260px]' : 'lg:pl-6'}`}>
        <div className="p-4 lg:p-8 landscape-content max-w-[1920px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
