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
  Star,
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

const navigation = [
  { name: 'Dashboard',            href: '/dashboard',                 icon: LayoutDashboard, roles: ['ADMIN', 'CHEFE', 'ASSESSOR'] },
  { name: 'Mapa do Gabinete',     href: '/dashboard/mapa-demandas',   icon: MapPin,          roles: ['ADMIN', 'CHEFE', 'ASSESSOR'] },
  { name: 'Contatos',             href: '/dashboard/contatos',        icon: BookUser,        roles: ['ADMIN', 'CHEFE', 'ASSESSOR'] },
  { name: 'Agenda',               href: '/dashboard/agenda',          icon: CalendarDays,    roles: ['ADMIN', 'CHEFE', 'ASSESSOR'] },
  { name: 'Demandas',             href: '/dashboard/demandas',        icon: FileText,        roles: ['ADMIN', 'CHEFE', 'ASSESSOR'] },
  { name: 'Projeto de Campanha',  href: '/dashboard/mapa-campanha',   icon: Target,          roles: ['ADMIN', 'CHEFE'] },
  { name: 'Mapa Eleitoral',       href: '/dashboard/mapa',            icon: Map,             roles: ['ADMIN', 'CHEFE'] },
  { name: 'Favoritos',            href: '/dashboard/favoritos',       icon: Star,            roles: ['ADMIN', 'CHEFE'] },
  { name: 'Usuários',             href: '/dashboard/usuarios',        icon: Users,           roles: ['ADMIN'] },
  { name: 'Configurações',        href: '/dashboard/configuracoes',   icon: Settings,        roles: ['ADMIN', 'CHEFE'] },
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

  const filteredNav = navigation?.filter?.((item) => item?.roles?.includes?.(userRole)) ?? [];

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
      <nav className="sidebar-nav flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {filteredNav?.map?.((item) => {
          const isActive = pathname === item?.href || (item?.href !== '/dashboard' && pathname?.startsWith?.(`${item?.href}/`));
          const Icon = item?.icon;
          return (
            <Link
              key={item?.name}
              href={item?.href ?? '#'}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 relative group',
                // Garante area de toque confortavel em touch (lg = desktop fica mais compacto)
                'min-h-[44px] lg:min-h-0',
                isActive
                  ? 'text-white'
                  : 'text-white/60 hover:text-white/90'
              )}
              style={isActive ? { background: 'rgba(201,162,39,0.12)', borderLeft: '3px solid #c9a227' } : { borderLeft: '3px solid transparent' }}
            >
              <span
                className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 transition-all duration-200"
                style={isActive
                  ? { background: 'rgba(201,162,39,0.2)', color: '#c9a227' }
                  : { background: 'rgba(255,255,255,0.06)', color: 'inherit' }
                }
              >
                {Icon && <Icon className="h-4 w-4" />}
              </span>
              <span className="font-medium text-sm">{item?.name}</span>
              {!isActive && (
                <span className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" style={{ background: 'rgba(255,255,255,0.05)' }} />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-3 px-2 py-2 mb-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <span
            className="flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #c9a227, #e6b83a)', color: '#04111f' }}
          >
            {initials || '?'}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate leading-tight">{userName}</p>
            <p className="text-white/50 text-xs truncate leading-tight">{userRole === 'ADMIN' ? 'Administrador' : userRole === 'CHEFE' ? 'Chefe de Gabinete' : 'Assessor'}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] lg:min-h-0 text-white/50 hover:text-white/90 rounded-lg transition-all duration-200 group"
          style={{ borderLeft: '3px solid transparent' }}
        >
          <span className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 transition-all duration-200" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <LogOut className="h-4 w-4" />
          </span>
          <span className="font-medium text-sm">Sair</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile toggle — min 44x44 garante toque confortavel (iOS HIG) */}
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir menu"
        className="lg:hidden fixed top-4 left-4 z-40 p-3 min-w-[44px] min-h-[44px] flex items-center justify-center bg-[#1e3a5f] text-white rounded-lg shadow-lg"
      >
        <Menu className="h-6 w-6" />
      </button>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 gradient-primary" style={{ borderRight: '1px solid rgba(201,162,39,0.12)' }}>
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
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Fechar menu"
                className="absolute top-4 right-4 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-white/70 hover:text-white"
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
