'use client';

import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { motion } from 'framer-motion';
import { Clock, CheckCircle2, LogOut, RefreshCw } from 'lucide-react';

export default function AguardandoAprovacaoPage() {
  const { data: session } = useSession() || {};
  const userName = (session?.user as any)?.name ?? 'Usuário';
  const [checking, setChecking] = useState(false);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState('');

  const handleCheck = async () => {
    setChecking(true);
    setError('');
    try {
      const res = await fetch('/api/me/status');
      if (res.ok) {
        const data = await res.json();
        if (data.approved) {
          setApproved(true);
        } else {
          setError('Seu cadastro ainda está aguardando aprovação.');
        }
      }
    } catch {
      setError('Erro ao verificar status. Tente novamente.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(160deg, #04111f 0%, #071d36 55%, #0c2a4f 100%)' }}
    >
      {/* Subtle grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 w-full max-w-md text-center"
      >
        {/* Logo */}
        <img
          src="/logo.png"
          alt="AdminHub"
          className="w-32 h-auto object-contain mx-auto mb-8"
          style={{ filter: 'drop-shadow(0 0 18px rgba(37,99,235,0.2))' }}
        />

        <div
          className="rounded-2xl p-8"
          style={{
            background: 'var(--bg-card-raised)',
            border: '1px solid rgba(37,99,235,0.2)',
            backdropFilter: 'blur(12px)',
          }}
        >
          {!approved ? (
            <>
              {/* Icon */}
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
                style={{ background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.3)' }}
              >
                <Clock className="w-7 h-7" style={{ color: '#2563EB' }} />
              </div>

              <h1 className="text-xl font-bold text-white mb-2">Aguardando Aprovação</h1>
              <p className="text-sm mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Olá, <span style={{ color: '#3B82F6' }}>{userName}</span>
              </p>
              <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Seu cadastro foi recebido. O Chefe de Gabinete ou Administrador precisará aprovar seu acesso antes de você entrar no sistema.
              </p>

              {error && (
                <p className="text-xs mb-4 px-3 py-2 rounded-lg"
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.25)' }}>
                  {error}
                </p>
              )}

              <div className="flex flex-col gap-3">
                <button
                  onClick={handleCheck}
                  disabled={checking}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#2563EB,#3B82F6)', color: '#04111f' }}
                >
                  {checking
                    ? <RefreshCw className="w-4 h-4 animate-spin" />
                    : <RefreshCw className="w-4 h-4" />}
                  Verificar aprovação
                </button>

                <button
                  onClick={() => signOut({ callbackUrl: '/login' })}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-all hover:bg-white/5"
                  style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <LogOut className="w-4 h-4" />
                  Sair
                </button>
              </div>
            </>
          ) : (
            <>
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
                style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)' }}
              >
                <CheckCircle2 className="w-7 h-7" style={{ color: '#4ade80' }} />
              </div>
              <h1 className="text-xl font-bold text-white mb-2">Acesso Aprovado!</h1>
              <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Seu cadastro foi aprovado. Faça login novamente para acessar o sistema.
              </p>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg,#2563EB,#3B82F6)', color: '#04111f' }}
              >
                Ir para o Login
              </button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
