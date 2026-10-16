// Acesso ao Colaboradores de Campanha (rotas de colaboradores e padrinhos).
// Só ADMIN e SUPER_ADMIN, ou quem eles liberarem — ver PERMISSOES_RESTRITAS.

import { PERMISSIONS } from '@/lib/permissions';
import { semPermissao } from '@/lib/acesso-api';

export async function podeUsarColaboradores(session: any): Promise<boolean> {
  return semPermissao(session, PERMISSIONS.COLABORADORES_CAMPANHA) === null;
}
