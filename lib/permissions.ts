export type Role = 'ADMIN' | 'CHEFE' | 'ASSESSOR' | 'ANALISTA' | 'VISUALIZADOR';

export const ROLE_LABELS: Record<string, string> = {
  ADMIN:        'Administrador',
  CHEFE:        'Chefe de Gabinete',
  ASSESSOR:     'Assessor',
  ANALISTA:     'Analista',
  VISUALIZADOR: 'Visualizador',
};

export function isAdmin(role?: string | null): boolean {
  return role === 'ADMIN';
}

export function isChefe(role?: string | null): boolean {
  return role === 'CHEFE';
}

export function isAssessor(role?: string | null): boolean {
  return role === 'ASSESSOR';
}

export function canManageUsers(role?: string | null): boolean {
  return role === 'ADMIN' || role === 'CHEFE';
}

export function canManageContent(role?: string | null): boolean {
  return role === 'ADMIN' || role === 'CHEFE' || role === 'ASSESSOR';
}

export function hasFullAccess(role?: string | null): boolean {
  return role === 'ADMIN';
}

export function getRoleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}
