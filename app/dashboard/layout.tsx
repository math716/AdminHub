'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { GabiFAB } from '@/components/gabi/gabi-fab';
import { Menu } from 'lucide-react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession() || {};
  const router   = useRouter();
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Abaixo disto o menu não fica ao lado do conteúdo: ele abre POR CIMA dele.
  const ehCelular = () => window.innerWidth < 1024;

  useEffect(() => {
    setMounted(true);
    if (typeof window === 'undefined') return;
    // No celular o menu começa SEMPRE fechado. A preferência guardada vale para
    // o computador, onde ele divide a tela com o conteúdo. Antes ela valia para
    // os dois: bastava abrir o menu uma vez no celular para, dali em diante,
    // todo acesso começar com ele cobrindo a tela.
    if (ehCelular()) {
      setSidebarOpen(false);
      return;
    }
    let guardado: string | null = null;
    try { guardado = window.localStorage.getItem('sidebar-open'); } catch { /* sem localStorage */ }
    setSidebarOpen(guardado === null ? true : guardado === '1');
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!ehCelular()) {
      try { window.localStorage.setItem('sidebar-open', sidebarOpen ? '1' : '0'); } catch { /* sem localStorage */ }
    }

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
          <p className="text-[11px] tracking-[0.18em] uppercase" style={{ color: 'var(--text-tertiary)' }}>
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
      <GabiFAB />
      {/* Barra do celular. O menu lateral não cabe ao lado do conteúdo numa
          tela estreita, então fica escondido e abre por este botão — no lugar
          conhecido, no alto à esquerda, sem nada flutuando sobre as páginas. */}
      <header
        className="lg:hidden sticky top-0 z-[1100] flex items-center gap-3 px-3 h-14"
        style={{ background: '#0F2240', borderBottom: '1px solid rgba(148,163,184,0.14)' }}
      >
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Abrir menu"
          aria-expanded={sidebarOpen}
          className="flex items-center justify-center w-10 h-10 rounded-lg transition-colors hover:[background:rgba(255,255,255,0.10)]"
          style={{ color: '#E2E8F0', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(148,163,184,0.20)' }}
        >
          <Menu className="w-5 h-5" />
        </button>
        <img src="/logo.png" alt="" className="w-8 h-8 object-contain" />
        <span className="text-[15px] font-semibold text-white tracking-tight">AdminHub</span>
      </header>
      <main className={`transition-[padding] duration-300 ease-out ${sidebarOpen ? 'lg:pl-[260px]' : 'lg:pl-6'}`}>
        <div className="px-2 py-4 md:p-4 lg:p-8 landscape-content max-w-[1920px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
