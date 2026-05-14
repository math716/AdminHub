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

  const userRole    = (session?.user as any)?.role;
  const gabineteId  = (session?.user as any)?.gabineteId;
  const needsGabinete = mounted && status === 'authenticated' && userRole === 'ADMIN' && !gabineteId;

  useEffect(() => {
    setMounted(true);
  }, []);

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
      <Sidebar />
      <main className="lg:pl-64">
        <div className="p-4 lg:p-8 pt-16 lg:pt-8 landscape-content">
          {children}
        </div>
      </main>

      {/* ADMIN sem gabinete selecionado — bloqueia navegação até escolher */}
      {needsGabinete && <AdminGabineteSwitcher required />}
    </div>
  );
}
