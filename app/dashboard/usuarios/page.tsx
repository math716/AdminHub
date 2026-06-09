'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  Users, Check, X, Clock, Shield, Building2,
  Loader2, ChevronDown, ChevronUp, CheckCircle2, AlertCircle,
  Link2, Copy, CheckCheck, Search, KeyRound, Trash2, SlidersHorizontal,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ALL_PERMISSIONS,
  PERMISSION_LABELS,
  type Permission,
  hasFullAccess,
} from '@/lib/permissions';

// ---------------------------------------------------------------------------
// Componente reutilizável: lista de permissões (moldura arredondada + tick na
// cor do botão de Salvar)
// ---------------------------------------------------------------------------
type Accent = { solid: string; bgLight: string; borderLight: string };
const ACCENT_PURPLE: Accent  = { solid: '#a855f7', bgLight: 'rgba(168,85,247,0.08)', borderLight: 'rgba(168,85,247,0.3)' };
const ACCENT_EMERALD: Accent = { solid: '#22c55e', bgLight: 'rgba(34,197,94,0.08)',  borderLight: 'rgba(34,197,94,0.3)'  };

function PermissionsChecklist({
  selected,
  onToggle,
  onSelectAll,
  onClear,
  accent,
}: {
  selected: Set<string>;
  onToggle: (perm: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  accent: Accent;
}) {
  return (
    <>
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {ALL_PERMISSIONS.map((p) => {
          const checked = selected.has(p);
          return (
            <button key={p} type="button" onClick={() => onToggle(p)}
              className="w-full text-left flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200"
              style={{
                background: checked ? accent.bgLight : 'rgba(255,255,255,0.02)',
                border: `1px solid ${checked ? accent.borderLight : 'rgba(255,255,255,0.08)'}`,
              }}>
              <span className="text-sm font-medium tracking-wide"
                style={{ color: checked ? '#fff' : 'rgba(255,255,255,0.75)' }}>
                {PERMISSION_LABELS[p as Permission]}
              </span>
              <span className="flex items-center justify-center w-5 h-5 rounded-md flex-shrink-0 transition-all"
                style={checked
                  ? { background: accent.solid, color: '#fff', boxShadow: `0 0 8px ${accent.borderLight}` }
                  : { background: 'transparent', border: '1.5px solid rgba(255,255,255,0.2)' }
                }>
                {checked && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[11px] pt-1">
        <button type="button" onClick={onSelectAll}
          className="font-semibold hover:opacity-80 transition-opacity"
          style={{ color: accent.solid }}>
          Marcar todas
        </button>
        <button type="button" onClick={onClear}
          className="hover:opacity-80 transition-opacity"
          style={{ color: 'rgba(255,255,255,0.45)' }}>
          Limpar
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
type UserRoleKey = 'ADMIN' | 'AGENTE_POLITICO' | 'CHEFE' | 'ASSESSOR' | 'ANALISTA' | 'VISUALIZADOR';

interface UserData {
  id: string;
  email: string;
  name: string;
  role: UserRoleKey;
  approved: boolean;
  permissions: string[];
  createdAt: string;
  gabinete?: { id: string; nome: string };
}

interface GabineteGroup {
  id: string;
  nome: string;
  users: UserData[];
}

// ---------------------------------------------------------------------------
// Helpers visuais
// ---------------------------------------------------------------------------
const ROLE_LABELS: Record<string, string> = {
  ADMIN:           'Administrador',
  AGENTE_POLITICO: 'Agente Político',
  CHEFE:           'Chefe de Gabinete',
  ASSESSOR:        'Assessor',
  ANALISTA:        'Analista',
  VISUALIZADOR:    'Visualizador',
};

const ROLE_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  ADMIN:           { bg: 'rgba(201,162,39,0.12)',  color: '#c9a227',  border: 'rgba(201,162,39,0.3)'  },
  AGENTE_POLITICO: { bg: 'rgba(168,85,247,0.12)',  color: '#c084fc',  border: 'rgba(168,85,247,0.3)'  },
  CHEFE:           { bg: 'rgba(74,158,222,0.12)',  color: '#4a9ede',  border: 'rgba(74,158,222,0.3)'  },
  ASSESSOR:        { bg: 'rgba(34,197,94,0.10)',   color: '#4ade80',  border: 'rgba(34,197,94,0.25)'  },
  ANALISTA:        { bg: 'rgba(255,255,255,0.06)', color: '#cbd5e1',  border: 'rgba(255,255,255,0.12)' },
  VISUALIZADOR:    { bg: 'rgba(255,255,255,0.06)', color: '#94a3b8',  border: 'rgba(255,255,255,0.12)' },
};

function RoleBadge({ role }: { role: string }) {
  const s = ROLE_STYLE[role] ?? ROLE_STYLE.ASSESSOR;
  return (
    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

function RoleSelect({ userId, current, onChanged }: { userId: string; current: string; onChanged: (role: string) => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dropPos, setDropPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const roles = ['ADMIN', 'AGENTE_POLITICO', 'CHEFE', 'ASSESSOR'];

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
          <motion.div
            ref={dropRef}
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            className="fixed z-[9999] rounded-xl overflow-hidden shadow-xl"
            style={{
              top: dropPos.top,
              right: dropPos.right,
              background: '#071d36',
              border: '1px solid rgba(201,162,39,0.2)',
              minWidth: 170,
            }}
          >
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

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export default function UsuariosPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const userRole      = (session?.user as any)?.role;
  const sessionUserId = (session?.user as any)?.id;

  // ── estado geral ──────────────────────────────────────────────────────────
  const [users,     setUsers]     = useState<UserData[]>([]);
  const [gabinetes, setGabinetes] = useState<{ id: string; nome: string }[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [toastData, setToastData] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // ── convite ───────────────────────────────────────────────────────────────
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [inviteUrl,        setInviteUrl]        = useState('');
  const [inviteGabinete,   setInviteGabinete]   = useState('');
  const [inviteRoleResult, setInviteRoleResult] = useState('ASSESSOR');
  const [showInviteModal,  setShowInviteModal]  = useState(false);
  const [showInviteForm,   setShowInviteForm]   = useState(false);
  const [copied,           setCopied]           = useState(false);

  const [searchGabinete,  setSearchGabinete]  = useState('');
  const [expandedGabs,    setExpandedGabs]    = useState<Set<string>>(new Set());

  // ── excluir gabinete ──────────────────────────────────────────────────────
  const [showDeleteGabModal, setShowDeleteGabModal] = useState(false);
  const [deleteGabTarget,    setDeleteGabTarget]    = useState<{ id: string; nome: string; userCount: number } | null>(null);
  const [deletingGab,        setDeletingGab]        = useState(false);

  // ── aprovação com permissões ──────────────────────────────────────────────
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approveTarget,    setApproveTarget]    = useState<UserData | null>(null);
  const [approvePerms,     setApprovePerms]     = useState<Set<string>>(new Set());

  // ── edição de permissões (usuário já aprovado) ────────────────────────────
  const [showEditPermsModal, setShowEditPermsModal] = useState(false);
  const [editPermsTarget,    setEditPermsTarget]    = useState<UserData | null>(null);
  const [editPerms,          setEditPerms]          = useState<Set<string>>(new Set());
  const [savingPerms,        setSavingPerms]        = useState(false);

  // ── reset senha ───────────────────────────────────────────────────────────
  const [showResetModal,  setShowResetModal]  = useState(false);
  const [resetTargetId,   setResetTargetId]   = useState('');
  const [resetTargetName, setResetTargetName] = useState('');
  const [resetResult,     setResetResult]     = useState('');
  const [resettingPwd,    setResettingPwd]    = useState(false);
  const [copiedPwd,       setCopiedPwd]       = useState(false);

  // ── redirect ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (status === 'authenticated' && userRole !== 'CHEFE' && userRole !== 'ADMIN') {
      router.replace('/dashboard');
    }
  }, [status, userRole, router]);

  // ── fetch ─────────────────────────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, gabsRes] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/gabinetes'),
      ]);
      if (usersRes.ok) setUsers(await usersRes.json() ?? []);
      if (gabsRes.ok)  setGabinetes(await gabsRes.json() ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (userRole === 'CHEFE' || userRole === 'ADMIN') fetchUsers();
  }, [userRole, fetchUsers]);

  // ── helpers ───────────────────────────────────────────────────────────────
  const showToast = (type: 'ok' | 'err', msg: string) => {
    setToastData({ type, msg });
    setTimeout(() => setToastData(null), 3500);
  };

  const openApproveModal = (u: UserData) => {
    // ADMIN e AGENTE_POLITICO têm acesso total automaticamente — não precisa modal
    if (hasFullAccess(u.role)) {
      void approveUser(u.id, undefined);
      return;
    }
    setApproveTarget(u);
    setApprovePerms(new Set(u.permissions ?? []));
    setShowApproveModal(true);
  };

  const approveUser = async (userId: string, perms?: string[]) => {
    setActionId(userId);
    try {
      const res = await fetch(`/api/users/${userId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(perms !== undefined ? { permissions: perms } : {}),
      });
      if (res.ok) {
        setUsers(prev => prev.map(u =>
          u.id === userId ? { ...u, approved: true, permissions: perms ?? u.permissions } : u,
        ));
        showToast('ok', 'Usuário aprovado. E-mail de confirmação enviado.');
        setShowApproveModal(false);
        setApproveTarget(null);
      } else { showToast('err', 'Erro ao aprovar usuário.'); }
    } finally { setActionId(null); }
  };

  const openEditPermsModal = (u: UserData) => {
    setEditPermsTarget(u);
    setEditPerms(new Set(u.permissions ?? []));
    setShowEditPermsModal(true);
  };

  const confirmEditPermissions = async () => {
    if (!editPermsTarget) return;
    setSavingPerms(true);
    try {
      const perms = Array.from(editPerms);
      const res = await fetch(`/api/users/${editPermsTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: perms }),
      });
      if (res.ok) {
        setUsers(prev => prev.map(u =>
          u.id === editPermsTarget.id ? { ...u, permissions: perms } : u,
        ));
        showToast('ok', 'Permissões atualizadas.');
        setShowEditPermsModal(false);
        setEditPermsTarget(null);
      } else {
        const data = await res.json().catch(() => ({}));
        showToast('err', data.error || 'Erro ao atualizar permissões.');
      }
    } finally { setSavingPerms(false); }
  };

  const togglePermInSet = (set: Set<string>, setter: (s: Set<string>) => void, perm: string) => {
    const next = new Set(set);
    next.has(perm) ? next.delete(perm) : next.add(perm);
    setter(next);
  };

  const handleReject = async (userId: string, name: string) => {
    if (!confirm(`Remover "${name}"? Esta ação não pode ser desfeita.`)) return;
    setActionId(userId);
    try {
      const res = await fetch(`/api/users/${userId}/reject`, { method: 'POST' });
      if (res.ok) {
        setUsers(prev => prev.filter(u => u.id !== userId));
        showToast('ok', 'Usuário removido.');
      } else { showToast('err', 'Erro ao remover usuário.'); }
    } finally { setActionId(null); }
  };

  const handleRoleChange = (userId: string, newRole: string) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole as UserData['role'] } : u));
    showToast('ok', `Perfil alterado para ${ROLE_LABELS[newRole] ?? newRole}.`);
  };

  const handleGenerateInvite = async (role: 'ASSESSOR' | 'CHEFE' | 'AGENTE_POLITICO' = 'ASSESSOR') => {
    setGeneratingInvite(true);
    setShowInviteForm(false);
    try {
      const res = await fetch('/api/invites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) });
      const data = await res.json();
      if (res.ok) {
        setInviteUrl(data.url);
        setInviteGabinete(data.gabineteNome ?? '');
        setInviteRoleResult(data.role ?? 'ASSESSOR');
        setShowInviteModal(true);
        setCopied(false);
      } else { showToast('err', data.error ?? 'Erro ao gerar convite.'); }
    } finally { setGeneratingInvite(false); }
  };

  const openDeleteGabModal = (group: { id: string; nome: string; users: UserData[] }) => {
    setDeleteGabTarget({ id: group.id, nome: group.nome, userCount: group.users.length });
    setShowDeleteGabModal(true);
  };

  const confirmDeleteGabinete = async () => {
    if (!deleteGabTarget) return;
    setDeletingGab(true);
    try {
      const res = await fetch(`/api/gabinetes/${deleteGabTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        setUsers(prev => prev.filter(u => u.gabinete?.id !== deleteGabTarget.id));
        setGabinetes(prev => prev.filter(g => g.id !== deleteGabTarget.id));
        showToast('ok', `Gabinete "${deleteGabTarget.nome}" excluído.`);
        setShowDeleteGabModal(false);
        setDeleteGabTarget(null);
      } else {
        showToast('err', data.error ?? 'Erro ao excluir gabinete.');
      }
    } finally { setDeletingGab(false); }
  };

  const openResetModal = (userId: string, name: string) => {
    setResetTargetId(userId);
    setResetTargetName(name);
    setResetResult('');
    setCopiedPwd(false);
    setShowResetModal(true);
  };

  const confirmResetPassword = async () => {
    setResettingPwd(true);
    try {
      const res  = await fetch(`/api/users/${resetTargetId}/reset-password`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setResetResult(data.emailSent ? '__EMAIL_SENT__' : (data.password ?? ''));
      } else {
        showToast('err', data.error || 'Erro ao resetar senha.');
        setShowResetModal(false);
      }
    } finally { setResettingPwd(false); }
  };

  // ── gabinete groups ───────────────────────────────────────────────────────
  const { gabineteGroups, noGabinete } = useMemo(() => {
    // Parte dos gabinetes (inclui os sem usuários) para ADMIN;
    // para CHEFE usa apenas os gabinetes presentes nos usuários retornados.
    const base = userRole === 'ADMIN' ? gabinetes : [];
    const map = new Map<string, GabineteGroup>(
      base.map(g => [g.id, { id: g.id, nome: g.nome, users: [] }])
    );
    const sem: UserData[] = [];
    users.forEach(u => {
      if (u.gabinete) {
        if (!map.has(u.gabinete.id)) map.set(u.gabinete.id, { id: u.gabinete.id, nome: u.gabinete.nome, users: [] });
        map.get(u.gabinete.id)!.users.push(u);
      } else { sem.push(u); }
    });
    const groups = Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return { gabineteGroups: groups, noGabinete: sem };
  }, [users, gabinetes, userRole]);

  const filteredGroups = useMemo(() => {
    if (!searchGabinete.trim()) return gabineteGroups;
    const q = searchGabinete.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return gabineteGroups.filter(g =>
      g.nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q)
    );
  }, [gabineteGroups, searchGabinete]);

  const toggleGabinete = (id: string) =>
    setExpandedGabs(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  // ── loading / guard ───────────────────────────────────────────────────────
  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: '#c9a227' }} />
      </div>
    );
  }
  if (userRole !== 'CHEFE' && userRole !== 'ADMIN') return null;

  const pendingUsers  = users.filter(u => !u.approved && u.role !== 'ADMIN');
  const approvedUsers = users.filter(u => u.approved  || u.role === 'ADMIN');
  const cardStyle     = { background: 'rgba(7,29,54,0.75)', border: '1px solid rgba(201,162,39,0.13)' };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Toast */}
      <AnimatePresence>
        {toastData && (
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            className="fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium"
            style={toastData.type === 'ok'
              ? { background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80' }
              : { background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>
            {toastData.type === 'ok'
              ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              : <AlertCircle  className="w-4 h-4 flex-shrink-0" />}
            {toastData.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <PageHeader
        icon={Users}
        title="Gerenciar Usuários"
        subtitle={
          <>
            {approvedUsers.length} ativo{approvedUsers.length !== 1 ? 's' : ''}
            {pendingUsers.length > 0 && ` · ${pendingUsers.length} aguardando aprovação`}
          </>
        }
        actions={
          <div className="relative flex-shrink-0">
          <button
            onClick={() => userRole === 'ADMIN' ? setShowInviteForm(f => !f) : handleGenerateInvite('ASSESSOR')}
            disabled={generatingInvite}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#c9a227,#e6b83a)', color: '#04111f' }}
          >
            {generatingInvite ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            Gerar Convite
            {userRole === 'ADMIN' && <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <AnimatePresence>
            {showInviteForm && userRole === 'ADMIN' && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                className="absolute right-0 mt-1 z-20 rounded-xl overflow-hidden shadow-xl"
                style={{ background: '#071d36', border: '1px solid rgba(201,162,39,0.2)', minWidth: 200 }}>
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Tipo de convite</p>
                {(['ASSESSOR', 'CHEFE', 'AGENTE_POLITICO'] as const).map(r => {
                  const labelColor =
                    r === 'AGENTE_POLITICO' ? '#c084fc' :
                    r === 'CHEFE'           ? '#4a9ede' :
                                              '#4ade80';
                  const label =
                    r === 'AGENTE_POLITICO' ? 'Agente Político' :
                    r === 'CHEFE'           ? 'Chefe de Gabinete' :
                                              'Assessor';
                  const desc =
                    r === 'AGENTE_POLITICO' ? 'Deputado, Senador, Prefeito… acesso total ao gabinete' :
                    r === 'CHEFE'           ? 'Conta pré-aprovada pelo Admin' :
                                              'Requer aprovação do Chefe';
                  return (
                    <button key={r} onClick={() => handleGenerateInvite(r)}
                      className="w-full text-left px-4 py-2.5 text-xs font-medium transition-all hover:bg-white/5"
                      style={{ color: 'rgba(255,255,255,0.75)' }}>
                      <span className="font-semibold" style={{ color: labelColor }}>{label}</span><br />
                      <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '10px' }}>{desc}</span>
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
          </div>
        }
      />


      {/* ══════════════════════════════════════════════════════════════════════
          POR GABINETE
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="space-y-4">

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Gabinetes',  value: gabineteGroups.length, color: '#4a9ede',  icon: Building2 },
              { label: 'Usuários',   value: users.length,          color: '#c9a227',  icon: Users    },
              { label: 'Pendentes',  value: pendingUsers.length,   color: '#f59e0b',  icon: Clock    },
            ].map(stat => (
              <div key={stat.label} className="rounded-xl px-4 py-3 flex items-center gap-3"
                style={{ background: 'rgba(7,29,54,0.75)', border: `1px solid ${stat.color}22` }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `${stat.color}18` }}>
                  <stat.icon className="w-4 h-4" style={{ color: stat.color }} />
                </div>
                <div>
                  <p className="text-white font-bold text-lg leading-none">{stat.value}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{stat.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'rgba(255,255,255,0.3)' }} />
            <input
              value={searchGabinete}
              onChange={e => setSearchGabinete(e.target.value)}
              placeholder="Buscar gabinete pelo nome..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-white placeholder:text-slate-600 outline-none focus:ring-1"
              style={{ background: 'rgba(7,29,54,0.75)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
          </div>

          {/* Cards de Gabinetes */}
          {filteredGroups.length === 0 && (
            <div className="py-16 text-center rounded-2xl" style={cardStyle}>
              <Building2 className="w-10 h-10 mx-auto mb-2 opacity-20" style={{ color: '#4a9ede' }} />
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {searchGabinete ? `Nenhum gabinete encontrado para "${searchGabinete}"` : 'Nenhum gabinete cadastrado'}
              </p>
            </div>
          )}

          <AnimatePresence initial={false}>
            {filteredGroups.map((group, gi) => {
              const isOpen   = expandedGabs.has(group.id);
              const pending  = group.users.filter(u => !u.approved && u.role !== 'ADMIN');
              const approved = group.users.filter(u => u.approved  || u.role === 'ADMIN');

              return (
                <motion.div key={group.id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: gi * 0.04 }}
                  className="rounded-2xl overflow-hidden"
                  style={{ background: 'rgba(7,29,54,0.8)', border: '1px solid rgba(74,158,222,0.15)' }}>

                  {/* Header do card */}
                  <div className="flex items-center px-5 py-4 gap-2">
                    {/* Área clicável para expandir */}
                    <button className="flex-1 flex items-center gap-3 text-left transition-all hover:opacity-80"
                      onClick={() => toggleGabinete(group.id)}>
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(74,158,222,0.15)', border: '1px solid rgba(74,158,222,0.3)' }}>
                        <Building2 className="w-[18px] h-[18px]" style={{ color: '#4a9ede' }} />
                      </div>
                      <div>
                        <p className="text-white font-semibold text-sm">{group.nome}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                            {group.users.length} usuário{group.users.length !== 1 ? 's' : ''}
                          </span>
                          {pending.length > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                              style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}>
                              {pending.length} pendente{pending.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>

                    {/* Ações do gabinete */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => openDeleteGabModal(group)}
                        title="Excluir gabinete"
                        className="p-1.5 rounded-lg transition-all hover:bg-red-500/10"
                        style={{ color: 'rgba(255,255,255,0.25)' }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => toggleGabinete(group.id)}
                        className="p-1.5 rounded-lg transition-all hover:bg-white/5"
                        style={{ color: 'rgba(255,255,255,0.3)' }}>
                        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Corpo expansível */}
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{ overflow: 'hidden' }}>

                        {group.users.length === 0 ? (
                          <div className="px-5 py-6 text-center text-xs" style={{ color: 'rgba(255,255,255,0.25)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            Nenhum usuário neste gabinete
                          </div>
                        ) : (
                          <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            {/* Pendentes primeiro */}
                            {[...pending, ...approved].map((u) => (
                              <div key={u.id}
                                className="flex items-center justify-between px-5 py-3.5 gap-3 transition-all hover:bg-white/[0.02]"
                                style={!u.approved && u.role !== 'ADMIN'
                                  ? { background: 'rgba(245,158,11,0.04)' } : {}}>

                                <div className="flex items-center gap-3 min-w-0">
                                  {/* Avatar */}
                                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                                    style={u.approved || u.role === 'ADMIN'
                                      ? { background: 'linear-gradient(135deg,#1b3a5c,#2a5580)', color: '#7dd3fc' }
                                      : { background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}>
                                    {u.name.split(' ').filter(Boolean).slice(0,2).map(w => w[0].toUpperCase()).join('')}
                                  </div>

                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <p className="text-white text-sm font-medium truncate">{u.name}</p>
                                      {u.id === sessionUserId && (
                                        <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: 'rgba(201,162,39,0.15)', color: '#c9a227' }}>você</span>
                                      )}
                                      {!u.approved && u.role !== 'ADMIN' && (
                                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                                          style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                                          Pendente
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>{u.email}</p>
                                  </div>
                                </div>

                                {/* Ações */}
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {/* Cargo */}
                                  {u.id !== sessionUserId
                                    ? <RoleSelect userId={u.id} current={u.role} onChanged={(r) => handleRoleChange(u.id, r)} />
                                    : <RoleBadge role={u.role} />
                                  }

                                  {/* Aprovar (se pendente) */}
                                  {!u.approved && u.role !== 'ADMIN' && (
                                    <button onClick={() => openApproveModal(u)} disabled={actionId === u.id}
                                      title="Aprovar usuário"
                                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-50"
                                      style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80' }}>
                                      {actionId === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                      Aprovar
                                    </button>
                                  )}

                                  {/* Editar permissões (apenas usuários aprovados que dependem do array) */}
                                  {u.approved && !hasFullAccess(u.role) && u.id !== sessionUserId && (
                                    <button onClick={() => openEditPermsModal(u)}
                                      title="Editar permissões"
                                      className="p-1.5 rounded-lg transition-all hover:bg-purple-500/10"
                                      style={{ color: 'rgba(255,255,255,0.3)' }}>
                                      <SlidersHorizontal className="w-3.5 h-3.5" />
                                    </button>
                                  )}

                                  {/* Reset senha */}
                                  {u.id !== sessionUserId && (
                                    <button onClick={() => openResetModal(u.id, u.name)}
                                      title="Resetar senha"
                                      className="p-1.5 rounded-lg transition-all hover:bg-yellow-500/10"
                                      style={{ color: 'rgba(255,255,255,0.3)' }}>
                                      <KeyRound className="w-3.5 h-3.5" />
                                    </button>
                                  )}

                                  {/* Excluir */}
                                  {u.id !== sessionUserId && (
                                    <button onClick={() => handleReject(u.id, u.name)} disabled={actionId === u.id}
                                      title="Remover usuário"
                                      className="p-1.5 rounded-lg transition-all hover:bg-red-500/10"
                                      style={{ color: 'rgba(255,255,255,0.3)' }}>
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

          {/* Seção sem gabinete (ADMINs sem vínculo) */}
          {noGabinete.length > 0 && !searchGabinete && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl overflow-hidden"
              style={{ background: 'rgba(7,29,54,0.8)', border: '1px solid rgba(201,162,39,0.15)' }}>
              <button className="w-full flex items-center justify-between px-5 py-4 transition-all hover:bg-white/[0.02] text-left"
                onClick={() => toggleGabinete('__no_gabinete__')}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(201,162,39,0.12)', border: '1px solid rgba(201,162,39,0.25)' }}>
                    <Shield className="w-[18px] h-[18px]" style={{ color: '#c9a227' }} />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">Administradores do Sistema</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      {noGabinete.length} usuário{noGabinete.length !== 1 ? 's' : ''} sem gabinete
                    </p>
                  </div>
                </div>
                {expandedGabs.has('__no_gabinete__')
                  ? <ChevronUp  className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }} />
                  : <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }} />
                }
              </button>

              <AnimatePresence initial={false}>
                {expandedGabs.has('__no_gabinete__') && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} style={{ overflow: 'hidden' }}>
                    <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      {noGabinete.map(u => (
                        <div key={u.id} className="flex items-center justify-between px-5 py-3.5 gap-3 transition-all hover:bg-white/[0.02]">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                              style={{ background: 'linear-gradient(135deg,#c9a227,#e6b83a)', color: '#04111f' }}>
                              {u.name.split(' ').filter(Boolean).slice(0,2).map(w => w[0].toUpperCase()).join('')}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-white text-sm font-medium truncate">{u.name}</p>
                                {u.id === sessionUserId && (
                                  <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: 'rgba(201,162,39,0.15)', color: '#c9a227' }}>você</span>
                                )}
                              </div>
                              <p className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>{u.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {u.id !== sessionUserId
                              ? <RoleSelect userId={u.id} current={u.role} onChanged={(r) => handleRoleChange(u.id, r)} />
                              : <RoleBadge role={u.role} />
                            }
                            {u.id !== sessionUserId && (
                              <>
                                <button onClick={() => openResetModal(u.id, u.name)} title="Resetar senha"
                                  className="p-1.5 rounded-lg transition-all hover:bg-yellow-500/10"
                                  style={{ color: 'rgba(255,255,255,0.3)' }}>
                                  <KeyRound className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => handleReject(u.id, u.name)} disabled={actionId === u.id}
                                  title="Remover usuário"
                                  className="p-1.5 rounded-lg transition-all hover:bg-red-500/10"
                                  style={{ color: 'rgba(255,255,255,0.3)' }}>
                                  {actionId === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </div>

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL: Invite
      ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showInviteModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={e => { if (e.target === e.currentTarget) setShowInviteModal(false); }}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md rounded-2xl p-6"
              style={{ background: '#071d36', border: '1px solid rgba(201,162,39,0.25)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(201,162,39,0.12)', border: '1px solid rgba(201,162,39,0.3)' }}>
                  <Link2 className="w-4 h-4" style={{ color: '#c9a227' }} />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm">Link de Convite</h3>
                  {inviteGabinete && <p className="text-xs" style={{ color: '#c9a227' }}>{inviteGabinete}</p>}
                </div>
              </div>
              <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Convite para <span style={{
                  color:
                    inviteRoleResult === 'AGENTE_POLITICO' ? '#c084fc' :
                    inviteRoleResult === 'CHEFE'           ? '#4a9ede' :
                                                              '#4ade80',
                  fontWeight: 600,
                }}>
                  {ROLE_LABELS[inviteRoleResult] ?? 'Assessor'}</span>.
                {inviteRoleResult === 'CHEFE' || inviteRoleResult === 'AGENTE_POLITICO'
                  ? ' A conta será pré-aprovada automaticamente.'
                  : ' Requer aprovação após o cadastro.'}
                {' '}Expira em <span style={{ color: '#e6b83a' }}>7 dias</span>.
              </p>
              <div className="flex items-center gap-2 rounded-xl p-3 mb-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <p className="text-xs flex-1 break-all" style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace' }}>{inviteUrl}</p>
                <button onClick={() => { navigator.clipboard.writeText(inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 2500); }}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={copied
                    ? { background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }
                    : { background: 'rgba(201,162,39,0.12)', color: '#c9a227', border: '1px solid rgba(201,162,39,0.3)' }}>
                  {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
              <button onClick={() => setShowInviteModal(false)}
                className="w-full py-2 rounded-xl text-sm font-medium transition-all hover:bg-white/5"
                style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
                Fechar
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL: Reset de Senha
      ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showResetModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
            onClick={e => { if (e.target === e.currentTarget && !resettingPwd) { setShowResetModal(false); setResetResult(''); } }}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm rounded-2xl p-6 space-y-4"
              style={{ background: '#071d36', border: '1px solid rgba(245,158,11,0.25)' }}>

              {/* Ícone + título */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)' }}>
                  <KeyRound className="w-5 h-5" style={{ color: '#f59e0b' }} />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm">Resetar Senha</h3>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{resetTargetName}</p>
                </div>
              </div>

              {/* Antes do reset: confirmação */}
              {!resetResult && (
                <>
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    Uma <strong style={{ color: '#f59e0b' }}>senha temporária</strong> será gerada e a senha atual será substituída. Compartilhe com o usuário para que ele faça login e altere a senha nas configurações.
                  </p>
                  <div className="flex gap-3 pt-1">
                    <button onClick={() => setShowResetModal(false)} disabled={resettingPwd}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-white/5 disabled:opacity-50"
                      style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      Cancelar
                    </button>
                    <button onClick={confirmResetPassword} disabled={resettingPwd}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                      style={{ background: 'linear-gradient(135deg,#d97706,#f59e0b)', color: '#04111f' }}>
                      {resettingPwd ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                      {resettingPwd ? 'Gerando...' : 'Confirmar Reset'}
                    </button>
                  </div>
                </>
              )}

              {/* Após o reset: exibir senha ou confirmação de email */}
              {resetResult && (
                <>
                  {resetResult === '__EMAIL_SENT__' ? (
                    <div className="rounded-xl p-4 text-center space-y-2" style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)' }}>
                      <p className="text-sm font-semibold" style={{ color: '#4ade80' }}>Senha redefinida com sucesso!</p>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
                        A senha temporária foi enviada por e-mail ao usuário.<br />Ele deverá alterá-la no próximo acesso.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-xl p-4 text-center space-y-2" style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)' }}>
                        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>Senha temporária gerada</p>
                        <p className="text-2xl font-bold tracking-[0.2em] select-all" style={{ color: '#4ade80', fontFamily: 'monospace' }}>
                          {resetResult}
                        </p>
                        <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                          Clique na senha para selecionar
                        </p>
                      </div>

                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(resetResult);
                          setCopiedPwd(true);
                          setTimeout(() => setCopiedPwd(false), 2500);
                        }}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
                        style={copiedPwd
                          ? { background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }
                          : { background: 'rgba(201,162,39,0.12)', color: '#c9a227', border: '1px solid rgba(201,162,39,0.3)' }}>
                        {copiedPwd ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {copiedPwd ? 'Copiado!' : 'Copiar Senha'}
                      </button>

                      <p className="text-[11px] text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        ⚠️ Esta senha não será exibida novamente após fechar
                      </p>
                    </>
                  )}

                  <button onClick={() => { setShowResetModal(false); setResetResult(''); }}
                    className="w-full py-2 rounded-xl text-sm font-medium transition-all hover:bg-white/5"
                    style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    Fechar
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL: Aprovar com permissões
      ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showApproveModal && approveTarget && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
            onClick={e => { if (e.target === e.currentTarget && actionId !== approveTarget.id) setShowApproveModal(false); }}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md rounded-2xl p-6 space-y-4"
              style={{ background: '#071d36', border: '1px solid rgba(34,197,94,0.25)' }}>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)' }}>
                  <Check className="w-5 h-5" style={{ color: '#4ade80' }} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-white font-semibold text-sm">Aprovar usuário</h3>
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {approveTarget.name} · <RoleBadge role={approveTarget.role} />
                  </p>
                </div>
              </div>

              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Selecione quais áreas este usuário poderá acessar:
              </p>

              <PermissionsChecklist
                selected={approvePerms}
                onToggle={(p) => togglePermInSet(approvePerms, setApprovePerms, p)}
                onSelectAll={() => setApprovePerms(new Set(ALL_PERMISSIONS))}
                onClear={() => setApprovePerms(new Set())}
                accent={ACCENT_EMERALD}
              />

              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowApproveModal(false)} disabled={actionId === approveTarget.id}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-white/5 disabled:opacity-50"
                  style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  Cancelar
                </button>
                <button onClick={() => approveUser(approveTarget.id, Array.from(approvePerms))}
                  disabled={actionId === approveTarget.id}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg,#16a34a,#22c55e)', color: '#04111f' }}>
                  {actionId === approveTarget.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {actionId === approveTarget.id ? 'Aprovando...' : 'Aprovar'}
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
            onClick={e => { if (e.target === e.currentTarget && !savingPerms) setShowEditPermsModal(false); }}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md rounded-2xl p-6 space-y-4"
              style={{ background: '#071d36', border: '1px solid rgba(168,85,247,0.25)' }}>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)' }}>
                  <SlidersHorizontal className="w-5 h-5" style={{ color: '#c084fc' }} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-white font-semibold text-sm">Editar permissões</h3>
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {editPermsTarget.name}
                  </p>
                </div>
              </div>

              <PermissionsChecklist
                selected={editPerms}
                onToggle={(p) => togglePermInSet(editPerms, setEditPerms, p)}
                onSelectAll={() => setEditPerms(new Set(ALL_PERMISSIONS))}
                onClear={() => setEditPerms(new Set())}
                accent={ACCENT_PURPLE}
              />

              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowEditPermsModal(false)} disabled={savingPerms}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-white/5 disabled:opacity-50"
                  style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  Cancelar
                </button>
                <button onClick={confirmEditPermissions} disabled={savingPerms}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg,#9333ea,#a855f7)', color: '#fff' }}>
                  {savingPerms ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {savingPerms ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL: Excluir Gabinete
      ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showDeleteGabModal && deleteGabTarget && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
            onClick={e => { if (e.target === e.currentTarget && !deletingGab) setShowDeleteGabModal(false); }}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm rounded-2xl p-6 space-y-4"
              style={{ background: '#071d36', border: '1px solid rgba(239,68,68,0.25)' }}>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)' }}>
                  <Trash2 className="w-5 h-5" style={{ color: '#f87171' }} />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm">Excluir Gabinete</h3>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{deleteGabTarget.nome}</p>
                </div>
              </div>

              <div className="rounded-xl p-4 space-y-2 text-xs"
                style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)' }}>
                <p className="font-semibold" style={{ color: '#fca5a5' }}>Esta ação é irreversível. Serão excluídos permanentemente:</p>
                <ul className="space-y-1 mt-2" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  <li>• Todas as demandas do gabinete</li>
                  <li>• Todos os contatos do gabinete</li>
                  <li>• Todos os eventos da agenda</li>
                </ul>
                {deleteGabTarget.userCount > 0 && (
                  <p className="mt-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    Os <span style={{ color: '#fbbf24' }}>{deleteGabTarget.userCount} usuário{deleteGabTarget.userCount !== 1 ? 's' : ''}</span> vinculados perderão o vínculo mas não serão excluídos.
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowDeleteGabModal(false)} disabled={deletingGab}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-white/5 disabled:opacity-50"
                  style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  Cancelar
                </button>
                <button onClick={confirmDeleteGabinete} disabled={deletingGab}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg,#dc2626,#ef4444)', color: '#fff' }}>
                  {deletingGab ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {deletingGab ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
