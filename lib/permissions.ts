export type Role =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'AGENTE_POLITICO'
  | 'CHEFE'
  | 'ASSESSOR'
  | 'ANALISTA'
  | 'VISUALIZADOR';

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN:     'Super Admin',
  ADMIN:           'Administrador',
  AGENTE_POLITICO: 'Agente Político',
  CHEFE:           'Chefe de Gabinete',
  ASSESSOR:        'Assessor',
  ANALISTA:        'Analista',
  VISUALIZADOR:    'Visualizador',
};

export function isSuperAdmin(role?: string | null): boolean {
  return role === 'SUPER_ADMIN';
}

export function isAdmin(role?: string | null): boolean {
  return role === 'ADMIN';
}

export function isChefe(role?: string | null): boolean {
  return role === 'CHEFE';
}

export function isAssessor(role?: string | null): boolean {
  return role === 'ASSESSOR';
}

export function isAgentePolitico(role?: string | null): boolean {
  return role === 'AGENTE_POLITICO';
}

export function canManageUsers(role?: string | null): boolean {
  return role === 'ADMIN' || role === 'CHEFE';
}

export function canManageContent(role?: string | null): boolean {
  return role === 'ADMIN' || role === 'AGENTE_POLITICO' || role === 'CHEFE' || role === 'ASSESSOR';
}

export function hasFullAccess(role?: string | null): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'AGENTE_POLITICO';
}

export function getRoleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

// ─── Permissões granulares por feature ──────────────────────────────────────

export const PERMISSIONS = {
  MAPA_GABINETE:    'MAPA_GABINETE',
  CONTATOS:         'CONTATOS',
  AGENDA:           'AGENDA',
  DEMANDAS:         'DEMANDAS',
  PROJETO_CAMPANHA: 'PROJETO_CAMPANHA',
  MAPA_ELEITORAL:   'MAPA_ELEITORAL',
  EMENDAS_MAPA:     'EMENDAS_MAPA',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

export const PERMISSION_LABELS: Record<Permission, string> = {
  MAPA_GABINETE:    'Mapa do Gabinete',
  CONTATOS:         'Contatos',
  AGENDA:           'Agenda',
  DEMANDAS:         'Demandas',
  PROJETO_CAMPANHA: 'Projeto de Campanha',
  MAPA_ELEITORAL:   'Mapa Eleitoral',
  EMENDAS_MAPA:     'Mapa de Emendas',
};

// Mapeia prefixo de rota → permissão exigida. Rotas não listadas (/dashboard,
// /dashboard/configuracoes, /dashboard/usuarios, /dashboard/favoritos) são livres
// para qualquer usuário autenticado — checagens de role acontecem nas próprias páginas.
export const PATH_PERMISSIONS: { prefix: string; permission: Permission }[] = [
  { prefix: '/dashboard/mapa-demandas', permission: PERMISSIONS.MAPA_GABINETE    },
  { prefix: '/dashboard/contatos',      permission: PERMISSIONS.CONTATOS         },
  { prefix: '/dashboard/agenda',        permission: PERMISSIONS.AGENDA           },
  { prefix: '/dashboard/demandas',      permission: PERMISSIONS.DEMANDAS         },
  { prefix: '/dashboard/mapa-campanha', permission: PERMISSIONS.PROJETO_CAMPANHA },
  { prefix: '/dashboard/mapa',          permission: PERMISSIONS.MAPA_ELEITORAL   },
  { prefix: '/dashboard/emendas',       permission: PERMISSIONS.EMENDAS_MAPA     },
];

export function requiredPermissionForPath(pathname: string): Permission | null {
  const match = PATH_PERMISSIONS.find(
    (p) => pathname === p.prefix || pathname.startsWith(`${p.prefix}/`),
  );
  return match?.permission ?? null;
}

interface PermissionContext {
  role?: string | null;
  permissions?: string[] | null;
}

// Permissões concedidas automaticamente por role, independente do array do banco.
const ROLE_DEFAULT_PERMISSIONS: Partial<Record<string, Permission[]>> = {
  CHEFE: [PERMISSIONS.EMENDAS_MAPA],
};

// ADMIN e AGENTE_POLITICO sempre têm todas as permissões. O escopo de gabinete
// do AGENTE_POLITICO é aplicado nas queries (via gabineteId), não aqui.
// Demais roles dependem do array permissions[] do banco + defaults acima.
export function hasPermission(
  user: PermissionContext | null | undefined,
  permission: Permission,
): boolean {
  if (!user?.role) return false;
  if (hasFullAccess(user.role)) return true;
  const roleDefaults = ROLE_DEFAULT_PERMISSIONS[user.role] ?? [];
  if (roleDefaults.includes(permission)) return true;
  return Array.isArray(user.permissions) && user.permissions.includes(permission);
}
