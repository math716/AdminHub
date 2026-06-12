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
    section: 'Gabinete',
    items: [
      { name: 'Dashboard',        href: '/dashboard'              , icon: LayoutDashboard },
      { name: 'Demandas',         href: '/dashboard/demandas'     , icon: FileText,     permission: PERMISSIONS.DEMANDAS      },
      { name: 'Agenda',           href: '/dashboard/agenda'       , icon: CalendarDays, permission: PERMISSIONS.AGENDA        },
      { name: 'Contatos',         href: '/dashboard/contatos'     , icon: BookUser,     permission: PERMISSIONS.CONTATOS      },
      { name: 'Mapa do Gabinete', href: '/dashboard/mapa-demandas', icon: MapPin,       permission: PERMISSIONS.MAPA_GABINETE },
    ],
  },
  {
    section: 'Dados Políticos',
    items: [
      { name: 'Mapa Eleitoral',         href: '/dashboard/mapa'         , icon: Map,      permission: PERMISSIONS.MAPA_ELEITORAL   },
      { name: 'Projeto de Campanha',    href: '/dashboard/mapa-campanha', icon: Target,   permission: PERMISSIONS.PROJETO_CAMPANHA },
      { name: 'Emendas Parlamentares',  href: '/dashboard/emendas'      , icon: Landmark, permission: PERMISSIONS.EMENDAS_MAPA     },
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
  const isAdmin         = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';

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
      {/* ── Logo / header ───────────────────────────────────────────────── */}
      <div className="flex flex-col items-center px-4 pt-4 pb-4"
        style={{ borderBottom: '1px solid rgba(74,158,222,0.13)' }}>

        <img src="/logo.png" alt="AdminHub" className="w-44 h-auto object-contain drop-shadow-md" />

        <p className="mt-1 text-xs font-bold tracking-[0.22em] uppercase select-none"
          style={{ color: '#1b3a5e' }}>
          AdminHub
        </p>

        {/* Gabinete switcher — somente ADMIN / SUPER_ADMIN */}
        {isAdmin && (
          gabineteNome ? (
            <button onClick={() => setSwitcherOpen(true)}
              title="Trocar gabinete"
              className="w-full mt-3 rounded-xl px-3 py-2.5 flex items-center gap-2.5 transition-all text-left"
              style={{
                background: 'rgba(255,255,255,0.55)',
                border: '1px solid rgba(74,158,222,0.22)',
                boxShadow: '0 1px 6px rgba(74,158,222,0.08)',
              }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(74,158,222,0.12)', border: '1px solid rgba(74,158,222,0.2)' }}>
                <Building2 className="w-3.5 h-3.5" style={{ color: '#4a9ede' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate leading-tight" style={{ color: '#1b3a5e' }}>{gabineteNome}</p>
                <p className="text-[10px] mt-0.5 leading-tight" style={{ color: 'rgba(74,158,222,0.7)' }}>
                  Clique para trocar
                </p>
              </div>
              <ArrowLeftRight className="w-3 h-3 flex-shrink-0" style={{ color: 'rgba(74,158,222,0.5)' }} />
            </button>
          ) : (
            <button onClick={() => setSwitcherOpen(true)}
              title="Selecionar gabinete"
              className="w-full mt-3 rounded-xl px-3 py-2.5 flex items-center gap-2.5 transition-all text-left"
              style={{
                background: 'rgba(245,158,11,0.06)',
                border: '1px solid rgba(245,158,11,0.25)',
              }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(245,158,11,0.1)' }}>
                <Building2 className="w-3.5 h-3.5" style={{ color: '#d97706' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold leading-tight" style={{ color: '#b45309' }}>Selecionar Gabinete</p>
                <p className="text-[10px] mt-0.5 leading-tight" style={{ color: 'rgba(100,116,139,0.7)' }}>
                  Nenhum gabinete ativo
                </p>
              </div>
              <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: 'rgba(217,119,6,0.5)' }} />
            </button>
          )
        )}
      </div>

      {/* ── Navigation ──────────────────────────────────────────────────── */}
      <nav className="sidebar-nav flex-1 px-3 py-4 overflow-y-auto">
        {filteredSections.map((sec, secIdx) => (
          <div key={sec.section} className={cn(secIdx > 0 && 'mt-5')}>
            {/* Section label */}
            <div className="flex items-center gap-2 px-3 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em]"
                style={{ color: '#c9a227' }}>
                {sec.section}
              </span>
              <span className="flex-1 h-px"
                style={{ background: 'linear-gradient(90deg, rgba(201,162,39,0.45), transparent)' }} />
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
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 relative group"
                    style={isActive ? {
                      background: 'rgba(255,255,255,0.72)',
                      borderLeft: '3px solid #4a9ede',
                      boxShadow: '0 2px 10px rgba(74,158,222,0.1), inset 0 0 0 1px rgba(74,158,222,0.07)',
                      color: '#0d2f52',
                    } : {
                      borderLeft: '3px solid transparent',
                      color: '#2c4f7c',
                    }}
                  >
                    <span
                      className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 transition-all duration-200 group-hover:scale-[1.04]"
                      style={isActive ? {
                        background: 'rgba(74,158,222,0.16)',
                        color: '#4a9ede',
                        boxShadow: 'inset 0 0 10px rgba(74,158,222,0.12), 0 0 10px rgba(74,158,222,0.18)',
                        border: '1px solid rgba(74,158,222,0.28)',
                      } : {
                        background: 'rgba(74,158,222,0.07)',
                        color: '#4a9ede',
                        border: '1px solid rgba(74,158,222,0.14)',
                      }}
                    >
                      {Icon && <Icon className="h-4 w-4" />}
                    </span>

                    <span className="font-medium text-sm tracking-wide">{item?.name}</span>

                    {/* Indicador dourado no item ativo */}
                    {isActive && (
                      <span
                        className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: '#c9a227', boxShadow: '0 0 7px rgba(201,162,39,0.6)' }}
                      />
                    )}

                    {!isActive && (
                      <span
                        className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
                        style={{ background: 'linear-gradient(90deg, rgba(74,158,222,0.07) 0%, rgba(74,158,222,0.01) 100%)' }}
                      />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="relative p-3">
        {/* Divisor sutil */}
        <div
          className="absolute left-3 right-3 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(74,158,222,0.3), rgba(201,162,39,0.18), transparent)' }}
        />

        {/* Card do usuário */}
        <div
          className="flex items-center gap-3 px-2.5 py-2.5 mb-2 rounded-xl"
          style={{
            background: 'rgba(255,255,255,0.5)',
            border: '1px solid rgba(74,158,222,0.16)',
          }}
        >
          <span
            className="flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, #4a9ede, #7dc8f7)',
              color: '#fff',
              boxShadow: '0 0 0 2px rgba(236,244,253,1), 0 0 0 3px rgba(74,158,222,0.35), 0 0 10px rgba(74,158,222,0.2)',
            }}
          >
            {initials || '?'}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate leading-tight" style={{ color: '#1b3a5e' }}>{userName}</p>
            <p className="text-[11px] truncate leading-tight mt-0.5 tracking-wide" style={{ color: '#4a9ede' }}>
              {ROLE_LABELS[userRole] ?? 'Assessor'}
            </p>
          </div>
        </div>

        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group"
          style={{ borderLeft: '3px solid transparent', color: '#64748b' }}
        >
          <span
            className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 transition-all duration-200 group-hover:scale-[1.04]"
            style={{
              background: 'rgba(74,158,222,0.07)',
              color: 'rgba(74,158,222,0.55)',
              border: '1px solid rgba(74,158,222,0.13)',
            }}
          >
            <LogOut className="h-4 w-4" />
          </span>
          <span className="font-medium text-sm tracking-wide">Sair</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Backdrop mobile */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onToggle}
            className="lg:hidden fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }}
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
          borderRadius: 20,
          background: 'linear-gradient(165deg, #d6e8f7 0%, #eaf3fc 45%, #ddeaf7 100%)',
          border: '1px solid rgba(74,158,222,0.22)',
          boxShadow: '0 20px 50px -12px rgba(20,50,90,0.16), 0 0 0 1px rgba(255,255,255,0.75), 0 4px 24px rgba(74,158,222,0.09)',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        {/* Fio bicolor no topo */}
        <span
          className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(74,158,222,0.55), rgba(201,162,39,0.4), transparent)' }}
        />
        {/* Brilho interno suave */}
        <span
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.45), transparent 65%)',
            borderRadius: 20,
          }}
        />
        <NavContent />
      </motion.aside>

      {/* Botão de toggle */}
      {onToggle && (
        <motion.button
          onClick={onToggle}
          aria-label={open ? 'Recolher sidebar' : 'Abrir sidebar'}
          title={open ? 'Recolher menu' : 'Abrir menu'}
          animate={{ left: open ? 256 : 8 }}
          transition={{ type: 'spring', damping: 24, stiffness: 220 }}
          className="fixed top-1/2 -translate-y-1/2 w-7 h-14 flex items-center justify-center z-50 hover:opacity-100 transition-opacity"
          style={{
            background: 'linear-gradient(135deg, #dce9f7 0%, #cde2f5 100%)',
            border: '1px solid rgba(74,158,222,0.3)',
            borderRadius: 10,
            color: '#4a9ede',
            opacity: 0.95,
            boxShadow: '0 4px 14px rgba(20,50,90,0.12), 0 0 0 1px rgba(255,255,255,0.65)',
          }}
        >
          {open ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </motion.button>
      )}

      {/* Modal de troca de gabinete */}
      <AdminGabineteSwitcher
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
      />
    </>
  );
}
