'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, Shield, ChevronRight, Loader2, BarChart3, Users, MapPin, Landmark } from 'lucide-react';
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
    <div className="min-h-screen flex" style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* ── Painel esquerdo: Branding ─────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6 }}
        className="hidden lg:flex flex-col justify-between w-[46%] relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #04111f 0%, #071d36 45%, #0c2a4f 100%)' }}
      >
        {/* Grade sutil */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        {/* Brilhos decorativos */}
        <div
          className="absolute -top-40 -left-40 w-[480px] h-[480px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(201,162,39,0.12), transparent 70%)' }}
        />
        <div
          className="absolute -bottom-48 -right-24 w-[420px] h-[420px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(30,74,128,0.35), transparent 70%)' }}
        />

        {/* Linha dourada decorativa */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[3px]"
          style={{ background: 'linear-gradient(to bottom, transparent, #c9a227 30%, #c9a227 70%, transparent)' }}
        />

        {/* Logo topo */}
        <div className="relative z-10 px-12 pt-12 flex items-center gap-3">
          <img src="/logo.png" alt="AdminHub" style={{ width: 150, height: 150, objectFit: 'contain' }} />
          <span className="text-white font-light text-xl tracking-widest uppercase">AdminHub</span>
        </div>

        {/* Conteúdo central */}
        <div className="relative z-10 px-12 pb-2">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
          >
            {/* Badge */}
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-7"
              style={{
                background: 'rgba(201,162,39,0.12)',
                border: '1px solid rgba(201,162,39,0.35)',
              }}
            >
              <Shield className="w-3.5 h-3.5" style={{ color: '#c9a227' }} />
              <span className="text-xs font-semibold tracking-wide" style={{ color: '#c9a227' }}>
                PLATAFORMA OFICIAL · ACESSO RESTRITO
              </span>
            </div>

            <h1 className="text-[2.4rem] font-extrabold text-white leading-tight mb-4">
              Sistema de Gestão<br />
              <span style={{ color: '#c9a227' }}>de Gabinete Político</span>
            </h1>
            <p className="text-gray-400 text-[0.95rem] leading-relaxed mb-10 max-w-xs">
              Plataforma integrada para gestão de demandas, análise eleitoral e organização do gabinete.
            </p>

            {/* Features */}
            <div className="space-y-4">
              {FEATURES.map(({ icon: Icon, label }, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.12 }}
                  className="flex items-center gap-3.5"
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      background: 'rgba(201,162,39,0.12)',
                      border: '1px solid rgba(201,162,39,0.3)',
                    }}
                  >
                    <Icon className="w-4 h-4" style={{ color: '#c9a227' }} />
                  </div>
                  <span className="text-gray-300 text-sm">{label}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Rodapé */}
        <div className="relative z-10 px-12 pb-10">
          <div className="h-px mb-6" style={{ background: 'rgba(255,255,255,0.07)' }} />
          <p className="text-gray-600 text-xs">© 2025 AdminHub · Todos os direitos reservados</p>
        </div>
      </motion.div>

      {/* ── Painel direito: Formulário ────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="flex-1 flex items-center justify-center p-8"
        style={{ background: '#f0f4f9' }}
      >
        <div className="w-full max-w-[400px]">

          {/* Logo mobile */}
          <div className="lg:hidden flex flex-col items-center mb-10">
            <img src="/logo.png" alt="AdminHub" className="w-16 h-16 object-contain mb-3" />
            <h2 className="text-xl font-bold" style={{ color: '#04111f' }}>AdminHub</h2>
          </div>

          {/* Card do formulário */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.55 }}
            className="rounded-2xl p-8"
            style={{
              background: '#ffffff',
              boxShadow: '0 8px 40px rgba(4,17,31,0.10), 0 1px 3px rgba(4,17,31,0.06)',
              border: '1px solid rgba(4,17,31,0.06)',
            }}
          >
            {/* Título */}
            <div className="mb-7">
              <h2 className="text-[1.5rem] font-bold mb-1" style={{ color: '#04111f' }}>
                Bem-vindo de volta
              </h2>
              <p className="text-sm" style={{ color: '#6b7280' }}>
                Faça login para acessar a plataforma
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">

              {/* Erro */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-3 p-4 rounded-xl text-sm"
                  style={{ background: '#fff1f1', border: '1px solid #fca5a5', color: '#b91c1c' }}
                >
                  <div className="w-4 h-4 rounded-full mt-0.5 flex-shrink-0" style={{ background: '#dc2626' }} />
                  {error}
                </motion.div>
              )}

              {/* E-mail */}
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: '#374151' }}>
                  E-mail institucional
                </label>
                <div className="relative">
                  <Mail
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                    style={{ color: '#9ca3af' }}
                  />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                    className="w-full pl-10 pr-4 py-3 rounded-xl text-sm outline-none transition-all"
                    style={{ background: '#f9fafb', border: '1.5px solid #e5e7eb', color: '#111827' }}
                    onFocus={e => {
                      e.target.style.borderColor = '#0c2a4f';
                      e.target.style.boxShadow = '0 0 0 3px rgba(12,42,79,0.10)';
                      e.target.style.background = '#fff';
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = '#e5e7eb';
                      e.target.style.boxShadow = 'none';
                      e.target.style.background = '#f9fafb';
                    }}
                  />
                </div>
              </div>

              {/* Senha */}
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: '#374151' }}>
                  Senha
                </label>
                <div className="relative">
                  <Lock
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                    style={{ color: '#9ca3af' }}
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••••"
                    required
                    className="w-full pl-10 pr-4 py-3 rounded-xl text-sm outline-none transition-all"
                    style={{ background: '#f9fafb', border: '1.5px solid #e5e7eb', color: '#111827' }}
                    onFocus={e => {
                      e.target.style.borderColor = '#0c2a4f';
                      e.target.style.boxShadow = '0 0 0 3px rgba(12,42,79,0.10)';
                      e.target.style.background = '#fff';
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = '#e5e7eb';
                      e.target.style.boxShadow = 'none';
                      e.target.style.background = '#f9fafb';
                    }}
                  />
                </div>
              </div>

              {/* Botão */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
                style={{
                  background: loading
                    ? '#6b7280'
                    : 'linear-gradient(135deg, #071d36 0%, #0c2a4f 60%, #1e4a80 100%)',
                  color: '#fff',
                  border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: loading ? 'none' : '0 4px 18px rgba(7,29,54,0.35)',
                  letterSpacing: '0.02em',
                }}
                onMouseEnter={e => {
                  if (!loading) (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.12)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1)';
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

          {/* Nota de segurança */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="flex items-center justify-center gap-2 mt-6"
          >
            <Shield className="w-3.5 h-3.5" style={{ color: '#9ca3af' }} />
            <span className="text-xs" style={{ color: '#9ca3af' }}>
              Conexão criptografada · Acesso restrito ao gabinete
            </span>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
