// O verificador único (exigirAcesso): login, permissão da área, papel e
// gabinete — com as respostas que as telas esperam (401, 403, 400).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const { sessao, banco } = await vi.hoisted(async () => (await import('./apoio')).criarAmbiente());
vi.mock('next-auth', () => ({ getServerSession: async () => sessao.atual }));
vi.mock('@/lib/auth-options', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ prisma: banco.cliente }));

import { exigirAcesso } from '@/lib/acesso-api';
import { PERMISSIONS } from '@/lib/permissions';
import { usuarios, GAB_A } from './apoio';

const status = (r: unknown) => (r instanceof NextResponse ? r.status : 'ok');

beforeEach(() => { sessao.atual = null; banco.limpar(); });

describe('exigirAcesso', () => {
  it('sem login: 401', async () => {
    expect(status(await exigirAcesso())).toBe(401);
  });

  it('logado, sem exigência: segue com id, papel e gabinete', async () => {
    sessao.atual = { user: usuarios.chefeA };
    const r = await exigirAcesso();
    expect(r).toMatchObject({ userId: 'chefe-a', role: 'CHEFE', gabineteId: GAB_A });
  });

  it('assessor sem a área liberada: 403; com a área: segue', async () => {
    sessao.atual = { user: usuarios.assessorA([]) };
    expect(status(await exigirAcesso({ permissoes: [PERMISSIONS.CONTATOS] }))).toBe(403);
    sessao.atual = { user: usuarios.assessorA([PERMISSIONS.CONTATOS]) };
    expect(status(await exigirAcesso({ permissoes: [PERMISSIONS.CONTATOS] }))).toBe('ok');
  });

  it('rota de duas áreas: basta uma', async () => {
    sessao.atual = { user: usuarios.assessorA([PERMISSIONS.MAPA_GABINETE]) };
    expect(status(await exigirAcesso({ permissoes: [PERMISSIONS.DEMANDAS, PERMISSIONS.MAPA_GABINETE] }))).toBe('ok');
  });

  it('chefe tem as áreas comuns, mas não a restrita (Colaboradores) sem liberação', async () => {
    sessao.atual = { user: usuarios.chefeA };
    expect(status(await exigirAcesso({ permissoes: [PERMISSIONS.CONTATOS] }))).toBe('ok');
    expect(status(await exigirAcesso({ permissoes: [PERMISSIONS.COLABORADORES_CAMPANHA] }))).toBe(403);
    sessao.atual = { user: { ...usuarios.chefeA, permissions: [PERMISSIONS.COLABORADORES_CAMPANHA] } };
    expect(status(await exigirAcesso({ permissoes: [PERMISSIONS.COLABORADORES_CAMPANHA] }))).toBe('ok');
  });

  it('papéis: fora da lista é 403', async () => {
    sessao.atual = { user: usuarios.chefeA };
    expect(status(await exigirAcesso({ papeis: ['ADMIN', 'SUPER_ADMIN'] }))).toBe(403);
    sessao.atual = { user: usuarios.admin };
    expect(status(await exigirAcesso({ papeis: ['ADMIN', 'SUPER_ADMIN'] }))).toBe('ok');
  });

  it('gabinete exigido e ausente: 400', async () => {
    sessao.atual = { user: usuarios.semGabinete };
    expect(status(await exigirAcesso({ gabinete: 'sessao' }))).toBe(400);
  });

  it("gabinete 'banco': relê do cadastro, não da sessão", async () => {
    sessao.atual = { user: { ...usuarios.chefeA, gabineteId: 'gabinete-velho-da-sessao' } };
    banco.responder('user.findUnique', () => ({ gabineteId: GAB_A }));
    const r = await exigirAcesso({ gabinete: 'banco' });
    expect(r).toMatchObject({ gabineteId: GAB_A });
    expect(banco.pediu('user.findUnique')[0].args.where).toEqual({ id: 'chefe-a' });
  });
});
