export const dynamic = 'force-dynamic';

// Teto declarado de propósito. A geolocalização consulta um serviço externo que
// aceita uma pergunta por segundo, então a importação tem um orçamento de tempo
// próprio (ORCAMENTO_GEO_MS) sempre menor que este teto: quando o orçamento
// acaba, o resto entra sem coordenada e a gravação acontece do mesmo jeito.
// Antes não havia orçamento nenhum — acima de ~275 endereços a rota estourava
// e, como a gravação vinha depois do laço, a importação inteira se perdia.
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { geocodificarLote, ancoraDoGabinete } from '@/lib/geocode';

const MAX_CONTATOS = 500;
const ORCAMENTO_GEO_MS = 150_000;

/** Só os dígitos: é o que identifica a mesma pessoa em formatos diferentes
 *  ("(11) 98888-7777" e "11988887777" são o mesmo número). */
function soDigitos(numero: string): string {
  return numero.replace(/\D/g, '');
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const userId = (session.user as any)?.id;
    const gabineteId = (session.user as any)?.gabineteId;

    if (!gabineteId) {
      return NextResponse.json({ error: 'Usuário sem gabinete associado' }, { status: 400 });
    }

    const body = await request.json();
    const contatos: Array<{ nome: string; numero: string; email?: string; endereco?: string }> =
      body?.contatos ?? [];

    if (!Array.isArray(contatos) || contatos.length === 0) {
      return NextResponse.json({ error: 'Nenhum contato enviado' }, { status: 400 });
    }
    if (contatos.length > MAX_CONTATOS) {
      return NextResponse.json({ error: `Máximo de ${MAX_CONTATOS} contatos por importação` }, { status: 400 });
    }

    const comDados = contatos.filter((c) => c.nome?.trim() && c.numero?.trim());
    if (comDados.length === 0) {
      return NextResponse.json({ error: 'Nenhum contato com nome e número válidos' }, { status: 400 });
    }

    // ── Repetidos ────────────────────────────────────────────────────────────
    // A base de contatos é a lista de disparo: um número repetido vira uma
    // mensagem a mais para a mesma pessoa. Antes a rota gravava tudo com
    // `skipDuplicates: false`, e a tabela não tem restrição de unicidade — quem
    // importasse o mesmo arquivo duas vezes ficava com a base dobrada, sem aviso.
    const jaNoGabinete = new Set(
      (await prisma.contato.findMany({ where: { gabineteId }, select: { numero: true } }))
        .map((c) => soDigitos(c.numero)),
    );

    const vistos = new Set<string>();
    const validos: typeof comDados = [];
    for (const c of comDados) {
      const chave = soDigitos(c.numero);
      if (!chave || vistos.has(chave) || jaNoGabinete.has(chave)) continue;
      vistos.add(chave);
      validos.push(c);
    }

    const repetidos = comDados.length - validos.length;

    if (validos.length === 0) {
      return NextResponse.json({
        imported: 0,
        errors: contatos.length - comDados.length,
        repetidos,
        geocodificados: 0,
        semCoordenada: 0,
      });
    }

    // ── Coordenadas ──────────────────────────────────────────────────────────
    // Usa a biblioteca do sistema em vez de perguntar direto ao serviço de
    // mapas. Ela recusa texto que descreve um compromisso em vez de um lugar e
    // confere se o resultado bate com o número da via — sem isso, "Residência"
    // virava um ponto em Fortaleza, "Sede" em Pelotas e "Rua das Flores, 123"
    // virava a Rua XV de Novembro, em Curitiba. Esses pinos vão para o mapa do
    // gabinete, então o endereço errado é pior do que endereço nenhum.
    //
    // A âncora enviesa a busca para a região do gabinete, o que resolve os
    // homônimos de cidade — que no Brasil são muitos.
    const ancora = await ancoraDoGabinete(gabineteId).catch(() => undefined);
    const coords = await geocodificarLote(
      validos.map((c) => ({ endereco: c.endereco?.trim() || null })),
      { ancora, maximo: validos.length, orcamentoMs: ORCAMENTO_GEO_MS },
    );

    await prisma.contato.createMany({
      data: validos.map((c, i) => ({
        nome: c.nome.trim(),
        numero: c.numero.trim(),
        email: c.email?.trim() || null,
        endereco: c.endereco?.trim() || null,
        lat: coords[i]?.lat ?? null,
        lng: coords[i]?.lng ?? null,
        gabineteId,
        createdById: userId,
      })),
    });

    const geocodificados = coords.filter((c) => c !== null).length;
    // Quem tinha endereço mas ficou sem ponto no mapa: ou o orçamento de tempo
    // acabou, ou o endereço não foi reconhecido. A tela precisa poder dizer isso.
    const comEndereco = validos.filter((c) => c.endereco?.trim()).length;

    return NextResponse.json({
      imported: validos.length,
      errors: contatos.length - comDados.length,
      repetidos,
      geocodificados,
      semCoordenada: comEndereco - geocodificados,
    });
  } catch (error) {
    console.error('Import contacts error:', error);
    return NextResponse.json({ error: 'Erro ao importar contatos' }, { status: 500 });
  }
}
