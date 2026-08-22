export const dynamic = 'force-dynamic';

// Conexão do gabinete com o Google Agenda.
//
//   GET    → status da conexão (para a tela decidir o que mostrar)
//   POST   → inicia a autorização; devolve a URL de consentimento
//   DELETE → desconecta
//
// A troca do código pelo token acontece em ./callback.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { googleConfigurado, urlDeConsentimento } from '@/lib/google-agenda';
import { assinarEstado } from '@/lib/google-agenda-estado';

/** Só quem administra o gabinete conecta a agenda oficial. */
const PAPEIS_PERMITIDOS = new Set(['ADMIN', 'SUPER_ADMIN', 'CHEFE', 'AGENTE_POLITICO']);

function redirectUri(request: NextRequest): string {
  const host = request.headers.get('host') ?? 'localhost:3000';
  const proto = host.startsWith('localhost') ? 'http' : 'https';
  return `${proto}://${host}/api/agenda/google/callback`;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const gabineteId = (session.user as any)?.gabineteId;
    if (!gabineteId) return NextResponse.json({ error: 'Usuário sem gabinete' }, { status: 400 });

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
