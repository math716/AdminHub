'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  Building2, Link2, Copy, CheckCheck, Clock, CheckCircle2,
  XCircle, AlertCircle, Loader2, RefreshCw, ChevronDown, ChevronUp,
  User, Mail, Calendar, Trash2, UserX, Check, X,
  SlidersHorizontal, KeyRound, Search, Shield, RotateCcw, Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ALL_PERMISSIONS, PERMISSION_LABELS, type Permission, hasFullAccess,
} from '@/lib/permissions';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────
interface UsuarioSemGabinete {
  id: string; name: string; email: string;
  role: string; approved: boolean; createdAt: string;
}

interface UserData {
  id: string; email: string; name: string;
  role: string; approved: boolean; permissions: string[];
  createdAt: string;
  gabinete?: { id: string; nome: string };
  pendingGabineteNome?: string | null;
}

interface GabineteGroup { id: string; nome: string; users: UserData[] }

interface UsuarioExcluido {
  id: string; name: string; email: string; role: string;
  deletedAt: string; deletedByName: string | null;
  gabinete?: { id: string; nome: string };
}

interface GabineteExcluido {
  id: string;
  nome: string;
  deletedAt: string;
  deletedByName: string | null;
  _count: { users: number; demands: number; contatos: number };
}

interface Solicitacao {
  id: string; gabineteNome: string; userName: string; userEmail: string;
  status: 'PENDENTE' | 'APROVADA' | 'RECUSADA';
  motivoRecusa?: string; reviewedAt?: string; createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers visuais
// ─────────────────────────────────────────────────────────────────────────────
const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin', ADMIN: 'Administrador',
  AGENTE_POLITICO: 'Agente Político', CHEFE: 'Chefe de Gabinete',
  ASSESSOR: 'Assessor', ANALISTA: 'Analista', VISUALIZADOR: 'Visualizador',
};

const ROLE_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  SUPER_ADMIN:     { bg: 'rgba(37,99,235,0.12)',  color: '#2563EB',  border: 'rgba(37,99,235,0.3)'  },
  ADMIN:           { bg: 'rgba(37,99,235,0.12)',  color: '#2563EB',  border: 'rgba(37,99,235,0.3)'  },
  AGENTE_POLITICO: { bg: 'rgba(168,85,247,0.12)',  color: '#c084fc',  border: 'rgba(168,85,247,0.3)'  },
  CHEFE:           { bg: 'rgba(74,158,222,0.12)',  color: '#4a9ede',  border: 'rgba(74,158,222,0.3)'  },
  ASSESSOR:        { bg: 'rgba(34,197,94,0.10)',   color: '#4ade80',  border: 'rgba(34,197,94,0.25)'  },
  ANALISTA:        { bg: 'var(--tint-06)', color: 'var(--text-primary)',  border: 'var(--tint-14)' },
  VISUALIZADOR:    { bg: 'var(--tint-06)', color: '#94a3b8',  border: 'var(--tint-14)' },
};

type Accent = { solid: string; bgLight: string; borderLight: string };
const ACCENT_PURPLE: Accent  = { solid: '#a855f7', bgLight: 'rgba(168,85,247,0.08)', borderLight: 'rgba(168,85,247,0.3)' };
const ACCENT_EMERALD: Accent = { solid: '#22c55e', bgLight: 'rgba(34,197,94,0.08)',  borderLight: 'rgba(34,197,94,0.3)'  };

// ─────────────────────────────────────────────────────────────────────────────
// Componentes reutilizáveis
// ─────────────────────────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: string }) {
  const s = ROLE_STYLE[role] ?? ROLE_STYLE.ASSESSOR;
  return (
    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

function RoleSelect({ userId, current, sessionRole, onChanged }: { userId: string; current: string; sessionRole: string; onChanged: (role: string) => void }) {
  const [open, setOpen]     = useState(false);
  const [saving, setSaving] = useState(false);
  const [dropPos, setDropPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef  = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const roles   = sessionRole === 'SUPER_ADMIN'
    ? ['SUPER_ADMIN', 'ADMIN', 'AGENTE_POLITICO', 'CHEFE', 'ASSESSOR']
    : ['ADMIN', 'AGENTE_POLITICO', 'CHEFE', 'ASSESSOR'];

  const openDrop = () => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setDropPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        dropRef.current  && !dropRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const change = async (role: string) => {
    if (role === current) { setOpen(false); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (res.ok) onChanged(role);
      else { const d = await res.json(); toast.error(d.error || 'Erro ao alterar cargo'); }
    } finally { setSaving(false); setOpen(false); }
  };

  const s = ROLE_STYLE[current] ?? ROLE_STYLE.ASSESSOR;
  return (
    <>
      <button ref={btnRef} onClick={openDrop} disabled={saving}
        className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full transition-all hover:opacity-80 disabled:opacity-50"
        style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
        {ROLE_LABELS[current] ?? current}
        <ChevronDown className="w-3 h-3" />
      </button>
      <AnimatePresence>
        {open && dropPos && (
          <motion.div ref={dropRef}
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            className="fixed z-[9999] rounded-xl overflow-hidden shadow-xl"
            style={{ top: dropPos.top, right: dropPos.right, background: 'var(--bg-card)', border: '1px solid rgba(37,99,235,0.2)', minWidth: 170 }}>
            {roles.map(r => (
              <button key={r} onClick={() => change(r)}
                className="w-full text-left px-4 py-2.5 text-xs font-medium transition-all hover:bg-[var(--tint-06)] flex items-center gap-2"
                style={{ color: r === current ? '#2563EB' : 'var(--tint-75)' }}>
                {r === current && <Check className="w-3 h-3 flex-shrink-0" style={{ color: '#2563EB' }} />}
                {r !== current && <span className="w-3" />}
                {ROLE_LABELS[r]}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function PermissionsChecklist({ selected, onToggle, onSelectAll, onClear, accent }: {
  selected: Set<string>; onToggle: (p: string) => void;
  onSelectAll: () => void; onClear: () => void; accent: Accent;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  // No escuro, usa tom mais claro do roxo + bg um pouco mais marcado pra contraste.
  const checkedText = isDark ? '#d8b4fe' : accent.solid;
  const checkedBg = isDark ? 'rgba(168,85,247,0.16)' : accent.bgLight;
  const checkedBorder = isDark ? 'rgba(168,85,247,0.40)' : accent.borderLight;
  return (
    <>
      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {ALL_PERMISSIONS.map(p => {
          const checked = selected.has(p);
          return (
            <button key={p} type="button" onClick={() => onToggle(p)}
              className="w-full text-left flex items-center justify-between px-4 py-3 rounded-xl transition-all"
              style={{ background: checked ? checkedBg : 'var(--tint-04)', border: `1px solid ${checked ? checkedBorder : 'var(--border-default)'}` }}>
              <span className="text-sm font-medium" style={{ color: checked ? checkedText : 'var(--text-primary)' }}>
                {PERMISSION_LABELS[p as Permission]}
              </span>
              <span className="flex items-center justify-center w-5 h-5 rounded-md flex-shrink-0 transition-all"
                style={checked
                  ? { background: accent.solid, color: '#FFFFFF', boxShadow: `0 0 8px ${accent.borderLight}` }
                  : { background: 'transparent', border: '1.5px solid var(--border-strong)' }}>
                {checked && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[11px] pt-1">
        <button type="button" onClick={onSelectAll} className="font-semibold hover:opacity-80" style={{ color: accent.solid }}>Marcar todas</button>
        <button type="button" onClick={onClear} className="hover:opacity-80" style={{ color: 'var(--tint-45)' }}>Limpar</button>
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: Solicitacao['status'] }) {
  const map = {
    PENDENTE: { label: 'Pendente', color: '#3B82F6', bg: 'rgba(37,99,235,0.15)', border: 'rgba(37,99,235,0.3)', icon: <Clock size={12} /> },
    APROVADA: { label: 'Aprovada', color: '#4ade80', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.25)', icon: <CheckCircle2 size={12} /> },
    RECUSADA: { label: 'Recusada', color: '#f87171', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.25)', icon: <XCircle size={12} /> },
  };
  const s = map[status];
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:'0.3rem', padding:'0.2rem 0.65rem', borderRadius:'999px', background:s.bg, color:s.color, border:`1px solid ${s.border}`, fontSize:'0.72rem', fontWeight:600 }}>
      {s.icon}{s.label}
    </span>
  );
}

function SolicitacaoCard({ sol, onAcao }: { sol: Solicitacao; onAcao: () => void }) {
  const [expanded, setExpanded]         = useState(false);
  const [loading, setLoading]           = useState(false);
  const [motivoRecusa, setMotivoRecusa] = useState('');
  const [showRecusa, setShowRecusa]     = useState(false);

  async function agir(acao: 'APROVAR' | 'RECUSAR') {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/solicitacoes-gabinete/${sol.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao, motivoRecusa }),
      });
      const data = await res.json();
      if (res.ok) { toast.success(acao === 'APROVAR' ? 'Gabinete criado com sucesso!' : 'Solicitação recusada'); onAcao(); }
      else toast.error(data.error || 'Erro ao processar');
    } catch { toast.error('Erro de conexão'); }
    finally { setLoading(false); setShowRecusa(false); }
  }

  const dt = new Date(sol.createdAt).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

  return (
    <div style={{ background:'var(--bg-card)', borderRadius:'0.875rem', border:'1px solid rgba(37,99,235,0.13)', overflow:'hidden' }}>
      <div style={{ padding:'1rem 1.25rem', display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer', userSelect:'none' }}
        onClick={() => setExpanded(v => !v)}>
        <div style={{ display:'flex', alignItems:'center', gap:'0.85rem' }}>
          <div style={{ width:38, height:38, borderRadius:'0.65rem', background:'rgba(37,99,235,0.12)', border:'1px solid rgba(37,99,235,0.25)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <Building2 size={18} color="#2563EB" />
          </div>
          <div>
            <p style={{ margin:0, fontWeight:700, fontSize:'0.9rem', color: 'var(--text-primary)' }}>{sol.gabineteNome}</p>
            <p style={{ margin:0, fontSize:'0.75rem', color:'var(--tint-45)', marginTop:'0.1rem' }}>{sol.userName} · {sol.userEmail}</p>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
          <StatusBadge status={sol.status} />
          {expanded ? <ChevronUp size={15} color="var(--tint-35)" /> : <ChevronDown size={15} color="var(--tint-35)" />}
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop:'1px solid var(--tint-06)', padding:'1rem 1.25rem', background:'rgba(0,0,0,0.15)' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.65rem', marginBottom:'1rem' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', fontSize:'0.8rem', color:'var(--tint-65)' }}>
              <User size={13} color="var(--tint-35)" /><span>{sol.userName}</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', fontSize:'0.8rem', color:'var(--tint-65)' }}>
              <Mail size={13} color="var(--tint-35)" /><span>{sol.userEmail}</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', fontSize:'0.8rem', color:'var(--tint-45)' }}>
              <Calendar size={13} color="var(--tint-35)" /><span>{dt}</span>
            </div>
            {sol.motivoRecusa && (
              <div style={{ display:'flex', alignItems:'flex-start', gap:'0.5rem', fontSize:'0.8rem', color:'#f87171', gridColumn:'1/-1' }}>
                <AlertCircle size={13} style={{ marginTop:2, flexShrink:0 }} />
                <span><strong>Motivo:</strong> {sol.motivoRecusa}</span>
              </div>
            )}
          </div>

          {sol.status === 'PENDENTE' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
              {showRecusa && (
                <textarea placeholder="Motivo da recusa (opcional)" value={motivoRecusa}
                  onChange={e => setMotivoRecusa(e.target.value)} rows={2}
                  style={{ width:'100%', padding:'0.6rem 0.85rem', borderRadius:'0.65rem', border:'1px solid var(--tint-14)', background:'var(--tint-06)', fontSize:'0.8rem', resize:'vertical', outline:'none', boxSizing:'border-box', fontFamily:'inherit', color: 'var(--text-primary)' }} />
              )}
              <div style={{ display:'flex', gap:'0.6rem' }}>
                <button onClick={() => agir('APROVAR')} disabled={loading}
                  style={{ flex:1, padding:'0.55rem', borderRadius:'0.65rem', border:'1px solid rgba(34,197,94,0.3)', cursor:loading?'not-allowed':'pointer', fontWeight:600, fontSize:'0.82rem', color:'#4ade80', background:'rgba(34,197,94,0.1)', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem' }}>
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Aprovar
                </button>
                <button onClick={() => { if (showRecusa) agir('RECUSAR'); else setShowRecusa(true); }} disabled={loading}
                  style={{ flex:1, padding:'0.55rem', borderRadius:'0.65rem', border:'1px solid rgba(239,68,68,0.3)', cursor:loading?'not-allowed':'pointer', fontWeight:600, fontSize:'0.82rem', color:'#f87171', background:'rgba(239,68,68,0.08)', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem' }}>
                  <XCircle size={14} />{showRecusa ? 'Confirmar Recusa' : 'Recusar'}
                </button>
                {showRecusa && (
                  <button onClick={() => { setShowRecusa(false); setMotivoRecusa(''); }}
                    style={{ padding:'0.55rem 0.85rem', borderRadius:'0.65rem', border:'1px solid var(--tint-10)', cursor:'pointer', fontSize:'0.78rem', color:'var(--tint-45)', background:'transparent' }}>
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

// ─────────────────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminGabinetesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const sessionUserId = (session?.user as any)?.id;
  const role          = (session?.user as any)?.role;

  // ── estado base ─────────────────────────────────────────────────────────────
  const [solicitacoes,   setSolicitacoes]   = useState<Solicitacao[]>([]);
  const [loadingSol,     setLoadingSol]     = useState(true);
  const [gerandoLink,    setGerandoLink]    = useState(false);
  const [linkGerado,     setLinkGerado]     = useState('');
  const [linkExpiry,     setLinkExpiry]     = useState('');
  const [copiado,        setCopiado]        = useState(false);
  const [filtro,         setFiltro]         = useState<'TODAS'|'PENDENTE'|'APROVADA'|'RECUSADA'>('PENDENTE');
  const [deletingUserId,     setDeletingUserId]     = useState<string|null>(null);
  const [excluidos,          setExcluidos]          = useState<UsuarioExcluido[]>([]);
  const [acaoExcluidoId,     setAcaoExcluidoId]     = useState<string|null>(null);
  const [gabExcluidos,       setGabExcluidos]       = useState<GabineteExcluido[]>([]);
  const [acaoGabExcluidoId,  setAcaoGabExcluidoId]  = useState<string|null>(null);

  // ── dados de usuários/gabinetes ──────────────────────────────────────────────
  const [allUsers,    setAllUsers]    = useState<UserData[]>([]);
  const [gabinetes,   setGabinetes]   = useState<{ id: string; nome: string }[]>([]);
  const [expandedGabs, setExpandedGabs] = useState<Set<string>>(new Set());
  const [searchGabinete, setSearchGabinete] = useState('');

  // ── modais ───────────────────────────────────────────────────────────────────
  const [actionId,         setActionId]         = useState<string|null>(null);
  const [confirmReject,    setConfirmReject]     = useState<{ userId: string; name: string }|null>(null);
  const [deletingReject,   setDeletingReject]    = useState(false);

  const [confirmDeleteGab, setConfirmDeleteGab] = useState<GabineteGroup | null>(null);
  const [deletingGab,      setDeletingGab]      = useState(false);

  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approveTarget,    setApproveTarget]    = useState<UserData|null>(null);
  const [approvePerms,     setApprovePerms]     = useState<Set<string>>(new Set());

  const [showEditPermsModal, setShowEditPermsModal] = useState(false);
  const [editPermsTarget,    setEditPermsTarget]    = useState<UserData|null>(null);
  const [editPerms,          setEditPerms]          = useState<Set<string>>(new Set());
  const [savingPerms,        setSavingPerms]        = useState(false);

  const [showResetModal,  setShowResetModal]  = useState(false);
  const [resetTargetId,   setResetTargetId]   = useState('');
  const [resetTargetName, setResetTargetName] = useState('');
  const [resetResult,     setResetResult]     = useState('');
  const [resettingPwd,    setResettingPwd]    = useState(false);
  const [copiedPwd,       setCopiedPwd]       = useState(false);

  // ── guards ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (status === 'unauthenticated') { router.replace('/login'); return; }
    if (status === 'authenticated' && role !== 'ADMIN' && role !== 'SUPER_ADMIN') router.replace('/dashboard');
  }, [status, role, router]);

  // ── fetch ────────────────────────────────────────────────────────────────────
  const carregarTudo = useCallback(async () => {
    setLoadingSol(true);
    try {
      const [resSol, resUsers, resGabs, resExcluidos, resGabExcluidos] = await Promise.all([
        fetch('/api/admin/solicitacoes-gabinete', { cache: 'no-store' }),
        fetch('/api/users', { cache: 'no-store' }),
        fetch('/api/gabinetes', { cache: 'no-store' }),
        fetch('/api/admin/usuarios-excluidos', { cache: 'no-store' }),
        fetch('/api/admin/gabinetes-excluidos', { cache: 'no-store' }),
      ]);
      if (resSol.ok)           { const d = await resSol.json();           setSolicitacoes(d.solicitacoes ?? []); }
      if (resUsers.ok)         { const d = await resUsers.json();          setAllUsers(d ?? []); }
      if (resGabs.ok)          { const d = await resGabs.json();           setGabinetes(d ?? []); }
      if (resExcluidos.ok)     { const d = await resExcluidos.json();      setExcluidos(d ?? []); }
      if (resGabExcluidos.ok)  { const d = await resGabExcluidos.json();   setGabExcluidos(d ?? []); }
    } finally { setLoadingSol(false); }
  }, []);

  useEffect(() => { if (status === 'authenticated') carregarTudo(); }, [status, carregarTudo]);

  // ── derivados ─────────────────────────────────────────────────────────────────
  const { gabineteGroups, semGabinete } = useMemo(() => {
    const map = new Map<string, GabineteGroup>(
      gabinetes.map(g => [g.id, { id: g.id, nome: g.nome, users: [] }])
    );
    const sem: UserData[] = [];
    allUsers.forEach(u => {
      if (u.gabinete) {
        if (!map.has(u.gabinete.id)) map.set(u.gabinete.id, { id: u.gabinete.id, nome: u.gabinete.nome, users: [] });
        map.get(u.gabinete.id)!.users.push(u);
      } else if (!u.pendingGabineteNome && u.role !== 'ADMIN' && u.role !== 'SUPER_ADMIN') {
        sem.push(u);
      }
    });
    return {
      gabineteGroups: Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      semGabinete: sem,
    };
  }, [allUsers, gabinetes]);

  const filteredGroups = useMemo(() => {
    if (!searchGabinete.trim()) return gabineteGroups;
    const q = searchGabinete.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return gabineteGroups.filter(g =>
      g.nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q)
    );
  }, [gabineteGroups, searchGabinete]);

  const adminUsers = useMemo(() =>
    allUsers
      .filter(u => u.role === 'ADMIN' || u.role === 'SUPER_ADMIN')
      .sort((a, b) => {
        if (a.role === 'SUPER_ADMIN' && b.role !== 'SUPER_ADMIN') return -1;
        if (b.role === 'SUPER_ADMIN' && a.role !== 'SUPER_ADMIN') return 1;
        return a.name.localeCompare(b.name, 'pt-BR');
      }),
    [allUsers]
  );

  const toggleGab = (id: string) =>
    setExpandedGabs(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  // ── handlers de usuário ──────────────────────────────────────────────────────
  const openApproveModal = (u: UserData) => {
    if (hasFullAccess(u.role)) { void doApprove(u.id, undefined); return; }
    setApproveTarget(u);
    setApprovePerms(new Set(u.permissions ?? []));
    setShowApproveModal(true);
  };

  const doApprove = async (userId: string, perms?: string[]) => {
    setActionId(userId);
    try {
      const res = await fetch(`/api/users/${userId}/approve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(perms !== undefined ? { permissions: perms } : {}),
      });
      if (res.ok) {
        setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, approved: true, permissions: perms ?? u.permissions } : u));
        toast.success('Usuário aprovado.');
        setShowApproveModal(false); setApproveTarget(null);
      } else { const d = await res.json(); toast.error(d.error || 'Erro ao aprovar'); }
    } finally { setActionId(null); }
  };

  const openEditPermsModal = (u: UserData) => {
    setEditPermsTarget(u);
    setEditPerms(new Set(u.permissions ?? []));
    setShowEditPermsModal(true);
  };

  const doEditPerms = async () => {
    if (!editPermsTarget) return;
    setSavingPerms(true);
    try {
      const perms = Array.from(editPerms);
      const res = await fetch(`/api/users/${editPermsTarget.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: perms }),
      });
      if (res.ok) {
        setAllUsers(prev => prev.map(u => u.id === editPermsTarget.id ? { ...u, permissions: perms } : u));
        toast.success('Permissões atualizadas.');
        setShowEditPermsModal(false); setEditPermsTarget(null);
      } else { const d = await res.json(); toast.error(d.error || 'Erro ao salvar'); }
    } finally { setSavingPerms(false); }
  };

  const handleRoleChange = (userId: string, newRole: string) =>
    setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));

  const openResetModal = (userId: string, name: string) => {
    setResetTargetId(userId); setResetTargetName(name);
    setResetResult(''); setCopiedPwd(false); setShowResetModal(true);
  };

  const doReset = async () => {
    setResettingPwd(true);
    try {
      const res  = await fetch(`/api/users/${resetTargetId}/reset-password`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) setResetResult(data.emailSent ? '__EMAIL_SENT__' : (data.password ?? ''));
      else { toast.error(data.error || 'Erro ao resetar'); setShowResetModal(false); }
    } finally { setResettingPwd(false); }
  };

  const doReject = async () => {
    if (!confirmReject) return;
    const { userId } = confirmReject;
    setConfirmReject(null);
    setDeletingReject(true);
    try {
      const res = await fetch(`/api/users/${userId}/reject`, { method: 'POST' });
      if (res.ok) { setAllUsers(prev => prev.filter(u => u.id !== userId)); toast.success('Usuário removido.'); }
      else { const d = await res.json(); toast.error(d.error || 'Erro ao remover'); }
    } finally { setDeletingReject(false); }
  };

  const exportarGabinete = async (group: GabineteGroup) => {
    try {
      toast.info(`Exportando dados de "${group.nome}"...`);
      const res = await fetch(`/api/gabinetes/${group.id}/export`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Erro ao exportar');
        return;
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${group.nome}_${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Arquivo exportado com sucesso!');
    } catch { toast.error('Erro ao exportar dados'); }
  };

  const doDeleteGabinete = async () => {
    if (!confirmDeleteGab) return;
    setDeletingGab(true);
    try {
      const res  = await fetch(`/api/gabinetes/${confirmDeleteGab.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Gabinete "${confirmDeleteGab.nome}" movido para a lixeira.`);
        setConfirmDeleteGab(null);
        carregarTudo();
      } else {
        toast.error(data.error || 'Erro ao excluir gabinete');
      }
    } catch { toast.error('Erro de conexão'); }
    finally { setDeletingGab(false); }
  };

  const acaoGabExcluido = async (gabId: string, acao: 'RESTAURAR' | 'EXCLUIR') => {
    setAcaoGabExcluidoId(gabId);
    try {
      const res = await fetch(`/api/admin/gabinetes-excluidos/${gabId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao }),
      });
      const data = await res.json();
      if (res.ok) {
        setGabExcluidos(prev => prev.filter(g => g.id !== gabId));
        if (acao === 'RESTAURAR') {
          toast.success('Gabinete restaurado com sucesso.');
          carregarTudo();
        } else {
          toast.success('Gabinete excluído definitivamente.');
        }
      } else {
        toast.error(data.error || 'Erro ao processar ação');
      }
    } catch { toast.error('Erro de conexão'); }
    finally { setAcaoGabExcluidoId(null); }
  };

  const deletarUsuarioSemGabinete = async (userId: string, userName: string) => {
    if (!confirm(`Excluir o usuário "${userName}"? Esta ação não pode ser desfeita.`)) return;
    setDeletingUserId(userId);
    try {
      const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      if (res.ok) { setAllUsers(prev => prev.filter(u => u.id !== userId)); toast.success(`Usuário "${userName}" excluído.`); }
      else { const d = await res.json(); toast.error(d.error || 'Erro ao excluir'); }
    } catch { toast.error('Erro de conexão'); }
    finally { setDeletingUserId(null); }
  };

  const acaoExcluido = async (userId: string, acao: 'RESTAURAR' | 'EXCLUIR') => {
    setAcaoExcluidoId(userId);
    try {
      const res = await fetch(`/api/admin/usuarios-excluidos/${userId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao }),
      });
      const data = await res.json();
      if (res.ok) {
        setExcluidos(prev => prev.filter(u => u.id !== userId));
        if (acao === 'RESTAURAR') {
          toast.success('Usuário restaurado com sucesso.');
          carregarTudo();
        } else {
          toast.success('Usuário excluído definitivamente.');
        }
      } else {
        toast.error(data.error || 'Erro ao processar ação');
      }
    } catch { toast.error('Erro de conexão'); }
    finally { setAcaoExcluidoId(null); }
  };

  const togglePerm = (set: Set<string>, setter: (s: Set<string>) => void, p: string) => {
    const next = new Set(set); next.has(p) ? next.delete(p) : next.add(p); setter(next);
  };

  // ── link / gerarLink ─────────────────────────────────────────────────────────
  async function gerarLink() {
    setGerandoLink(true); setLinkGerado('');
    try {
      const res  = await fetch('/api/admin/gabinete-convite', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setLinkGerado(data.url);
        setLinkExpiry(new Date(data.expiresAt).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }));
        toast.success('Link gerado! Válido por 1 hora.');
      } else toast.error(data.error || 'Erro ao gerar link');
    } catch { toast.error('Erro de conexão'); }
    finally { setGerandoLink(false); }
  }

  async function copiarLink() {
    if (!linkGerado) return;
    await navigator.clipboard.writeText(linkGerado);
    setCopiado(true); toast.success('Link copiado!');
    setTimeout(() => setCopiado(false), 2500);
  }

  const filtradas = solicitacoes.filter(s => filtro === 'TODAS' || s.status === filtro);
  const pendentes = solicitacoes.filter(s => s.status === 'PENDENTE').length;

  if (status === 'loading') {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-7 h-7 animate-spin" style={{ color:'#2563EB' }} /></div>;
  }

  const filterBtn = (label: string, value: typeof filtro) => (
    <button key={value} onClick={() => setFiltro(value)}
      className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
      style={{ border:'1px solid', borderColor:filtro===value?'rgba(37,99,235,0.5)':'var(--tint-10)', background:filtro===value?'rgba(37,99,235,0.15)':'transparent', color:filtro===value?'#2563EB':'var(--tint-45)', cursor:'pointer' }}>
      {label}
    </button>
  );

  return (
    <div className="space-y-5">

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background:'rgba(37,99,235,0.12)', border:'1px solid rgba(37,99,235,0.25)' }}>
            <Building2 className="w-5 h-5" style={{ color:'#2563EB' }} />
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Administração de Gabinetes</h1>
            <p className="text-xs" style={{ color:'var(--tint-45)' }}>Gerencie gabinetes, solicitações e usuários</p>
          </div>
        </div>
        <button onClick={carregarTudo}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all"
          style={{ border:'1px solid var(--tint-10)', background:'var(--tint-04)', color:'var(--tint-65)', cursor:'pointer' }}>
          <RefreshCw size={13} /> Atualizar
        </button>
      </div>

      {/* ── Card Gerar Link ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl p-5" style={{ background:'var(--bg-card)', border:'1px solid rgba(37,99,235,0.2)' }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Link2 size={16} style={{ color:'#2563EB' }} />
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Link de Convite para Novo Gabinete</h2>
            </div>
            <p className="text-xs" style={{ color:'var(--tint-45)', maxWidth:520 }}>
              Gere um link válido por <strong style={{ color:'#2563EB' }}>1 hora</strong> e envie para o Agente Político.
            </p>
          </div>
          <button onClick={gerarLink} disabled={gerandoLink}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50 flex-shrink-0"
            style={{ background:'linear-gradient(135deg,#2563EB,#3B82F6)', color:'var(--bg-page)', border:'none', cursor:gerandoLink?'not-allowed':'pointer' }}>
            {gerandoLink ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
            {gerandoLink ? 'Gerando...' : 'Gerar Link'}
          </button>
        </div>

        {linkGerado && (
          <div className="mt-4 flex items-center gap-3 flex-wrap rounded-xl p-3" style={{ background:'var(--tint-04)', border:'1px solid var(--tint-08)' }}>
            <code className="flex-1 text-xs break-all" style={{ color:'var(--tint-65)', fontFamily:'monospace', minWidth:0 }}>{linkGerado}</code>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[10px]" style={{ color:'var(--tint-35)' }}>expira às {linkExpiry}</span>
              <button onClick={copiarLink}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{ background:copiado?'rgba(34,197,94,0.15)':'rgba(37,99,235,0.15)', color:copiado?'#4ade80':'#2563EB', border:copiado?'1px solid rgba(34,197,94,0.3)':'1px solid rgba(37,99,235,0.3)', cursor:'pointer' }}>
                {copiado ? <><CheckCheck size={12}/> Copiado</> : <><Copy size={12}/> Copiar</>}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Administradores do Sistema ────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Shield size={15} style={{ color: '#2563EB' }} />
          <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            Administradores do Sistema
          </h2>
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold"
            style={{ background: 'rgba(37,99,235,0.12)', color: '#2563EB', border: '1px solid rgba(37,99,235,0.25)' }}>
            {adminUsers.length}
          </span>
        </div>
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--tint-06)' }}>
          {loadingSol ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin" style={{ color: '#2563EB' }} />
            </div>
          ) : adminUsers.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm" style={{ color: 'var(--tint-35)' }}>
              Nenhum administrador encontrado
            </div>
          ) : (
            <div>
              {adminUsers.map((u, idx) => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 px-5 py-3.5"
                  style={{ borderBottom: idx < adminUsers.length - 1 ? '1px solid var(--tint-06)' : 'none' }}
                >
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(37,99,235,0.10)', border: '1px solid rgba(37,99,235,0.2)' }}>
                    {u.role === 'SUPER_ADMIN'
                      ? <Shield size={14} style={{ color: '#2563EB' }} />
                      : <User size={14} style={{ color: '#2563EB' }} />
                    }
                  </div>

                  {/* Nome + email */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{u.name}</p>
                    <p className="text-xs truncate flex items-center gap-1" style={{ color: 'var(--tint-45)' }}>
                      <Mail size={10} />
                      {u.email}
                    </p>
                  </div>

                  {/* Role badge */}
                  <RoleBadge role={u.role} />

                  {/* Ações */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => openResetModal(u.id, u.name)}
                      title="Resetar senha"
                      className="p-1.5 rounded-lg transition-all hover:bg-[var(--tint-06)]"
                      style={{ color: 'var(--tint-45)', border: '1px solid var(--tint-06)' }}
                    >
                      <KeyRound size={13} />
                    </button>
                    {(role === 'SUPER_ADMIN' || u.role !== 'SUPER_ADMIN') && (
                      <RoleSelect
                        userId={u.id}
                        current={u.role}
                        sessionRole={role ?? ''}
                        onChanged={(newRole) =>
                          setAllUsers(prev => prev.map(x => x.id === u.id ? { ...x, role: newRole } : x))
                        }
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Solicitações ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
          Solicitações de Cadastro
          {pendentes > 0 && (
            <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background:'rgba(37,99,235,0.15)', color:'#2563EB', border:'1px solid rgba(37,99,235,0.3)' }}>
              {pendentes} pendente{pendentes>1?'s':''}
            </span>
          )}
        </h2>
        <div className="flex gap-1.5">
          {filterBtn('Pendentes','PENDENTE')}
          {filterBtn('Aprovadas','APROVADA')}
          {filterBtn('Recusadas','RECUSADA')}
          {filterBtn('Todas','TODAS')}
        </div>
      </div>

      {loadingSol ? (
        <div className="flex flex-col items-center justify-center py-12" style={{ color:'var(--tint-35)' }}>
          <Loader2 size={28} className="animate-spin mb-3" style={{ color:'#2563EB' }} />
          <p className="text-sm">Carregando...</p>
        </div>
      ) : filtradas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 rounded-2xl" style={{ background:'var(--bg-card-subtle)', border:'1px solid var(--tint-06)' }}>
          <Building2 size={32} style={{ color:'var(--tint-10)', marginBottom:'0.75rem' }} />
          <p className="text-sm font-semibold" style={{ color:'var(--tint-45)' }}>
            Nenhuma solicitação {filtro !== 'TODAS' ? filtro.toLowerCase() : ''}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtradas.map(sol => <SolicitacaoCard key={sol.id} sol={sol} onAcao={carregarTudo} />)}
        </div>
      )}

      {/* ── Gabinetes Ativos ──────────────────────────────────────────────────── */}
      {!loadingSol && gabineteGroups.length > 0 && (
        <>
          <div className="flex items-center gap-3 pt-2">
            <div className="flex-1 h-px" style={{ background:'var(--tint-06)' }} />
            <div className="flex items-center gap-2">
              <Building2 size={14} style={{ color:'#4a9ede' }} />
              <span className="text-xs font-semibold" style={{ color:'var(--tint-35)' }}>GABINETES ATIVOS</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background:'rgba(74,158,222,0.15)', color:'#4a9ede', border:'1px solid rgba(74,158,222,0.25)' }}>
                {gabineteGroups.length}
              </span>
            </div>
            <div className="flex-1 h-px" style={{ background:'var(--tint-06)' }} />
          </div>

          {/* Busca */}
          {gabineteGroups.length > 3 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color:'var(--tint-35)' }} />
              <input value={searchGabinete} onChange={e => setSearchGabinete(e.target.value)}
                placeholder="Buscar gabinete..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-[color:var(--text-primary)] outline-none"
                style={{ background:'var(--bg-card)', border:'1px solid var(--tint-08)' }} />
            </div>
          )}

          <AnimatePresence initial={false}>
            {filteredGroups.map((group, gi) => {
              const isOpen   = expandedGabs.has(group.id);
              const pending  = group.users.filter(u => !u.approved && u.role !== 'ADMIN' && u.role !== 'SUPER_ADMIN');
              const approved = group.users.filter(u => u.approved  || u.role === 'ADMIN' || u.role === 'SUPER_ADMIN');

              return (
                <motion.div key={group.id}
                  initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay: gi * 0.04 }}
                  className="rounded-2xl overflow-hidden"
                  style={{ background:'var(--bg-card)', border:'1px solid rgba(74,158,222,0.15)' }}>

                  {/* Header */}
                  <div className="flex items-center px-5 py-4 gap-2">
                    <button className="flex-1 flex items-center gap-3 text-left transition-all hover:opacity-80"
                      onClick={() => toggleGab(group.id)}>
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background:'rgba(74,158,222,0.15)', border:'1px solid rgba(74,158,222,0.3)' }}>
                        <Building2 className="w-[18px] h-[18px]" style={{ color:'#4a9ede' }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[color:var(--text-primary)] font-semibold text-sm">{group.nome}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[11px]" style={{ color:'var(--tint-45)' }}>
                            {group.users.length} usuário{group.users.length !== 1 ? 's' : ''}
                          </span>
                          {pending.length > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                              style={{ background:'rgba(245,158,11,0.15)', color:'#f59e0b', border:'1px solid rgba(245,158,11,0.25)' }}>
                              {pending.length} pendente{pending.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => exportarGabinete(group)}
                        title="Exportar dados do gabinete (.xlsx)"
                        className="p-1.5 rounded-lg transition-all hover:bg-blue-500/10"
                        style={{ color:'var(--tint-25)' }}>
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setConfirmDeleteGab(group)}
                        title="Excluir gabinete"
                        className="p-1.5 rounded-lg transition-all hover:bg-red-500/10"
                        style={{ color:'var(--tint-25)' }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => toggleGab(group.id)}
                        className="p-1.5 rounded-lg transition-all hover:bg-[var(--tint-06)]"
                        style={{ color:'var(--tint-35)' }}>
                        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Corpo */}
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }}
                        exit={{ height:0, opacity:0 }} transition={{ duration:0.2 }} style={{ overflow:'hidden' }}>
                        {group.users.length === 0 ? (
                          <div className="px-5 py-6 text-center text-xs" style={{ color:'var(--tint-25)', borderTop:'1px solid var(--tint-04)' }}>
                            Nenhum usuário neste gabinete
                          </div>
                        ) : (
                          <div className="divide-y" style={{ borderColor:'var(--tint-04)', borderTop:'1px solid var(--tint-04)' }}>
                            {[...pending, ...approved].map(u => (
                              <div key={u.id}
                                className="flex items-center justify-between px-5 py-3.5 gap-3 transition-all hover:bg-white/[0.02]"
                                style={!u.approved && u.role !== 'ADMIN' && u.role !== 'SUPER_ADMIN' ? { background:'rgba(245,158,11,0.04)' } : {}}>

                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                                    style={u.approved || u.role === 'ADMIN' || u.role === 'SUPER_ADMIN'
                                      ? { background:'linear-gradient(135deg,#1b3a5c,#2a5580)', color:'#7dd3fc' }
                                      : { background:'rgba(245,158,11,0.15)', border:'1px solid rgba(245,158,11,0.3)', color:'#f59e0b' }}>
                                    {u.name.split(' ').filter(Boolean).slice(0,2).map(w => w[0].toUpperCase()).join('')}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <p className="text-[color:var(--text-primary)] text-sm font-medium truncate">{u.name}</p>
                                      {!u.approved && u.role !== 'ADMIN' && u.role !== 'SUPER_ADMIN' && (
                                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                                          style={{ background:'rgba(245,158,11,0.15)', color:'#f59e0b' }}>Pendente</span>
                                      )}
                                    </div>
                                    <p className="text-[11px] truncate" style={{ color:'var(--tint-35)' }}>{u.email}</p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {u.role !== 'SUPER_ADMIN'
                                    ? <RoleSelect userId={u.id} current={u.role} sessionRole={role} onChanged={r => handleRoleChange(u.id, r)} />
                                    : <RoleBadge role={role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'ADMIN'} />
                                  }
                                  {/* Aprovar */}
                                  {!u.approved && u.role !== 'ADMIN' && u.role !== 'SUPER_ADMIN' && (
                                    <button onClick={() => openApproveModal(u)} disabled={actionId === u.id}
                                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-50"
                                      style={{ background:'rgba(34,197,94,0.15)', border:'1px solid rgba(34,197,94,0.3)', color:'#4ade80' }}>
                                      {actionId === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Aprovar
                                    </button>
                                  )}
                                  {/* Editar permissões */}
                                  {u.approved && !hasFullAccess(u.role) && (
                                    <button onClick={() => openEditPermsModal(u)} title="Editar permissões"
                                      className="p-1.5 rounded-lg transition-all hover:bg-purple-500/10"
                                      style={{ color:'var(--tint-35)' }}>
                                      <SlidersHorizontal className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {/* Reset senha */}
                                  <button onClick={() => openResetModal(u.id, u.name)} title="Resetar senha"
                                    className="p-1.5 rounded-lg transition-all hover:bg-yellow-500/10"
                                    style={{ color:'var(--tint-35)' }}>
                                    <KeyRound className="w-3.5 h-3.5" />
                                  </button>
                                  {/* Remover */}
                                  {u.role !== 'SUPER_ADMIN' && (
                                    <button onClick={() => setConfirmReject({ userId: u.id, name: u.name })}
                                      disabled={actionId === u.id}
                                      title="Remover usuário"
                                      className="p-1.5 rounded-lg transition-all hover:bg-red-500/10"
                                      style={{ color:'var(--tint-35)' }}>
                                      {actionId === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </>
      )}

      {/* ── Usuários Sem Gabinete ─────────────────────────────────────────────── */}
      {semGabinete.length > 0 && (
        <>
          <div className="flex items-center gap-3 pt-2">
            <div className="flex-1 h-px" style={{ background:'var(--tint-06)' }} />
            <div className="flex items-center gap-2">
              <UserX size={14} style={{ color:'#f87171' }} />
              <span className="text-xs font-semibold" style={{ color:'var(--tint-35)' }}>USUÁRIOS SEM GABINETE</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background:'rgba(239,68,68,0.15)', color:'#f87171', border:'1px solid rgba(239,68,68,0.25)' }}>
                {semGabinete.length}
              </span>
            </div>
            <div className="flex-1 h-px" style={{ background:'var(--tint-06)' }} />
          </div>

          <div className="flex flex-col gap-2">
            {semGabinete.map(u => (
              <div key={u.id} style={{ background:'var(--bg-card)', borderRadius:'0.875rem', border:'1px solid rgba(239,68,68,0.15)', padding:'0.875rem 1.25rem', display:'flex', alignItems:'center', gap:'0.875rem' }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <User size={16} style={{ color:'#f87171' }} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ margin:0, fontWeight:600, fontSize:'0.875rem', color: 'var(--text-primary)' }}>{u.name}</p>
                  <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginTop:'0.2rem', flexWrap:'wrap' }}>
                    <span style={{ fontSize:'0.73rem', color:'var(--tint-45)', display:'flex', alignItems:'center', gap:'0.3rem' }}>
                      <Mail size={11}/> {u.email}
                    </span>
                    <span style={{ fontSize:'0.7rem', padding:'0.1rem 0.5rem', borderRadius:'999px', background:'var(--tint-06)', color:'var(--tint-35)', border:'1px solid var(--tint-08)' }}>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </span>
                    {!u.approved && (
                      <span style={{ fontSize:'0.7rem', padding:'0.1rem 0.5rem', borderRadius:'999px', background:'rgba(245,158,11,0.1)', color:'#fbbf24', border:'1px solid rgba(245,158,11,0.2)' }}>
                        Não aprovado
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => deletarUsuarioSemGabinete(u.id, u.name)} disabled={deletingUserId === u.id}
                  title="Excluir usuário"
                  style={{ padding:'0.5rem', borderRadius:'0.5rem', border:'1px solid rgba(239,68,68,0.25)', background:'rgba(239,68,68,0.08)', color:'#f87171', cursor:deletingUserId===u.id?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  {deletingUserId === u.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Exclusões Pendentes de Revisão ───────────────────────────────────── */}
      {excluidos.length > 0 && (
        <>
          <div className="flex items-center gap-3 pt-2">
            <div className="flex-1 h-px" style={{ background: 'var(--tint-06)' }} />
            <div className="flex items-center gap-2">
              <Trash2 size={14} style={{ color: '#f87171' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--tint-35)' }}>EXCLUSÕES PENDENTES DE REVISÃO</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
                {excluidos.length}
              </span>
            </div>
            <div className="flex-1 h-px" style={{ background: 'var(--tint-06)' }} />
          </div>

          <div className="flex flex-col gap-2">
            {excluidos.map(u => {
              const dt = new Date(u.deletedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
              const isActing = acaoExcluidoId === u.id;
              return (
                <div key={u.id} style={{ background: 'var(--bg-card)', borderRadius: '0.875rem', border: '1px solid rgba(239,68,68,0.2)', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.875rem', flexWrap: 'wrap' }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.75rem', fontWeight: 700, color: '#f87171' }}>
                    {u.name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{u.name}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--tint-45)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Mail size={11} /> {u.email}
                      </span>
                      {u.gabinete && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--tint-35)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <Building2 size={11} /> {u.gabinete.nome}
                        </span>
                      )}
                      <span style={{ fontSize: '0.7rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Calendar size={11} /> Removido por <strong>{u.deletedByName ?? 'desconhecido'}</strong> em {dt}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                    <button
                      onClick={() => acaoExcluido(u.id, 'RESTAURAR')} disabled={isActing}
                      title="Restaurar usuário"
                      style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.875rem', borderRadius: '0.65rem', border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.1)', color: '#4ade80', fontSize: '0.78rem', fontWeight: 600, cursor: isActing ? 'not-allowed' : 'pointer' }}>
                      {isActing ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                      Restaurar
                    </button>
                    <button
                      onClick={() => acaoExcluido(u.id, 'EXCLUIR')} disabled={isActing}
                      title="Excluir definitivamente"
                      style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.875rem', borderRadius: '0.65rem', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#f87171', fontSize: '0.78rem', fontWeight: 600, cursor: isActing ? 'not-allowed' : 'pointer' }}>
                      {isActing ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      Excluir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Gabinetes Excluídos (Lixeira) ───────────────────────────────────── */}
      {gabExcluidos.length > 0 && (
        <>
          <div className="flex items-center gap-3 pt-2">
            <div className="flex-1 h-px" style={{ background: 'var(--tint-06)' }} />
            <div className="flex items-center gap-2">
              <Trash2 size={14} style={{ color: '#f87171' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--tint-35)' }}>LIXEIRA DE GABINETES</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
                {gabExcluidos.length}
              </span>
            </div>
            <div className="flex-1 h-px" style={{ background: 'var(--tint-06)' }} />
          </div>
          <p className="text-xs text-center" style={{ color: 'var(--tint-35)', marginTop: '0.35rem' }}>
            Gabinetes são excluídos permanentemente após <strong style={{ color: '#f59e0b' }}>90 dias</strong> na lixeira
          </p>

          <div className="flex flex-col gap-2">
            {gabExcluidos.map(g => {
              const dt = new Date(g.deletedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
              const expiry = new Date(g.deletedAt);
              expiry.setDate(expiry.getDate() + 90);
              const daysLeft = Math.max(0, Math.ceil((expiry.getTime() - Date.now()) / 86400000));
              const isActing = acaoGabExcluidoId === g.id;
              return (
                <div key={g.id} style={{ background: 'var(--bg-card)', borderRadius: '0.875rem', border: '1px solid rgba(239,68,68,0.2)', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.875rem', flexWrap: 'wrap' }}>
                  <div style={{ width: 38, height: 38, borderRadius: '0.65rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Building2 size={18} style={{ color: '#f87171' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{g.nome}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--tint-45)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <User size={11} /> {g._count.users} usuário{g._count.users !== 1 ? 's' : ''}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--tint-45)' }}>
                        {g._count.demands} demanda{g._count.demands !== 1 ? 's' : ''} · {g._count.contatos} contato{g._count.contatos !== 1 ? 's' : ''}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Calendar size={11} /> Excluído em {dt} por {g.deletedByName ?? 'Admin'}
                      </span>
                      <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.5rem', borderRadius: '999px', background: daysLeft <= 10 ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.12)', color: daysLeft <= 10 ? '#f87171' : '#f59e0b', border: `1px solid ${daysLeft <= 10 ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}` }}>
                        {daysLeft} dia{daysLeft !== 1 ? 's' : ''} restante{daysLeft !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                    <button
                      onClick={() => acaoGabExcluido(g.id, 'RESTAURAR')} disabled={isActing}
                      title="Restaurar gabinete"
                      style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.875rem', borderRadius: '0.65rem', border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.1)', color: '#4ade80', fontSize: '0.78rem', fontWeight: 600, cursor: isActing ? 'not-allowed' : 'pointer' }}>
                      {isActing ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                      Restaurar
                    </button>
                    <button
                      onClick={() => acaoGabExcluido(g.id, 'EXCLUIR')} disabled={isActing}
                      title="Excluir permanentemente"
                      style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.875rem', borderRadius: '0.65rem', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#f87171', fontSize: '0.78rem', fontWeight: 600, cursor: isActing ? 'not-allowed' : 'pointer' }}>
                      {isActing ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      Excluir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL: Aprovar com permissões
      ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showApproveModal && approveTarget && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)' }}
            onClick={e => { if (e.target===e.currentTarget && actionId!==approveTarget.id) setShowApproveModal(false); }}>
            <motion.div initial={{ scale:0.95, opacity:0 }} animate={{ scale:1, opacity:1 }} exit={{ scale:0.95, opacity:0 }}
              className="w-full max-w-md rounded-2xl p-6 space-y-4"
              style={{ background:'var(--bg-card)', border:'1px solid rgba(34,197,94,0.25)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background:'rgba(34,197,94,0.12)', border:'1px solid rgba(34,197,94,0.3)' }}>
                  <Check className="w-5 h-5" style={{ color:'#4ade80' }} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[color:var(--text-primary)] font-semibold text-sm">Aprovar usuário</h3>
                  <p className="text-xs mt-0.5 truncate" style={{ color:'var(--tint-45)' }}>{approveTarget.name}</p>
                </div>
              </div>
              <p className="text-xs" style={{ color:'var(--tint-55)' }}>Selecione quais áreas este usuário poderá acessar:</p>
              <PermissionsChecklist selected={approvePerms}
                onToggle={p => togglePerm(approvePerms, setApprovePerms, p)}
                onSelectAll={() => setApprovePerms(new Set(ALL_PERMISSIONS))}
                onClear={() => setApprovePerms(new Set())}
                accent={ACCENT_EMERALD} />
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowApproveModal(false)} disabled={actionId===approveTarget.id}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-[var(--tint-06)] disabled:opacity-50"
                  style={{ color:'var(--tint-45)', border:'1px solid var(--tint-08)' }}>Cancelar</button>
                <button onClick={() => doApprove(approveTarget.id, Array.from(approvePerms))} disabled={actionId===approveTarget.id}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background:'linear-gradient(135deg,#16a34a,#22c55e)', color:'var(--bg-page)' }}>
                  {actionId===approveTarget.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {actionId===approveTarget.id ? 'Aprovando...' : 'Aprovar'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL: Editar Permissões
      ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showEditPermsModal && editPermsTarget && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)' }}
            onClick={e => { if (e.target===e.currentTarget && !savingPerms) setShowEditPermsModal(false); }}>
            <motion.div initial={{ scale:0.95, opacity:0 }} animate={{ scale:1, opacity:1 }} exit={{ scale:0.95, opacity:0 }}
              className="w-full max-w-md rounded-2xl p-6 space-y-4"
              style={{ background:'var(--bg-card)', border:'1px solid rgba(168,85,247,0.25)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background:'rgba(168,85,247,0.12)', border:'1px solid rgba(168,85,247,0.3)' }}>
                  <SlidersHorizontal className="w-5 h-5" style={{ color:'#c084fc' }} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[color:var(--text-primary)] font-semibold text-sm">Editar permissões</h3>
                  <p className="text-xs mt-0.5 truncate" style={{ color:'var(--tint-45)' }}>{editPermsTarget.name}</p>
                </div>
              </div>
              <PermissionsChecklist selected={editPerms}
                onToggle={p => togglePerm(editPerms, setEditPerms, p)}
                onSelectAll={() => setEditPerms(new Set(ALL_PERMISSIONS))}
                onClear={() => setEditPerms(new Set())}
                accent={ACCENT_PURPLE} />
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowEditPermsModal(false)} disabled={savingPerms}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-[var(--tint-06)] disabled:opacity-50"
                  style={{ color:'var(--tint-45)', border:'1px solid var(--tint-08)' }}>Cancelar</button>
                <button onClick={doEditPerms} disabled={savingPerms}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background:'linear-gradient(135deg,#9333ea,#a855f7)', color:'#fff' }}>
                  {savingPerms ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {savingPerms ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL: Reset Senha
      ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showResetModal && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)' }}
            onClick={e => { if (e.target===e.currentTarget && !resettingPwd) { setShowResetModal(false); setResetResult(''); } }}>
            <motion.div initial={{ scale:0.95, opacity:0 }} animate={{ scale:1, opacity:1 }} exit={{ scale:0.95, opacity:0 }}
              className="w-full max-w-sm rounded-2xl p-6 space-y-4"
              style={{ background:'var(--bg-card)', border:'1px solid rgba(245,158,11,0.25)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background:'rgba(245,158,11,0.12)', border:'1px solid rgba(245,158,11,0.3)' }}>
                  <KeyRound className="w-5 h-5" style={{ color:'#f59e0b' }} />
                </div>
                <div>
                  <h3 className="text-[color:var(--text-primary)] font-semibold text-sm">Resetar Senha</h3>
                  <p className="text-xs mt-0.5" style={{ color:'var(--tint-45)' }}>{resetTargetName}</p>
                </div>
              </div>

              {!resetResult && (
                <>
                  <p className="text-sm" style={{ color:'var(--tint-55)' }}>
                    Uma <strong style={{ color:'#f59e0b' }}>senha temporária</strong> será gerada e a senha atual substituída.
                  </p>
                  <div className="flex gap-3 pt-1">
                    <button onClick={() => setShowResetModal(false)} disabled={resettingPwd}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-[var(--tint-06)] disabled:opacity-50"
                      style={{ color:'var(--tint-45)', border:'1px solid var(--tint-08)' }}>Cancelar</button>
                    <button onClick={doReset} disabled={resettingPwd}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                      style={{ background:'linear-gradient(135deg,#d97706,#f59e0b)', color:'var(--bg-page)' }}>
                      {resettingPwd ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                      {resettingPwd ? 'Gerando...' : 'Confirmar Reset'}
                    </button>
                  </div>
                </>
              )}

              {resetResult && (
                <>
                  {resetResult === '__EMAIL_SENT__' ? (
                    <div className="rounded-xl p-4 text-center space-y-2" style={{ background:'rgba(34,197,94,0.07)', border:'1px solid rgba(34,197,94,0.2)' }}>
                      <p className="text-sm font-semibold" style={{ color:'#4ade80' }}>Senha redefinida!</p>
                      <p className="text-xs" style={{ color:'var(--tint-55)' }}>Senha temporária enviada por e-mail.</p>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-xl p-4 text-center space-y-2" style={{ background:'rgba(34,197,94,0.07)', border:'1px solid rgba(34,197,94,0.2)' }}>
                        <p className="text-xs" style={{ color:'var(--tint-45)' }}>Senha temporária gerada</p>
                        <p className="text-2xl font-bold tracking-[0.2em] select-all" style={{ color:'#4ade80', fontFamily:'monospace' }}>{resetResult}</p>
                        <p className="text-[10px]" style={{ color:'var(--tint-35)' }}>Clique para selecionar</p>
                      </div>
                      <button onClick={() => { navigator.clipboard.writeText(resetResult); setCopiedPwd(true); setTimeout(() => setCopiedPwd(false), 2500); }}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
                        style={copiedPwd
                          ? { background:'rgba(34,197,94,0.15)', color:'#4ade80', border:'1px solid rgba(34,197,94,0.3)' }
                          : { background:'rgba(37,99,235,0.12)', color:'#2563EB', border:'1px solid rgba(37,99,235,0.3)' }}>
                        {copiedPwd ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {copiedPwd ? 'Copiado!' : 'Copiar Senha'}
                      </button>
                      <p className="text-[11px] text-center" style={{ color:'var(--tint-35)' }}>
                        ⚠️ Esta senha não será exibida novamente
                      </p>
                    </>
                  )}
                  <button onClick={() => { setShowResetModal(false); setResetResult(''); }}
                    className="w-full py-2 rounded-xl text-sm font-medium transition-all hover:bg-[var(--tint-06)]"
                    style={{ color:'var(--tint-45)', border:'1px solid var(--tint-08)' }}>Fechar</button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL: Excluir Gabinete
      ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {confirmDeleteGab && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)' }}
            onClick={e => { if (e.target===e.currentTarget && !deletingGab) setConfirmDeleteGab(null); }}>
            <motion.div initial={{ scale:0.95, opacity:0 }} animate={{ scale:1, opacity:1 }} exit={{ scale:0.95, opacity:0 }}
              className="w-full max-w-sm rounded-2xl p-6 space-y-4"
              style={{ background:'var(--bg-card)', border:'1px solid rgba(239,68,68,0.25)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background:'rgba(239,68,68,0.12)', border:'1px solid rgba(239,68,68,0.3)' }}>
                  <Trash2 className="w-5 h-5" style={{ color:'#f87171' }} />
                </div>
                <div>
                  <h3 className="text-[color:var(--text-primary)] font-semibold text-sm">Excluir Gabinete</h3>
                  <p className="text-xs mt-0.5" style={{ color:'var(--tint-45)' }}>{confirmDeleteGab.nome}</p>
                </div>
              </div>
              <p className="text-sm" style={{ color:'var(--tint-55)' }}>
                O gabinete <strong style={{ color: 'var(--text-primary)' }}>{confirmDeleteGab.nome}</strong> será movido para a lixeira.
                Você terá <strong style={{ color:'#f59e0b' }}>90 dias</strong> para restaurá-lo.
                Após esse prazo, o gabinete e todos os seus{' '}
                <strong style={{ color:'var(--tint-75)' }}>{confirmDeleteGab.users.length} usuário{confirmDeleteGab.users.length !== 1 ? 's' : ''}</strong>,
                demandas, agenda e contatos serão excluídos permanentemente.
              </p>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setConfirmDeleteGab(null)} disabled={deletingGab}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-[var(--tint-06)] disabled:opacity-50"
                  style={{ color:'var(--tint-45)', border:'1px solid var(--tint-08)' }}>Cancelar</button>
                <button onClick={doDeleteGabinete} disabled={deletingGab}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background:'linear-gradient(135deg,#dc2626,#ef4444)', color:'#fff' }}>
                  {deletingGab ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {deletingGab ? 'Movendo...' : 'Mover para lixeira'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL: Confirmar Remoção
      ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {confirmReject && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)' }}
            onClick={e => { if (e.target===e.currentTarget && !deletingReject) setConfirmReject(null); }}>
            <motion.div initial={{ scale:0.95, opacity:0 }} animate={{ scale:1, opacity:1 }} exit={{ scale:0.95, opacity:0 }}
              className="w-full max-w-sm rounded-2xl p-6 space-y-4"
              style={{ background:'var(--bg-card)', border:'1px solid rgba(239,68,68,0.25)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background:'rgba(239,68,68,0.12)', border:'1px solid rgba(239,68,68,0.3)' }}>
                  <Trash2 className="w-5 h-5" style={{ color:'#f87171' }} />
                </div>
                <div>
                  <h3 className="text-[color:var(--text-primary)] font-semibold text-sm">Remover usuário</h3>
                  <p className="text-xs mt-0.5" style={{ color:'var(--tint-45)' }}>{confirmReject.name}</p>
                </div>
              </div>
              <p className="text-sm" style={{ color:'var(--tint-55)' }}>
                Esta ação excluirá permanentemente a conta do usuário. Não pode ser desfeita.
              </p>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setConfirmReject(null)} disabled={deletingReject}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-[var(--tint-06)] disabled:opacity-50"
                  style={{ color:'var(--tint-45)', border:'1px solid var(--tint-08)' }}>Cancelar</button>
                <button onClick={doReject} disabled={deletingReject}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background:'linear-gradient(135deg,#dc2626,#ef4444)', color:'#fff' }}>
                  {deletingReject ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {deletingReject ? 'Removendo...' : 'Sim, remover'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
