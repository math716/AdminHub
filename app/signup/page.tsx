'use client';

import { useState, useEffect, useRef } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Mail, Lock, User, Building2, Briefcase, Plus, Shield,
  ChevronRight, Loader2, BarChart3, Users, MapPin, ChevronDown, Check, Landmark,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const FEATURES = [
  { icon: BarChart3, label: 'Mapa Eleitoral com dados do TSE' },
  { icon: Users,     label: 'Gestão de Demandas e Contatos' },
  { icon: MapPin,    label: 'Projeção de Campanha por Município' },
  { icon: Landmark,  label: 'Emendas Parlamentares Federais e Estaduais' },
];

interface Gabinete {
  id: string;
  nome: string;
  descricao?: string;
}

const inputBase: React.CSSProperties = {
  width: '100%',
  paddingLeft: '2.5rem',
  paddingRight: '1rem',
  paddingTop: '0.75rem',
  paddingBottom: '0.75rem',
  borderRadius: '0.75rem',
  fontSize: '0.875rem',
  outline: 'none',
  transition: 'all 0.15s',
  background: '#f9fafb',
  border: '1.5px solid #e5e7eb',
  color: '#111827',
  appearance: 'none' as const,
  WebkitAppearance: 'none' as const,
};

function StyledInput({
  type = 'text',
  placeholder,
  value,
  onChange,
  icon,
  required,
}: {
  type?: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  icon: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <span
        style={{
          position: 'absolute', left: '0.875rem', top: '50%',
          transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none',
          display: 'flex', alignItems: 'center',
        }}
      >
        {icon}
      </span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        style={inputBase}
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
  );
}

interface DropdownOption { value: string; label: string }

function CustomDropdown({
  value, onChange, options, placeholder, icon, disabled,
}: {
  value: string;
  onChange: (val: string) => void;
  options: DropdownOption[];
  placeholder: string;
  icon: React.ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(v => !v)}
        style={{
          ...inputBase,
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          paddingLeft: '2.5rem', paddingRight: '2.5rem',
          cursor: disabled ? 'not-allowed' : 'pointer',
          textAlign: 'left',
          borderColor: open ? '#0c2a4f' : '#e5e7eb',
          boxShadow: open ? '0 0 0 3px rgba(12,42,79,0.10)' : 'none',
          background: open ? '#fff' : '#f9fafb',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span style={{ position: 'absolute', left: '0.875rem', color: '#9ca3af', display: 'flex', alignItems: 'center' }}>
          {icon}
        </span>
        <span style={{ flex: 1, color: selected ? '#111827' : '#9ca3af', fontSize: '0.875rem' }}>
          {selected ? selected.label : placeholder}
        </span>
        <span style={{ position: 'absolute', right: '0.875rem', color: '#9ca3af', display: 'flex', alignItems: 'center', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          <ChevronDown size={15} />
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 50,
              background: '#fff', borderRadius: '0.75rem', overflow: 'hidden',
              border: '1.5px solid #e5e7eb',
              boxShadow: '0 8px 30px rgba(4,17,31,0.12), 0 2px 8px rgba(4,17,31,0.06)',
            }}
          >
            {options.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0.65rem 1rem', fontSize: '0.875rem', textAlign: 'left',
                  background: opt.value === value ? '#f0f4f9' : 'transparent',
                  color: opt.value === value ? '#0c2a4f' : '#374151',
                  fontWeight: opt.value === value ? 600 : 400,
                  border: 'none', cursor: 'pointer', transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (opt.value !== value) (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb'; }}
                onMouseLeave={e => { if (opt.value !== value) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              >
                {opt.label}
                {opt.value === value && <Check size={14} style={{ color: '#0c2a4f', flexShrink: 0 }} />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FieldLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <label
      style={{
        display: 'flex', alignItems: 'center', gap: '0.375rem',
        fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem',
      }}
    >
      <span style={{ color: '#9ca3af', display: 'flex', alignItems: 'center' }}>{icon}</span>
      {children}
    </label>
  );
}

export default function SignupPage() {
  const [name, setName]                   = useState('');
  const [email, setEmail]                 = useState('');
  const [password, setPassword]           = useState('');
  const [confirmPassword, setConfirm]     = useState('');
  const [role, setRole]                   = useState('');
  const [gabineteId, setGabineteId]       = useState('');
  const [novoGabinete, setNovoGabinete]   = useState('');
  const [criarNovo, setCriarNovo]         = useState(false);
  const [gabinetes, setGabinetes]         = useState<Gabinete[]>([]);
  const [loadingGabs, setLoadingGabs]     = useState(true);
  const [error, setError]                 = useState('');
  const [success, setSuccess]             = useState('');
  const [loading, setLoading]             = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/gabinetes')
      .then(r => r.ok ? r.json() : [])
      .then(d => setGabinetes(d))
      .catch(() => {})
      .finally(() => setLoadingGabs(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!role) { setError('Selecione sua função'); return; }
    if (criarNovo && role === 'CHEFE') {
      if (!novoGabinete.trim()) { setError('Digite o nome do novo gabinete'); return; }
    } else if (!gabineteId) {
      setError('Selecione um gabinete');
      return;
    }
    if (password !== confirmPassword) { setError('As senhas não coincidem'); return; }
    if (password.length < 6) { setError('A senha deve ter pelo menos 6 caracteres'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, email, password, role,
          gabineteId: criarNovo ? null : gabineteId,
          novoGabinete: criarNovo ? novoGabinete : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Erro ao realizar cadastro'); return; }
      if (data.isFirstUser) {
        const result = await signIn('credentials', { email, password, redirect: false });
        if (!result?.error) router.replace('/dashboard');
      } else {
        setSuccess(data.message);
      }
    } catch {
      setError('Erro ao realizar cadastro');
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
        {/* Linha dourada */}
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
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-7"
              style={{ background: 'rgba(201,162,39,0.12)', border: '1px solid rgba(201,162,39,0.35)' }}
            >
              <Shield className="w-3.5 h-3.5" style={{ color: '#c9a227' }} />
              <span className="text-xs font-semibold tracking-wide" style={{ color: '#c9a227' }}>
                CADASTRO DE USUÁRIO · ACESSO CONTROLADO
              </span>
            </div>

            <h1 className="text-[2.4rem] font-extrabold text-white leading-tight mb-4">
              Sistema de Gestão<br />
              <span style={{ color: '#c9a227' }}>de Gabinete Político</span>
            </h1>
            <p className="text-gray-400 text-[0.95rem] leading-relaxed mb-10 max-w-xs">
              Plataforma integrada para gestão de demandas, análise eleitoral e organização do gabinete.
            </p>

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
                    style={{ background: 'rgba(201,162,39,0.12)', border: '1px solid rgba(201,162,39,0.3)' }}
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
        <div className="w-full max-w-[440px] py-8">

          {/* Logo mobile */}
          <div className="lg:hidden flex flex-col items-center mb-10">
            <img src="/logo.png" alt="AdminHub" className="w-16 h-16 object-contain mb-3" />
            <h2 className="text-xl font-bold" style={{ color: '#04111f' }}>AdminHub</h2>
          </div>

          {/* Card */}
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
            <div className="mb-6">
              <h2 className="text-[1.5rem] font-bold mb-1" style={{ color: '#04111f' }}>
                Criar Conta
              </h2>
              <p className="text-sm" style={{ color: '#6b7280' }}>
                Preencha os dados para solicitar acesso à plataforma
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">

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

              {/* Sucesso */}
              {success && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 rounded-xl text-sm"
                  style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#15803d' }}
                >
                  {success}
                  <Link href="/login" className="block mt-2 font-semibold hover:underline">
                    Ir para o login →
                  </Link>
                </motion.div>
              )}

              {/* Função — cards de seleção */}
              <div>
                <FieldLabel icon={<Briefcase size={15} />}>Função</FieldLabel>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
                  {[
                    { value: 'CHEFE',    label: 'Chefe de Gabinete', icon: Building2, desc: 'Gerencia o gabinete' },
                    { value: 'ASSESSOR', label: 'Assessor',          icon: User,      desc: 'Membro da equipe'   },
                  ].map(({ value: v, label, icon: Icon, desc }) => {
                    const active = role === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => { setRole(v); if (v === 'ASSESSOR') setCriarNovo(false); }}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                          gap: '0.375rem', padding: '0.875rem', borderRadius: '0.875rem',
                          border: active ? '2px solid #0c2a4f' : '1.5px solid #e5e7eb',
                          background: active ? '#f0f4f9' : '#f9fafb',
                          cursor: 'pointer', transition: 'all 0.15s', textAlign: 'left',
                          boxShadow: active ? '0 0 0 3px rgba(12,42,79,0.08)' : 'none',
                          position: 'relative',
                        }}
                      >
                        <span style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 32, height: 32, borderRadius: '0.5rem',
                          background: active ? '#0c2a4f' : '#e5e7eb',
                          color: active ? '#fff' : '#9ca3af',
                          transition: 'all 0.15s',
                        }}>
                          <Icon size={15} />
                        </span>
                        <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: active ? '#0c2a4f' : '#374151' }}>
                          {label}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: active ? '#4a6fa5' : '#9ca3af' }}>
                          {desc}
                        </span>
                        {active && (
                          <span style={{
                            position: 'absolute', top: '0.5rem', right: '0.5rem',
                            width: 18, height: 18, borderRadius: '50%',
                            background: '#0c2a4f', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <Check size={11} color="#fff" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Gabinete */}
              {role && (
                <div>
                  <FieldLabel icon={<Building2 size={15} />}>Gabinete</FieldLabel>
                  {!criarNovo ? (
                    <>
                      <CustomDropdown
                        value={gabineteId}
                        onChange={val => setGabineteId(val)}
                        placeholder={loadingGabs ? 'Carregando...' : 'Selecione um gabinete'}
                        icon={<Building2 size={15} />}
                        disabled={loadingGabs}
                        options={gabinetes.map(g => ({ value: g.id, label: g.nome }))}
                      />
                      {role === 'CHEFE' && (
                        <button
                          type="button"
                          onClick={() => setCriarNovo(true)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '0.25rem',
                            marginTop: '0.5rem', fontSize: '0.8125rem', fontWeight: 600,
                            color: '#0c2a4f', background: 'none', border: 'none',
                            cursor: 'pointer', padding: 0,
                          }}
                        >
                          <Plus size={14} />
                          Criar novo gabinete
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <StyledInput
                        placeholder="Ex: Gabinete Deputado Silva"
                        value={novoGabinete}
                        onChange={e => setNovoGabinete(e.target.value)}
                        icon={<Building2 size={15} />}
                      />
                      <button
                        type="button"
                        onClick={() => { setCriarNovo(false); setNovoGabinete(''); }}
                        style={{
                          marginTop: '0.5rem', fontSize: '0.8125rem',
                          color: '#6b7280', background: 'none', border: 'none',
                          cursor: 'pointer', padding: 0,
                        }}
                      >
                        ← Selecionar gabinete existente
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Divisor */}
              <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: '0.5rem' }} />

              {/* Nome */}
              <div>
                <FieldLabel icon={<User size={15} />}>Nome completo</FieldLabel>
                <StyledInput
                  placeholder="Seu nome"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  icon={<User size={15} />}
                  required
                />
              </div>

              {/* Email */}
              <div>
                <FieldLabel icon={<Mail size={15} />}>E-mail</FieldLabel>
                <StyledInput
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  icon={<Mail size={15} />}
                  required
                />
              </div>

              {/* Senha */}
              <div>
                <FieldLabel icon={<Lock size={15} />}>Senha</FieldLabel>
                <StyledInput
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  icon={<Lock size={15} />}
                  required
                />
              </div>

              {/* Confirmar senha */}
              <div>
                <FieldLabel icon={<Lock size={15} />}>Confirmar senha</FieldLabel>
                <StyledInput
                  type="password"
                  placeholder="Repita a senha"
                  value={confirmPassword}
                  onChange={e => setConfirm(e.target.value)}
                  icon={<Lock size={15} />}
                  required
                />
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
                  marginTop: '0.5rem',
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
                    Cadastrando...
                  </>
                ) : (
                  <>
                    Criar Conta
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Divisor */}
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px" style={{ background: '#f0f0f0' }} />
              <span className="text-xs" style={{ color: '#d1d5db' }}>ou</span>
              <div className="flex-1 h-px" style={{ background: '#f0f0f0' }} />
            </div>

            <p className="text-center text-sm" style={{ color: '#6b7280' }}>
              Já tem conta?{' '}
              <Link href="/login" className="font-semibold hover:underline" style={{ color: '#0c2a4f' }}>
                Faça login
              </Link>
            </p>
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
