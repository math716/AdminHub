export const dynamic = 'force-dynamic';

// Conexão do gabinete com o Google Agenda.
//
//   GET    → status da conexão (para a tela decidir o que mostrar)
//   GET ?agendas=1 → as agendas que a conta enxerga, para escolher qual usar
//   POST   → inicia a autorização; devolve a URL de consentimento
//   PATCH  → troca a agenda sincronizada
//   DELETE → desconecta
//
// A troca do código pelo token acontece em ./callback.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { googleConfigurado, urlDeConsentimento, tokenValido, listarAgendas } from '@/lib/google-agenda';
import { assinarEstado } from '@/lib/google-agenda-estado';

/** Só quem administra o gabinete conecta a agenda oficial. */
const PAPEIS_PERMITIDOS = new Set(['ADMIN', 'SUPER_ADMIN', 'CHEFE', 'AGENTE_POLITICO']);

function redirectUri(request: NextRequest): string {
  const host = request.headers.get('host') ?? 'localhost:3000';
  const proto = host.startsWith('localhost') ? 'http' : 'https';
  return `${proto}://${host}/api/agenda/google/callback`;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const gabineteId = (session.user as any)?.gabineteId;
    if (!gabineteId) return NextResponse.json({ error: 'Usuário sem gabinete' }, { status: 400 });

    // ?agendas=1 — as agendas que a conta enxerga, para a pessoa escolher qual
    // sincronizar. Fica atrás de um parâmetro porque custa uma chamada ao
    // Google, e a tela de agenda consulta o estado a cada carregamento.
    if (request.nextUrl.searchParams.get('agendas') === '1') {
      const conexao = await prisma.googleAgendaConexao.findUnique({ where: { gabineteId } });
      if (!conexao) return NextResponse.json({ agendas: [] });
      try {
        const accessToken = await tokenValido(conexao);
        return NextResponse.json({
          agendas: await listarAgendas(accessToken),
          atual: conexao.calendarId,
        });
      } catch (e) {
        console.error('[/api/agenda/google?agendas=1]', e);
        return NextResponse.json(
          { error: 'Não consegui listar as agendas desta conta. Tente reconectar.' },
          { status: 502 },
        );
      }
    }

    const c = await prisma.googleAgendaConexao.findUnique({
      where: { gabineteId },
      select: {
        email: true, calendarId: true, ultimaSync: true, ultimoErro: true,
        eventosImportados: true, conectadoPorNome: true, createdAt: true,
      },
    });

    return NextResponse.json({
      disponivel: googleConfigurado(),  // false = faltam as credenciais no ambiente
      conectado: !!c,
      conexao: c,
    });
  } catch (error) {
    console.error('GET /api/agenda/google error:', error);
    return NextResponse.json({ error: 'Erro ao consultar a conexão' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const user = session.user as any;
    if (!user?.gabineteId) return NextResponse.json({ error: 'Usuário sem gabinete' }, { status: 400 });
    if (!PAPEIS_PERMITIDOS.has(user?.role)) {
      return NextResponse.json(
        { error: 'Apenas o chefe de gabinete ou administrador pode conectar a agenda.' },
        { status: 403 },
      );
    }
    if (!googleConfigurado()) {
      return NextResponse.json(
        { error: 'Integração com o Google ainda não configurada neste ambiente.' },
        { status: 503 },
      );
    }

    const url = urlDeConsentimento(redirectUri(request), assinarEstado(user.gabineteId, user.id));
    return NextResponse.json({ url });
  } catch (error) {
    console.error('POST /api/agenda/google error:', error);
    return NextResponse.json({ error: 'Erro ao iniciar a conexão' }, { status: 500 });
  }
}

/**
 * Troca a agenda sincronizada.
 *
 * Zerar o `syncToken` é obrigatório: ele é o marcador de "já vi até aqui"
 * DAQUELA agenda. Mantido, o Google devolveria 410 ou, pior, as mudanças da
 * agenda antiga. Sem ele, a próxima sincronização faz a carga cheia da nova.
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const user = session.user as any;
    if (!user?.gabineteId) return NextResponse.json({ error: 'Usuário sem gabinete' }, { status: 400 });
    if (!PAPEIS_PERMITIDOS.has(user?.role)) {
      return NextResponse.json({ error: 'Sem permissão para trocar a agenda.' }, { status: 403 });
    }

    const { calendarId } = await request.json();
    if (typeof calendarId !== 'string' || !calendarId.trim()) {
      return NextResponse.json({ error: 'Agenda não informada.' }, { status: 400 });
    }

    const conexao = await prisma.googleAgendaConexao.findUnique({
      where: { gabineteId: user.gabineteId },
    });
    if (!conexao) return NextResponse.json({ error: 'Nenhuma conta conectada.' }, { status: 400 });

    // Só aceita uma agenda que a conta realmente enxerga. Sem esta conferência,
    // um id qualquer entraria e a sincronização passaria a falhar em silêncio.
    const accessToken = await tokenValido(conexao);
    const agendas = await listarAgendas(accessToken);
    if (!agendas.some(a => a.id === calendarId)) {
      return NextResponse.json(
        { error: 'Esta conta não tem acesso a essa agenda.' },
        { status: 400 },
      );
    }

    await prisma.googleAgendaConexao.update({
      where: { id: conexao.id },
      data: { calendarId, syncToken: null, ultimoErro: null },
    });

    return NextResponse.json({ ok: true, calendarId });
  } catch (error) {
    console.error('PATCH /api/agenda/google error:', error);
    return NextResponse.json({ error: 'Erro ao trocar a agenda' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const user = session.user as any;
    if (!user?.gabineteId) return NextResponse.json({ error: 'Usuário sem gabinete' }, { status: 400 });
    if (!PAPEIS_PERMITIDOS.has(user?.role)) {
      return NextResponse.json({ error: 'Sem permissão para desconectar.' }, { status: 403 });
    }

    await prisma.googleAgendaConexao.deleteMany({ where: { gabineteId: user.gabineteId } });
    // Os eventos já importados PERMANECEM: apagá-los sumiria com compromissos
    // que a equipe já está usando. Eles deixam de ser atualizados, só isso.
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/agenda/google error:', error);
    return NextResponse.json({ error: 'Erro ao desconectar' }, { status: 500 });
  }
}
