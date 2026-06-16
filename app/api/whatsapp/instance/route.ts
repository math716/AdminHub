export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import {
  isConfigured, createInstance, getQrCode,
  getConnectionState, logoutInstance, deleteInstance, makeInstanceName,
} from '@/lib/evolution';

// GET — retorna status e QR code da instância do gabinete
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const userRole    = (session.user as any)?.role;
  const gabineteId  = (session.user as any)?.gabineteId;

  if (userRole !== 'ADMIN' && userRole !== 'CHEFE' && userRole !== 'SUPER_ADMIN' && userRole !== 'AGENTE_POLITICO') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  if (!isConfigured()) {
    return NextResponse.json({ configured: false });
  }

  const gabinete = await prisma.gabinete.findUnique({ where: { id: gabineteId } });
  if (!gabinete) return NextResponse.json({ error: 'Gabinete não encontrado' }, { status: 404 });

  const instanceName = gabinete.whatsappInstanceId ?? makeInstanceName(gabineteId);
  const state = await getConnectionState(instanceName);

  if (state === 'open') {
    // Sincroniza DB se o instanceName estava ausente (ex: após desconexão inconsistente)
    if (!gabinete.whatsappInstanceId) {
      await prisma.gabinete.update({
        where: { id: gabineteId },
        data: { whatsappInstanceId: instanceName },
      }).catch(() => {});
    }
    return NextResponse.json({ configured: true, connected: true, instanceName, state });
  }

  // Instância desconectada — retorna QR code
  const qrData = await getQrCode(instanceName);
  return NextResponse.json({
    configured: true,
    connected: false,
    instanceName,
    state,
    qrCode: qrData?.base64 ?? qrData?.qrcode?.base64 ?? null,
  });
}

// POST — cria nova instância para o gabinete
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const userRole   = (session.user as any)?.role;
  const gabineteId = (session.user as any)?.gabineteId;

  if (userRole !== 'ADMIN' && userRole !== 'CHEFE' && userRole !== 'SUPER_ADMIN' && userRole !== 'AGENTE_POLITICO') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  if (!isConfigured()) {
    return NextResponse.json({ error: 'Evolution API não configurada no servidor' }, { status: 503 });
  }

  const instanceName = makeInstanceName(gabineteId);
  const result = await createInstance(instanceName);

  if (result?.instance || result?.instanceName) {
    await prisma.gabinete.update({
      where: { id: gabineteId },
      data: { whatsappInstanceId: instanceName },
    });
    const qrData = await getQrCode(instanceName);
    return NextResponse.json({
      instanceName,
      qrCode: qrData?.base64 ?? qrData?.qrcode?.base64 ?? null,
    });
  }

  return NextResponse.json({ error: 'Erro ao criar instância', details: result }, { status: 500 });
}

// DELETE — desconecta e remove a instância
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const userRole   = (session.user as any)?.role;
  const gabineteId = (session.user as any)?.gabineteId;

  if (userRole !== 'ADMIN' && userRole !== 'CHEFE' && userRole !== 'SUPER_ADMIN' && userRole !== 'AGENTE_POLITICO') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const gabinete = await prisma.gabinete.findUnique({ where: { id: gabineteId } });
  const instanceName = gabinete?.whatsappInstanceId ?? makeInstanceName(gabineteId);

  // Logout da sessão WhatsApp antes de deletar a instância
  await logoutInstance(instanceName).catch(() => {});
  await deleteInstance(instanceName).catch(() => {});

  await prisma.gabinete.update({
    where: { id: gabineteId },
    data: { whatsappInstanceId: null },
  });

  return NextResponse.json({ success: true });
}
