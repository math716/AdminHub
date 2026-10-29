// Validação do que as rotas de API recebem.
//
// O corpo da requisição ia quase direto para o banco: um campo com o tipo
// errado (um objeto no lugar do e-mail, um número no lugar do nome) virava
// erro 500 do Prisma, e um texto de megabytes era gravado sem reclamar. Aqui
// cada rota declara o formato esperado e recebe de volta os dados conferidos
// ou uma resposta 400 com uma frase que a tela pode mostrar como está.
//
// Os validadores CONFEREM, não transformam: nada é aparado, convertido nem
// descartado (campos a mais seguem junto — `.passthrough()`), para a rota
// continuar gravando exatamente o que gravava antes.
//
//   const body = await lerCorpo(request, z.object({ nome: v.texto('o nome', 200) }).passthrough());
//   if (body instanceof NextResponse) return body;

import { NextResponse } from 'next/server';
import { z } from 'zod';

/** Lê o JSON do pedido e confere com o esquema. 400 com a frase do primeiro problema. */
export async function lerCorpo<S extends z.ZodTypeAny>(req: Request, esquema: S): Promise<z.infer<S> | NextResponse> {
  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    return NextResponse.json({ error: 'Dados inválidos: o conteúdo enviado não pôde ser lido.' }, { status: 400 });
  }
  return conferir(bruto, esquema);
}

/** Confere um valor já lido (ex.: campos de um formulário). */
export function conferir<S extends z.ZodTypeAny>(bruto: unknown, esquema: S): z.infer<S> | NextResponse {
  const r = esquema.safeParse(bruto);
  if (r.success) return r.data;
  const problema = r.error.issues[0];
  // As frases do `v` já vêm em português. As padrão do zod ("Expected object,
  // received array", "Required"…) não — essas viram uma frase genérica.
  const emIngles = !problema || /^(Expected|Required|Invalid|String must|Number must|Array must|Unrecognized)/.test(problema.message);
  const frase = !emIngles
    ? problema.message
    : problema?.path.length
      ? `Campo "${problema.path.join('.')}": valor inválido.`
      : 'Dados inválidos: formato não esperado.';
  return NextResponse.json({ error: frase }, { status: 400 });
}

// ── Construtores com mensagens em português ─────────────────────────────────
// `rotulo` vem com o artigo ("o nome", "a senha"): vira "Informe o nome." e
// "Nome: no máximo 200 caracteres."

const semArtigo = (rotulo: string) => {
  const s = rotulo.replace(/^(o|a|os|as) /i, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function texto(rotulo: string, max: number) {
  return z
    .string({ required_error: `Informe ${rotulo}.`, invalid_type_error: `${semArtigo(rotulo)}: valor inválido.` })
    .refine(s => s.trim().length > 0, `Informe ${rotulo}.`)
    .refine(s => s.length <= max, `${semArtigo(rotulo)}: no máximo ${max} caracteres.`);
}

function textoOpcional(rotulo: string, max: number) {
  return z
    .string({ invalid_type_error: `${semArtigo(rotulo)}: valor inválido.` })
    .max(max, `${semArtigo(rotulo)}: no máximo ${max} caracteres.`)
    .nullish();
}

function numero(rotulo: string, min = -Number.MAX_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  return z
    .number({ required_error: `Informe ${rotulo}.`, invalid_type_error: `${semArtigo(rotulo)}: precisa ser um número.` })
    .finite(`${semArtigo(rotulo)}: precisa ser um número.`)
    .min(min, `${semArtigo(rotulo)}: valor fora do permitido.`)
    .max(max, `${semArtigo(rotulo)}: valor fora do permitido.`);
}

export const v = {
  texto,
  textoOpcional,
  numero,
  numeroOpcional: (rotulo: string, min?: number, max?: number) => numero(rotulo, min, max).nullish(),
  /** Inteiro (votos, metas): o banco recusa casas decimais. */
  inteiroOpcional: (rotulo: string) =>
    numero(rotulo, 0).int(`${semArtigo(rotulo)}: precisa ser um número inteiro.`).nullish(),
  /** Para campos que a rota já converte com Number()/parseInt (ano, valor): número ou texto curto. */
  numeroOuTexto: (rotulo: string) =>
    z.union([z.number(), z.string().max(30)], { errorMap: () => ({ message: `${semArtigo(rotulo)}: valor inválido.` }) }).nullish(),
  /** Latitude/longitude: número no intervalo do globo, ou vazio. */
  latitude: () => numero('a latitude', -90, 90).nullish(),
  longitude: () => numero('a longitude', -180, 180).nullish(),
  /** Identificador de registro (cuid/uuid). */
  id: (rotulo: string) => texto(rotulo, 64),
  idOpcional: (rotulo: string) => textoOpcional(rotulo, 64),
  email: (rotulo = 'o e-mail') =>
    texto(rotulo, 254).refine(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim()), `${semArtigo(rotulo)}: endereço inválido.`),
  /** Senha: mínimo de 6 (o que as telas dizem); teto evita hash de megabytes. */
  senha: (rotulo = 'a senha') =>
    z.string({ required_error: `Informe ${rotulo}.`, invalid_type_error: `${semArtigo(rotulo)}: valor inválido.` })
      .min(6, 'A senha deve ter no mínimo 6 caracteres')
      .max(200, `${semArtigo(rotulo)}: no máximo 200 caracteres.`),
  /** Data em texto que o JavaScript entende (ISO, "2026-10-29", etc.). */
  data: (rotulo: string) =>
    texto(rotulo, 40).refine(s => !Number.isNaN(new Date(s).getTime()), `${semArtigo(rotulo)}: data inválida.`),
  dataOpcional: (rotulo: string) =>
    textoOpcional(rotulo, 40).refine(s => !s || !Number.isNaN(new Date(s).getTime()), `${semArtigo(rotulo)}: data inválida.`),
  booleanoOpcional: (rotulo: string) =>
    z.boolean({ invalid_type_error: `${semArtigo(rotulo)}: valor inválido.` }).nullish(),
  /** Lista com teto de itens. */
  lista: <T extends z.ZodTypeAny>(rotulo: string, item: T, max: number) =>
    z.array(item, { required_error: `Informe ${rotulo}.`, invalid_type_error: `${semArtigo(rotulo)}: valor inválido.` })
      .max(max, `${semArtigo(rotulo)}: no máximo ${max} itens.`),
};
