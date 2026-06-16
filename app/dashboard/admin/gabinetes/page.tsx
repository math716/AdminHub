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
    PENDENTE:  { label: 'Pendente',  color: '#e6b83a', bg: 'rgba(201,162,39,0.15)',  border: 'rgba(201,162,39,0.3)',  icon: <Clock size={12} /> },
    APROVADA:  { label: 'Aprovada',  color: '#4ade80', bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.25)',  icon: <CheckCircle2 size={12} /> },
    RECUSADA:  { label: 'Recusada',  color: '#f87171', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.25)',  icon: <XCircle size={12} /> },
  };
  const s = map[status];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0.65rem', borderRadius: '999px', background: s.bg, color: s.color, border: `1px solid ${s.border}`, fontSize: '0.72rem', fontWeight: 600 }}>
      {s.icon}{s.label}
    </span>
  );
}

function SolicitacaoCard({ sol, onAcao }: { sol: Solicitacao; onAcao: () => void }) {
  const [expanded,     setExpanded]     = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [motivoRecusa, setMotivoRecusa] = useState('');
  const [showRecusa,   setShowRecusa]   = useState(false);

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

  const dt = new Date(sol.createdAt).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div style={{
      background: 'rgba(7,29,54,0.75)',
      borderRadius: '0.875rem',
      border: '1px solid rgba(201,162,39,0.13)',
      overflow: 'hidden',
    }}>
      {/* Cabeçalho */}
      <div
        style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setExpanded(v => !v)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ width: 38, height: 38, borderRadius: '0.65rem', background: 'rgba(201,162,39,0.12)', border: '1px solid rgba(201,162,39,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Building2 size={18} color="#c9a227" />
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem', color: '#e2e8f0' }}>{sol.gabineteNome}</p>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginTop: '0.1rem' }}>{sol.userName} · {sol.userEmail}</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <StatusBadge status={sol.status} />
          {expanded ? <ChevronUp size={15} color="rgba(255,255,255,0.3)" /> : <ChevronDown size={15} color="rgba(255,255,255,0.3)" />}
        </div>
      </div>

      {/* Detalhes */}
      {expanded && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '1rem 1.25rem', background: 'rgba(0,0,0,0.15)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>
              <User size={13} color="rgba(255,255,255,0.3)" />
              <span>{sol.userName}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>
              <Mail size={13} color="rgba(255,255,255,0.3)" />
              <span>{sol.userEmail}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)' }}>
              <Calendar size={13} color="rgba(255,255,255,0.3)" />
              <span>{dt}</span>
            </div>
            {sol.motivoRecusa && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.8rem', color: '#f87171', gridColumn: '1/-1' }}>
                <AlertCircle size={13} style={{ marginTop: 2, flexShrink: 0 }} />
                <span><strong>Motivo:</strong> {sol.motivoRecusa}</span>
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
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '0.65rem', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', fontSize: '0.8rem', resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', color: '#e2e8f0' }}
                />
              )}
              <div style={{ display: 'flex', gap: '0.6rem' }}>
                <button
                  onClick={() => agir('APROVAR')} disabled={loading}
                  style={{ flex: 1, padding: '0.55rem', borderRadius: '0.65rem', border: '1px solid rgba(34,197,94,0.3)', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.82rem', color: '#4ade80', background: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', transition: 'all 0.15s' }}
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Aprovar
                </button>
                <button
                  onClick={() => { if (showRecusa) agir('RECUSAR'); else setShowRecusa(true); }}
                  disabled={loading}
                  style={{ flex: 1, padding: '0.55rem', borderRadius: '0.65rem', border: '1px solid rgba(239,68,68,0.3)', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.82rem', color: '#f87171', background: 'rgba(239,68,68,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                >
                  <XCircle size={14} />
                  {showRecusa ? 'Confirmar Recusa' : 'Recusar'}
                </button>
                {showRecusa && (
                  <button
                    onClick={() => { setShowRecusa(false); setMotivoRecusa(''); }}
                    style={{ padding: '0.55rem 0.85rem', borderRadius: '0.65rem', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)', background: 'transparent' }}
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

  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [loadingSol,   setLoadingSol]   = useState(true);
  const [gerandoLink,  setGerandoLink]  = useState(false);
  const [linkGerado,   setLinkGerado]   = useState('');
  const [linkExpiry,   setLinkExpiry]   = useState('');
  const [copiado,      setCopiado]      = useState(false);
  const [filtro,       setFiltro]       = useState<'TODAS' | 'PENDENTE' | 'APROVADA' | 'RECUSADA'>('PENDENTE');

  const role = (session?.user as any)?.role;

  useEffect(() => {
    if (status === 'unauthenticated') { router.replace('/login'); return; }
    if (status === 'authenticated' && role !== 'ADMIN' && role !== 'SUPER_ADMIN') router.replace('/dashboard');
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
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: '#c9a227' }} />
      </div>
    );
  }

  const filterBtn = (label: string, value: typeof filtro) => (
    <button
      key={value}
      onClick={() => setFiltro(value)}
      className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
      style={{
        border: '1px solid',
        borderColor: filtro === value ? 'rgba(201,162,39,0.5)' : 'rgba(255,255,255,0.1)',
        background:  filtro === value ? 'rgba(201,162,39,0.15)' : 'transparent',
        color:       filtro === value ? '#c9a227' : 'rgba(255,255,255,0.45)',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(201,162,39,0.12)', border: '1px solid rgba(201,162,39,0.25)' }}>
            <Building2 className="w-5 h-5" style={{ color: '#c9a227' }} />
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: '#e2e8f0' }}>Administração de Gabinetes</h1>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Gerencie solicitações de criação de novos gabinetes</p>
          </div>
        </div>
        <button
          onClick={carregarSolicitacoes}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all"
          style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}
        >
          <RefreshCw size={13} /> Atualizar
        </button>
      </div>

      {/* Card Gerar Link */}
      <div className="rounded-2xl p-5" style={{ background: 'rgba(7,29,54,0.8)', border: '1px solid rgba(201,162,39,0.2)' }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Link2 size={16} style={{ color: '#c9a227' }} />
              <h2 className="text-sm font-bold" style={{ color: '#e2e8f0' }}>Link de Convite para Novo Gabinete</h2>
            </div>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)', maxWidth: 520 }}>
              Gere um link válido por <strong style={{ color: '#c9a227' }}>1 hora</strong> e envie para o Agente Político. Após preencher o formulário, a solicitação aparecerá abaixo para aprovação.
            </p>
          </div>
          <button
            onClick={gerarLink} disabled={gerandoLink}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50 flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#c9a227,#e6b83a)', color: '#04111f', border: 'none', cursor: gerandoLink ? 'not-allowed' : 'pointer' }}
          >
            {gerandoLink ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
            {gerandoLink ? 'Gerando...' : 'Gerar Link'}
          </button>
        </div>

        {linkGerado && (
          <div className="mt-4 flex items-center gap-3 flex-wrap rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <code className="flex-1 text-xs break-all" style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace', minWidth: 0 }}>{linkGerado}</code>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>expira às {linkExpiry}</span>
              <button
                onClick={copiarLink}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: copiado ? 'rgba(34,197,94,0.15)' : 'rgba(201,162,39,0.15)',
                  color:      copiado ? '#4ade80' : '#c9a227',
                  border:     copiado ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(201,162,39,0.3)',
                  cursor: 'pointer',
                }}
              >
                {copiado ? <><CheckCheck size={12} /> Copiado</> : <><Copy size={12} /> Copiar</>}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Filtros + lista */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-sm font-bold" style={{ color: '#e2e8f0' }}>
          Solicitações
          {pendentes > 0 && (
            <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: 'rgba(201,162,39,0.15)', color: '#c9a227', border: '1px solid rgba(201,162,39,0.3)' }}>
              {pendentes} pendente{pendentes > 1 ? 's' : ''}
            </span>
          )}
        </h2>
        <div className="flex gap-1.5">
          {filterBtn('Pendentes', 'PENDENTE')}
          {filterBtn('Aprovadas', 'APROVADA')}
          {filterBtn('Recusadas', 'RECUSADA')}
          {filterBtn('Todas', 'TODAS')}
        </div>
      </div>

      {loadingSol ? (
        <div className="flex flex-col items-center justify-center py-16" style={{ color: 'rgba(255,255,255,0.3)' }}>
          <Loader2 size={28} className="animate-spin mb-3" style={{ color: '#c9a227' }} />
          <p className="text-sm">Carregando solicitações...</p>
        </div>
      ) : filtradas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-2xl" style={{ background: 'rgba(7,29,54,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <Building2 size={36} style={{ color: 'rgba(255,255,255,0.1)', marginBottom: '0.75rem' }} />
          <p className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Nenhuma solicitação {filtro !== 'TODAS' ? filtro.toLowerCase() : ''}
          </p>
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.25)' }}>
            Gere um link de convite e compartilhe com o Agente Político
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtradas.map(sol => (
            <SolicitacaoCard key={sol.id} sol={sol} onAcao={carregarSolicitacoes} />
          ))}
        </div>
      )}
    </div>
  );
}
