// Quem é o gabinete que está falando com a Gabi.
//
// Sem isto ela conversa com um desconhecido, e os relatórios saem cheios de
// "SE você tem emendas nesse recorte", "SE o parlamentar tem emendas de
// segurança". É a diferença mais visível entre uma assessora e um buscador.
//
// Nada disso é pedido ao usuário: tudo sai do que o banco já tem. O nome do
// gabinete quase sempre É o nome do parlamentar ("Ricardo Molina", "Tarcisio de
// Freitas"), então basta procurá-lo na base de parlamentares.

import { prisma } from '@/lib/db';

/** Palavras que descrevem o cargo ou a caixa, não a pessoa. */
const RUIDO = new Set([
  'gabinete', 'deputado', 'deputada', 'senador', 'senadora', 'vereador',
  'vereadora', 'prefeito', 'prefeita', 'governador', 'governadora',
  'assessoria', 'mandato', 'equipe', 'escritorio', 'do', 'da', 'de', 'dos', 'das',
]);

const COMBINANTES = new RegExp(
  '[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');

function semAcento(s: string): string {
  return s.normalize('NFD').replace(COMBINANTES, '').toLowerCase().trim();
}

/** As palavras do nome do gabinete que podem identificar uma pessoa. */
function palavrasDoNome(nome: string): string[] {
  return semAcento(nome)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(p => p.length > 2 && !RUIDO.has(p));
}

export interface ContextoGabinete {
  nome: string;
  parlamentar?: { nome: string; cargo: string; partido?: string | null; uf?: string | null };
  uf?: string;
  conversasRecentes: string[];
}

/**
 * Procura, na base de parlamentares, alguém cujo nome case com o do gabinete.
 *
 * Conservador de propósito: só devolve quando UM único parlamentar bate com
 * TODAS as palavras úteis do nome. Apresentar a pessoa errada é pior que não
 * apresentar ninguém — a Gabi passaria a resposta inteira falando de outro
 * mandato com toda a confiança.
 */
async function acharParlamentar(nomeGabinete: string) {
  const palavras = palavrasDoNome(nomeGabinete);
  if (palavras.length === 0) return undefined;

  const candidatos = await prisma.parlamentar.findMany({
    where: { AND: palavras.map(p => ({ nome: { contains: p, mode: 'insensitive' as const } })) } as any,
    select: { nome: true, cargo: true, partido: true, uf: true },
    take: 5,
  }).catch(() => [] as any[]);

  return candidatos.length === 1 ? candidatos[0] : undefined;
}

/** UF onde o gabinete atua, pelo estado que mais aparece nas demandas dele. */
async function ufDasDemandas(gabineteId: string): Promise<string | undefined> {
  const porEstado = await prisma.demand.groupBy({
    by: ['estado'],
    where: { gabineteId },
    _count: { _all: true },
    orderBy: { _count: { estado: 'desc' } },
    take: 1,
  }).catch(() => [] as any[]);
  const uf = String(porEstado[0]?.estado ?? '').trim();
  return uf.length === 2 ? uf.toUpperCase() : undefined;
}

export async function contextoDoGabinete(gabineteId: string): Promise<ContextoGabinete | null> {
  try {
    const gab = await prisma.gabinete.findUnique({
      where: { id: gabineteId },
      select: { nome: true },
    });
    if (!gab?.nome) return null;

    const [parlamentar, uf, conversas] = await Promise.all([
      acharParlamentar(gab.nome),
      ufDasDemandas(gabineteId),
      prisma.gabiConversa.findMany({
        where: { gabineteId, titulo: { not: null } },
        orderBy: { criadaEm: 'desc' },
        select: { titulo: true },
        take: 6,
      }).catch(() => [] as any[]),
    ]);

    // Títulos repetidos não acrescentam contexto — o gabinete costuma refazer
    // a mesma consulta várias vezes no mesmo dia.
    const vistos = new Set<string>();
    const conversasRecentes = conversas
      .map((c: any) => String(c.titulo ?? '').trim())
      .filter((t: string) => t && !vistos.has(t) && vistos.add(t))
      .slice(0, 4);

    return {
      nome: gab.nome,
      parlamentar: parlamentar ?? undefined,
      uf: parlamentar?.uf ?? uf,
      conversasRecentes,
    };
  } catch {
    return null;   // contexto é bônus; nunca pode derrubar a conversa
  }
}

const CARGO_LEGIVEL: Record<string, string> = {
  DEPUTADO_FEDERAL: 'deputado federal', DEPUTADO_ESTADUAL: 'deputado estadual',
  DEPUTADO_DISTRITAL: 'deputado distrital', SENADOR: 'senador',
  GOVERNADOR: 'governador', PREFEITO: 'prefeito', VEREADOR: 'vereador',
};

/** O bloco de texto que vai para o modelo. Vazio quando não há o que dizer. */
export function blocoDoGabinete(ctx: ContextoGabinete | null): string {
  if (!ctx) return '';
  const linhas: string[] = [`Você está atendendo o gabinete "${ctx.nome}".`];

  if (ctx.parlamentar) {
    const cargo = CARGO_LEGIVEL[ctx.parlamentar.cargo] ?? String(ctx.parlamentar.cargo).toLowerCase();
    const partido = ctx.parlamentar.partido ? ` (${ctx.parlamentar.partido})` : '';
    const uf = ctx.parlamentar.uf ? `/${ctx.parlamentar.uf}` : '';
    linhas.push(
      `Na base, esse nome corresponde a ${ctx.parlamentar.nome}${partido}${uf}, ${cargo}. ` +
      'Trate como o parlamentar do gabinete: fale "suas emendas", "sua votação", ' +
      'e traga a posição dele sem esperarem pedir. ' +
      // O cargo evita um erro besta: governador e prefeito não têm emenda
      // parlamentar, e procurá-la devolveria vazio com cara de problema.
      'Respeite o CARGO: emenda parlamentar existe para quem tem mandato legislativo — ' +
      'de governador ou prefeito, busque votação e não emendas.',
    );
  } else {
    linhas.push(
      'Não foi possível identificar com segurança um parlamentar com esse nome na base. ' +
      'Não chute de quem é o gabinete: fale de forma neutra sobre os dados.',
    );
  }

  if (ctx.uf) linhas.push(`Estado de atuação: ${ctx.uf}. Use como padrão quando o usuário não disser o estado.`);

  if (ctx.conversasRecentes.length > 0) {
    linhas.push(
      `Assuntos recentes deste gabinete: ${ctx.conversasRecentes.join(' · ')}. ` +
      'Serve de contexto para entender pedidos curtos — não os repita nem os cite sem propósito.',
    );
  }

  return linhas.join('\n');
}
