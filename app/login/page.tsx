'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Shield, ChevronRight, Loader2, BarChart3, Users, MapPin, Landmark, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

const FEATURES = [
  { icon: BarChart3, label: 'Mapa Eleitoral com dados do TSE' },
  { icon: Users,     label: 'Gestão de Demandas e Contatos' },
  { icon: MapPin,    label: 'Projeção de Campanha por Município' },
  { icon: Landmark,  label: 'Emendas Parlamentares Federais e Estaduais' },
];

export default function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await signIn('credentials', { email, password, redirect: false });
      if (result?.error) setError('E-mail ou senha incorretos. Verifique e tente novamente.');
      else router.replace('/dashboard');
    } catch {
      setError('Erro ao realizar login. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dark min-h-screen flex" style={{ background: 'var(--bg-page)' }}>

      {/* ── Painel esquerdo: Branding (navy fixo) ─────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
        className="hidden lg:flex flex-col justify-between w-[46%] relative overflow-hidden"
        style={{ background: '#0F2240' }}
      >
        {/* Grade sutil */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(148,163,184,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.04) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        {/* Glow sutil cobalto (sem dourado) */}
        <div
          className="absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.16), transparent 70%)' }}
        />
        <div
          className="absolute -bottom-40 -right-20 w-[360px] h-[360px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.10), transparent 70%)' }}
        />

        {/* Linha cobalto */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[2px]"
          style={{ background: 'linear-gradient(to bottom, transparent, #2563EB 30%, #2563EB 70%, transparent)' }}
        />

        {/* Logo topo */}
        <div className="relative z-10 px-12 pt-12 flex items-center gap-5">
          <img src="/logo.png" alt="AdminHub" style={{ width: 120, height: 120, objectFit: 'contain' }} />
          <span className="text-white font-semibold text-4xl tracking-tight">AdminHub</span>
        </div>

        {/* Conteúdo central */}
        <div className="relative z-10 px-12 pb-2">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.5 }}
          >
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-7"
              style={{
                background: 'rgba(37,99,235,0.14)',
                border: '1px solid rgba(96,165,250,0.32)',
              }}
            >
              <Shield className="w-3.5 h-3.5" style={{ color: '#60A5FA' }} />
              <span className="text-xs font-semibold tracking-wide" style={{ color: '#93C5FD' }}>
                PLATAFORMA OFICIAL · ACESSO RESTRITO
              </span>
            </div>

            <h1 className="text-[2.4rem] font-semibold text-white leading-tight mb-4 tracking-tight">
              Sistema de Gestão<br />
              <span style={{ color: '#60A5FA' }}>de Gabinete Político</span>
            </h1>
            <p className="text-[0.95rem] leading-relaxed mb-10 max-w-sm" style={{ color: '#94A3B8' }}>
              Plataforma integrada para gestão de demandas, análise eleitoral e organização do gabinete.
            </p>

            <div className="space-y-4">
              {FEATURES.map(({ icon: Icon, label }, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 + i * 0.10 }}
                  className="flex items-center gap-3.5"
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      background: 'rgba(37,99,235,0.14)',
                      border: '1px solid rgba(96,165,250,0.26)',
                    }}
                  >
                    <Icon className="w-4 h-4" style={{ color: '#60A5FA' }} />
                  </div>
                  <span className="text-sm" style={{ color: '#CBD5E1' }}>{label}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        <div className="relative z-10 px-12 pb-10">
          <div className="h-px mb-6" style={{ background: 'rgba(148,163,184,0.10)' }} />
          <p className="text-xs" style={{ color: '#64748B' }}>© 2025 AdminHub · Todos os direitos reservados</p>
        </div>
      </motion.div>

      {/* ── Painel direito: Formulário (tema-aware) ───────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="flex-1 flex items-center justify-center p-8"
        style={{ background: 'var(--bg-page)' }}
      >
        <div className="w-full max-w-[400px]">

          <div className="lg:hidden flex flex-col items-center mb-10">
            <img src="/logo.png" alt="AdminHub" className="w-16 h-16 object-contain mb-3" />
            <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>AdminHub</h2>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.45 }}
            className="rounded-2xl p-8"
            style={{
              background: 'var(--bg-card)',
              boxShadow: 'var(--shadow-raised)',
              border: '1px solid var(--border-default)',
            }}
          >
            <div className="mb-7">
              <h2 className="text-2xl font-semibold mb-1 tracking-tight" style={{ color: 'var(--text-primary)' }}>
                Bem-vindo de volta
              </h2>
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                Faça login para acessar a plataforma
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-3 p-3.5 rounded-lg text-sm"
                  style={{
                    background: 'var(--danger-soft)',
                    border: '1px solid var(--danger)',
                    color: 'var(--danger)',
                  }}
                >
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {error}
                </motion.div>
              )}

              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                  E-mail institucional
                </label>
                <div className="relative">
                  <Mail
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                    style={{ color: 'var(--text-muted)' }}
                  />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                    className="w-full pl-10 pr-4 py-3 rounded-lg text-sm outline-none transition-all"
                    style={{
                      background: 'var(--bg-card-subtle)',
                      border: '1px solid var(--border-default)',
                      color: 'var(--text-primary)',
                    }}
                    onFocus={e => {
                      e.target.style.borderColor = 'var(--brand-cobalt)';
                      e.target.style.boxShadow = '0 0 0 3px var(--focus-ring)';
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = 'var(--border-default)';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Senha
                </label>
                <div className="relative">
                  <Lock
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                    style={{ color: 'var(--text-muted)' }}
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••••"
                    required
                    className="w-full pl-10 pr-4 py-3 rounded-lg text-sm outline-none transition-all"
                    style={{
                      background: 'var(--bg-card-subtle)',
                      border: '1px solid var(--border-default)',
                      color: 'var(--text-primary)',
                    }}
                    onFocus={e => {
                      e.target.style.borderColor = 'var(--brand-cobalt)';
                      e.target.style.boxShadow = '0 0 0 3px var(--focus-ring)';
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = 'var(--border-default)';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-colors hover:brightness-110 active:brightness-95"
                style={{
                  background: loading ? 'var(--text-muted)' : 'var(--brand-cobalt)',
                  color: '#FFFFFF',
                  border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  letterSpacing: '0.01em',
                }}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  <>
                    Entrar na Plataforma
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
