'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  Mail, Lock, Shield, Loader2, BarChart3, Users, MapPin, Landmark,
  Building2, User, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { motion } from 'framer-motion';

const FEATURES = [
  { icon: BarChart3, label: 'Mapa Eleitoral com dados do TSE' },
  { icon: Users,     label: 'Gestão de Demandas e Contatos' },
  { icon: MapPin,    label: 'Projeção de Campanha por Município' },
  { icon: Landmark,  label: 'Emendas Parlamentares Federais e Estaduais' },
];

const inputClass = 'w-full pl-10 pr-4 py-3 rounded-xl text-sm outline-none transition-all';
const inputStyle = { background: '#f9fafb', border: '1.5px solid #e5e7eb', color: '#111827' };
const onFocus = (e: React.FocusEvent<HTMLInputElement>) => {
  e.target.style.borderColor = '#0c2a4f';
  e.target.style.boxShadow = '0 0 0 3px rgba(12,42,79,0.10)';
  e.target.style.background = '#fff';
};
const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
  e.target.style.borderColor = '#e5e7eb';
  e.target.style.boxShadow = 'none';
  e.target.style.background = '#f9fafb';
};

function FormField({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold mb-2" style={{ color: '#374151' }}>{label}</label>
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#9ca3af', display: 'flex' }}>
          {icon}
        </span>
        {children}
      </div>
    </div>
  );
}

export default function RegistroGabinetePage() {
  const params = useParams();
  const token  = params?.token as string;

  const [tokenValid,  setTokenValid]  = useState<boolean | null>(null);
  const [tokenError,  setTokenError]  = useState('');

  const [gabineteNome,    setGabineteNome]    = useState('');
  const [userName,        setUserName]        = useState('');
  const [userEmail,       setUserEmail]       = useState('');
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState(false);

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
    <div className="min-h-screen flex" style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* ── Painel esquerdo: Branding (idêntico ao login) ─────────────────── */}
      <motion.div
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6 }}
        className="hidden lg:flex flex-col justify-between w-[46%] relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #04111f 0%, #071d36 45%, #0c2a4f 100%)' }}
      >
        {/* Grade sutil */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }} />

        {/* Brilhos decorativos */}
        <div className="absolute -top-40 -left-40 w-[480px] h-[480px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(201,162,39,0.12), transparent 70%)' }} />
        <div className="absolute -bottom-48 -right-24 w-[420px] h-[420px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(30,74,128,0.35), transparent 70%)' }} />

        {/* Linha dourada */}
        <div className="absolute left-0 top-0 bottom-0 w-[3px]"
          style={{ background: 'linear-gradient(to bottom, transparent, #c9a227 30%, #c9a227 70%, transparent)' }} />

        {/* Logo topo */}
        <div className="relative z-10 px-12 pt-12 flex items-center gap-3">
          <img src="/logo.png" alt="AdminHub" style={{ width: 150, height: 150, objectFit: 'contain' }} />
          <span className="text-white font-light text-xl tracking-widest uppercase">AdminHub</span>
        </div>

        {/* Conteúdo central */}
        <div className="relative z-10 px-12 pb-2">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6 }}>
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-7"
              style={{ background: 'rgba(201,162,39,0.12)', border: '1px solid rgba(201,162,39,0.35)' }}>
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
                <motion.div key={i} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.12 }} className="flex items-center gap-3.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(201,162,39,0.12)', border: '1px solid rgba(201,162,39,0.3)' }}>
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
        <div className="w-full max-w-[440px]">

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
            style={{ background: '#ffffff', boxShadow: '0 8px 40px rgba(4,17,31,0.10), 0 1px 3px rgba(4,17,31,0.06)', border: '1px solid rgba(4,17,31,0.06)' }}
          >
            {/* Título */}
            <div className="mb-6">
              <h2 className="text-[1.5rem] font-bold mb-1" style={{ color: '#04111f' }}>
                Solicitar Criação de Gabinete
              </h2>
              <p className="text-sm" style={{ color: '#6b7280' }}>
                Preencha os dados para enviar sua solicitação
              </p>
            </div>

            {/* Token inválido */}
            {tokenValid === false && (
              <div className="flex items-center gap-3 p-4 rounded-xl text-sm mb-4"
                style={{ background: '#fff1f1', border: '1px solid #fca5a5', color: '#b91c1c' }}>
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <div>
                  <p className="font-semibold">Link inválido ou expirado</p>
                  <p className="text-xs mt-0.5">{tokenError}</p>
                </div>
              </div>
            )}

            {/* Validando token */}
            {tokenValid === null && (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                <Loader2 className="w-7 h-7 animate-spin mb-2" style={{ color: '#0c2a4f' }} />
                <p className="text-sm">Validando link...</p>
              </div>
            )}

            {/* Sucesso */}
            {success && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center text-center py-6">
                <CheckCircle2 className="w-14 h-14 mb-4" style={{ color: '#16a34a' }} />
                <h3 className="text-lg font-bold mb-2" style={{ color: '#04111f' }}>Solicitação enviada!</h3>
                <p className="text-sm" style={{ color: '#6b7280' }}>
                  Sua solicitação foi recebida e será analisada por um administrador. Você receberá acesso após a aprovação.
                </p>
              </motion.div>
            )}

            {/* Formulário */}
            {tokenValid === true && !success && (
              <form onSubmit={handleSubmit} className="space-y-4">

                {/* Seção Gabinete */}
                <div className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: '#f0f4f9', color: '#0c2a4f', border: '1px solid #dbeafe' }}>
                  Dados do Gabinete
                </div>

                <FormField label="Nome do Gabinete *" icon={<Building2 className="w-4 h-4" />}>
                  <input type="text" className={inputClass} style={inputStyle}
                    placeholder="Ex: Gabinete do Vereador João Silva"
                    value={gabineteNome} onChange={e => setGabineteNome(e.target.value)}
                    required onFocus={onFocus} onBlur={onBlur} />
                </FormField>

                {/* Seção Usuário */}
                <div className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: '#f0f4f9', color: '#0c2a4f', border: '1px solid #dbeafe' }}>
                  Dados do Agente Político
                </div>

                <FormField label="Seu Nome *" icon={<User className="w-4 h-4" />}>
                  <input type="text" className={inputClass} style={inputStyle}
                    placeholder="Nome completo"
                    value={userName} onChange={e => setUserName(e.target.value)}
                    required onFocus={onFocus} onBlur={onBlur} />
                </FormField>

                <FormField label="E-mail *" icon={<Mail className="w-4 h-4" />}>
                  <input type="email" className={inputClass} style={inputStyle}
                    placeholder="seu@email.com"
                    value={userEmail} onChange={e => setUserEmail(e.target.value)}
                    required onFocus={onFocus} onBlur={onBlur} />
                </FormField>

                <FormField label="Senha *" icon={<Lock className="w-4 h-4" />}>
                  <input type="password" className={inputClass} style={inputStyle}
                    placeholder="Mínimo 6 caracteres"
                    value={password} onChange={e => setPassword(e.target.value)}
                    required onFocus={onFocus} onBlur={onBlur} />
                </FormField>

                <FormField label="Confirmar Senha *" icon={<Lock className="w-4 h-4" />}>
                  <input type="password" className={inputClass} style={inputStyle}
                    placeholder="Repita a senha"
                    value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                    required onFocus={onFocus} onBlur={onBlur} />
                </FormField>

                {/* Erro */}
                {error && (
                  <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-3 p-4 rounded-xl text-sm"
                    style={{ background: '#fff1f1', border: '1px solid #fca5a5', color: '#b91c1c' }}>
                    <div className="w-4 h-4 rounded-full mt-0.5 flex-shrink-0" style={{ background: '#dc2626' }} />
                    {error}
                  </motion.div>
                )}

                {/* Botão */}
                <button
                  type="submit" disabled={loading}
                  className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
                  style={{
                    background: loading ? '#6b7280' : 'linear-gradient(135deg, #071d36 0%, #0c2a4f 60%, #1e4a80 100%)',
                    color: '#fff', border: 'none',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    boxShadow: loading ? 'none' : '0 4px 18px rgba(7,29,54,0.35)',
                    letterSpacing: '0.02em',
                  }}
                  onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.12)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1)'; }}
                >
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</> : 'Enviar Solicitação'}
                </button>
              </form>
            )}
          </motion.div>

          {/* Nota de segurança */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
            className="flex items-center justify-center gap-2 mt-6">
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
