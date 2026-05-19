'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { AdminGabineteSwitcher } from '@/components/admin-gabinete-switcher';

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
  const gabineteId  = (session?.user as any)?.gabineteId;
  const needsGabinete = mounted && status === 'authenticated' && userRole === 'ADMIN' && !gabineteId;

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
        style={{ background: 'linear-gradient(160deg, #04111f 0%, #071d36 55%, #0c2a4f 100%)' }}>
        <div className="flex flex-col items-center gap-5">
          <img
            src="/logo.png"
            alt="AdminHub"
            className="w-48 h-auto object-contain drop-shadow-2xl"
            style={{ filter: 'drop-shadow(0 0 24px rgba(201,162,39,0.25))' }}
          />
          <div className="flex items-center gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#c9a227', animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#c9a227', animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#c9a227', animationDelay: '300ms' }} />
          </div>
          <p className="text-xs tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>Carregando</p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null;
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #04111f 0%, #071d36 55%, #0c2a4f 100%)' }}>
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} />
      <main className={`transition-[padding] duration-300 ease-out ${sidebarOpen ? 'lg:pl-72' : 'lg:px-12'}`}>
        <div className="p-4 lg:p-8 pt-16 lg:pt-8 landscape-content">
          {children}
        </div>
      </main>

      {/* ADMIN sem gabinete selecionado — bloqueia navegação até escolher */}
      {needsGabinete && <AdminGabineteSwitcher required />}
    </div>
  );
}
