'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  Building2, Link2, Copy, CheckCheck, Clock, CheckCircle2,
  XCircle, AlertCircle, Loader2, RefreshCw, ChevronDown, ChevronUp,
  User, Mail, Calendar, Trash2, UserX, Check, X,
  SlidersHorizontal, KeyRound, Search, Shield, RotateCcw,
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
  SUPER_ADMIN:     { bg: 'rgba(201,162,39,0.12)',  color: '#c9a227',  border: 'rgba(201,162,39,0.3)'  },
  ADMIN:           { bg: 'rgba(201,162,39,0.12)',  color: '#c9a227',  border: 'rgba(201,162,39,0.3)'  },
  AGENTE_POLITICO: { bg: 'rgba(168,85,247,0.12)',  color: '#c084fc',  border: 'rgba(168,85,247,0.3)'  },
  CHEFE:           { bg: 'rgba(74,158,222,0.12)',  color: '#4a9ede',  border: 'rgba(74,158,222,0.3)'  },
  ASSESSOR:        { bg: 'rgba(34,197,94,0.10)',   color: '#4ade80',  border: 'rgba(34,197,94,0.25)'  },
  ANALISTA:        { bg: 'rgba(255,255,255,0.06)', color: '#cbd5e1',  border: 'rgba(255,255,255,0.12)' },
  VISUALIZADOR:    { bg: 'rgba(255,255,255,0.06)', color: '#94a3b8',  border: 'rgba(255,255,255,0.12)' },
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
            style={{ top: dropPos.top, right: dropPos.right, background: '#071d36', border: '1px solid rgba(201,162,39,0.2)', minWidth: 170 }}>
            {roles.map(r => (
              <button key={r} onClick={() => change(r)}
                className="w-full text-left px-4 py-2.5 text-xs font-medium transition-all hover:bg-white/5 flex items-center gap-2"
                style={{ color: r === current ? '#c9a227' : 'rgba(255,255,255,0.7)' }}>
                {r === current && <Check className="w-3 h-3 flex-shrink-0" style={{ color: '#c9a227' }} />}
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
  return (
    <>
      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {ALL_PERMISSIONS.map(p => {
          const checked = selected.has(p);
          return (
            <button key={p} type="button" onClick={() => onToggle(p)}
              className="w-full text-left flex items-center justify-between px-4 py-3 rounded-xl transition-all"
              style={{ background: checked ? accent.bgLight : 'rgba(255,255,255,0.02)', border: `1px solid ${checked ? accent.borderLight : 'rgba(255,255,255,0.08)'}` }}>
              <span className="text-sm font-medium" style={{ color: checked ? '#fff' : 'rgba(255,255,255,0.75)' }}>
                {PERMISSION_LABELS[p as Permission]}
              </span>
              <span className="flex items-center justify-center w-5 h-5 rounded-md flex-shrink-0 transition-all"
                style={checked
                  ? { background: accent.solid, color: '#fff', boxShadow: `0 0 8px ${accent.borderLight}` }
                  : { background: 'transparent', border: '1.5px solid rgba(255,255,255,0.2)' }}>
                {checked && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[11px] pt-1">
        <button type="button" onClick={onSelectAll} className="font-semibold hover:opacity-80" style={{ color: accent.solid }}>Marcar todas</button>
        <button type="button" onClick={onClear} className="hover:opacity-80" style={{ color: 'rgba(255,255,255,0.45)' }}>Limpar</button>
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: Solicitacao['status'] }) {
  const map = {
    PENDENTE: { label: 'Pendente', color: '#e6b83a', bg: 'rgba(201,162,39,0.15)', border: 'rgba(201,162,39,0.3)', icon: <Clock size={12} /> },
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
    <div style={{ background:'rgba(7,29,54,0.75)', borderRadius:'0.875rem', border:'1px solid rgba(201,162,39,0.13)', overflow:'hidden' }}>
      <div style={{ padding:'1rem 1.25rem', display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer', userSelect:'none' }}
        onClick={() => setExpanded(v => !v)}>
        <div style={{ display:'flex', alignItems:'center', gap:'0.85rem' }}>
          <div style={{ width:38, height:38, borderRadius:'0.65rem', background:'rgba(201,162,39,0.12)', border:'1px solid rgba(201,162,39,0.25)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <Building2 size={18} color="#c9a227" />
          </div>
          <div>
            <p style={{ margin:0, fontWeight:700, fontSize:'0.9rem', color:'#e2e8f0' }}>{sol.gabineteNome}</p>
            <p style={{ margin:0, fontSize:'0.75rem', color:'rgba(255,255,255,0.4)', marginTop:'0.1rem' }}>{sol.userName} · {sol.userEmail}</p>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
          <StatusBadge status={sol.status} />
          {expanded ? <ChevronUp size={15} color="rgba(255,255,255,0.3)" /> : <ChevronDown size={15} color="rgba(255,255,255,0.3)" />}
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop:'1px solid rgba(255,255,255,0.06)', padding:'1rem 1.25rem', background:'rgba(0,0,0,0.15)' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.65rem', marginBottom:'1rem' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', fontSize:'0.8rem', color:'rgba(255,255,255,0.6)' }}>
              <User size={13} color="rgba(255,255,255,0.3)" /><span>{sol.userName}</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', fontSize:'0.8rem', color:'rgba(255,255,255,0.6)' }}>
              <Mail size={13} color="rgba(255,255,255,0.3)" /><span>{sol.userEmail}</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', fontSize:'0.8rem', color:'rgba(255,255,255,0.45)' }}>
              <Calendar size={13} color="rgba(255,255,255,0.3)" /><span>{dt}</span>
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
                  style={{ width:'100%', padding:'0.6rem 0.85rem', borderRadius:'0.65rem', border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.06)', fontSize:'0.8rem', resize:'vertical', outline:'none', boxSizing:'border-box', fontFamily:'inherit', color:'#e2e8f0' }} />
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
                    style={{ padding:'0.55rem 0.85rem', borderRadius:'0.65rem', border:'1px solid rgba(255,255,255,0.1)', cursor:'pointer', fontSize:'0.78rem', color:'rgba(255,255,255,0.45)', background:'transparent' }}>
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
  const [deletingUserId,   setDeletingUserId]   = useState<string|null>(null);
  const [excluidos,        setExcluidos]        = useState<UsuarioExcluido[]>([]);
  const [acaoExcluidoId,   setAcaoExcluidoId]   = useState<string|null>(null);

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
      const [resSol, resUsers, resGabs, resExcluidos] = await Promise.all([
        fetch('/api/admin/solicitacoes-gabinete', { cache: 'no-store' }),
        fetch('/api/users', { cache: 'no-store' }),
        fetch('/api/gabinetes', { cache: 'no-store' }),
        fetch('/api/admin/usuarios-excluidos', { cache: 'no-store' }),
      ]);
      if (resSol.ok)      { const d = await resSol.json();      setSolicitacoes(d.solicitacoes ?? []); }
      if (resUsers.ok)    { const d = await resUsers.json();     setAllUsers(d ?? []); }
      if (resGabs.ok)     { const d = await resGabs.json();      setGabinetes(d ?? []); }
      if (resExcluidos.ok){ const d = await resExcluidos.json(); setExcluidos(d ?? []); }
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

  const doDeleteGabinete = async () => {
    if (!confirmDeleteGab) return;
    setDeletingGab(true);
    try {
      const res  = await fetch(`/api/gabinetes/${confirmDeleteGab.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        setGabinetes(prev => prev.filter(g => g.id !== confirmDeleteGab.id));
        setAllUsers(prev => prev.filter(u => u.gabinete?.id !== confirmDeleteGab.id));
        toast.success(`Gabinete "${confirmDeleteGab.nome}" excluído.`);
        setConfirmDeleteGab(null);
      } else {
        toast.error(data.error || 'Erro ao excluir gabinete');
      }
    } catch { toast.error('Erro de conexão'); }
    finally { setDeletingGab(false); }
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
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-7 h-7 animate-spin" style={{ color:'#c9a227' }} /></div>;
  }

  const filterBtn = (label: string, value: typeof filtro) => (
    <button key={value} onClick={() => setFiltro(value)}
      className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
      style={{ border:'1px solid', borderColor:filtro===value?'rgba(201,162,39,0.5)':'rgba(255,255,255,0.1)', background:filtro===value?'rgba(201,162,39,0.15)':'transparent', color:filtro===value?'#c9a227':'rgba(255,255,255,0.45)', cursor:'pointer' }}>
      {label}
    </button>
  );

  return (
    <div className="space-y-5">

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background:'rgba(201,162,39,0.12)', border:'1px solid rgba(201,162,39,0.25)' }}>
            <Building2 className="w-5 h-5" style={{ color:'#c9a227' }} />
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color:'#e2e8f0' }}>Administração de Gabinetes</h1>
            <p className="text-xs" style={{ color:'rgba(255,255,255,0.4)' }}>Gerencie gabinetes, solicitações e usuários</p>
          </div>
        </div>
        <button onClick={carregarTudo}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all"
          style={{ border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'rgba(255,255,255,0.6)', cursor:'pointer' }}>
          <RefreshCw size={13} /> Atualizar
        </button>
      </div>

      {/* ── Card Gerar Link ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl p-5" style={{ background:'rgba(7,29,54,0.8)', border:'1px solid rgba(201,162,39,0.2)' }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Link2 size={16} style={{ color:'#c9a227' }} />
              <h2 className="text-sm font-bold" style={{ color:'#e2e8f0' }}>Link de Convite para Novo Gabinete</h2>
            </div>
            <p className="text-xs" style={{ color:'rgba(255,255,255,0.45)', maxWidth:520 }}>
              Gere um link válido por <strong style={{ color:'#c9a227' }}>1 hora</strong> e envie para o Agente Político.
            </p>
          </div>
          <button onClick={gerarLink} disabled={gerandoLink}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50 flex-shrink-0"
            style={{ background:'linear-gradient(135deg,#c9a227,#e6b83a)', color:'#04111f', border:'none', cursor:gerandoLink?'not-allowed':'pointer' }}>
            {gerandoLink ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
            {gerandoLink ? 'Gerando...' : 'Gerar Link'}
          </button>
        </div>

        {linkGerado && (
          <div className="mt-4 flex items-center gap-3 flex-wrap rounded-xl p-3" style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)' }}>
            <code className="flex-1 text-xs break-all" style={{ color:'rgba(255,255,255,0.6)', fontFamily:'monospace', minWidth:0 }}>{linkGerado}</code>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[10px]" style={{ color:'rgba(255,255,255,0.3)' }}>expira às {linkExpiry}</span>
              <button onClick={copiarLink}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{ background:copiado?'rgba(34,197,94,0.15)':'rgba(201,162,39,0.15)', color:copiado?'#4ade80':'#c9a227', border:copiado?'1px solid rgba(34,197,94,0.3)':'1px solid rgba(201,162,39,0.3)', cursor:'pointer' }}>
                {copiado ? <><CheckCheck size={12}/> Copiado</> : <><Copy size={12}/> Copiar</>}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Solicitações ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-sm font-bold" style={{ color:'#e2e8f0' }}>
          Solicitações de Cadastro
          {pendentes > 0 && (
            <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background:'rgba(201,162,39,0.15)', color:'#c9a227', border:'1px solid rgba(201,162,39,0.3)' }}>
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
        <div className="flex flex-col items-center justify-center py-12" style={{ color:'rgba(255,255,255,0.3)' }}>
          <Loader2 size={28} className="animate-spin mb-3" style={{ color:'#c9a227' }} />
          <p className="text-sm">Carregando...</p>
        </div>
      ) : filtradas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 rounded-2xl" style={{ background:'rgba(7,29,54,0.5)', border:'1px solid rgba(255,255,255,0.06)' }}>
          <Building2 size={32} style={{ color:'rgba(255,255,255,0.1)', marginBottom:'0.75rem' }} />
          <p className="text-sm font-semibold" style={{ color:'rgba(255,255,255,0.4)' }}>
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
            <div className="flex-1 h-px" style={{ background:'rgba(255,255,255,0.06)' }} />
            <div className="flex items-center gap-2">
              <Building2 size={14} style={{ color:'#4a9ede' }} />
              <span className="text-xs font-semibold" style={{ color:'rgba(255,255,255,0.35)' }}>GABINETES ATIVOS</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background:'rgba(74,158,222,0.15)', color:'#4a9ede', border:'1px solid rgba(74,158,222,0.25)' }}>
                {gabineteGroups.length}
              </span>
            </div>
            <div className="flex-1 h-px" style={{ background:'rgba(255,255,255,0.06)' }} />
          </div>

          {/* Busca */}
          {gabineteGroups.length > 3 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color:'rgba(255,255,255,0.3)' }} />
              <input value={searchGabinete} onChange={e => setSearchGabinete(e.target.value)}
                placeholder="Buscar gabinete..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-white outline-none"
                style={{ background:'rgba(7,29,54,0.75)', border:'1px solid rgba(255,255,255,0.08)' }} />
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
                  style={{ background:'rgba(7,29,54,0.8)', border:'1px solid rgba(74,158,222,0.15)' }}>

                  {/* Header */}
                  <div className="flex items-center px-5 py-4 gap-2">
                    <button className="flex-1 flex items-center gap-3 text-left transition-all hover:opacity-80"
                      onClick={() => toggleGab(group.id)}>
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background:'rgba(74,158,222,0.15)', border:'1px solid rgba(74,158,222,0.3)' }}>
                        <Building2 className="w-[18px] h-[18px]" style={{ color:'#4a9ede' }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-white font-semibold text-sm">{group.nome}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[11px]" style={{ color:'rgba(255,255,255,0.4)' }}>
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
                      <button onClick={() => setConfirmDeleteGab(group)}
                        title="Excluir gabinete"
                        className="p-1.5 rounded-lg transition-all hover:bg-red-500/10"
                        style={{ color:'rgba(255,255,255,0.25)' }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => toggleGab(group.id)}
                        className="p-1.5 rounded-lg transition-all hover:bg-white/5"
                        style={{ color:'rgba(255,255,255,0.3)' }}>
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
                          <div className="px-5 py-6 text-center text-xs" style={{ color:'rgba(255,255,255,0.25)', borderTop:'1px solid rgba(255,255,255,0.05)' }}>
                            Nenhum usuário neste gabinete
                          </div>
                        ) : (
                          <div className="divide-y" style={{ borderColor:'rgba(255,255,255,0.05)', borderTop:'1px solid rgba(255,255,255,0.05)' }}>
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
                                      <p className="text-white text-sm font-medium truncate">{u.name}</p>
                                      {!u.approved && u.role !== 'ADMIN' && u.role !== 'SUPER_ADMIN' && (
                                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                                          style={{ background:'rgba(245,158,11,0.15)', color:'#f59e0b' }}>Pendente</span>
                                      )}
                                    </div>
                                    <p className="text-[11px] truncate" style={{ color:'rgba(255,255,255,0.35)' }}>{u.email}</p>
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
                                      style={{ color:'rgba(255,255,255,0.3)' }}>
                                      <SlidersHorizontal className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {/* Reset senha */}
                                  <button onClick={() => openResetModal(u.id, u.name)} title="Resetar senha"
                                    className="p-1.5 rounded-lg transition-all hover:bg-yellow-500/10"
                                    style={{ color:'rgba(255,255,255,0.3)' }}>
                                    <KeyRound className="w-3.5 h-3.5" />
                                  </button>
                                  {/* Remover */}
                                  {u.role !== 'SUPER_ADMIN' && (
                                    <button onClick={() => setConfirmReject({ userId: u.id, name: u.name })}
                                      disabled={actionId === u.id}
                                      title="Remover usuário"
                                      className="p-1.5 rounded-lg transition-all hover:bg-red-500/10"
                                      style={{ color:'rgba(255,255,255,0.3)' }}>
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
            <div className="flex-1 h-px" style={{ background:'rgba(255,255,255,0.06)' }} />
            <div className="flex items-center gap-2">
              <UserX size={14} style={{ color:'#f87171' }} />
              <span className="text-xs font-semibold" style={{ color:'rgba(255,255,255,0.35)' }}>USUÁRIOS SEM GABINETE</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background:'rgba(239,68,68,0.15)', color:'#f87171', border:'1px solid rgba(239,68,68,0.25)' }}>
                {semGabinete.length}
              </span>
            </div>
            <div className="flex-1 h-px" style={{ background:'rgba(255,255,255,0.06)' }} />
          </div>

          <div className="flex flex-col gap-2">
            {semGabinete.map(u => (
              <div key={u.id} style={{ background:'rgba(7,29,54,0.75)', borderRadius:'0.875rem', border:'1px solid rgba(239,68,68,0.15)', padding:'0.875rem 1.25rem', display:'flex', alignItems:'center', gap:'0.875rem' }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <User size={16} style={{ color:'#f87171' }} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ margin:0, fontWeight:600, fontSize:'0.875rem', color:'#e2e8f0' }}>{u.name}</p>
                  <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginTop:'0.2rem', flexWrap:'wrap' }}>
                    <span style={{ fontSize:'0.73rem', color:'rgba(255,255,255,0.4)', display:'flex', alignItems:'center', gap:'0.3rem' }}>
                      <Mail size={11}/> {u.email}
                    </span>
                    <span style={{ fontSize:'0.7rem', padding:'0.1rem 0.5rem', borderRadius:'999px', background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.35)', border:'1px solid rgba(255,255,255,0.08)' }}>
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
            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <div className="flex items-center gap-2">
              <Trash2 size={14} style={{ color: '#f87171' }} />
              <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.35)' }}>EXCLUSÕES PENDENTES DE REVISÃO</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
                {excluidos.length}
              </span>
            </div>
            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
          </div>

          <div className="flex flex-col gap-2">
            {excluidos.map(u => {
              const dt = new Date(u.deletedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
              const isActing = acaoExcluidoId === u.id;
              return (
                <div key={u.id} style={{ background: 'rgba(7,29,54,0.75)', borderRadius: '0.875rem', border: '1px solid rgba(239,68,68,0.2)', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.875rem', flexWrap: 'wrap' }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.75rem', fontWeight: 700, color: '#f87171' }}>
                    {u.name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: '#e2e8f0' }}>{u.name}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Mail size={11} /> {u.email}
                      </span>
                      {u.gabinete && (
                        <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
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
              style={{ background:'#071d36', border:'1px solid rgba(34,197,94,0.25)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background:'rgba(34,197,94,0.12)', border:'1px solid rgba(34,197,94,0.3)' }}>
                  <Check className="w-5 h-5" style={{ color:'#4ade80' }} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-white font-semibold text-sm">Aprovar usuário</h3>
                  <p className="text-xs mt-0.5 truncate" style={{ color:'rgba(255,255,255,0.4)' }}>{approveTarget.name}</p>
                </div>
              </div>
              <p className="text-xs" style={{ color:'rgba(255,255,255,0.5)' }}>Selecione quais áreas este usuário poderá acessar:</p>
              <PermissionsChecklist selected={approvePerms}
                onToggle={p => togglePerm(approvePerms, setApprovePerms, p)}
                onSelectAll={() => setApprovePerms(new Set(ALL_PERMISSIONS))}
                onClear={() => setApprovePerms(new Set())}
                accent={ACCENT_EMERALD} />
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowApproveModal(false)} disabled={actionId===approveTarget.id}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-white/5 disabled:opacity-50"
                  style={{ color:'rgba(255,255,255,0.4)', border:'1px solid rgba(255,255,255,0.08)' }}>Cancelar</button>
                <button onClick={() => doApprove(approveTarget.id, Array.from(approvePerms))} disabled={actionId===approveTarget.id}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background:'linear-gradient(135deg,#16a34a,#22c55e)', color:'#04111f' }}>
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
              style={{ background:'#071d36', border:'1px solid rgba(168,85,247,0.25)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background:'rgba(168,85,247,0.12)', border:'1px solid rgba(168,85,247,0.3)' }}>
                  <SlidersHorizontal className="w-5 h-5" style={{ color:'#c084fc' }} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-white font-semibold text-sm">Editar permissões</h3>
                  <p className="text-xs mt-0.5 truncate" style={{ color:'rgba(255,255,255,0.4)' }}>{editPermsTarget.name}</p>
                </div>
              </div>
              <PermissionsChecklist selected={editPerms}
                onToggle={p => togglePerm(editPerms, setEditPerms, p)}
                onSelectAll={() => setEditPerms(new Set(ALL_PERMISSIONS))}
                onClear={() => setEditPerms(new Set())}
                accent={ACCENT_PURPLE} />
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowEditPermsModal(false)} disabled={savingPerms}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-white/5 disabled:opacity-50"
                  style={{ color:'rgba(255,255,255,0.4)', border:'1px solid rgba(255,255,255,0.08)' }}>Cancelar</button>
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
              style={{ background:'#071d36', border:'1px solid rgba(245,158,11,0.25)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background:'rgba(245,158,11,0.12)', border:'1px solid rgba(245,158,11,0.3)' }}>
                  <KeyRound className="w-5 h-5" style={{ color:'#f59e0b' }} />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm">Resetar Senha</h3>
                  <p className="text-xs mt-0.5" style={{ color:'rgba(255,255,255,0.4)' }}>{resetTargetName}</p>
                </div>
              </div>

              {!resetResult && (
                <>
                  <p className="text-sm" style={{ color:'rgba(255,255,255,0.55)' }}>
                    Uma <strong style={{ color:'#f59e0b' }}>senha temporária</strong> será gerada e a senha atual substituída.
                  </p>
                  <div className="flex gap-3 pt-1">
                    <button onClick={() => setShowResetModal(false)} disabled={resettingPwd}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-white/5 disabled:opacity-50"
                      style={{ color:'rgba(255,255,255,0.4)', border:'1px solid rgba(255,255,255,0.08)' }}>Cancelar</button>
                    <button onClick={doReset} disabled={resettingPwd}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                      style={{ background:'linear-gradient(135deg,#d97706,#f59e0b)', color:'#04111f' }}>
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
                      <p className="text-xs" style={{ color:'rgba(255,255,255,0.55)' }}>Senha temporária enviada por e-mail.</p>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-xl p-4 text-center space-y-2" style={{ background:'rgba(34,197,94,0.07)', border:'1px solid rgba(34,197,94,0.2)' }}>
                        <p className="text-xs" style={{ color:'rgba(255,255,255,0.45)' }}>Senha temporária gerada</p>
                        <p className="text-2xl font-bold tracking-[0.2em] select-all" style={{ color:'#4ade80', fontFamily:'monospace' }}>{resetResult}</p>
                        <p className="text-[10px]" style={{ color:'rgba(255,255,255,0.3)' }}>Clique para selecionar</p>
                      </div>
                      <button onClick={() => { navigator.clipboard.writeText(resetResult); setCopiedPwd(true); setTimeout(() => setCopiedPwd(false), 2500); }}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
                        style={copiedPwd
                          ? { background:'rgba(34,197,94,0.15)', color:'#4ade80', border:'1px solid rgba(34,197,94,0.3)' }
                          : { background:'rgba(201,162,39,0.12)', color:'#c9a227', border:'1px solid rgba(201,162,39,0.3)' }}>
                        {copiedPwd ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {copiedPwd ? 'Copiado!' : 'Copiar Senha'}
                      </button>
                      <p className="text-[11px] text-center" style={{ color:'rgba(255,255,255,0.3)' }}>
                        ⚠️ Esta senha não será exibida novamente
                      </p>
                    </>
                  )}
                  <button onClick={() => { setShowResetModal(false); setResetResult(''); }}
                    className="w-full py-2 rounded-xl text-sm font-medium transition-all hover:bg-white/5"
                    style={{ color:'rgba(255,255,255,0.4)', border:'1px solid rgba(255,255,255,0.08)' }}>Fechar</button>
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
              style={{ background:'#071d36', border:'1px solid rgba(239,68,68,0.25)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background:'rgba(239,68,68,0.12)', border:'1px solid rgba(239,68,68,0.3)' }}>
                  <Trash2 className="w-5 h-5" style={{ color:'#f87171' }} />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm">Excluir Gabinete</h3>
                  <p className="text-xs mt-0.5" style={{ color:'rgba(255,255,255,0.4)' }}>{confirmDeleteGab.nome}</p>
                </div>
              </div>
              <p className="text-sm" style={{ color:'rgba(255,255,255,0.55)' }}>
                Isso excluirá <strong style={{ color:'#f87171' }}>permanentemente</strong> o gabinete e todos os seus{' '}
                <strong style={{ color:'#f87171' }}>{confirmDeleteGab.users.length} usuário{confirmDeleteGab.users.length !== 1 ? 's' : ''}</strong>,
                demandas, agenda e contatos vinculados. Esta ação não pode ser desfeita.
              </p>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setConfirmDeleteGab(null)} disabled={deletingGab}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-white/5 disabled:opacity-50"
                  style={{ color:'rgba(255,255,255,0.4)', border:'1px solid rgba(255,255,255,0.08)' }}>Cancelar</button>
                <button onClick={doDeleteGabinete} disabled={deletingGab}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background:'linear-gradient(135deg,#dc2626,#ef4444)', color:'#fff' }}>
                  {deletingGab ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {deletingGab ? 'Excluindo...' : 'Sim, excluir'}
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
              style={{ background:'#071d36', border:'1px solid rgba(239,68,68,0.25)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background:'rgba(239,68,68,0.12)', border:'1px solid rgba(239,68,68,0.3)' }}>
                  <Trash2 className="w-5 h-5" style={{ color:'#f87171' }} />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm">Remover usuário</h3>
                  <p className="text-xs mt-0.5" style={{ color:'rgba(255,255,255,0.4)' }}>{confirmReject.name}</p>
                </div>
              </div>
              <p className="text-sm" style={{ color:'rgba(255,255,255,0.55)' }}>
                Esta ação excluirá permanentemente a conta do usuário. Não pode ser desfeita.
              </p>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setConfirmReject(null)} disabled={deletingReject}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-white/5 disabled:opacity-50"
                  style={{ color:'rgba(255,255,255,0.4)', border:'1px solid rgba(255,255,255,0.08)' }}>Cancelar</button>
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
