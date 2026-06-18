'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

export default function HomePage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/dashboard');
    } else if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  return (
    <div className="dark min-h-screen flex flex-col items-center justify-center"
      style={{ background: 'linear-gradient(160deg, #04111f 0%, #071d36 55%, #0c2a4f 100%)' }}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center gap-5"
      >
        <img
          src="/logo.png"
          alt="AdminHub"
          className="w-48 h-auto object-contain drop-shadow-2xl"
          style={{ filter: 'drop-shadow(0 0 24px rgba(37,99,235,0.25))' }}
        />
        <div className="flex items-center gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#2563EB', animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#2563EB', animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#2563EB', animationDelay: '300ms' }} />
        </div>
        <p className="text-xs tracking-widest uppercase" style={{ color: 'var(--tint-35)' }}>Carregando</p>
      </motion.div>
    </div>
  );
}
