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

// ── Paleta índigo/graphite ──────────────────────────────────────────────────
const I = {
  accent:      '#3b82f6',        // blue-500
  accentLight: '#60a5fa',        // blue-400
  accentSoft:  'rgba(59,130,246,0.18)',
  accentGlow:  'rgba(59,130,246,0.35)',
  accentBorder:'rgba(59,130,246,0.28)',
  accentLabel: 'rgba(147,197,253,0.85)', // blue-300
  bg:          '#080e1a',
  bgCard:      'rgba(255,255,255,0.035)',
  border:      'rgba(255,255,255,0.07)',
  text:        'rgba(255,255,255,0.82)',
  textMuted:   'rgba(255,255,255,0.38)',
  sectionLine: 'linear-gradient(90deg, rgba(59,130,246,0.55), transparent)',
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
      {/* ── Logo / header — NÃO MODIFICADO ───────────────────────────── */}
      <div className="flex flex-col items-center px-4 pt-4 pb-4" style={{ borderBottom: `1px solid ${I.border}` }}>
        <img src="/logo.png" alt="AdminHub" className="w-44 h-auto object-contain drop-shadow-lg" />
        <p className="mt-1 text-xs font-bold tracking-[0.22em] uppercase select-none text-white">
          AdminHub
        </p>

        {isAdmin && (
          gabineteNome ? (
            <div className="w-full mt-3 rounded-xl px-3 py-2.5 flex items-center gap-2.5"
              style={{ background: I.accentSoft, border: `1px solid ${I.accentBorder}` }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(99,102,241,0.2)' }}>
                <Building2 className="w-3.5 h-3.5" style={{ color: I.accentLight }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-semibold truncate leading-tight">{gabineteNome}</p>
                <p className="text-[10px] mt-0.5 leading-tight" style={{ color: I.textMuted }}>
                  Administrador
                </p>
              </div>
              <button onClick={() => setSwitcherOpen(true)}
                title="Trocar gabinete"
                className="flex-shrink-0 p-1 rounded-lg transition-all hover:bg-white/10"
                style={{ color: I.accentLight }}>
                <ArrowLeftRight className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <span className="mt-3 px-3 py-0.5 rounded-full text-xs font-semibold tracking-wide"
              style={{ background: I.accentSoft, color: I.accentLight, border: `1px solid ${I.accentBorder}` }}>
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
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: I.accentLabel }}>
                {sec.section}
              </span>
              <span className="flex-1 h-px" style={{ background: I.sectionLine }} />
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
                    className="flex items-center gap-3 px-2.5 py-2 rounded-lg transition-all duration-200 relative group"
                    style={
                      isActive
                        ? {
                            background: I.accentSoft,
                            borderLeft: `2px solid ${I.accent}`,
                          }
                        : {
                            borderLeft: '2px solid transparent',
                          }
                    }
                  >
                    {/* Icon box */}
                    <span
                      className="flex items-center justify-center w-7 h-7 rounded-md flex-shrink-0 transition-all duration-200"
                      style={
                        isActive
                          ? {
                              background: 'rgba(99,102,241,0.28)',
                              color: I.accentLight,
                              boxShadow: `0 0 12px rgba(99,102,241,0.3)`,
                            }
                          : {
                              background: I.bgCard,
                              color: I.textMuted,
                            }
                      }
                    >
                      {Icon && <Icon className="h-3.5 w-3.5" />}
                    </span>

                    {/* Label */}
                    <span
                      className="font-medium text-sm"
                      style={{ color: isActive ? '#fff' : I.text }}
                    >
                      {item?.name}
                    </span>

                    {/* Dot indicator */}
                    {isActive && (
                      <span
                        className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: I.accent, boxShadow: `0 0 6px ${I.accentGlow}` }}
                      />
                    )}

                    {/* Hover overlay */}
                    {!isActive && (
                      <span className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none"
                        style={{ background: 'rgba(255,255,255,0.04)' }} />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <div className="p-3 space-y-1" style={{ borderTop: `1px solid ${I.border}` }}>
        {/* User pill */}
        <div
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
          style={{ background: I.bgCard, border: `1px solid ${I.border}` }}
        >
          <span
            className="flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold flex-shrink-0"
            style={{
              background: `linear-gradient(135deg, ${I.accent}, ${I.accentLight})`,
              color: '#fff',
              boxShadow: `0 0 0 2px ${I.bg}, 0 0 0 3px ${I.accentBorder}`,
            }}
          >
            {initials || '?'}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold truncate leading-tight">{userName}</p>
            <p className="text-[11px] truncate leading-tight mt-0.5" style={{ color: I.accentLabel }}>
              {ROLE_LABELS[userRole] ?? 'Assessor'}
            </p>
          </div>
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group"
          style={{ color: I.textMuted }}
        >
          <span
            className="flex items-center justify-center w-7 h-7 rounded-md flex-shrink-0 transition-colors duration-200 group-hover:bg-red-500/15"
            style={{ background: I.bgCard }}
          >
            <LogOut className="h-3.5 w-3.5 group-hover:text-red-400 transition-colors" />
          </span>
          <span className="font-medium text-sm group-hover:text-white transition-colors">Sair</span>
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
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }}
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
          background: `linear-gradient(170deg, #0b1120 0%, ${I.bg} 100%)`,
          border: `1px solid ${I.accentBorder}`,
          boxShadow: `0 24px 60px -12px rgba(0,0,0,0.7), 0 0 40px rgba(99,102,241,0.08)`,
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        {/* Fio índigo no topo */}
        <span
          className="absolute top-0 left-0 right-0 h-[1.5px] pointer-events-none"
          style={{ background: `linear-gradient(90deg, transparent, ${I.accent}, transparent)` }}
        />
        {/* Glow interno */}
        <span
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at 50% -10%, rgba(99,102,241,0.09) 0%, transparent 65%)`,
            borderRadius: 18,
          }}
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
            background: '#0e1021',
            border: `1px solid ${I.accentBorder}`,
            borderRadius: 8,
            color: I.accentLight,
            opacity: 0.9,
            boxShadow: `0 4px 16px rgba(0,0,0,0.5), 0 0 12px rgba(99,102,241,0.15)`,
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
