'use client';

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
  ChevronLeft,
  ChevronRight,
  Landmark,
  Upload,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { PERMISSIONS, type Permission, hasPermission, ROLE_LABELS } from '@/lib/permissions';
import { ThemeToggleButton } from '@/components/layout/theme-toggle-button';

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
      { name: 'Usuários',               href: '/dashboard/usuarios'        , icon: Users,    roles: ['AGENTE_POLITICO', 'CHEFE']                    },
      { name: 'Adm. de Gabinetes',      href: '/dashboard/admin/gabinetes' , icon: Building2, roles: ['SUPER_ADMIN', 'ADMIN']                       },
      { name: 'Configurações',          href: '/dashboard/configuracoes'   , icon: Settings, roles: ['AGENTE_POLITICO', 'CHEFE'] },
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

  const pathname = usePathname();
  const { data: session } = useSession() || {};
  const userRole        = (session?.user as any)?.role    || 'ASSESSOR';
  const userPermissions = (session?.user as any)?.permissions ?? [];
  const userName        = session?.user?.name             || 'Usuário';

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

  const handleSignOut = async () => {
    // Limpa flag de sync de tema pra proxima sessao buscar do servidor
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem('theme-synced');
    }
    try {
      // redirect: false evita a cadeia /api/auth/signout?callbackUrl=...
      // que estava causando 404 do Vercel em alguns casos
      await signOut({ redirect: false });
    } catch (err) {
      console.error('Erro ao deslogar:', err);
    }
    // Hard navigation pra garantir que cookies/state sao limpos e
    // a URL final fica /login no mesmo host
    if (typeof window !== 'undefined') {
      window.location.replace(window.location.origin + '/login');
    }
  };

  const initials = userName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0].toUpperCase())
    .join('');

  const NavContent = () => (
    <>
      {/* ── Logo / header ───────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-4 pt-5 pb-5"
        style={{ borderBottom: '1px solid rgba(148,163,184,0.12)' }}
      >
        <img
          src="/logo.png"
          alt="AdminHub"
          className="w-20 h-20 object-contain flex-shrink-0"
        />
        <div className="min-w-0">
          <p className="text-2xl font-semibold text-white leading-tight tracking-tight truncate">
            AdminHub
          </p>
          <p className="text-[11px] leading-snug mt-1" style={{ color: '#94A3B8' }}>
            Plataforma de Gabinete Político
          </p>
        </div>
      </div>

      {/* ── Navigation ──────────────────────────────────────────────────── */}
      <nav className="sidebar-nav flex-1 px-3 py-4 overflow-y-auto">
        {filteredSections.map((sec, secIdx) => (
          <div key={sec.section} className={cn(secIdx > 0 && 'mt-5')}>
            <div className="px-3 mb-2">
              <span
                className="text-[10px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: '#64748B' }}
              >
                {sec.section}
              </span>
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
                    className={cn(
                      'sidebar-nav-item flex items-center gap-3 px-3 py-2 rounded-md transition-colors duration-150 relative group',
                      isActive && 'sidebar-nav-item--active'
                    )}
                  >
                    <Icon className="sidebar-nav-icon h-[18px] w-[18px] flex-shrink-0" />
                    <span className="text-[14px] font-medium tracking-wide">{item?.name}</span>

                    {isActive && (
                      <span
                        className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: '#22D3EE' }}
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
      <div className="p-3 relative">
        <div
          className="absolute left-3 right-3 top-0 h-px"
          style={{ background: 'rgba(148,163,184,0.10)' }}
        />

        <div
          className="flex items-center gap-3 px-2.5 py-2.5 mb-2 rounded-lg"
          style={{
            background: 'var(--tint-04)',
            border: '1px solid rgba(148,163,184,0.10)',
          }}
        >
          <span
            className="flex items-center justify-center w-9 h-9 rounded-full text-xs font-semibold flex-shrink-0"
            style={{ background: '#2563EB', color: '#FFFFFF' }}
          >
            {initials || '?'}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate leading-tight text-white">{userName}</p>
            <p className="text-[11px] truncate leading-tight mt-0.5" style={{ color: '#94A3B8' }}>
              {ROLE_LABELS[userRole] ?? 'Assessor'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSignOut}
            className="flex-1 flex items-center gap-3 px-3 py-2 rounded-md transition-colors duration-150"
            style={{ color: '#CBD5E1', background: 'var(--tint-04)', border: '1px solid rgba(148,163,184,0.10)' }}
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            <span className="text-[13px] font-medium tracking-wide">Sair</span>
          </button>
          <ThemeToggleButton />
        </div>
      </div>
    </>
  );

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onToggle}
            className="lg:hidden fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
          />
        )}
      </AnimatePresence>

      <motion.aside
        animate={{ x: open ? 0 : -280, opacity: open ? 1 : 0 }}
        transition={{ type: 'spring', damping: 26, stiffness: 240 }}
        className="flex flex-col fixed overflow-hidden z-50"
        style={{
          top: 0,
          bottom: 0,
          left: 0,
          width: 260,
          background: '#0F2240',
          borderRight: '1px solid rgba(148,163,184,0.10)',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        <span
          className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(96,165,250,0.45), transparent)' }}
        />
        <NavContent />
      </motion.aside>

      {onToggle && (
        <motion.button
          onClick={onToggle}
          aria-label={open ? 'Recolher sidebar' : 'Abrir sidebar'}
          title={open ? 'Recolher menu' : 'Abrir menu'}
          animate={{ left: open ? 260 : 8 }}
          transition={{ type: 'spring', damping: 26, stiffness: 240 }}
          className="fixed top-1/2 -translate-y-1/2 w-6 h-12 flex items-center justify-center z-50 transition-colors"
          style={{
            background: '#0F2240',
            border: '1px solid rgba(148,163,184,0.18)',
            borderLeft: 'none',
            borderRadius: '0 8px 8px 0',
            color: '#60A5FA',
          }}
        >
          {open ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </motion.button>
      )}
    </>
  );
}
