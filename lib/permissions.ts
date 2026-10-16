export type Role =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'AGENTE_POLITICO'
  | 'CHEFE'
  | 'ASSESSOR';

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN:     'Super Admin',
  ADMIN:           'Administrador',
  AGENTE_POLITICO: 'Agente Político',
  CHEFE:           'Chefe de Gabinete',
  ASSESSOR:        'Assessor',
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
  return role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'AGENTE_POLITICO' || role === 'CHEFE';
}

export function getRoleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

// ─── Permissões granulares por feature ──────────────────────────────────────

export const PERMISSIONS = {
  MAPA_GABINETE:          'MAPA_GABINETE',
  CONTATOS:               'CONTATOS',
  AGENDA:                 'AGENDA',
  DEMANDAS:               'DEMANDAS',
  PROJETO_CAMPANHA:       'PROJETO_CAMPANHA',
  MAPA_ELEITORAL:         'MAPA_ELEITORAL',
  EMENDAS_MAPA:           'EMENDAS_MAPA',
  COLABORADORES_CAMPANHA: 'COLABORADORES_CAMPANHA',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

export const PERMISSION_LABELS: Record<Permission, string> = {
  MAPA_GABINETE:          'Mapa do Gabinete',
  CONTATOS:               'Contatos',
  AGENDA:                 'Agenda',
  DEMANDAS:               'Demandas',
  PROJETO_CAMPANHA:       'Projeto de Campanha',
  MAPA_ELEITORAL:         'Mapa Eleitoral',
  EMENDAS_MAPA:           'Mapa de Emendas',
  COLABORADORES_CAMPANHA: 'Colaboradores de Campanha',
};

// Mapeia prefixo de rota → permissão exigida. Rotas não listadas (/dashboard,
// /dashboard/configuracoes, /dashboard/usuarios, /dashboard/favoritos) são livres
// para qualquer usuário autenticado — checagens de role acontecem nas próprias páginas.
export const PATH_PERMISSIONS: { prefix: string; permission: Permission }[] = [
  { prefix: '/dashboard/mapa-demandas',   permission: PERMISSIONS.MAPA_GABINETE          },
  { prefix: '/dashboard/contatos',        permission: PERMISSIONS.CONTATOS               },
  { prefix: '/dashboard/agenda',          permission: PERMISSIONS.AGENDA                 },
  { prefix: '/dashboard/demandas',        permission: PERMISSIONS.DEMANDAS               },
  { prefix: '/dashboard/mapa-campanha',   permission: PERMISSIONS.PROJETO_CAMPANHA       },
  { prefix: '/dashboard/mapa',            permission: PERMISSIONS.MAPA_ELEITORAL         },
  { prefix: '/dashboard/emendas',         permission: PERMISSIONS.EMENDAS_MAPA           },
  { prefix: '/dashboard/colaboradores',   permission: PERMISSIONS.COLABORADORES_CAMPANHA },
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

// ADMIN, AGENTE_POLITICO e CHEFE sempre têm todas as permissões. O escopo de gabinete
// é aplicado nas queries (via gabineteId), não aqui.
// Demais roles dependem do array permissions[] do banco.
//
// Exceção: as permissões RESTRITAS não vêm automáticas para Agente Político e
// Chefe. Só ADMIN e SUPER_ADMIN têm sempre; os demais, só se um ADMIN ou
// SUPER_ADMIN marcar para aquele usuário.
export function hasPermission(
  user: PermissionContext | null | undefined,
  permission: Permission,
): boolean {
  if (!user?.role) return false;
  const marcada = Array.isArray(user.permissions) && user.permissions.includes(permission);
  if (ehPermissaoRestrita(permission)) return podeAtribuirRestritas(user.role) || marcada;
  if (hasFullAccess(user.role)) return true;
  return marcada;
}

// ─── Permissões restritas ───────────────────────────────────────────────────
// Colaboradores de Campanha organizou a campanha de 2026 e foi ocultado em
// out/2026: fica só com ADMIN e SUPER_ADMIN, que podem liberar para um usuário
// específico (inclusive político ou chefe). O Chefe de Gabinete não atribui.
export const PERMISSOES_RESTRITAS: Permission[] = [PERMISSIONS.COLABORADORES_CAMPANHA];

export function ehPermissaoRestrita(permission: string): boolean {
  return (PERMISSOES_RESTRITAS as string[]).includes(permission);
}

/** Quem pode ver e marcar as permissões restritas nos usuários. */
export function podeAtribuirRestritas(role?: string | null): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

/** Permissões que este papel pode marcar em outro usuário. */
export function permissoesAtribuiveis(role?: string | null): Permission[] {
  return podeAtribuirRestritas(role) ? ALL_PERMISSIONS : ALL_PERMISSIONS.filter(p => !ehPermissaoRestrita(p));
}

/**
 * Permissões que se pode editar num usuário: quem tem acesso a tudo
 * (Agente Político, Chefe) só tem as restritas para marcar.
 */
export function permissoesEditaveisDoUsuario(alvoRole: string | null | undefined, quemEditaRole?: string | null): Permission[] {
  const base = permissoesAtribuiveis(quemEditaRole);
  if (alvoRole === 'SUPER_ADMIN' || alvoRole === 'ADMIN') return [];
  return hasFullAccess(alvoRole) ? base.filter(ehPermissaoRestrita) : base;
}

/**
 * Junta o que foi enviado com o que o usuário já tinha, respeitando quem
 * edita: quem não pode atribuir restritas não as tira nem as põe (uma
 * restrita dada pelo ADMIN continua lá quando o Chefe edita as demais).
 */
export function mesclarPermissoes(enviadas: string[], atuais: string[], quemEditaRole?: string | null): string[] {
  const validas = enviadas.filter(p => (ALL_PERMISSIONS as string[]).includes(p));
  if (podeAtribuirRestritas(quemEditaRole)) return Array.from(new Set(validas));
  const restritasAtuais = atuais.filter(ehPermissaoRestrita);
  return Array.from(new Set([...validas.filter(p => !ehPermissaoRestrita(p)), ...restritasAtuais]));
}
