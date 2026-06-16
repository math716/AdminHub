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

  const userRole    = (session?.user as any)?.role;

  useEffect(() => {
    setMounted(true);
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('sidebar-open');
    if (stored !== null) {
      setSidebarOpen(stored === '1');
    } else {
      // Primeira visita: aberto no desktop, fechado no mobile/tablet
      setSidebarOpen(window.innerWidth >= 1024);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    window.localStorage.setItem('sidebar-open', sidebarOpen ? '1' : '0');

    // Dispara window.resize durante e ao final da animacao do sidebar.
    // Necessario para mapas Leaflet, ResponsiveContainer do recharts e qualquer
    // componente que dimensiona com base na largura do parent recalcularem o tamanho.
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
      <div className="min-h-screen flex flex-col items-center justify-center"
        style={{ background: '#080f1c' }}>
        <div className="flex flex-col items-center gap-6">
          <div style={{ position: 'relative' }}>
            <div style={{
              position: 'absolute', inset: -20,
              background: 'radial-gradient(circle, rgba(74,158,222,0.12) 0%, transparent 70%)',
              borderRadius: '50%',
            }} />
            <img
              src="/logo.png"
              alt="AdminHub"
              className="w-40 h-auto object-contain"
              style={{ position: 'relative', filter: 'drop-shadow(0 0 20px rgba(74,158,222,0.2))' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[0, 120, 240].map(d => (
              <span key={d} className="animate-bounce" style={{
                display: 'block', width: 5, height: 5, borderRadius: '50%',
                background: 'rgba(74,158,222,0.7)', animationDelay: `${d}ms`,
              }} />
            ))}
          </div>
          <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
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
    <div className="min-h-screen" style={{ background: '#080f1c' }}>
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} />
      <main className={`transition-[padding] duration-300 ease-out ${sidebarOpen ? 'lg:pl-72' : 'lg:px-12'}`}>
        <div className="p-4 lg:p-8 pt-16 lg:pt-8 landscape-content">
          {children}
        </div>
      </main>

    </div>
  );
}
