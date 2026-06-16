'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Building2, User, Mail, Lock, Loader2, CheckCircle2, AlertCircle, BarChart3, Users, MapPin, Landmark } from 'lucide-react';
import { motion } from 'framer-motion';

const FEATURES = [
  { icon: BarChart3,  label: 'Mapa Eleitoral com dados do TSE' },
  { icon: Users,      label: 'Gestão de Demandas e Contatos' },
  { icon: MapPin,     label: 'Projeção de Campanha por Município' },
  { icon: Landmark,   label: 'Emendas Parlamentares Federais e Estaduais' },
];

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
          {icon}
        </span>
        {children}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', paddingLeft: '2.5rem', paddingRight: '1rem',
  paddingTop: '0.75rem', paddingBottom: '0.75rem',
  borderRadius: '0.75rem', fontSize: '0.875rem', outline: 'none',
  transition: 'all 0.15s', background: '#f9fafb',
  border: '1.5px solid #e5e7eb', color: '#111827', boxSizing: 'border-box',
};

export default function RegistroGabinetePage() {
  const params   = useParams();
  const router   = useRouter();
  const token    = params?.token as string;

  const [tokenValid,   setTokenValid]   = useState<boolean | null>(null);
  const [tokenError,   setTokenError]   = useState('');

  const [gabineteNome,     setGabineteNome]     = useState('');
  const [userName,         setUserName]         = useState('');
  const [userEmail,        setUserEmail]        = useState('');
  const [password,         setPassword]         = useState('');
  const [confirmPassword,  setConfirmPassword]  = useState('');

  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/registro-gabinete/${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => {
        if (d.valid) setTokenValid(true);
        else { setTokenValid(false); setTokenError(d.error || 'Link inválido'); }
      })
      .catch(() => { setTokenValid(false); setTokenError('Erro ao validar link'); });
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) { setError('As senhas não coincidem'); return; }
    if (password.length < 6) { setError('A senha deve ter no mínimo 6 caracteres'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/registro-gabinete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, gabineteNome, userName, userEmail, password, confirmPassword }),
      });
      const data = await res.json();
      if (res.ok) setSuccess(true);
      else setError(data.error || 'Erro ao enviar solicitação');
    } catch {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'linear-gradient(135deg, #f0f4f8 0%, #e8f0fe 100%)' }}>
      {/* Painel esquerdo */}
      <div style={{ display: 'none', flex: '0 0 420px', background: 'linear-gradient(160deg, #0d2f52 0%, #1b4f85 60%, #0a1f38 100%)', padding: '3rem 2.5rem', flexDirection: 'column', justifyContent: 'center' }} className="left-panel">
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ width: 48, height: 48, borderRadius: '0.875rem', background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem' }}>
            <Building2 size={26} color="#c9a227" />
          </div>
          <h1 style={{ color: '#fff', fontSize: '1.7rem', fontWeight: 700, lineHeight: 1.2, margin: 0 }}>AdminHub</h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.85rem', marginTop: '0.4rem' }}>Plataforma de Gestão Parlamentar</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {FEATURES.map(({ icon: Icon, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div style={{ width: 36, height: 36, borderRadius: '0.6rem', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={17} color="#c9a227" />
              </div>
              <span style={{ color: 'rgba(255,255,255,0.82)', fontSize: '0.875rem' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Painel direito */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          style={{ background: '#fff', borderRadius: '1.25rem', boxShadow: '0 8px 40px rgba(0,0,0,0.1)', padding: '2.25rem 2rem', width: '100%', maxWidth: 440 }}
        >
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
            <div style={{ width: 52, height: 52, borderRadius: '1rem', background: 'linear-gradient(135deg, #0d2f52, #1b4f85)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
              <Building2 size={24} color="#c9a227" />
            </div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#111827', margin: 0 }}>Solicitar Criação de Gabinete</h2>
            <p style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: '0.35rem' }}>Preencha os dados para enviar sua solicitação</p>
          </div>

          {/* Token inválido */}
          {tokenValid === false && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.75rem', color: '#dc2626' }}>
              <AlertCircle size={18} />
              <div>
                <p style={{ fontWeight: 600, margin: 0, fontSize: '0.875rem' }}>Link inválido</p>
                <p style={{ margin: 0, fontSize: '0.8rem' }}>{tokenError}</p>
              </div>
            </div>
          )}

          {/* Validando */}
          {tokenValid === null && (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: '#6b7280' }}>
              <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 0.5rem' }} />
              <p style={{ fontSize: '0.875rem' }}>Validando link...</p>
            </div>
          )}

          {/* Sucesso */}
          {success && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: 'center', padding: '1.5rem 0' }}>
              <CheckCircle2 size={52} color="#16a34a" style={{ margin: '0 auto 1rem' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827', margin: '0 0 0.5rem' }}>Solicitação enviada!</h3>
              <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0 }}>
                Sua solicitação foi recebida e será analisada por um administrador. Você receberá acesso após a aprovação.
              </p>
            </motion.div>
          )}

          {/* Formulário */}
          {tokenValid === true && !success && (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ padding: '0.75rem 1rem', background: '#f0f9ff', borderRadius: '0.75rem', border: '1px solid #bae6fd', fontSize: '0.8rem', color: '#0369a1' }}>
                <strong>Dados do Gabinete</strong>
              </div>

              <Field label="Nome do Gabinete *" icon={<Building2 size={16} />}>
                <input
                  style={inputStyle} type="text" placeholder="Ex: Gabinete do Vereador João Silva"
                  value={gabineteNome} onChange={e => setGabineteNome(e.target.value)} required
                  onFocus={e => { e.target.style.borderColor = '#0c2a4f'; e.target.style.background = '#fff'; }}
                  onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.background = '#f9fafb'; }}
                />
              </Field>

              <div style={{ padding: '0.75rem 1rem', background: '#f0f9ff', borderRadius: '0.75rem', border: '1px solid #bae6fd', fontSize: '0.8rem', color: '#0369a1', marginTop: '0.25rem' }}>
                <strong>Dados do Agente Político</strong>
              </div>

              <Field label="Seu Nome *" icon={<User size={16} />}>
                <input
                  style={inputStyle} type="text" placeholder="Nome completo"
                  value={userName} onChange={e => setUserName(e.target.value)} required
                  onFocus={e => { e.target.style.borderColor = '#0c2a4f'; e.target.style.background = '#fff'; }}
                  onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.background = '#f9fafb'; }}
                />
              </Field>

              <Field label="E-mail *" icon={<Mail size={16} />}>
                <input
                  style={inputStyle} type="email" placeholder="seu@email.com"
                  value={userEmail} onChange={e => setUserEmail(e.target.value)} required
                  onFocus={e => { e.target.style.borderColor = '#0c2a4f'; e.target.style.background = '#fff'; }}
                  onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.background = '#f9fafb'; }}
                />
              </Field>

              <Field label="Senha *" icon={<Lock size={16} />}>
                <input
                  style={inputStyle} type="password" placeholder="Mínimo 6 caracteres"
                  value={password} onChange={e => setPassword(e.target.value)} required
                  onFocus={e => { e.target.style.borderColor = '#0c2a4f'; e.target.style.background = '#fff'; }}
                  onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.background = '#f9fafb'; }}
                />
              </Field>

              <Field label="Confirmar Senha *" icon={<Lock size={16} />}>
                <input
                  style={inputStyle} type="password" placeholder="Repita a senha"
                  value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required
                  onFocus={e => { e.target.style.borderColor = '#0c2a4f'; e.target.style.background = '#fff'; }}
                  onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.background = '#f9fafb'; }}
                />
              </Field>

              {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.75rem', color: '#dc2626', fontSize: '0.875rem' }}>
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}

              <button
                type="submit" disabled={loading}
                style={{ width: '100%', padding: '0.85rem', borderRadius: '0.75rem', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.9rem', color: '#fff', background: loading ? '#9ca3af' : 'linear-gradient(135deg, #0d2f52, #1b4f85)', transition: 'all 0.2s', marginTop: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
              >
                {loading ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Enviando...</> : 'Enviar Solicitação'}
              </button>
            </form>
          )}
        </motion.div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } @media (min-width: 768px) { .left-panel { display: flex !important; } }`}</style>
    </div>
  );
}
