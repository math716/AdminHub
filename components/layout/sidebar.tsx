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
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AdminGabineteSwitcher } from '@/components/admin-gabinete-switcher';
import { PERMISSIONS, type Permission, hasPermission, ROLE_LABELS } from '@/lib/permissions';

type NavItem = {
  name: string;
  href: string;
  icon: any;
  // Quando definido, item aparece somente se hasPermission(user, permission) for true.
  permission?: Permission;
  // Quando definido, item aparece somente se o role do usuário estiver na lista.
  // Usado para itens administrativos que não dependem do sistema de permissões.
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
      { name: 'Usuários',      href: '/dashboard/usuarios'     , icon: Users,    roles: ['ADMIN', 'CHEFE']                    },
      { name: 'Configurações', href: '/dashboard/configuracoes', icon: Settings, roles: ['ADMIN', 'AGENTE_POLITICO', 'CHEFE'] },
    ],
  },
];

interface SidebarProps {
  open?: boolean;
  onToggle?: () => void;
}

export function Sidebar({ open = true, onToggle }: SidebarProps = {}) {
  const [switcherOpen,  setSwitcherOpen]  = useState(false);
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
        return true; // sem restrição (ex.: Dashboard)
      }),
    }))
    .filter((sec) => sec.items.length > 0);

  const handleSignOut = () => {
    signOut({ callbackUrl: '/login' });
  };

  const initials = userName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0].toUpperCase())
    .join('');

  const NavContent = () => (
    <>
      {/* Logo / header */}
      <div className="flex flex-col items-center px-4 pt-4 pb-4 border-b border-white/10">

        {/* Ícone */}
        <img src="/logo.png" alt="AdminHub" className="w-44 h-auto object-contain drop-shadow-lg" />

        {/* Nome do sistema — branco */}
        <p className="mt-1 text-xs font-bold tracking-[0.22em] uppercase select-none text-white">
          AdminHub
        </p>

        {/* Bloco de gabinete — apenas ADMIN (para trocar de gabinete) */}
        {isAdmin && (
          gabineteNome ? (
            <div className="w-full mt-3 rounded-xl px-3 py-2.5 flex items-center gap-2.5"
              style={{ background: 'rgba(74,158,222,0.07)', border: '1px solid rgba(74,158,222,0.15)' }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(74,158,222,0.15)' }}>
                <Building2 className="w-3.5 h-3.5" style={{ color: '#4a9ede' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-semibold truncate leading-tight">{gabineteNome}</p>
                <p className="text-[10px] mt-0.5 leading-tight" style={{ color: 'rgba(255,255,255,0.38)' }}>
                  Administrador
                </p>
              </div>
              <button onClick={() => setSwitcherOpen(true)}
                title="Trocar gabinete"
                className="flex-shrink-0 p-1 rounded-lg transition-all hover:bg-white/10"
                style={{ color: 'rgba(74,158,222,0.6)' }}>
                <ArrowLeftRight className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <span className="mt-3 px-3 py-0.5 rounded-full text-xs font-semibold tracking-wide"
              style={{ background: 'rgba(201,162,39,0.12)', color: '#c9a227', border: '1px solid rgba(201,162,39,0.25)' }}>
              Administrador
            </span>
          )
        )}
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav flex-1 px-3 py-4 overflow-y-auto">
        {filteredSections.map((sec, secIdx) => (
          <div key={sec.section} className={cn(secIdx > 0 && 'mt-5')}>
            {/* Section label */}
            <div className="flex items-center gap-2 px-3 mb-2">
              <span
                className="text-[10px] font-bold uppercase tracking-[0.2em]"
                style={{ color: '#c9a227' }}
              >
                {sec.section}
              </span>
              <span
                className="flex-1 h-px"
                style={{ background: 'linear-gradient(90deg, rgba(201,162,39,0.45), transparent)' }}
              />
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
                      // Auto-recolhe o sidebar em telas pequenas ao navegar
                      if (typeof window !== 'undefined' && window.innerWidth < 1024) onToggle?.();
                    }}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 relative group',
                      isActive ? 'text-white' : 'text-slate-200 hover:text-white'
                    )}
                    style={
                      isActive
                        ? {
                            background:
                              'linear-gradient(90deg, rgba(201,162,39,0.18) 0%, rgba(201,162,39,0.04) 100%)',
                            borderLeft: '3px solid #c9a227',
                            boxShadow: 'inset 0 0 0 1px rgba(201,162,39,0.10)',
                          }
                        : { borderLeft: '3px solid transparent' }
                    }
                  >
                    <span
                      className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 transition-all duration-200 group-hover:scale-[1.04]"
                      style={
                        isActive
                          ? {
                              background: 'rgba(201,162,39,0.22)',
                              color: '#c9a227',
                              boxShadow:
                                'inset 0 0 10px rgba(201,162,39,0.18), 0 0 12px rgba(201,162,39,0.25)',
                              border: '1px solid rgba(201,162,39,0.35)',
                            }
                          : {
                              background: 'rgba(201,162,39,0.08)',
                              color: 'rgba(201,162,39,0.75)',
                              border: '1px solid rgba(201,162,39,0.18)',
                            }
                      }
                    >
                      {Icon && <Icon className="h-4 w-4" />}
                    </span>
                    <span className="font-medium text-sm tracking-wide">{item?.name}</span>

                    {/* Indicador à direita no item ativo */}
                    {isActive && (
                      <span
                        className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{
                          background: '#c9a227',
                          boxShadow: '0 0 8px rgba(201,162,39,0.7)',
                        }}
                      />
                    )}

                    {!isActive && (
                      <span
                        className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
                        style={{
                          background:
                            'linear-gradient(90deg, rgba(201,162,39,0.10) 0%, rgba(255,255,255,0.03) 100%)',
                        }}
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
        {/* Divider dourado decorativo */}
        <div
          className="absolute left-3 right-3 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(201,162,39,0.4), transparent)' }}
        />

        <div
          className="flex items-center gap-3 px-2.5 py-2.5 mb-2 rounded-xl"
          style={{
            background: 'linear-gradient(135deg, rgba(201,162,39,0.08) 0%, rgba(255,255,255,0.03) 100%)',
            border: '1px solid rgba(201,162,39,0.18)',
          }}
        >
          <span
            className="flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, #c9a227, #e6b83a)',
              color: '#04111f',
              boxShadow: '0 0 0 2px rgba(7,29,54,1), 0 0 0 3px rgba(201,162,39,0.5), 0 0 10px rgba(201,162,39,0.3)',
            }}
          >
            {initials || '?'}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold truncate leading-tight">{userName}</p>
            <p
              className="text-[11px] truncate leading-tight mt-0.5 tracking-wide"
              style={{ color: 'rgba(201,162,39,0.85)' }}
            >
              {ROLE_LABELS[userRole] ?? 'Assessor'}
            </p>
          </div>
        </div>

        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-slate-300 hover:text-white rounded-lg transition-all duration-200 group"
          style={{ borderLeft: '3px solid transparent' }}
        >
          <span
            className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 transition-all duration-200 group-hover:scale-[1.04]"
            style={{
              background: 'rgba(201,162,39,0.08)',
              color: 'rgba(201,162,39,0.75)',
              border: '1px solid rgba(201,162,39,0.18)',
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
      {/* Backdrop overlay — somente em mobile/tablet quando o sidebar esta aberto */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onToggle}
            className="lg:hidden fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
          />
        )}
      </AnimatePresence>

      {/* Sidebar — painel flutuante em todos os tamanhos */}
      <motion.aside
        animate={{
          x: open ? 0 : -280,
          opacity: open ? 1 : 0,
        }}
        transition={{ type: 'spring', damping: 24, stiffness: 220 }}
        className="flex flex-col fixed gradient-primary overflow-hidden z-50"
        style={{
          top: 12,
          bottom: 12,
          left: 12,
          width: 256,
          borderRadius: 20,
          border: '1px solid rgba(201,162,39,0.18)',
          boxShadow:
            '0 20px 50px -12px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04), 0 0 35px rgba(201,162,39,0.08)',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        {/* Fio dourado no topo */}
        <span
          className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(201,162,39,0.6), transparent)' }}
        />
        {/* Glow interno sutil para destacar do fundo */}
        <span
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(circle at 50% 0%, rgba(201,162,39,0.06), transparent 60%)',
            borderRadius: 20,
          }}
        />
        <NavContent />
      </motion.aside>

      {/* Botão de toggle — chevron, funciona em todos os tamanhos */}
      {onToggle && (
        <motion.button
          onClick={onToggle}
          aria-label={open ? 'Recolher sidebar' : 'Abrir sidebar'}
          title={open ? 'Recolher menu' : 'Abrir menu'}
          animate={{ left: open ? 256 : 8 }}
          transition={{ type: 'spring', damping: 24, stiffness: 220 }}
          className="fixed top-1/2 -translate-y-1/2 w-7 h-14 flex items-center justify-center z-50 hover:opacity-100 transition-opacity"
          style={{
            background: 'linear-gradient(135deg, #143764 0%, #0d2c52 100%)',
            border: '1px solid rgba(201,162,39,0.3)',
            borderRadius: 10,
            color: '#c9a227',
            opacity: 0.95,
            boxShadow: '0 4px 16px rgba(0,0,0,0.5), 0 0 18px rgba(201,162,39,0.12)',
          }}
        >
          {open ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </motion.button>
      )}

      {/* Switcher de gabinete (ADMIN) */}
      <AdminGabineteSwitcher
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
      />
    </>
  );
}
