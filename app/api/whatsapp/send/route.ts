export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { isConfigured, sendText, getConnectionState, makeInstanceName, motivoDaFalha } from '@/lib/evolution';

function normalizeWA(n: string): string {
  const d = n.replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) return d;
  if (d.length >= 10) return `55${d}`;
  return d;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const gabineteId = (session.user as any)?.gabineteId;

  // Usuário sem gabinete é possível (User.gabineteId é opcional, e o middleware
  // só barra quem não foi aprovado). Sem esta guarda a busca do gabinete ia com
  // id indefinido e a pessoa recebia um erro de banco na tela, em vez de uma
  // frase. Todas as rotas irmãs já tratam isso assim.
  if (!gabineteId) {
    return NextResponse.json({ error: 'Usuário sem gabinete associado' }, { status: 400 });
  }

  if (!isConfigured()) {
    return NextResponse.json({ error: 'WhatsApp não configurado. Conecte um número em Configurações.' }, { status: 503 });
  }

  const gabinete = await prisma.gabinete.findUnique({ where: { id: gabineteId } });
  const instanceName = gabinete?.whatsappInstanceId ?? makeInstanceName(gabineteId);

  // Verifica estado real na Evolution API — não depende apenas do DB
  const connState = await getConnectionState(instanceName);
  if (connState !== 'open') {
    return NextResponse.json({ error: 'Nenhum número conectado. Acesse Configurações para escanear o QR Code.' }, { status: 503 });
  }

  // Sincroniza DB se estava desatualizado (instância conectada mas DB sem o nome)
  if (!gabinete?.whatsappInstanceId) {
    await prisma.gabinete.update({
      where: { id: gabineteId },
      data: { whatsappInstanceId: instanceName },
    }).catch(() => {});
  }

  const body = await request.json();
  const { numero, message } = body as { numero: string; message: string };

  if (!numero || !message?.trim()) {
    return NextResponse.json({ error: 'Número e mensagem são obrigatórios' }, { status: 400 });
  }

  const to = normalizeWA(numero);
  if (to.length < 12) {
    return NextResponse.json({ error: `Número inválido: ${numero}` }, { status: 400 });
  }

  const { ok, data } = await sendText(instanceName, to, message);

  if (!ok) {
    // A resposta inteira vai para o log do servidor: é onde está o diagnóstico
    // quando a Evolution recusa sem explicar. Para a tela vai só a frase.
    console.error('[/api/whatsapp/send] recusado pela Evolution:', JSON.stringify(data));
    return NextResponse.json({ error: motivoDaFalha(data) }, { status: 500 });
  }

  return NextResponse.json({ success: true, messageId: data?.key?.id });
}
