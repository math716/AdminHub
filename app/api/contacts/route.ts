export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { exigirAcesso } from '@/lib/acesso-api';
import { z } from 'zod';
import { lerCorpo, v } from '@/lib/validacao-api';
import { PERMISSIONS } from '@/lib/permissions';

const NovoContato = z.object({
  nome:     v.texto('o nome', 200),
  numero:   v.texto('o número', 40),
  email:    v.textoOpcional('o e-mail', 254),
  endereco: v.textoOpcional('o endereço', 500),
  lat:      v.latitude(),
  lng:      v.longitude(),
}).passthrough();

export async function GET() {
  try {
    const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.CONTATOS], gabinete: 'sessao' });
    if (acesso instanceof NextResponse) return acesso;
    const { gabineteId } = acesso;

    const contatos = await prisma.contato.findMany({
      where: { gabineteId },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { name: true } } },
    });

    return NextResponse.json(contatos ?? []);
  } catch (error) {
    console.error('Get contacts error:', error);
    return NextResponse.json({ error: 'Erro ao buscar contatos' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const acesso = await exigirAcesso({ permissoes: [PERMISSIONS.CONTATOS], gabinete: 'sessao' });
    if (acesso instanceof NextResponse) return acesso;
    const { userId, gabineteId } = acesso;

    const body = await lerCorpo(request, NovoContato);
    if (body instanceof NextResponse) return body;

    if (!body?.nome || !body?.numero) {
      return NextResponse.json({ error: 'Nome e número são obrigatórios' }, { status: 400 });
    }

    const contato = await prisma.contato.create({
      data: {
        nome: body.nome,
        numero: body.numero,
        email: body.email ?? null,
        endereco: body.endereco ?? null,
        lat: body.lat ?? null,
        lng: body.lng ?? null,
        gabineteId,
        createdById: userId,
      },
    });

    return NextResponse.json(contato);
  } catch (error) {
    console.error('Create contact error:', error);
    return NextResponse.json({ error: 'Erro ao criar contato' }, { status: 500 });
  }
}
