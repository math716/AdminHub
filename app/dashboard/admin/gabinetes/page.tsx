'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  Building2, Link2, Copy, CheckCheck, Clock, CheckCircle2,
  XCircle, AlertCircle, Loader2, RefreshCw, ChevronDown, ChevronUp,
  User, Mail, Calendar,
} from 'lucide-react';
import { toast } from 'sonner';

interface Solicitacao {
  id: string;
  gabineteNome: string;
  userName: string;
  userEmail: string;
  status: 'PENDENTE' | 'APROVADA' | 'RECUSADA';
  motivoRecusa?: string;
  reviewedAt?: string;
  createdAt: string;
}

function StatusBadge({ status }: { status: Solicitacao['status'] }) {
  const map = {
    PENDENTE:  { label: 'Pendente',  color: '#92400e', bg: '#fef3c7', icon: <Clock size={13} /> },
    APROVADA:  { label: 'Aprovada',  color: '#065f46', bg: '#d1fae5', icon: <CheckCircle2 size={13} /> },
    RECUSADA:  { label: 'Recusada',  color: '#991b1b', bg: '#fee2e2', icon: <XCircle size={13} /> },
  };
  const s = map[status];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.65rem', borderRadius: '999px', background: s.bg, color: s.color, fontSize: '0.75rem', fontWeight: 600 }}>
      {s.icon}{s.label}
    </span>
  );
}

function SolicitacaoCard({ sol, onAcao }: { sol: Solicitacao; onAcao: () => void }) {
  const [expanded,      setExpanded]      = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [motivoRecusa,  setMotivoRecusa]  = useState('');
  const [showRecusa,    setShowRecusa]    = useState(false);

  async function agir(acao: 'APROVAR' | 'RECUSAR') {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/solicitacoes-gabinete/${sol.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao, motivoRecusa }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(acao === 'APROVAR' ? 'Gabinete criado com sucesso!' : 'Solicitação recusada');
        onAcao();
      } else {
        toast.error(data.error || 'Erro ao processar');
      }
    } catch {
      toast.error('Erro de conexão');
    } finally {
      setLoading(false);
      setShowRecusa(false);
    }
  }

  const dt = new Date(sol.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{ background: '#fff', borderRadius: '1rem', border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
      {/* Cabeçalho */}
      <div
        style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setExpanded(v => !v)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ width: 38, height: 38, borderRadius: '0.65rem', background: 'linear-gradient(135deg,#0d2f52,#1b4f85)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Building2 size={18} color="#c9a227" />
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: '#111827' }}>{sol.gabineteNome}</p>
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b7280', marginTop: '0.1rem' }}>{sol.userName} · {sol.userEmail}</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <StatusBadge status={sol.status} />
          {expanded ? <ChevronUp size={16} color="#9ca3af" /> : <ChevronDown size={16} color="#9ca3af" />}
        </div>
      </div>

      {/* Detalhes expandidos */}
      {expanded && (
        <div style={{ borderTop: '1px solid #f3f4f6', padding: '1rem 1.25rem', background: '#fafafa' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: '#374151' }}>
              <User size={14} color="#6b7280" />
              <span><strong>Agente:</strong> {sol.userName}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: '#374151' }}>
              <Mail size={14} color="#6b7280" />
              <span>{sol.userEmail}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: '#374151' }}>
              <Calendar size={14} color="#6b7280" />
              <span><strong>Enviado em:</strong> {dt}</span>
            </div>
            {sol.motivoRecusa && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.82rem', color: '#991b1b', gridColumn: '1/-1' }}>
                <AlertCircle size={14} style={{ marginTop: 2, flexShrink: 0 }} />
                <span><strong>Motivo da recusa:</strong> {sol.motivoRecusa}</span>
              </div>
            )}
          </div>

          {sol.status === 'PENDENTE' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {showRecusa && (
                <textarea
                  placeholder="Motivo da recusa (opcional)"
                  value={motivoRecusa}
                  onChange={e => setMotivoRecusa(e.target.value)}
                  rows={2}
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '0.65rem', border: '1.5px solid #e5e7eb', fontSize: '0.82rem', resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
              )}
              <div style={{ display: 'flex', gap: '0.65rem' }}>
                <button
                  onClick={() => agir('APROVAR')} disabled={loading}
                  style={{ flex: 1, padding: '0.6rem', borderRadius: '0.65rem', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.85rem', color: '#fff', background: loading ? '#9ca3af' : 'linear-gradient(135deg,#065f46,#059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                >
                  {loading ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={15} />}
                  Aprovar
                </button>
                <button
                  onClick={() => { if (showRecusa) agir('RECUSAR'); else setShowRecusa(true); }}
                  disabled={loading}
                  style={{ flex: 1, padding: '0.6rem', borderRadius: '0.65rem', border: '1.5px solid #fca5a5', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.85rem', color: '#dc2626', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                >
                  <XCircle size={15} />
                  {showRecusa ? 'Confirmar Recusa' : 'Recusar'}
                </button>
                {showRecusa && (
                  <button
                    onClick={() => { setShowRecusa(false); setMotivoRecusa(''); }}
                    style={{ padding: '0.6rem 0.85rem', borderRadius: '0.65rem', border: '1.5px solid #e5e7eb', cursor: 'pointer', fontSize: '0.82rem', color: '#6b7280', background: '#fff' }}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminGabinetesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [solicitacoes,  setSolicitacoes]  = useState<Solicitacao[]>([]);
  const [loadingSol,    setLoadingSol]    = useState(true);
  const [gerandoLink,   setGerandoLink]   = useState(false);
  const [linkGerado,    setLinkGerado]    = useState('');
  const [linkExpiry,    setLinkExpiry]    = useState('');
  const [copiado,       setCopiado]       = useState(false);
  const [filtro,        setFiltro]        = useState<'TODAS' | 'PENDENTE' | 'APROVADA' | 'RECUSADA'>('PENDENTE');

  const role = (session?.user as any)?.role;

  useEffect(() => {
    if (status === 'unauthenticated') { router.replace('/login'); return; }
    if (status === 'authenticated' && role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      router.replace('/dashboard');
    }
  }, [status, role, router]);

  const carregarSolicitacoes = useCallback(async () => {
    setLoadingSol(true);
    try {
      const res = await fetch('/api/admin/solicitacoes-gabinete', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) setSolicitacoes(data.solicitacoes);
    } finally {
      setLoadingSol(false);
    }
  }, []);

  useEffect(() => { if (status === 'authenticated') carregarSolicitacoes(); }, [status, carregarSolicitacoes]);

  async function gerarLink() {
    setGerandoLink(true);
    setLinkGerado('');
    try {
      const res = await fetch('/api/admin/gabinete-convite', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setLinkGerado(data.url);
        const expiry = new Date(data.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        setLinkExpiry(expiry);
        toast.success('Link gerado! Válido por 1 hora.');
      } else {
        toast.error(data.error || 'Erro ao gerar link');
      }
    } catch {
      toast.error('Erro de conexão');
    } finally {
      setGerandoLink(false);
    }
  }

  async function copiarLink() {
    if (!linkGerado) return;
    await navigator.clipboard.writeText(linkGerado);
    setCopiado(true);
    toast.success('Link copiado!');
    setTimeout(() => setCopiado(false), 2500);
  }

  const filtradas = solicitacoes.filter(s => filtro === 'TODAS' || s.status === filtro);
  const pendentes = solicitacoes.filter(s => s.status === 'PENDENTE').length;

  if (status === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: '#1b4f85' }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ padding: '1.75rem', maxWidth: 860, margin: '0 auto' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* Título */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ width: 44, height: 44, borderRadius: '0.875rem', background: 'linear-gradient(135deg,#0d2f52,#1b4f85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Building2 size={22} color="#c9a227" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: '#111827' }}>Administração de Gabinetes</h1>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280' }}>Gerencie solicitações de criação de novos gabinetes</p>
          </div>
        </div>
        <button
          onClick={carregarSolicitacoes}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1rem', borderRadius: '0.65rem', border: '1.5px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: '0.82rem', color: '#374151', fontWeight: 500 }}
        >
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      {/* Card: Gerar Link */}
      <div style={{ background: 'linear-gradient(135deg,#0d2f52,#1b4f85)', borderRadius: '1.1rem', padding: '1.5rem', marginBottom: '1.75rem', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <Link2 size={18} color="#c9a227" />
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Link de Convite para Novo Gabinete</h2>
            </div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'rgba(255,255,255,0.65)' }}>
              Gere um link válido por <strong style={{ color: '#c9a227' }}>1 hora</strong> e envie para o Agente Político. Após preencher o formulário, a solicitação aparecerá abaixo para aprovação.
            </p>
          </div>
          <button
            onClick={gerarLink} disabled={gerandoLink}
            style={{ flexShrink: 0, padding: '0.65rem 1.25rem', borderRadius: '0.75rem', border: 'none', cursor: gerandoLink ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.875rem', color: '#0d2f52', background: gerandoLink ? 'rgba(255,255,255,0.4)' : '#c9a227', display: 'flex', alignItems: 'center', gap: '0.4rem', transition: 'all 0.2s' }}
          >
            {gerandoLink ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Link2 size={16} />}
            {gerandoLink ? 'Gerando...' : 'Gerar Link'}
          </button>
        </div>

        {linkGerado && (
          <div style={{ marginTop: '1rem', background: 'rgba(255,255,255,0.1)', borderRadius: '0.75rem', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <code style={{ flex: 1, fontSize: '0.78rem', color: 'rgba(255,255,255,0.9)', wordBreak: 'break-all', minWidth: 0 }}>{linkGerado}</code>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
              <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>expira às {linkExpiry}</span>
              <button
                onClick={copiarLink}
                style={{ padding: '0.45rem 0.85rem', borderRadius: '0.55rem', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.78rem', color: '#0d2f52', background: copiado ? '#86efac' : '#c9a227', display: 'flex', alignItems: 'center', gap: '0.35rem', transition: 'all 0.2s' }}
              >
                {copiado ? <><CheckCheck size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Filtros + lista */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827' }}>
          Solicitações {pendentes > 0 && <span style={{ marginLeft: '0.4rem', padding: '0.15rem 0.55rem', background: '#fef3c7', color: '#92400e', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700 }}>{pendentes} pendente{pendentes > 1 ? 's' : ''}</span>}
        </h2>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {(['PENDENTE', 'APROVADA', 'RECUSADA', 'TODAS'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              style={{ padding: '0.4rem 0.85rem', borderRadius: '0.55rem', border: '1.5px solid', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, transition: 'all 0.15s', borderColor: filtro === f ? '#1b4f85' : '#e5e7eb', background: filtro === f ? '#0d2f52' : '#fff', color: filtro === f ? '#fff' : '#6b7280' }}
            >
              {f === 'TODAS' ? 'Todas' : f === 'PENDENTE' ? 'Pendentes' : f === 'APROVADA' ? 'Aprovadas' : 'Recusadas'}
            </button>
          ))}
        </div>
      </div>

      {loadingSol ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
          <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 0.75rem' }} />
          <p style={{ margin: 0, fontSize: '0.875rem' }}>Carregando solicitações...</p>
        </div>
      ) : filtradas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', background: '#fff', borderRadius: '1rem', border: '1px solid #e5e7eb', color: '#9ca3af' }}>
          <Building2 size={40} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
          <p style={{ margin: 0, fontWeight: 600, color: '#6b7280' }}>Nenhuma solicitação {filtro !== 'TODAS' ? filtro.toLowerCase() : ''}</p>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem' }}>Gere um link de convite e compartilhe com o Agente Político</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filtradas.map(sol => (
            <SolicitacaoCard key={sol.id} sol={sol} onAcao={carregarSolicitacoes} />
          ))}
        </div>
      )}
    </div>
  );
}
