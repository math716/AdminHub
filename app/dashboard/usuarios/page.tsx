'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  Users, Check, X, Clock, Shield, Building2,
  Loader2, ChevronDown, ChevronUp, CheckCircle2, AlertCircle,
  Link2, Copy, CheckCheck, Search, KeyRound, Trash2, SlidersHorizontal,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  // No escuro, usa tom mais claro do roxo + bg um pouco mais marcado pra contraste.
  const checkedText = isDark ? '#d8b4fe' : accent.solid;
  const checkedBg = isDark ? 'rgba(168,85,247,0.16)' : accent.bgLight;
  const checkedBorder = isDark ? 'rgba(168,85,247,0.40)' : accent.borderLight;
  return (
    <>
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {ALL_PERMISSIONS.map((p) => {
          const checked = selected.has(p);
          return (
            <button key={p} type="button" onClick={() => onToggle(p)}
              className="w-full text-left flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200"
              style={{
                background: checked ? checkedBg : 'var(--tint-04)',
                border: `1px solid ${checked ? checkedBorder : 'var(--border-default)'}`,
              }}>
              <span className="text-sm font-medium tracking-wide"
                style={{ color: checked ? checkedText : 'var(--text-primary)' }}>
                {PERMISSION_LABELS[p as Permission]}
              </span>
              <span className="flex items-center justify-center w-5 h-5 rounded-md flex-shrink-0 transition-all"
                style={checked
                  ? { background: accent.solid, color: '#FFFFFF', boxShadow: `0 0 8px ${accent.borderLight}` }
                  : { background: 'transparent', border: '1.5px solid var(--border-strong)' }
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
          style={{ color: 'var(--tint-45)' }}>
          Limpar
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
type UserRoleKey = 'SUPER_ADMIN' | 'ADMIN' | 'AGENTE_POLITICO' | 'CHEFE' | 'ASSESSOR' | 'ANALISTA' | 'VISUALIZADOR';

interface UserData {
  id: string;
  email: string;
  name: string;
  role: UserRoleKey;
  approved: boolean;
  permissions: string[];
  createdAt: string;
  gabinete?: { id: string; nome: string };
  pendingGabineteNome?: string | null;
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
  SUPER_ADMIN:     'Administrador',
  ADMIN:           'Administrador',
  AGENTE_POLITICO: 'Agente Político',
  CHEFE:           'Chefe de Gabinete',
  ASSESSOR:        'Assessor',
  ANALISTA:        'Analista',
  VISUALIZADOR:    'Visualizador',
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

function RoleBadge({ role }: { role: string }) {
  const s = ROLE_STYLE[role] ?? ROLE_STYLE.ASSESSOR;
  return (
    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

function RoleSelect({
  userId,
  current,
  sessionRole,
  chefeExists = false,
  onChanged,
  onError,
}: {
  userId: string;
  current: string;
  sessionRole: string;
  chefeExists?: boolean;
  onChanged: (role: string) => void;
  onError?: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dropPos, setDropPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const roles = (() => {
    if (sessionRole === 'SUPER_ADMIN') return ['ADMIN', 'AGENTE_POLITICO', 'CHEFE', 'ASSESSOR'];
    if (sessionRole === 'ADMIN')       return ['AGENTE_POLITICO', 'CHEFE', 'ASSESSOR'];
    if (sessionRole === 'AGENTE_POLITICO') return ['CHEFE', 'ASSESSOR'];
    return ['ASSESSOR'];
  })();

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
    if (role === 'CHEFE' && chefeExists) {
      onError?.('Já existe um Chefe de Gabinete neste gabinete. Remova o acesso do atual antes de atribuir um novo.');
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (res.ok) onChanged(role);
      else {
        const data = await res.json().catch(() => ({}));
        onError?.(data.error || 'Erro ao alterar cargo.');
      }
    } finally { setSaving(false); setOpen(false); }
  };

  if (roles.length === 0 || (roles.length === 1 && roles[0] === current)) {
    return <RoleBadge role={current} />;
  }

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
              background: 'var(--bg-card)',
              border: '1px solid rgba(37,99,235,0.2)',
              minWidth: 170,
            }}
          >
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
  const [searchMember,    setSearchMember]    = useState('');
  const [expandedGabs,    setExpandedGabs]    = useState<Set<string>>(new Set());

  // ── excluir gabinete ──────────────────────────────────────────────────────
  const [showDeleteGabModal, setShowDeleteGabModal] = useState(false);
  const [deleteGabTarget,    setDeleteGabTarget]    = useState<{ id: string; nome: string; userCount: number } | null>(null);

  const [confirmReject, setConfirmReject] = useState<{ userId: string; name: string } | null>(null);
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
    if (status === 'authenticated' && userRole !== 'CHEFE' && userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN' && userRole !== 'AGENTE_POLITICO') {
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
    if (userRole === 'CHEFE' || userRole === 'ADMIN' || userRole === 'SUPER_ADMIN' || userRole === 'AGENTE_POLITICO') fetchUsers();
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
    const targetUser = users.find(u => u.id === userId);
    setActionId(userId);
    try {
      const res = await fetch(`/api/users/${userId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(perms !== undefined ? { permissions: perms } : {}),
      });
      if (res.ok) {
        if (targetUser?.pendingGabineteNome) {
          // Gabinete was created server-side — full refresh to get updated gabinete data
          await fetchUsers();
        } else {
          setUsers(prev => prev.map(u =>
            u.id === userId ? { ...u, approved: true, permissions: perms ?? u.permissions } : u,
          ));
        }
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
    setConfirmReject({ userId, name });
  };

  const doReject = async () => {
    if (!confirmReject) return;
    const { userId } = confirmReject;
    setConfirmReject(null);
    setActionId(userId);
    try {
      const res = await fetch(`/api/users/${userId}/reject`, { method: 'POST' });
      if (res.ok) {
        setUsers(prev => prev.filter(u => u.id !== userId));
        showToast('ok', 'Usuário removido.');
      } else { showToast('err', 'Erro ao remover usuário.'); }
    } finally { setActionId(null); }
  };

  // fim doReject

  const handleRoleChange = (userId: string, newRole: string) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole as UserData['role'] } : u));
    showToast('ok', `Perfil alterado para ${ROLE_LABELS[newRole] ?? newRole}.`);
  };

  const handleGenerateInvite = async (role: 'ASSESSOR' | 'CHEFE' = 'ASSESSOR') => {
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
  const { gabineteGroups, noGabinete, pendingGabineteGroups } = useMemo(() => {
    // Parte dos gabinetes (inclui os sem usuários) para ADMIN;
    // para CHEFE usa apenas os gabinetes presentes nos usuários retornados.
    const base = (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') ? gabinetes : [];
    const map = new Map<string, GabineteGroup>(
      base.map(g => [g.id, { id: g.id, nome: g.nome, users: [] }])
    );
    const sem: UserData[] = [];
    const pendingMap = new Map<string, { nome: string; users: UserData[] }>();
    users.forEach(u => {
      if (u.gabinete) {
        if (!map.has(u.gabinete.id)) map.set(u.gabinete.id, { id: u.gabinete.id, nome: u.gabinete.nome, users: [] });
        map.get(u.gabinete.id)!.users.push(u);
      } else if (u.pendingGabineteNome) {
        if (!pendingMap.has(u.pendingGabineteNome))
          pendingMap.set(u.pendingGabineteNome, { nome: u.pendingGabineteNome, users: [] });
        pendingMap.get(u.pendingGabineteNome)!.users.push(u);
      } else { sem.push(u); }
    });
    const groups = Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const pendingGroups = Array.from(pendingMap.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return { gabineteGroups: groups, noGabinete: sem, pendingGabineteGroups: pendingGroups };
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

  // Auto-expand for gabinete managers (they only have one gabinete)
  useEffect(() => {
    if (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN' && gabineteGroups.length > 0) {
      setExpandedGabs(prev => {
        const s = new Set(prev);
        gabineteGroups.forEach(g => s.add(g.id));
        return s;
      });
    }
  }, [gabineteGroups, userRole]);

  // ── loading / guard ───────────────────────────────────────────────────────
  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: '#2563EB' }} />
      </div>
    );
  }
  if (userRole !== 'CHEFE' && userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN' && userRole !== 'AGENTE_POLITICO') return null;

  const pendingUsers  = users.filter(u => !u.approved && u.role !== 'ADMIN' && u.role !== 'SUPER_ADMIN');
  const approvedUsers = users.filter(u => u.approved  || u.role === 'ADMIN' || u.role === 'SUPER_ADMIN');
  const cardStyle     = { background: 'var(--bg-card)', border: '1px solid rgba(37,99,235,0.13)' };
  const isAdmin       = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Toast */}
      <AnimatePresence>
        {toastData && (
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            className="fixed top-5 right-5 z-[9999] flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium"
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
          isAdmin ? (
            <>
              {approvedUsers.length} ativo{approvedUsers.length !== 1 ? 's' : ''}
              {pendingUsers.length > 0 && ` · ${pendingUsers.length} aguardando aprovação`}
            </>
          ) : (
            <>{gabineteGroups[0]?.nome ?? 'Meu Gabinete'}</>
          )
        }
        actions={
          <div className="relative flex-shrink-0">
          <button
            onClick={() => (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN' || userRole === 'AGENTE_POLITICO') ? setShowInviteForm(f => !f) : handleGenerateInvite('ASSESSOR')}
            disabled={generatingInvite}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#2563EB,#3B82F6)', color: 'var(--bg-page)' }}
          >
            {generatingInvite ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            Gerar Convite
            {(userRole === 'ADMIN' || userRole === 'SUPER_ADMIN' || userRole === 'AGENTE_POLITICO') && <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <AnimatePresence>
            {showInviteForm && (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN' || userRole === 'AGENTE_POLITICO') && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                className="absolute right-0 mt-1 z-20 rounded-xl overflow-hidden shadow-xl"
                style={{ background: 'var(--bg-card)', border: '1px solid rgba(37,99,235,0.2)', minWidth: 200 }}>
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--tint-35)' }}>Tipo de convite</p>
                {(['CHEFE', 'ASSESSOR'] as const).map(r => {
                  const labelColor = r === 'CHEFE' ? '#4a9ede' : '#4ade80';
                  const label      = r === 'CHEFE' ? 'Chefe de Gabinete' : 'Assessor';
                  const desc       = r === 'CHEFE' ? 'Acesso imediato após criar a conta' : 'Requer aprovação do Agente Político ou Chefe de Gabinete';
                  return (
                    <button key={r} onClick={() => handleGenerateInvite(r)}
                      className="w-full text-left px-4 py-2.5 text-xs font-medium transition-all hover:bg-[var(--tint-06)]"
                      style={{ color: 'var(--tint-75)' }}>
                      <span className="font-semibold" style={{ color: labelColor }}>{label}</span><br />
                      <span style={{ color: 'var(--tint-35)', fontSize: '10px' }}>{desc}</span>
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
          {isAdmin ? (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Gabinetes',  value: gabineteGroups.length, color: '#4a9ede',  icon: Building2 },
              { label: 'Usuários',   value: users.length,          color: '#2563EB',  icon: Users    },
              { label: 'Pendentes',  value: pendingUsers.length,   color: '#f59e0b',  icon: Clock    },
            ].map(stat => (
              <div key={stat.label} className="rounded-xl px-4 py-3 flex items-center gap-3"
                style={{ background: 'var(--bg-card)', border: `1px solid ${stat.color}22` }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `${stat.color}18` }}>
                  <stat.icon className="w-4 h-4" style={{ color: stat.color }} />
                </div>
                <div>
                  <p className="text-[color:var(--text-primary)] font-bold text-lg leading-none">{stat.value}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--tint-35)' }}>{stat.label}</p>
                </div>
              </div>
            ))}
          </div>
          ) : (
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Membros Ativos',       value: approvedUsers.length, color: '#4a9ede', icon: Users },
              { label: 'Aguardando Aprovação', value: pendingUsers.length,  color: '#f59e0b', icon: Clock },
            ].map(stat => (
              <div key={stat.label} className="rounded-xl px-4 py-4 flex items-center gap-4"
                style={{ background: 'var(--bg-card)', border: `1px solid ${stat.color}22` }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${stat.color}18`, border: `1px solid ${stat.color}30` }}>
                  <stat.icon className="w-5 h-5" style={{ color: stat.color }} />
                </div>
                <div>
                  <p className="text-[color:var(--text-primary)] font-bold text-2xl leading-none">{stat.value}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--tint-45)' }}>{stat.label}</p>
                </div>
              </div>
            ))}
          </div>
          )}

          {/* Busca */}
          {isAdmin ? (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--tint-35)' }} />
            <input
              value={searchGabinete}
              onChange={e => setSearchGabinete(e.target.value)}
              placeholder="Buscar gabinete pelo nome..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-[color:var(--text-primary)] placeholder:text-slate-600 outline-none focus:ring-1"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--tint-08)' }}
            />
          </div>
          ) : (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--tint-35)' }} />
            <input
              value={searchMember}
              onChange={e => setSearchMember(e.target.value)}
              placeholder="Buscar membro pelo nome ou e-mail..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-[color:var(--text-primary)] placeholder:text-slate-600 outline-none focus:ring-1"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--tint-08)' }}
            />
          </div>
          )}

          {/* Cards de Gabinetes */}
          {filteredGroups.length === 0 && (
            <div className="py-16 text-center rounded-2xl" style={cardStyle}>
              <Building2 className="w-10 h-10 mx-auto mb-2 opacity-20" style={{ color: '#4a9ede' }} />
              <p className="text-sm" style={{ color: 'var(--tint-35)' }}>
                {searchGabinete ? `Nenhum gabinete encontrado para "${searchGabinete}"` : 'Nenhum gabinete cadastrado'}
              </p>
            </div>
          )}

          <AnimatePresence initial={false}>
            {filteredGroups.map((group, gi) => {
              const isOpen   = expandedGabs.has(group.id);
              const pending  = group.users.filter(u => !u.approved && u.role !== 'ADMIN' && u.role !== 'SUPER_ADMIN');
              const approved = group.users.filter(u => u.approved  || u.role === 'ADMIN' || u.role === 'SUPER_ADMIN');

              return (
                <motion.div key={group.id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: gi * 0.04 }}
                  className="rounded-2xl overflow-hidden"
                  style={{ background: 'var(--bg-card)', border: '1px solid rgba(74,158,222,0.15)' }}>

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
                        <p className="text-[color:var(--text-primary)] font-semibold text-sm">{group.nome}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px]" style={{ color: 'var(--tint-45)' }}>
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
                      {isAdmin && (
                      <button onClick={() => openDeleteGabModal(group)}
                        title="Excluir gabinete"
                        className="p-1.5 rounded-lg transition-all hover:bg-red-500/10"
                        style={{ color: 'var(--tint-25)' }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      )}
                      <button onClick={() => toggleGabinete(group.id)}
                        className="p-1.5 rounded-lg transition-all hover:bg-[var(--tint-06)]"
                        style={{ color: 'var(--tint-35)' }}>
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
                          <div className="px-5 py-6 text-center text-xs" style={{ color: 'var(--tint-25)', borderTop: '1px solid var(--tint-04)' }}>
                            Nenhum usuário neste gabinete
                          </div>
                        ) : (
                          <div className="divide-y" style={{ borderColor: 'var(--tint-04)', borderTop: '1px solid var(--tint-04)' }}>
                            {/* Pendentes primeiro */}
                            {[...pending, ...approved]
                              .filter(u => {
                                if (!searchMember.trim()) return true;
                                const q = searchMember.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
                                const name  = u.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
                                const email = u.email.toLowerCase();
                                return name.includes(q) || email.includes(searchMember.toLowerCase());
                              })
                              .map((u) => (
                              <div key={u.id}
                                className="flex items-center justify-between px-5 py-3.5 gap-3 transition-all hover:bg-white/[0.02]"
                                style={!u.approved && u.role !== 'ADMIN' && u.role !== 'SUPER_ADMIN'
                                  ? { background: 'rgba(245,158,11,0.04)' } : {}}>

                                <div className="flex items-center gap-3 min-w-0">
                                  {/* Avatar */}
                                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                                    style={u.approved || u.role === 'ADMIN' || u.role === 'SUPER_ADMIN'
                                      ? { background: 'linear-gradient(135deg,#1b3a5c,#2a5580)', color: '#7dd3fc' }
                                      : { background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}>
                                    {u.name.split(' ').filter(Boolean).slice(0,2).map(w => w[0].toUpperCase()).join('')}
                                  </div>

                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <p className="text-[color:var(--text-primary)] text-sm font-medium truncate">{u.name}</p>
                                      {u.id === sessionUserId && (
                                        <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: 'rgba(37,99,235,0.15)', color: '#2563EB' }}>você</span>
                                      )}
                                      {!u.approved && u.role !== 'ADMIN' && u.role !== 'SUPER_ADMIN' && (
                                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                                          style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                                          Pendente
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[11px] truncate" style={{ color: 'var(--tint-35)' }}>{u.email}</p>
                                  </div>
                                </div>

                                {/* Ações */}
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {/* Cargo */}
                                  {u.id !== sessionUserId && u.role !== 'SUPER_ADMIN'
                                    ? <RoleSelect
                                        userId={u.id}
                                        current={u.role}
                                        sessionRole={userRole}
                                        chefeExists={group.users.some(gu => gu.role === 'CHEFE' && gu.id !== u.id)}
                                        onChanged={(r) => handleRoleChange(u.id, r)}
                                        onError={(msg) => showToast('err', msg)}
                                      />
                                    : <RoleBadge role={u.role} />
                                  }

                                  {/* Aprovar (se pendente) */}
                                  {!u.approved && u.role !== 'ADMIN' && u.role !== 'SUPER_ADMIN' && (
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
                                      style={{ color: 'var(--tint-35)' }}>
                                      <SlidersHorizontal className="w-3.5 h-3.5" />
                                    </button>
                                  )}

                                  {/* Reset senha */}
                                  {u.id !== sessionUserId && (
                                    <button onClick={() => openResetModal(u.id, u.name)}
                                      title="Resetar senha"
                                      className="p-1.5 rounded-lg transition-all hover:bg-yellow-500/10"
                                      style={{ color: 'var(--tint-35)' }}>
                                      <KeyRound className="w-3.5 h-3.5" />
                                    </button>
                                  )}

                                  {/* Excluir */}
                                  {u.id !== sessionUserId && (
                                    <button onClick={() => handleReject(u.id, u.name)} disabled={actionId === u.id}
                                      title="Remover usuário"
                                      className="p-1.5 rounded-lg transition-all hover:bg-red-500/10"
                                      style={{ color: 'var(--tint-35)' }}>
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

          {/* Gabinetes aguardando aprovação da criação */}
          {pendingGabineteGroups.length > 0 && !searchGabinete && pendingGabineteGroups.map((pg, pgi) => (
            <motion.div key={`pending-${pg.nome}`}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: pgi * 0.04 }}
              className="rounded-2xl overflow-hidden"
              style={{ background: 'var(--bg-card)', border: '1px solid rgba(245,158,11,0.3)' }}>

              {/* Header */}
              <button className="w-full flex items-center justify-between px-5 py-4 transition-all hover:bg-white/[0.02] text-left"
                onClick={() => toggleGabinete(`__pending__${pg.nome}`)}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)' }}>
                    <Building2 className="w-[18px] h-[18px]" style={{ color: '#f59e0b' }} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-[color:var(--text-primary)] font-semibold text-sm">{pg.nome}</p>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold tracking-wide"
                        style={{ background: 'rgba(245,158,11,0.18)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.35)' }}>
                        AGUARDANDO APROVAÇÃO
                      </span>
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--tint-45)' }}>
                      {pg.users.length} usuário{pg.users.length !== 1 ? 's' : ''} · gabinete será criado após aprovação
                    </p>
                  </div>
                </div>
                {expandedGabs.has(`__pending__${pg.nome}`)
                  ? <ChevronUp  className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--tint-35)' }} />
                  : <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--tint-35)' }} />
                }
              </button>

              <AnimatePresence initial={false}>
                {expandedGabs.has(`__pending__${pg.nome}`) && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} style={{ overflow: 'hidden' }}>
                    <div className="divide-y" style={{ borderColor: 'var(--tint-04)', borderTop: '1px solid rgba(245,158,11,0.12)' }}>
                      {pg.users.map(u => (
                        <div key={u.id}
                          className="flex items-center justify-between px-5 py-3.5 gap-3 transition-all hover:bg-white/[0.02]"
                          style={{ background: 'rgba(245,158,11,0.03)' }}>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                              style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}>
                              {u.name.split(' ').filter(Boolean).slice(0,2).map(w => w[0].toUpperCase()).join('')}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-[color:var(--text-primary)] text-sm font-medium truncate">{u.name}</p>
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                                  style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                                  Pendente
                                </span>
                              </div>
                              <p className="text-[11px] truncate" style={{ color: 'var(--tint-35)' }}>{u.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <RoleBadge role={u.role} />
                            <button onClick={() => openApproveModal(u)} disabled={actionId === u.id}
                              title="Aprovar usuário e criar gabinete"
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-50"
                              style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80' }}>
                              {actionId === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                              Aprovar
                            </button>
                            <button onClick={() => handleReject(u.id, u.name)} disabled={actionId === u.id}
                              title="Recusar solicitação"
                              className="p-1.5 rounded-lg transition-all hover:bg-red-500/10"
                              style={{ color: 'var(--tint-35)' }}>
                              {actionId === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}

          {/* Seção sem gabinete (ADMINs sem vínculo) */}
          {noGabinete.length > 0 && !searchGabinete && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl overflow-hidden"
              style={{ background: 'var(--bg-card)', border: '1px solid rgba(37,99,235,0.15)' }}>
              <button className="w-full flex items-center justify-between px-5 py-4 transition-all hover:bg-white/[0.02] text-left"
                onClick={() => toggleGabinete('__no_gabinete__')}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.25)' }}>
                    <Shield className="w-[18px] h-[18px]" style={{ color: '#2563EB' }} />
                  </div>
                  <div>
                    <p className="text-[color:var(--text-primary)] font-semibold text-sm">Administradores do Sistema</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--tint-45)' }}>
                      {noGabinete.length} usuário{noGabinete.length !== 1 ? 's' : ''} sem gabinete
                    </p>
                  </div>
                </div>
                {expandedGabs.has('__no_gabinete__')
                  ? <ChevronUp  className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--tint-35)' }} />
                  : <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--tint-35)' }} />
                }
              </button>

              <AnimatePresence initial={false}>
                {expandedGabs.has('__no_gabinete__') && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} style={{ overflow: 'hidden' }}>
                    <div className="divide-y" style={{ borderColor: 'var(--tint-04)', borderTop: '1px solid var(--tint-04)' }}>
                      {noGabinete.map(u => (
                        <div key={u.id} className="flex items-center justify-between px-5 py-3.5 gap-3 transition-all hover:bg-white/[0.02]">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                              style={{ background: 'linear-gradient(135deg,#2563EB,#3B82F6)', color: 'var(--bg-page)' }}>
                              {u.name.split(' ').filter(Boolean).slice(0,2).map(w => w[0].toUpperCase()).join('')}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-[color:var(--text-primary)] text-sm font-medium truncate">{u.name}</p>
                                {u.id === sessionUserId && (
                                  <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: 'rgba(37,99,235,0.15)', color: '#2563EB' }}>você</span>
                                )}
                              </div>
                              <p className="text-[11px] truncate" style={{ color: 'var(--tint-35)' }}>{u.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {u.id !== sessionUserId && u.role !== 'SUPER_ADMIN'
                              ? <RoleSelect
                                  userId={u.id}
                                  current={u.role}
                                  sessionRole={userRole}
                                  onChanged={(r) => handleRoleChange(u.id, r)}
                                  onError={(msg) => showToast('err', msg)}
                                />
                              : <RoleBadge role={u.role} />
                            }
                            {u.id !== sessionUserId && (
                              <>
                                <button onClick={() => openResetModal(u.id, u.name)} title="Resetar senha"
                                  className="p-1.5 rounded-lg transition-all hover:bg-yellow-500/10"
                                  style={{ color: 'var(--tint-35)' }}>
                                  <KeyRound className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => handleReject(u.id, u.name)} disabled={actionId === u.id}
                                  title="Remover usuário"
                                  className="p-1.5 rounded-lg transition-all hover:bg-red-500/10"
                                  style={{ color: 'var(--tint-35)' }}>
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
              style={{ background: 'var(--bg-card)', border: '1px solid rgba(37,99,235,0.25)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.3)' }}>
                  <Link2 className="w-4 h-4" style={{ color: '#2563EB' }} />
                </div>
                <div>
                  <h3 className="text-[color:var(--text-primary)] font-semibold text-sm">Link de Convite</h3>
                  {inviteGabinete && <p className="text-xs" style={{ color: '#2563EB' }}>{inviteGabinete}</p>}
                </div>
              </div>
              <p className="text-xs mb-3" style={{ color: 'var(--tint-45)' }}>
                Convite para <span style={{
                  color:
                    inviteRoleResult === 'AGENTE_POLITICO' ? '#c084fc' :
                    inviteRoleResult === 'CHEFE'           ? '#4a9ede' :
                                                              '#4ade80',
                  fontWeight: 600,
                }}>
                  {ROLE_LABELS[inviteRoleResult] ?? 'Assessor'}</span>.
                {inviteRoleResult === 'CHEFE'
                  ? ' Acesso imediato após o cadastro.'
                  : ' Requer aprovação após o cadastro.'}
                {' '}Expira em <span style={{ color: '#3B82F6' }}>7 dias</span>.
              </p>
              <div className="flex items-center gap-2 rounded-xl p-3 mb-4" style={{ background: 'var(--tint-04)', border: '1px solid var(--tint-08)' }}>
                <p className="text-xs flex-1 break-all" style={{ color: 'var(--tint-65)', fontFamily: 'monospace' }}>{inviteUrl}</p>
                <button onClick={() => { navigator.clipboard.writeText(inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 2500); }}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={copied
                    ? { background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }
                    : { background: 'rgba(37,99,235,0.12)', color: '#2563EB', border: '1px solid rgba(37,99,235,0.3)' }}>
                  {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
              <button onClick={() => setShowInviteModal(false)}
                className="w-full py-2 rounded-xl text-sm font-medium transition-all hover:bg-[var(--tint-06)]"
                style={{ color: 'var(--tint-45)', border: '1px solid var(--tint-08)' }}>
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
              style={{ background: 'var(--bg-card)', border: '1px solid rgba(245,158,11,0.25)' }}>

              {/* Ícone + título */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)' }}>
                  <KeyRound className="w-5 h-5" style={{ color: '#f59e0b' }} />
                </div>
                <div>
                  <h3 className="text-[color:var(--text-primary)] font-semibold text-sm">Resetar Senha</h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--tint-45)' }}>{resetTargetName}</p>
                </div>
              </div>

              {/* Antes do reset: confirmação */}
              {!resetResult && (
                <>
                  <p className="text-sm" style={{ color: 'var(--tint-55)' }}>
                    Uma <strong style={{ color: '#f59e0b' }}>senha temporária</strong> será gerada e a senha atual será substituída. Compartilhe com o usuário para que ele faça login e altere a senha nas configurações.
                  </p>
                  <div className="flex gap-3 pt-1">
                    <button onClick={() => setShowResetModal(false)} disabled={resettingPwd}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-[var(--tint-06)] disabled:opacity-50"
                      style={{ color: 'var(--tint-45)', border: '1px solid var(--tint-08)' }}>
                      Cancelar
                    </button>
                    <button onClick={confirmResetPassword} disabled={resettingPwd}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                      style={{ background: 'linear-gradient(135deg,#d97706,#f59e0b)', color: 'var(--bg-page)' }}>
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
                      <p className="text-xs" style={{ color: 'var(--tint-55)' }}>
                        A senha temporária foi enviada por e-mail ao usuário.<br />Ele deverá alterá-la no próximo acesso.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-xl p-4 text-center space-y-2" style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)' }}>
                        <p className="text-xs" style={{ color: 'var(--tint-45)' }}>Senha temporária gerada</p>
                        <p className="text-2xl font-bold tracking-[0.2em] select-all" style={{ color: '#4ade80', fontFamily: 'monospace' }}>
                          {resetResult}
                        </p>
                        <p className="text-[10px]" style={{ color: 'var(--tint-35)' }}>
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
                          : { background: 'rgba(37,99,235,0.12)', color: '#2563EB', border: '1px solid rgba(37,99,235,0.3)' }}>
                        {copiedPwd ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {copiedPwd ? 'Copiado!' : 'Copiar Senha'}
                      </button>

                      <p className="text-[11px] text-center" style={{ color: 'var(--tint-35)' }}>
                        ⚠️ Esta senha não será exibida novamente após fechar
                      </p>
                    </>
                  )}

                  <button onClick={() => { setShowResetModal(false); setResetResult(''); }}
                    className="w-full py-2 rounded-xl text-sm font-medium transition-all hover:bg-[var(--tint-06)]"
                    style={{ color: 'var(--tint-45)', border: '1px solid var(--tint-08)' }}>
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
              style={{ background: 'var(--bg-card)', border: '1px solid rgba(34,197,94,0.25)' }}>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)' }}>
                  <Check className="w-5 h-5" style={{ color: '#4ade80' }} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[color:var(--text-primary)] font-semibold text-sm">Aprovar usuário</h3>
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--tint-45)' }}>
                    {approveTarget.name} · <RoleBadge role={approveTarget.role} />
                  </p>
                </div>
              </div>

              {approveTarget.pendingGabineteNome && (
                <div className="flex items-center gap-2 rounded-xl px-3 py-2.5"
                  style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <Building2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#f59e0b' }} />
                  <p className="text-xs" style={{ color: 'var(--tint-65)' }}>
                    O gabinete <span style={{ color: '#f59e0b', fontWeight: 600 }}>"{approveTarget.pendingGabineteNome}"</span> será criado automaticamente.
                  </p>
                </div>
              )}

              <p className="text-xs" style={{ color: 'var(--tint-55)' }}>
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
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-[var(--tint-06)] disabled:opacity-50"
                  style={{ color: 'var(--tint-45)', border: '1px solid var(--tint-08)' }}>
                  Cancelar
                </button>
                <button onClick={() => approveUser(approveTarget.id, Array.from(approvePerms))}
                  disabled={actionId === approveTarget.id}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg,#16a34a,#22c55e)', color: 'var(--bg-page)' }}>
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
              style={{ background: 'var(--bg-card)', border: '1px solid rgba(168,85,247,0.25)' }}>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)' }}>
                  <SlidersHorizontal className="w-5 h-5" style={{ color: '#c084fc' }} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[color:var(--text-primary)] font-semibold text-sm">Editar permissões</h3>
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--tint-45)' }}>
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
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-[var(--tint-06)] disabled:opacity-50"
                  style={{ color: 'var(--tint-45)', border: '1px solid var(--tint-08)' }}>
                  Cancelar
                </button>
                <button onClick={confirmEditPermissions} disabled={savingPerms}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg,#9333ea,#a855f7)', color: 'var(--text-primary)' }}>
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
              style={{ background: 'var(--bg-card)', border: '1px solid rgba(239,68,68,0.25)' }}>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)' }}>
                  <Trash2 className="w-5 h-5" style={{ color: '#f87171' }} />
                </div>
                <div>
                  <h3 className="text-[color:var(--text-primary)] font-semibold text-sm">Excluir Gabinete</h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--tint-45)' }}>{deleteGabTarget.nome}</p>
                </div>
              </div>

              <div className="rounded-xl p-4 space-y-2 text-xs"
                style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)' }}>
                <p className="font-semibold" style={{ color: '#fca5a5' }}>Esta ação é irreversível. Serão excluídos permanentemente:</p>
                <ul className="space-y-1 mt-2" style={{ color: 'var(--tint-55)' }}>
                  <li>• Todas as demandas do gabinete</li>
                  <li>• Todos os contatos do gabinete</li>
                  <li>• Todos os eventos da agenda</li>
                </ul>
                {deleteGabTarget.userCount > 0 && (
                  <p className="mt-2" style={{ color: 'var(--tint-45)' }}>
                    Os <span style={{ color: '#fbbf24' }}>{deleteGabTarget.userCount} usuário{deleteGabTarget.userCount !== 1 ? 's' : ''}</span> vinculados perderão o vínculo mas não serão excluídos.
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowDeleteGabModal(false)} disabled={deletingGab}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-[var(--tint-06)] disabled:opacity-50"
                  style={{ color: 'var(--tint-45)', border: '1px solid var(--tint-08)' }}>
                  Cancelar
                </button>
                <button onClick={confirmDeleteGabinete} disabled={deletingGab}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg,#dc2626,#ef4444)', color: 'var(--text-primary)' }}>
                  {deletingGab ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {deletingGab ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={!!confirmReject}
        title={`Remover "${confirmReject?.name}"?`}
        message="Esta ação excluirá permanentemente a conta do usuário do sistema. Não poderá ser desfeita."
        confirmLabel="Sim, remover"
        variant="danger"
        onConfirm={doReject}
        onCancel={() => setConfirmReject(null)}
      />
    </div>
  );
}
