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
  Menu,
  X,
  Target,
  MapPin,
  CalendarDays,
  BookUser,
  Settings,
  Building2,
  ArrowLeftRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AdminGabineteSwitcher } from '@/components/admin-gabinete-switcher';

const navigation: {
  section: string;
  items: { name: string; href: string; icon: any; roles: string[] }[];
}[] = [
  {
    section: 'Principal',
    items: [
      { name: 'Dashboard',         href: '/dashboard',                 icon: LayoutDashboard, roles: ['ADMIN', 'CHEFE', 'ASSESSOR'] },
      { name: 'Mapa do Gabinete',  href: '/dashboard/mapa-demandas',   icon: MapPin,          roles: ['ADMIN', 'CHEFE', 'ASSESSOR'] },
      { name: 'Contatos',          href: '/dashboard/contatos',        icon: BookUser,        roles: ['ADMIN', 'CHEFE', 'ASSESSOR'] },
      { name: 'Agenda',            href: '/dashboard/agenda',          icon: CalendarDays,    roles: ['ADMIN', 'CHEFE', 'ASSESSOR'] },
    ],
  },
  {
    section: 'Operação',
    items: [
      { name: 'Demandas',            href: '/dashboard/demandas',      icon: FileText, roles: ['ADMIN', 'CHEFE', 'ASSESSOR'] },
      { name: 'Projeto de Campanha', href: '/dashboard/mapa-campanha', icon: Target,   roles: ['ADMIN', 'CHEFE'] },
      { name: 'Mapa Eleitoral',      href: '/dashboard/mapa',          icon: Map,      roles: ['ADMIN', 'CHEFE'] },
    ],
  },
  {
    section: 'Administração',
    items: [
      { name: 'Usuários',      href: '/dashboard/usuarios',      icon: Users,    roles: ['ADMIN'] },
      { name: 'Configurações', href: '/dashboard/configuracoes', icon: Settings, roles: ['ADMIN', 'CHEFE'] },
    ],
  },
];

export function Sidebar() {
  const [mobileOpen,    setMobileOpen]    = useState(false);
  const [switcherOpen,  setSwitcherOpen]  = useState(false);
  const pathname = usePathname();
  const { data: session } = useSession() || {};
  const userRole     = (session?.user as any)?.role    || 'ASSESSOR';
  const userName     = session?.user?.name             || 'Usuário';
  const gabineteNome = (session?.user as any)?.gabineteNome;
  const isAdmin      = userRole === 'ADMIN';

  const filteredSections = (navigation ?? [])
    .map((sec) => ({
      ...sec,
      items: (sec.items ?? []).filter((it) => it?.roles?.includes?.(userRole)),
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
                style={{ color: 'rgba(201,162,39,0.65)' }}
              >
                {sec.section}
              </span>
              <span
                className="flex-1 h-px"
                style={{ background: 'linear-gradient(90deg, rgba(201,162,39,0.25), transparent)' }}
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
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 relative group',
                      isActive ? 'text-white' : 'text-white/60 hover:text-white/95'
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
                              background: 'rgba(255,255,255,0.05)',
                              color: 'inherit',
                              border: '1px solid rgba(255,255,255,0.06)',
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
                            'linear-gradient(90deg, rgba(201,162,39,0.06) 0%, rgba(255,255,255,0.03) 100%)',
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
              {userRole === 'ADMIN' ? 'Administrador' : userRole === 'CHEFE' ? 'Chefe de Gabinete' : 'Assessor'}
            </p>
          </div>
        </div>

        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-white/60 hover:text-white rounded-lg transition-all duration-200 group"
          style={{ borderLeft: '3px solid transparent' }}
        >
          <span
            className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 transition-all duration-200 group-hover:scale-[1.04]"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.06)',
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
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 p-2 bg-[#1e3a5f] text-white rounded-lg shadow-lg"
      >
        <Menu className="h-6 w-6" />
      </button>

      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 gradient-primary relative"
        style={{ borderRight: '1px solid rgba(201,162,39,0.12)' }}
      >
        {/* Fio dourado no topo */}
        <span
          className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(201,162,39,0.6), transparent)' }}
        />
        <NavContent />
      </aside>

      {/* Mobile sidebar */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="lg:hidden fixed inset-0 bg-black/50 z-40"
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="lg:hidden fixed inset-y-0 left-0 w-64 gradient-primary z-50 flex flex-col"
              style={{ borderRight: '1px solid rgba(201,162,39,0.12)' }}
            >
              <span
                className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(201,162,39,0.6), transparent)' }}
              />
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute top-4 right-4 p-2 text-white/70 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
              <NavContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Switcher de gabinete (ADMIN) */}
      <AdminGabineteSwitcher
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
      />
    </>
  );
}
