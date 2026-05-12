export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { isConfigured, sendText, makeInstanceName } from '@/lib/evolution';

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

  if (!isConfigured()) {
    return NextResponse.json({ error: 'WhatsApp não configurado. Conecte um número em Configurações.' }, { status: 503 });
  }

  const gabinete = await prisma.gabinete.findUnique({ where: { id: gabineteId } });
  const instanceName = gabinete?.whatsappInstanceId ?? makeInstanceName(gabineteId);

  if (!gabinete?.whatsappInstanceId) {
    return NextResponse.json({ error: 'Nenhum número conectado. Acesse Configurações para escanear o QR Code.' }, { status: 503 });
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
    return NextResponse.json({ error: data?.message ?? 'Erro ao enviar mensagem', details: data }, { status: 500 });
  }

  return NextResponse.json({ success: true, messageId: data?.key?.id });
}
