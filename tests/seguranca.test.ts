// Peças de segurança: validação do que as rotas recebem, criptografia dos
// tokens do Google e limite de tentativas (login, cadastro, convite).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const { banco } = await vi.hoisted(async () => (await import('./apoio')).criarAmbiente());
const consulta = vi.hoisted(() => ({ fn: (async () => [{ contagem: 1 }]) as (...a: any[]) => Promise<any> }));
// O banco simulado, com a consulta do limite de tentativas controlada pelo teste.
vi.mock('@/lib/db', () => ({
  prisma: new Proxy(banco.cliente, {
    get: (alvo, k) => (k === '$queryRaw' ? (...a: any[]) => consulta.fn(...a) : alvo[k as string]),
  }),
}));

import { conferir, lerCorpo, v } from '@/lib/validacao-api';
import { cifrarToken, decifrarToken } from '@/lib/cripto-tokens';
import { limiteDeTentativas, checkRateLimit } from '@/lib/rate-limit';
import { pedido } from './apoio';

const erro = async (r: unknown) => (r instanceof NextResponse ? (await r.json()).error : null);

describe('validação do que as rotas recebem', () => {
  const Cadastro = z.object({ nome: v.texto('o nome', 50), email: v.email(), senha: v.senha(), lat: v.latitude() }).passthrough();

  it('dados válidos passam intactos, com os campos a mais', () => {
    const entrada = { nome: '  Ana ', email: 'Ana@X.com', senha: '123456', lat: -15.8, extra: 1 };
    expect(conferir(entrada, Cadastro)).toEqual(entrada);
  });

  it('frases em português para cada problema', async () => {
    expect(await erro(conferir({ email: 'a@b.co', senha: '123456' }, Cadastro))).toBe('Informe o nome.');
    expect(await erro(conferir({ nome: '   ', email: 'a@b.co', senha: '123456' }, Cadastro))).toBe('Informe o nome.');
    expect(await erro(conferir({ nome: 'x'.repeat(51), email: 'a@b.co', senha: '123456' }, Cadastro))).toBe('Nome: no máximo 50 caracteres.');
    expect(await erro(conferir({ nome: 'Ana', email: { $gt: '' }, senha: '123456' }, Cadastro))).toBe('E-mail: valor inválido.');
    expect(await erro(conferir({ nome: 'Ana', email: 'semarroba', senha: '123456' }, Cadastro))).toBe('E-mail: endereço inválido.');
    expect(await erro(conferir({ nome: 'Ana', email: 'a@b.co', senha: '123' }, Cadastro))).toBe('A senha deve ter no mínimo 6 caracteres');
    expect(await erro(conferir({ nome: 'Ana', email: 'a@b.co', senha: '123456', lat: 200 }, Cadastro))).toBe('Latitude: valor fora do permitido.');
    expect(await erro(conferir([1, 2], Cadastro))).toBe('Dados inválidos: formato não esperado.');
  });

  it('conteúdo ilegível: 400 com frase, não erro 500', async () => {
    const req = new Request('http://localhost/x', { method: 'POST', body: '{nao é json' });
    const r = await lerCorpo(req, Cadastro);
    expect(r instanceof NextResponse && r.status).toBe(400);
  });
});

describe('criptografia dos tokens do Google', () => {
  const token = '1//0-refresh-token-de-teste';
  beforeEach(() => { delete process.env.GOOGLE_TOKEN_KEY; });

  it('sem chave: grava e lê como antes', () => {
    expect(cifrarToken(token)).toBe(token);
    expect(decifrarToken(token)).toBe(token);
  });

  it('com chave: cifra, decifra e continua lendo o texto puro antigo', () => {
    process.env.GOOGLE_TOKEN_KEY = crypto.randomBytes(32).toString('base64');
    const c = cifrarToken(token);
    expect(c.startsWith('enc:v1:')).toBe(true);
    expect(c).not.toContain('refresh-token');
    expect(decifrarToken(c)).toBe(token);
    expect(cifrarToken(c)).toBe(c);
    expect(decifrarToken(token)).toBe(token);
  });

  it('chave errada ou cifra adulterada: recusado', () => {
    process.env.GOOGLE_TOKEN_KEY = crypto.randomBytes(32).toString('base64');
    const c = cifrarToken(token);
    process.env.GOOGLE_TOKEN_KEY = crypto.randomBytes(32).toString('base64');
    expect(() => decifrarToken(c)).toThrow();
  });
});

describe('limite de tentativas', () => {
  it('libera até o limite, barra depois (contagem do banco)', async () => {
    let n = 0;
    consulta.fn = async () => [{ contagem: ++n }];
    const r = [];
    for (let i = 0; i < 10; i++) r.push(await limiteDeTentativas('login:email:x', 8, 60_000));
    expect(r).toEqual([true, true, true, true, true, true, true, true, false, false]);
  });

  it('banco fora do ar: cai para o limite em memória, sem travar o login', async () => {
    consulta.fn = async () => { throw new Error('banco indisponível'); };
    const r = [];
    for (let i = 0; i < 4; i++) r.push(await limiteDeTentativas('cadastro:1.2.3.4', 3, 60_000));
    expect(r).toEqual([true, true, true, false]);
  });

  it('limite em memória isolado por chave', () => {
    expect(checkRateLimit('a', 1, 60_000)).toBe(true);
    expect(checkRateLimit('a', 1, 60_000)).toBe(false);
    expect(checkRateLimit('b', 1, 60_000)).toBe(true);
  });
});

// Cadastro aberto não entra em gabinete existente (desde 29/10/2026).
describe('cadastro aberto', () => {
  it('entrar em gabinete existente sem convite: recusado', async () => {
    consulta.fn = async () => [{ contagem: 1 }];
    banco.limpar();
    banco.tabelas.user = [{ id: 'alguem' }];
    banco.tabelas.gabinete = [{ id: 'g1', nome: 'Gabinete X' }];
    const { POST } = await import('@/app/api/signup/route');
    const r = await POST(pedido('/api/signup', 'POST', { name: 'Ana', email: 'ana@x.com', password: '123456', role: 'ASSESSOR', gabineteId: 'g1' }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/link de convite/);
    expect(banco.pediu('user.create')).toEqual([]);
  });
});
