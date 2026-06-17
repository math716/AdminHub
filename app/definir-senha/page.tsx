'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { KeyRound, Eye, EyeOff, Loader2, CheckCircle2, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';

export default function DefinirSenhaPage() {
  const { data: session, update } = useSession();

  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew,         setShowNew]         = useState(false);
  const [showConfirm,     setShowConfirm]     = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState('');
  const [done,            setDone]            = useState(false);

  const userName = (session?.user as any)?.name ?? '';

  const validate = () => {
    if (newPassword.length < 8) return 'A senha deve ter ao menos 8 caracteres.';
    if (newPassword !== confirmPassword) return 'As senhas não coincidem.';
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/users/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Erro ao alterar senha.'); return; }
      setDone(true);
      // Atualiza o JWT para limpar mustChangePassword e faz hard navigation
      // para garantir que o middleware leia o cookie atualizado
      await update();
      setTimeout(() => { window.location.replace('/dashboard'); }, 1200);
    } catch {
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#fff',
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg,#020d1a 0%,#071d36 50%,#04111f 100%)' }}>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md">

        {/* Logo / ícone */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(37,99,235,0.3)' }}>
            <ShieldCheck className="w-8 h-8" style={{ color: '#2563EB' }} />
          </div>
          <h1 className="text-white font-bold text-2xl tracking-tight">Definir Nova Senha</h1>
          {userName && (
            <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Olá, <span style={{ color: '#2563EB' }}>{userName}</span>. Por segurança, defina uma senha pessoal antes de continuar.
            </p>
          )}
        </div>

        <div className="rounded-2xl p-8 space-y-5"
          style={{ background: 'var(--bg-card-raised)', border: '1px solid rgba(37,99,235,0.15)', backdropFilter: 'blur(12px)' }}>

          {done ? (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="py-6 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 mx-auto" style={{ color: '#4ade80' }} />
              <p className="text-white font-semibold text-lg">Senha alterada com sucesso!</p>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>Redirecionando para o sistema…</p>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Nova Senha */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Nova Senha
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                    style={{ color: 'rgba(255,255,255,0.3)' }} />
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    required
                    className="w-full pl-10 pr-10 py-3 rounded-xl text-sm outline-none placeholder:text-slate-600"
                    style={inputStyle}
                  />
                  <button type="button" onClick={() => setShowNew(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-70"
                    style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirmar Senha */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Confirmar Senha
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                    style={{ color: 'rgba(255,255,255,0.3)' }} />
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Repita a nova senha"
                    required
                    className="w-full pl-10 pr-10 py-3 rounded-xl text-sm outline-none placeholder:text-slate-600"
                    style={inputStyle}
                  />
                  <button type="button" onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-70"
                    style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Força da senha */}
              {newPassword.length > 0 && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1,2,3,4].map(i => (
                      <div key={i} className="flex-1 h-1 rounded-full transition-all"
                        style={{
                          background: newPassword.length >= i * 3
                            ? (newPassword.length >= 12 ? '#4ade80' : newPassword.length >= 8 ? '#f59e0b' : '#ef4444')
                            : 'rgba(255,255,255,0.1)',
                        }} />
                    ))}
                  </div>
                  <p className="text-[10px]" style={{
                    color: newPassword.length >= 12 ? '#4ade80' : newPassword.length >= 8 ? '#f59e0b' : '#ef4444',
                  }}>
                    {newPassword.length >= 12 ? 'Senha forte' : newPassword.length >= 8 ? 'Senha aceitável' : 'Muito curta'}
                  </p>
                </div>
              )}

              {/* Erro */}
              {error && (
                <p className="text-sm rounded-xl px-4 py-3"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}>
                  {error}
                </p>
              )}

              <button type="submit" disabled={loading}
                className="w-full py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
                style={{ background: 'linear-gradient(135deg,#2563EB,#3B82F6)', color: '#04111f' }}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                {loading ? 'Salvando...' : 'Definir Nova Senha'}
              </button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
