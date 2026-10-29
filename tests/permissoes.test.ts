// Cada área do sistema exige a sua permissão — nas rotas, não só no menu.
//
// Até 16/10/2026 as rotas conferiam só o login: quem não tinha a área liberada
// lia e gravava os dados dela chamando a rota direto. Aqui, (1) cada grupo de
// rotas cita a permissão da sua área e (2) um assessor sem nenhuma área
// liberada recebe 403 nas rotas de exemplo de cada uma.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const { sessao, banco } = await vi.hoisted(async () => (await import('./apoio')).criarAmbiente());
vi.mock('next-auth', () => ({ getServerSession: async () => sessao.atual }));
vi.mock('@/lib/auth-options', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ prisma: banco.cliente }));

import { pedido, usuarios } from './apoio';
import { PERMISSIONS } from '@/lib/permissions';

const RAIZ = path.join(__dirname, '..', 'app', 'api');

/** Pasta da rota → o que o arquivo precisa citar (qualquer um da lista). */
const AREAS: Array<[RegExp, string[]]> = [
  [/^contacts(\/|$)/, ['PERMISSIONS.CONTATOS']],
  [/^demands(\/|$)/, ['PERMISSIONS.DEMANDAS']],
  [/^agenda(\/(?!google\/callback)|$)/, ['PERMISSIONS.AGENDA']],
  [/^rotas$/, ['PERMISSIONS.AGENDA']],
  [/^(colaboradores|padrinhos)(\/|$)/, ['PERMISSIONS.COLABORADORES_CAMPANHA']],
  [/^(emendas-portal|emendas-nao-realizadas)(\/|$)/, ['PERMISSIONS.EMENDAS_MAPA']],
  [/^tse\//, ['PERMISSIONS.MAPA_ELEITORAL']],
  [/^favorites(\/|$)/, ['PERMISSIONS.MAPA_ELEITORAL', 'PERMISSIONS.EMENDAS_MAPA']],
  [/^(projecoes|parcerias)(\/|$)/, ['PERMISSIONS.PROJETO_CAMPANHA']],
  [/^dashboard\/mapa-gabinete$/, ['PERMISSIONS.MAPA_GABINETE']],
  [/^whatsapp\/send$/, ['PERMISSIONS.CONTATOS']],
  [/^whatsapp\/instance$/, ["'CHEFE'"]],
  [/^admin\//, ["'ADMIN'"]],
  [/^gabinetes(\/|$)/, ["'ADMIN'"]],
  [/^importacao\//, ["'SUPER_ADMIN'"]],
  [/^users\/\[id\]/, ["'ADMIN'"]],
  [/^users$/, ["'ADMIN'"]],
];

function rotas(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? rotas(p) : e.name === 'route.ts' ? [p] : [];
  });
}

describe('cada área cita a sua permissão', () => {
  it('todas as rotas das áreas', () => {
    const faltando: string[] = [];
    let conferidas = 0;
    for (const f of rotas(RAIZ)) {
      const rota = path.relative(RAIZ, path.dirname(f)).split(path.sep).join('/');
      const regra = AREAS.find(([re]) => re.test(rota));
      if (!regra) continue;
      conferidas++;
      const fonte = fs.readFileSync(f, 'utf8');
      if (!regra[1].some(t => fonte.includes(t))) faltando.push(`${rota}: esperava ${regra[1].join(' ou ')}`);
    }
    expect(conferidas).toBeGreaterThan(60);
    expect(faltando).toEqual([]);
  });
});

describe('assessor sem nenhuma área liberada recebe 403', () => {
  beforeEach(() => {
    banco.limpar();
    sessao.atual = { user: usuarios.assessorA([]) };
  });

  const casos: Array<[string, () => Promise<Response>]> = [
    ['contatos', async () => (await import('@/app/api/contacts/route')).GET()],
    ['demandas', async () => (await import('@/app/api/demands/route')).GET(pedido('/api/demands'))],
    ['agenda', async () => (await import('@/app/api/agenda/route')).GET(pedido('/api/agenda'))],
    ['colaboradores', async () => (await import('@/app/api/colaboradores/route')).GET(pedido('/api/colaboradores'))],
    ['emendas', async () => (await import('@/app/api/emendas-portal/resumo/route')).GET(pedido('/api/emendas-portal/resumo?uf=SP'))],
    ['mapa eleitoral', async () => (await import('@/app/api/tse/zonas-lista/route')).GET(pedido('/api/tse/zonas-lista?ano=2022&uf=SP'))],
    ['projeto de campanha', async () => (await import('@/app/api/projecoes/route')).GET(pedido('/api/projecoes'))],
    ['mapa do gabinete', async () => (await import('@/app/api/dashboard/mapa-gabinete/route')).GET()],
    ['usuários (administração)', async () => (await import('@/app/api/users/route')).GET()],
    ['lista de gabinetes (administração)', async () => (await import('@/app/api/gabinetes/route')).GET()],
  ];
  for (const [area, chamar] of casos) {
    it(area, async () => {
      expect((await chamar()).status).toBe(403);
      // Barrado antes de qualquer consulta ao banco.
      expect(banco.chamadas.filter(c => !c.alvo.startsWith('user.'))).toEqual([]);
    });
  }

  it('com a área liberada, a mesma rota responde', async () => {
    sessao.atual = { user: usuarios.assessorA([PERMISSIONS.CONTATOS]) };
    expect((await (await import('@/app/api/contacts/route')).GET()).status).toBe(200);
  });
});
