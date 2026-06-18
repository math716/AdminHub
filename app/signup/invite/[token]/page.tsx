'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, User, Loader2, CheckCircle2, AlertCircle, Building2, BarChart3, Users, MapPin } from 'lucide-react';
import { motion } from 'framer-motion';

const FEATURES = [
  { icon: BarChart3, label: 'Mapa Eleitoral com dados do TSE' },
  { icon: Users,     label: 'Gestão de Demandas e Contatos' },
  { icon: MapPin,    label: 'Projeção de Campanha por Município' },
];

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
};

function StyledInput({ type = 'text', placeholder, value, onChange, icon, required }: {
  type?: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  icon: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <span style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
        {icon}
      </span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        style={inputBase}
        onFocus={e => { e.target.style.borderColor = '#0c2a4f'; e.target.style.boxShadow = '0 0 0 3px rgba(12,42,79,0.10)'; e.target.style.background = '#fff'; }}
        onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.boxShadow = 'none'; e.target.style.background = '#f9fafb'; }}
      />
    </div>
  );
}

export default function InviteSignupPage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;

  const [gabineteNome, setGabineteNome] = useState('');
  const [inviteRole, setInviteRole] = useState('ASSESSOR');
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [tokenError, setTokenError] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [autoApproved, setAutoApproved] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/invites?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setTokenValid(false);
          setTokenError(data.error);
        } else {
          setTokenValid(true);
          setGabineteNome(data.gabineteNome ?? '');
          setInviteRole(data.role ?? 'ASSESSOR');
        }
      })
      .catch(() => { setTokenValid(false); setTokenError('Erro ao validar convite.'); });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) { setError('A senha deve ter pelo menos 6 caracteres.'); return; }
    if (password !== confirm) { setError('As senhas não coincidem.'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/signup/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, token }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Erro ao realizar cadastro.'); return; }
      setSuccess(data.message ?? 'Cadastro realizado! Aguarde aprovação.');
      setAutoApproved(data.autoApprove ?? false);
    } finally {
      setLoading(false);
    }
  };

  const panelBg = 'linear-gradient(160deg, #04111f 0%, #071d36 60%, #0c2a4f 100%)';

  return (
    <div className="dark" style={{ minHeight: '100vh', display: 'flex', background: 'var(--bg-page)' }}>
      {/* Left branding panel */}
      <div className="hidden lg:flex" style={{ width: '42%', background: panelBg, flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '3rem' }}>
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }} style={{ maxWidth: 360 }}>
          <img src="/logo.png" alt="AdminHub" style={{ width: 140, marginBottom: '2.5rem', filter: 'drop-shadow(0 0 24px rgba(37,99,235,0.3))' }} />
          <h2 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem', lineHeight: 1.3 }}>
            Você foi convidado
          </h2>
          {gabineteNome && (
            <p style={{ color: 'var(--tint-55)', fontSize: '0.875rem', marginBottom: '2rem' }}>
              como <span style={{ color: '#3B82F6', fontWeight: 600 }}>{inviteRole === 'CHEFE' ? 'Chefe de Gabinete' : 'Assessor'}</span> do{' '}
              <span style={{ color: '#3B82F6', fontWeight: 600 }}>{gabineteNome}</span>
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {FEATURES.map(({ icon: Icon, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                <div style={{ width: 36, height: 36, borderRadius: '0.625rem', background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={16} color="#2563EB" />
                </div>
                <span style={{ color: 'var(--tint-65)', fontSize: '0.875rem' }}>{label}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Right form panel */}
      <div style={{ flex: 1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} style={{ width: '100%', maxWidth: 420 }}>

          {/* Mobile logo */}
          <div className="flex lg:hidden justify-center mb-6">
            <img src="/logo.png" alt="AdminHub" style={{ width: 96, filter: 'drop-shadow(0 0 8px rgba(37,99,235,0.2))' }} />
          </div>

          {/* Invalid token */}
          {tokenValid === false && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: '1rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                <AlertCircle size={24} color="#f87171" />
              </div>
              <h2 style={{ fontWeight: 700, fontSize: '1.25rem', color: '#111827', marginBottom: '0.5rem' }}>Convite inválido</h2>
              <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem' }}>{tokenError}</p>
              <Link href="/signup" style={{ color: '#0c2a4f', fontWeight: 600, fontSize: '0.875rem' }}>Fazer cadastro normal →</Link>
            </div>
          )}

          {/* Loading token validation */}
          {tokenValid === null && (
            <div style={{ textAlign: 'center', paddingTop: '3rem' }}>
              <Loader2 size={28} color="#2563EB" style={{ margin: '0 auto', animation: 'spin 1s linear infinite' }} />
              <p style={{ color: '#6b7280', marginTop: '1rem', fontSize: '0.875rem' }}>Validando convite…</p>
            </div>
          )}

          {/* Success */}
          {success && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: '1rem', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                <CheckCircle2 size={24} color="#4ade80" />
              </div>
              <h2 style={{ fontWeight: 700, fontSize: '1.25rem', color: '#111827', marginBottom: '0.5rem' }}>Cadastro realizado!</h2>
              <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem' }}>{success}</p>
              {autoApproved ? (
                <Link href="/login" style={{ display: 'block', textAlign: 'center', padding: '0.75rem', borderRadius: '0.75rem', background: 'linear-gradient(135deg,#071d36,#0c2a4f)', color: '#fff', fontWeight: 600, fontSize: '0.875rem', textDecoration: 'none' }}>
                  Fazer login
                </Link>
              ) : (
                <p style={{ color: '#9ca3af', fontSize: '0.8125rem', textAlign: 'center' }}>Você será notificado quando o acesso for aprovado.</p>
              )}
            </div>
          )}

          {/* Form */}
          {tokenValid === true && !success && (
            <>
              <div style={{ marginBottom: '2rem' }}>
                <h1 style={{ fontWeight: 700, fontSize: '1.5rem', color: '#111827', marginBottom: '0.375rem' }}>Criar conta</h1>
                {gabineteNome && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <Building2 size={14} color="#2563EB" />
                    <span style={{ color: '#2563EB', fontSize: '0.8125rem', fontWeight: 600 }}>{gabineteNome}</span>
                    <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>· {inviteRole === 'CHEFE' ? 'Chefe de Gabinete' : 'Assessor'}</span>
                  </div>
                )}
                <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>Preencha seus dados para ingressar no gabinete.</p>
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <StyledInput
                  placeholder="Nome completo"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  icon={<User size={16} />}
                  required
                />
                <StyledInput
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  icon={<Mail size={16} />}
                  required
                />
                <StyledInput
                  type="password"
                  placeholder="Senha (mín. 6 caracteres)"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  icon={<Lock size={16} />}
                  required
                />
                <StyledInput
                  type="password"
                  placeholder="Confirmar senha"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  icon={<Lock size={16} />}
                  required
                />

                {error && (
                  <p style={{ color: '#dc2626', fontSize: '0.8125rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.625rem', padding: '0.625rem 0.875rem' }}>
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  style={{ width: '100%', padding: '0.8125rem', borderRadius: '0.875rem', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg, #071d36 0%, #0c2a4f 100%)', color: '#fff', fontWeight: 700, fontSize: '0.9375rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', opacity: loading ? 0.7 : 1, transition: 'all 0.15s' }}
                >
                  {loading && <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />}
                  Criar conta
                </button>
              </form>

              <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                Já tem conta?{' '}
                <Link href="/login" style={{ color: '#0c2a4f', fontWeight: 600 }}>Entrar</Link>
              </p>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
