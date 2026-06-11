'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Map,
  FileText,
  Users,
  LogOut,
  Target,
  MapPin,
  CalendarDays,
  BookUser,
  Settings,
  Building2,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Landmark,
  Upload,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AdminGabineteSwitcher } from '@/components/admin-gabinete-switcher';
import { PERMISSIONS, type Permission, hasPermission, ROLE_LABELS } from '@/lib/permissions';

type NavItem = {
  name: string;
  href: string;
  icon: any;
  permission?: Permission;
  roles?: string[];
};

const navigation: { section: string; items: NavItem[] }[] = [
  {
    section: 'Principal',
    items: [
      { name: 'Dashboard',        href: '/dashboard'              , icon: LayoutDashboard },
      { name: 'Mapa do Gabinete', href: '/dashboard/mapa-demandas', icon: MapPin,       permission: PERMISSIONS.MAPA_GABINETE },
      { name: 'Contatos',         href: '/dashboard/contatos'     , icon: BookUser,     permission: PERMISSIONS.CONTATOS      },
      { name: 'Agenda',           href: '/dashboard/agenda'       , icon: CalendarDays, permission: PERMISSIONS.AGENDA        },
    ],
  },
  {
    section: 'Operação',
    items: [
      { name: 'Demandas',            href: '/dashboard/demandas'     , icon: FileText, permission: PERMISSIONS.DEMANDAS         },
      { name: 'Projeto de Campanha', href: '/dashboard/mapa-campanha', icon: Target,   permission: PERMISSIONS.PROJETO_CAMPANHA },
      { name: 'Mapa Eleitoral',      href: '/dashboard/mapa'         , icon: Map,      permission: PERMISSIONS.MAPA_ELEITORAL   },
      { name: 'Emendas',             href: '/dashboard/emendas'      , icon: Landmark, permission: PERMISSIONS.EMENDAS_MAPA     },
    ],
  },
  {
    section: 'Administração',
    items: [
      { name: 'Usuários',      href: '/dashboard/usuarios'     , icon: Users,    roles: ['SUPER_ADMIN', 'ADMIN', 'CHEFE']                    },
      { name: 'Configurações', href: '/dashboard/configuracoes', icon: Settings, roles: ['SUPER_ADMIN', 'ADMIN', 'AGENTE_POLITICO', 'CHEFE'] },
    ],
  },
  {
    section: 'Desenvolvimento',
    items: [
      { name: 'Importação de Dados', href: '/dashboard/importacao', icon: Upload, roles: ['SUPER_ADMIN'] },
    ],
  },
];

// ── Paleta clara / branco-azulada ───────────────────────────────────────────
const L = {
  accent:       '#1d6fd8',                          // blue-600 profundo
  accentLight:  '#3b82f6',                          // blue-500
  accentSoft:   'rgba(29,111,216,0.09)',
  accentBorder: 'rgba(29,111,216,0.18)',
  accentLabel:  '#3b82f6',
  bg:           '#f0f4fc',                          // azul-gelo suave
  bgTop:        '#ffffff',
  bgCard:       'rgba(29,111,216,0.06)',
  border:       'rgba(29,111,216,0.12)',
  borderStrong: 'rgba(29,111,216,0.22)',
  text:         '#0f172a',                          // slate-900
  textSub:      '#475569',                          // slate-500
  textMuted:    '#94a3b8',                          // slate-400
  sectionLine:  'linear-gradient(90deg, rgba(29,111,216,0.35), transparent)',
  shadow:       '0 20px 50px -8px rgba(29,111,216,0.18), 0 4px 16px -4px rgba(0,0,0,0.08)',
} as const;

interface SidebarProps {
  open?: boolean;
  onToggle?: () => void;
}

export function Sidebar({ open = true, onToggle }: SidebarProps = {}) {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const pathname = usePathname();
  const { data: session } = useSession() || {};
  const userRole        = (session?.user as any)?.role    || 'ASSESSOR';
  const userPermissions = (session?.user as any)?.permissions ?? [];
  const userName        = session?.user?.name             || 'Usuário';
  const gabineteNome    = (session?.user as any)?.gabineteNome;
  const isAdmin         = userRole === 'ADMIN';

  const filteredSections = (navigation ?? [])
    .map((sec) => ({
      ...sec,
      items: (sec.items ?? []).filter((it) => {
        if (it?.roles) return it.roles.includes(userRole);
        if (it?.permission) return hasPermission({ role: userRole, permissions: userPermissions }, it.permission);
        return true;
      }),
    }))
    .filter((sec) => sec.items.length > 0);

  const handleSignOut = () => signOut({ callbackUrl: '/login' });

  const initials = userName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0].toUpperCase())
    .join('');

  const NavContent = () => (
    <>
      {/* ── Logo / header ────────────────────────────────────────────── */}
      <div
        className="flex flex-col items-center px-4 pt-5 pb-4"
        style={{ borderBottom: `1px solid ${L.border}`, background: L.bgTop }}
      >
        <img src="/logo.png" alt="AdminHub" className="w-40 h-auto object-contain drop-shadow-md" />
        <p className="mt-1 text-xs font-bold tracking-[0.22em] uppercase select-none"
          style={{ color: L.accent }}>
          AdminHub
        </p>

        {isAdmin && (
          gabineteNome ? (
            <div className="w-full mt-3 rounded-xl px-3 py-2.5 flex items-center gap-2.5"
              style={{ background: L.accentSoft, border: `1px solid ${L.accentBorder}` }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(29,111,216,0.12)' }}>
                <Building2 className="w-3.5 h-3.5" style={{ color: L.accent }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate leading-tight" style={{ color: L.text }}>{gabineteNome}</p>
                <p className="text-[10px] mt-0.5 leading-tight" style={{ color: L.textMuted }}>
                  Administrador
                </p>
              </div>
              <button onClick={() => setSwitcherOpen(true)}
                title="Trocar gabinete"
                className="flex-shrink-0 p-1 rounded-lg transition-all hover:bg-blue-50"
                style={{ color: L.accent }}>
                <ArrowLeftRight className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <span className="mt-3 px-3 py-0.5 rounded-full text-xs font-semibold tracking-wide"
              style={{ background: L.accentSoft, color: L.accent, border: `1px solid ${L.accentBorder}` }}>
              Administrador
            </span>
          )
        )}
      </div>

      {/* ── Navigation ───────────────────────────────────────────────── */}
      <nav className="sidebar-nav flex-1 px-3 py-4 overflow-y-auto space-y-5">
        {filteredSections.map((sec) => (
          <div key={sec.section}>
            {/* Section label */}
            <div className="flex items-center gap-2 px-2 mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em]"
                style={{ color: L.accentLabel }}>
                {sec.section}
              </span>
              <span className="flex-1 h-px" style={{ background: L.sectionLine }} />
            </div>

            <div className="space-y-0.5">
              {sec.items.map((item) => {
                const isActive =
                  pathname === item?.href ||
                  (item?.href !== '/dashboard' && pathname?.startsWith?.(`${item?.href}/`));
                const Icon = item?.icon;

                return (
                  <Link
                    key={item?.name}
                    href={item?.href ?? '#'}
                    onClick={() => {
                      if (typeof window !== 'undefined' && window.innerWidth < 1024) onToggle?.();
                    }}
                    className="flex items-center gap-3 px-2.5 py-2 rounded-xl transition-all duration-200 relative group"
                    style={
                      isActive
                        ? {
                            background: `rgba(29,111,216,0.12)`,
                            borderLeft: `2px solid ${L.accent}`,
                          }
                        : {
                            borderLeft: '2px solid transparent',
                          }
                    }
                  >
                    {/* Icon box */}
                    <span
                      className="flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0 transition-all duration-200"
                      style={
                        isActive
                          ? {
                              background: `rgba(29,111,216,0.18)`,
                              color: L.accent,
                            }
                          : {
                              background: 'rgba(15,23,42,0.05)',
                              color: L.textMuted,
                            }
                      }
                    >
                      {Icon && <Icon className="h-3.5 w-3.5" />}
                    </span>

                    {/* Label */}
                    <span
                      className="font-semibold text-sm"
                      style={{ color: isActive ? L.accent : L.text }}
                    >
                      {item?.name}
                    </span>

                    {/* Dot indicator */}
                    {isActive && (
                      <span
                        className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: L.accent }}
                      />
                    )}

                    {/* Hover overlay */}
                    {!isActive && (
                      <span className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none"
                        style={{ background: 'rgba(29,111,216,0.05)' }} />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <div className="p-3 space-y-1" style={{ borderTop: `1px solid ${L.border}` }}>
        {/* User pill */}
        <div
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
          style={{ background: L.accentSoft, border: `1px solid ${L.accentBorder}` }}
        >
          <span
            className="flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold flex-shrink-0"
            style={{
              background: `linear-gradient(135deg, ${L.accent}, ${L.accentLight})`,
              color: '#fff',
              boxShadow: `0 0 0 2px #fff, 0 0 0 3px ${L.accentBorder}`,
            }}
          >
            {initials || '?'}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate leading-tight" style={{ color: L.text }}>{userName}</p>
            <p className="text-[11px] truncate leading-tight mt-0.5" style={{ color: L.accent }}>
              {ROLE_LABELS[userRole] ?? 'Assessor'}
            </p>
          </div>
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 group"
          style={{ color: L.textSub }}
        >
          <span
            className="flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0 transition-colors duration-200 group-hover:bg-red-50"
            style={{ background: 'rgba(15,23,42,0.05)' }}
          >
            <LogOut className="h-3.5 w-3.5 group-hover:text-red-500 transition-colors" />
          </span>
          <span className="font-semibold text-sm group-hover:text-red-500 transition-colors">Sair</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Backdrop overlay — mobile */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onToggle}
            className="lg:hidden fixed inset-0 z-40"
            style={{ background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(4px)' }}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        animate={{ x: open ? 0 : -280, opacity: open ? 1 : 0 }}
        transition={{ type: 'spring', damping: 24, stiffness: 220 }}
        className="flex flex-col fixed overflow-hidden z-50"
        style={{
          top: 12,
          bottom: 12,
          left: 12,
          width: 256,
          borderRadius: 18,
          background: `linear-gradient(180deg, ${L.bgTop} 0%, ${L.bg} 100%)`,
          border: `1px solid ${L.borderStrong}`,
          boxShadow: L.shadow,
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        {/* Fio azul no topo */}
        <span
          className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none"
          style={{ background: `linear-gradient(90deg, transparent, ${L.accent}, transparent)` }}
        />
        <NavContent />
      </motion.aside>

      {/* Toggle button */}
      {onToggle && (
        <motion.button
          onClick={onToggle}
          aria-label={open ? 'Recolher sidebar' : 'Abrir sidebar'}
          title={open ? 'Recolher menu' : 'Abrir menu'}
          animate={{ left: open ? 256 : 8 }}
          transition={{ type: 'spring', damping: 24, stiffness: 220 }}
          className="fixed top-1/2 -translate-y-1/2 w-6 h-12 flex items-center justify-center z-50 transition-opacity hover:opacity-100"
          style={{
            background: '#fff',
            border: `1px solid ${L.accentBorder}`,
            borderRadius: 8,
            color: L.accent,
            opacity: 0.95,
            boxShadow: `0 4px 12px rgba(29,111,216,0.2)`,
          }}
        >
          {open ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </motion.button>
      )}

      {/* Switcher de gabinete */}
      <AdminGabineteSwitcher
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
      />
    </>
  );
}
