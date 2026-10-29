// Um gabinete nunca lê nem altera os dados de outro.
//
// O banco simulado guarda registros do gabinete A e do B; o usuário logado é
// do A. As listas só podem pedir dados do A, e abrir/editar/apagar um registro
// do B pelo id tem de dar "não encontrado" sem gravar nada.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { sessao, banco } = await vi.hoisted(async () => (await import('./apoio')).criarAmbiente());
vi.mock('next-auth', () => ({ getServerSession: async () => sessao.atual }));
vi.mock('@/lib/auth-options', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ prisma: banco.cliente }));

import { pedido, usuarios, GAB_A, GAB_B } from './apoio';
import { PERMISSIONS } from '@/lib/permissions';
import * as contatos from '@/app/api/contacts/route';
import * as contato from '@/app/api/contacts/[id]/route';
import * as demandas from '@/app/api/demands/route';
import * as demanda from '@/app/api/demands/[id]/route';
import * as agenda from '@/app/api/agenda/route';
import * as evento from '@/app/api/agenda/[id]/route';
import * as colaboradores from '@/app/api/colaboradores/route';
import * as colaborador from '@/app/api/colaboradores/[id]/route';
import * as padrinhos from '@/app/api/padrinhos/route';
import * as padrinho from '@/app/api/padrinhos/[id]/route';

// Modelos que pertencem a um gabinete.
const DO_GABINETE = ['contato', 'demand', 'agendaEvent', 'colaborador', 'padrinho'];

/** Toda consulta a um modelo do gabinete, feita por uma LISTA, filtra pelo gabinete A. */
function listasSoDoGabineteA() {
  const fora = banco.chamadas.filter(c => {
    const [modelo] = c.alvo.split('.');
    return DO_GABINETE.includes(modelo) && c.args?.where?.gabineteId !== GAB_A;
  });
  expect(fora.map(c => `${c.alvo} where=${JSON.stringify(c.args?.where)}`)).toEqual([]);
}

/** Nada foi gravado em modelo do gabinete. */
function nadaGravado() {
  const gravou = banco.chamadas.filter(c => /\.(create|update|updateMany|delete|deleteMany|upsert)$/.test(c.alvo)
    && DO_GABINETE.includes(c.alvo.split('.')[0]));
  expect(gravou.map(c => c.alvo)).toEqual([]);
}

const params = { params: { id: 'registro-do-b' } };

beforeEach(() => {
  banco.limpar();
  // Chefe do A, com Colaboradores liberado (área restrita).
  sessao.atual = { user: { ...usuarios.chefeA, permissions: [PERMISSIONS.COLABORADORES_CAMPANHA] } };
  // Colaboradores e padrinhos releem o gabinete do cadastro.
  banco.tabelas.user = [{ id: 'chefe-a', gabineteId: GAB_A }];
  for (const m of DO_GABINETE) {
    banco.tabelas[m] = [
      { id: 'registro-do-a', gabineteId: GAB_A, createdById: 'chefe-a', nome: 'A', titulo: 'A', data: new Date() },
      { id: 'registro-do-b', gabineteId: GAB_B, createdById: 'chefe-b', nome: 'B', titulo: 'B', data: new Date() },
    ];
  }
});

describe('listas só trazem o gabinete de quem está logado', () => {
  it('contatos', async () => {
    const r = await contatos.GET();
    expect(r.status).toBe(200);
    listasSoDoGabineteA();
    expect((await r.json()).map((c: any) => c.id)).toEqual(['registro-do-a']);
  });
  it('demandas', async () => {
    expect((await demandas.GET(pedido('/api/demands'))).status).toBe(200);
    listasSoDoGabineteA();
  });
  it('agenda (inclusive a limpeza automática de eventos passados)', async () => {
    expect((await agenda.GET(pedido('/api/agenda?mes=10&ano=2026'))).status).toBe(200);
    expect(banco.pediu('agendaEvent.deleteMany').length).toBe(1);
    listasSoDoGabineteA();
  });
  it('colaboradores', async () => {
    expect((await colaboradores.GET(pedido('/api/colaboradores'))).status).toBe(200);
    listasSoDoGabineteA();
  });
  it('padrinhos', async () => {
    expect((await padrinhos.GET(pedido('/api/padrinhos'))).status).toBe(200);
    listasSoDoGabineteA();
  });
});

describe('registro de outro gabinete: não encontrado, nada gravado', () => {
  const casos: Array<[string, () => Promise<Response>]> = [
    ['editar contato', () => contato.PATCH(pedido('/api/contacts/x', 'PATCH', { nome: 'invasor' }), params)],
    ['apagar contato', () => contato.DELETE(pedido('/api/contacts/x', 'DELETE'), params)],
    ['abrir demanda', () => demanda.GET(pedido('/api/demands/x'), params)],
    ['editar demanda', () => demanda.PUT(pedido('/api/demands/x', 'PUT', { title: 'invasor' }), params)],
    ['apagar demanda', () => demanda.DELETE(pedido('/api/demands/x', 'DELETE'), params)],
    ['editar compromisso', () => evento.PUT(pedido('/api/agenda/x', 'PUT', { titulo: 'invasor' }), params)],
    ['apagar compromisso', () => evento.DELETE(pedido('/api/agenda/x', 'DELETE'), params)],
    ['editar colaborador', () => colaborador.PATCH(pedido('/api/colaboradores/x', 'PATCH', { nome: 'invasor' }), params)],
    ['apagar colaborador', () => colaborador.DELETE(pedido('/api/colaboradores/x', 'DELETE'), params)],
    ['editar padrinho', () => padrinho.PATCH(pedido('/api/padrinhos/x', 'PATCH', { nome: 'invasor' }), params)],
    ['apagar padrinho', () => padrinho.DELETE(pedido('/api/padrinhos/x', 'DELETE'), params)],
  ];
  for (const [nome, chamar] of casos) {
    it(nome, async () => {
      const r = await chamar();
      expect(r.status).toBe(404);
      nadaGravado();
    });
  }
});

describe('o próprio gabinete continua funcionando', () => {
  it('editar contato do A grava no registro do A', async () => {
    const r = await contato.PATCH(pedido('/api/contacts/x', 'PATCH', { nome: 'novo nome' }), { params: { id: 'registro-do-a' } });
    expect(r.status).toBe(200);
    expect(banco.pediu('contato.update')[0].args.where).toEqual({ id: 'registro-do-a' });
  });
  it('apagar compromisso do A', async () => {
    const r = await evento.DELETE(pedido('/api/agenda/x', 'DELETE'), { params: { id: 'registro-do-a' } });
    expect(r.status).toBe(200);
    expect(banco.pediu('agendaEvent.delete')[0].args.where).toEqual({ id: 'registro-do-a' });
  });
});
