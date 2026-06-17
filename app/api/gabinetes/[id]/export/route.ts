export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import * as XLSX from 'xlsx';

const CATEGORY_LABELS: Record<string, string> = {
  SAUDE: 'Saúde', EDUCACAO: 'Educação', INFRAESTRUTURA: 'Infraestrutura',
  ASSISTENCIA_SOCIAL: 'Assistência Social', SEGURANCA: 'Segurança',
  TRANSPORTE: 'Transporte', MEIO_AMBIENTE: 'Meio Ambiente',
  CULTURA: 'Cultura', ESPORTE: 'Esporte', OUTROS: 'Outros',
};
const STATUS_LABELS: Record<string, string> = {
  PENDENTE: 'Pendente', EM_ANDAMENTO: 'Em Andamento', RESOLVIDA: 'Resolvida',
};
const PRIORITY_LABELS: Record<string, string> = {
  BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta',
};
const TIPO_LABELS: Record<string, string> = {
  REUNIAO: 'Reunião', VISITA: 'Visita', EVENTO: 'Evento', COMPROMISSO: 'Compromisso',
};
const ROLE_LABELS: Record<string, string> = {
  AGENTE_POLITICO: 'Agente Político', CHEFE: 'Chefe de Gabinete',
  ASSESSOR: 'Assessor', ANALISTA: 'Analista', VISUALIZADOR: 'Visualizador',
  ADMIN: 'Administrador', SUPER_ADMIN: 'Super Admin',
};

function fmtDate(d: Date | string | null | undefined, withTime = false): string {
  if (!d) return '';
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
  if (withTime) { opts.hour = '2-digit'; opts.minute = '2-digit'; }
  return new Date(d).toLocaleDateString('pt-BR', opts);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userRole = (session.user as any)?.role;
    if (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    const gabinete = await prisma.gabinete.findUnique({ where: { id: params.id } });
    if (!gabinete) return NextResponse.json({ error: 'Gabinete não encontrado' }, { status: 404 });

    const [contatos, demandas, agenda, usuarios] = await Promise.all([
      prisma.contato.findMany({
        where: { gabineteId: params.id },
        orderBy: { nome: 'asc' },
      }),
      prisma.demand.findMany({
        where: { gabineteId: params.id },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.agendaEvent.findMany({
        where: { gabineteId: params.id },
        orderBy: { data: 'asc' },
      }),
      prisma.user.findMany({
        where: { gabineteId: params.id, deletedAt: null },
        orderBy: { name: 'asc' },
        select: { name: true, email: true, role: true, approved: true, createdAt: true },
      }),
    ]);

    const contatosRows = contatos.map(c => ({
      Nome:                c.nome,
      Telefone:            c.numero,
      'E-mail':            c.email     ?? '',
      Endereço:            c.endereco  ?? '',
      Latitude:            c.lat       ?? '',
      Longitude:           c.lng       ?? '',
      'Data de Cadastro':  fmtDate(c.createdAt),
    }));

    const demandasRows = demandas.map(d => ({
      Título:                d.title,
      Solicitante:           d.solicitante,
      'Contato/Telefone':    d.contato      ?? '',
      Status:                STATUS_LABELS[d.status]     ?? d.status,
      Prioridade:            PRIORITY_LABELS[d.priority] ?? d.priority,
      Categoria:             CATEGORY_LABELS[d.category] ?? d.category,
      Estado:                d.estado,
      Município:             d.municipio,
      Bairro:                d.bairro       ?? '',
      Endereço:              d.endereco     ?? '',
      Latitude:              d.lat          ?? '',
      Longitude:             d.lng          ?? '',
      Descrição:             d.description  ?? '',
      Observações:           d.observations ?? '',
      'Data de Abertura':    fmtDate(d.createdAt),
      'Data de Encerramento': fmtDate(d.closedAt),
    }));

    const agendaRows = agenda.map(e => ({
      Título:     e.titulo,
      Tipo:       TIPO_LABELS[e.tipo] ?? e.tipo,
      Data:       fmtDate(e.data, true),
      'Data Fim': fmtDate(e.dataFim, true),
      Local:      e.local     ?? '',
      Endereço:   e.endereco  ?? '',
      Latitude:   e.lat       ?? '',
      Longitude:  e.lng       ?? '',
      Descrição:  e.descricao ?? '',
    }));

    const usuariosRows = usuarios.map(u => ({
      Nome:               u.name,
      'E-mail':           u.email,
      Cargo:              ROLE_LABELS[u.role] ?? u.role,
      Status:             u.approved ? 'Aprovado' : 'Pendente',
      'Data de Cadastro': fmtDate(u.createdAt),
    }));

    const wb = XLSX.utils.book_new();

    const mkSheet = (rows: Record<string, unknown>[], placeholder: string) =>
      XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ Aviso: placeholder }]);

    XLSX.utils.book_append_sheet(wb, mkSheet(contatosRows,  'Nenhum contato cadastrado'),   'Contatos');
    XLSX.utils.book_append_sheet(wb, mkSheet(demandasRows,  'Nenhuma demanda cadastrada'),  'Demandas');
    XLSX.utils.book_append_sheet(wb, mkSheet(agendaRows,    'Nenhum evento cadastrado'),    'Agenda');
    XLSX.utils.book_append_sheet(wb, mkSheet(usuariosRows,  'Nenhum usuário encontrado'),   'Usuários');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const slug   = gabinete.nome.replace(/[^\wÀ-ɏ ]/g, '_').replace(/\s+/g, '_');
    const today  = new Date().toISOString().split('T')[0];
    const filename = `${slug}_${today}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Export gabinete error:', error);
    return NextResponse.json({ error: 'Erro ao exportar dados' }, { status: 500 });
  }
}
