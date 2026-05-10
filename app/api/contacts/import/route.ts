export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'AdminHub/1.0 (gabinete@adminhub.app)' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    return null;
  } catch {
    return null;
  }
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
    if (contatos.length > 500) {
      return NextResponse.json({ error: 'Máximo de 500 contatos por importação' }, { status: 400 });
    }

    const validos = contatos.filter((c) => c.nome?.trim() && c.numero?.trim());
    if (validos.length === 0) {
      return NextResponse.json({ error: 'Nenhum contato com nome e número válidos' }, { status: 400 });
    }

    // Geocodificar endereços (com delay para respeitar o rate limit do Nominatim)
    const coords: Array<{ lat: number | null; lng: number | null }> = validos.map(() => ({ lat: null, lng: null }));
    const comEndereco = validos.map((c, i) => ({ i, address: c.endereco?.trim() })).filter((x) => x.address);

    for (let j = 0; j < comEndereco.length; j++) {
      const { i, address } = comEndereco[j];
      const result = await geocodeAddress(address!);
      if (result) coords[i] = result;
      if (j < comEndereco.length - 1) await sleep(250);
    }

    await prisma.contato.createMany({
      data: validos.map((c, i) => ({
        nome: c.nome.trim(),
        numero: c.numero.trim(),
        email: c.email?.trim() || null,
        endereco: c.endereco?.trim() || null,
        lat: coords[i].lat,
        lng: coords[i].lng,
        gabineteId,
        createdById: userId,
      })),
      skipDuplicates: false,
    });

    const geocodificados = coords.filter((c) => c.lat !== null).length;

    return NextResponse.json({
      imported: validos.length,
      errors: contatos.length - validos.length,
      geocodificados,
    });
  } catch (error) {
    console.error('Import contacts error:', error);
    return NextResponse.json({ error: 'Erro ao importar contatos' }, { status: 500 });
  }
}
