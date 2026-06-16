'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Map, FileText, Users, LogOut, Target,
  MapPin, CalendarDays, BookUser, Settings, Building2,
  ChevronLeft, ChevronRight, Landmark, Upload,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
      { name: 'Dashboard',        href: '/dashboard',               icon: LayoutDashboard },
      { name: 'Demandas',         href: '/dashboard/demandas',      icon: FileText,      permission: PERMISSIONS.DEMANDAS      },
      { name: 'Agenda',           href: '/dashboard/agenda',        icon: CalendarDays,  permission: PERMISSIONS.AGENDA        },
      { name: 'Contatos',         href: '/dashboard/contatos',      icon: BookUser,      permission: PERMISSIONS.CONTATOS      },
      { name: 'Mapa do Gabinete', href: '/dashboard/mapa-demandas', icon: MapPin,        permission: PERMISSIONS.MAPA_GABINETE },
    ],
  },
  {
    section: 'Dados Políticos',
    items: [
      { name: 'Mapa Eleitoral',        href: '/dashboard/mapa',          icon: Map,      permission: PERMISSIONS.MAPA_ELEITORAL   },
      { name: 'Projeto de Campanha',   href: '/dashboard/mapa-campanha', icon: Target,   permission: PERMISSIONS.PROJETO_CAMPANHA },
      { name: 'Emendas Parlamentares', href: '/dashboard/emendas',       icon: Landmark, permission: PERMISSIONS.EMENDAS_MAPA     },
    ],
  },
  {
    section: 'Administração',
    items: [
      { name: 'Usuários',          href: '/dashboard/usuarios',         icon: Users,    roles: ['AGENTE_POLITICO', 'CHEFE']  },
      { name: 'Adm. de Gabinetes', href: '/dashboard/admin/gabinetes',  icon: Building2, roles: ['SUPER_ADMIN', 'ADMIN']     },
      { name: 'Configurações',     href: '/dashboard/configuracoes',    icon: Settings, roles: ['AGENTE_POLITICO', 'CHEFE']  },
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

  const filteredSections = navigation
    .map((sec) => ({
      ...sec,
      items: sec.items.filter((it) => {
        if (it.roles)      return it.roles.includes(userRole);
        if (it.permission) return hasPermission({ role: userRole, permissions: userPermissions }, it.permission);
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

  // ── Sidebar interior ────────────────────────────────────────────────────
  const NavContent = () => (
    <>
      {/* Logo */}
      <div className="flex flex-col items-center px-4 pt-5 pb-4"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <img src="/logo.png" alt="AdminHub" className="w-40 h-auto object-contain" />
        <p className="mt-1.5 text-[10px] font-bold tracking-[0.24em] uppercase select-none"
          style={{ color: 'rgba(255,255,255,0.3)' }}>
          AdminHub
        </p>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav flex-1 px-3 py-4 overflow-y-auto">
        {filteredSections.map((sec, secIdx) => (
          <div key={sec.section} className={cn(secIdx > 0 && 'mt-5')}>
            <div className="flex items-center gap-2 px-3 mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: 'rgba(255,255,255,0.28)' }}>
                {sec.section}
              </span>
              <span className="flex-1 h-px"
                style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.1), transparent)' }} />
            </div>

            <div className="space-y-0.5">
              {sec.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/dashboard' && pathname?.startsWith?.(`${item.href}/`));
                const Icon = item.icon;

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => {
                      if (typeof window !== 'undefined' && window.innerWidth < 1024) onToggle?.();
                    }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 relative group"
                    style={isActive ? {
                      background: 'rgba(59,130,246,0.14)',
                      borderLeft: '3px solid #3b82f6',
                      color: '#ffffff',
                    } : {
                      borderLeft: '3px solid transparent',
                      color: 'rgba(255,255,255,0.78)',
                    }}
                  >
                    <span
                      className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 transition-all duration-150 group-hover:scale-[1.04]"
                      style={isActive ? {
                        background: 'rgba(59,130,246,0.22)',
                        color: '#60a5fa',
                        border: '1px solid rgba(59,130,246,0.32)',
                      } : {
                        background: 'rgba(255,255,255,0.06)',
                        color: 'rgba(255,255,255,0.38)',
                        border: '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      {Icon && <Icon className="h-4 w-4" />}
                    </span>

                    <span className="font-medium text-sm">{item.name}</span>

                    {isActive && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: '#3b82f6', boxShadow: '0 0 8px rgba(59,130,246,0.8)' }} />
                    )}

                    {!isActive && (
                      <span
                        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none"
                        style={{ background: 'rgba(255,255,255,0.04)' }}
                      />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="relative p-3">
        <div className="absolute left-4 right-4 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)' }} />

        <div className="flex items-center gap-3 px-3 py-3 mb-2 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)' }}>
          <span className="flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
              color: '#fff',
              boxShadow: '0 0 0 2px rgba(59,130,246,0.25)',
            }}>
            {initials || '?'}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate leading-tight" style={{ color: '#f1f5f9' }}>{userName}</p>
            <p className="text-[11px] truncate leading-tight mt-0.5 font-medium" style={{ color: '#60a5fa' }}>
              {ROLE_LABELS[userRole] ?? 'Assessor'}
            </p>
          </div>
        </div>

        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group"
          style={{ borderLeft: '3px solid transparent', color: 'rgba(255,255,255,0.38)' }}
        >
          <span className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 transition-all duration-150 group-hover:scale-[1.04]"
            style={{
              background: 'rgba(255,255,255,0.05)',
              color: 'rgba(255,255,255,0.3)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}>
            <LogOut className="h-4 w-4" />
          </span>
          <span className="font-medium text-sm group-hover:text-white/60 transition-colors">Sair</span>
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
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        animate={{ x: open ? 0 : -280, opacity: open ? 1 : 0 }}
        transition={{ type: 'spring', damping: 24, stiffness: 220 }}
        className="flex flex-col fixed overflow-hidden z-50"
        style={{
          top: 12, bottom: 12, left: 12, width: 256,
          borderRadius: 18,
          background: 'linear-gradient(180deg, #111827 0%, #0f1724 100%)',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        {/* Fio azul no topo */}
        <span className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.7), rgba(96,165,250,0.4), transparent)' }} />

        <NavContent />
      </motion.aside>

      {/* Botão toggle */}
      {onToggle && (
        <motion.button
          onClick={onToggle}
          aria-label={open ? 'Recolher sidebar' : 'Abrir sidebar'}
          title={open ? 'Recolher menu' : 'Abrir menu'}
          animate={{ left: open ? 256 : 8 }}
          transition={{ type: 'spring', damping: 24, stiffness: 220 }}
          className="fixed top-1/2 -translate-y-1/2 w-7 h-14 flex items-center justify-center z-50 transition-opacity hover:opacity-100"
          style={{
            background: 'rgba(17,24,39,0.85)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(59,130,246,0.2)',
            borderRadius: 10,
            color: '#60a5fa',
            opacity: 0.9,
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          }}
        >
          {open ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </motion.button>
      )}
    </>
  );
}
