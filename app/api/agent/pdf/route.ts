export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import {
  Document, Page, Text, View,
  HeaderBand, DocFooter, renderContent, docStyles as S, stripEmoji, type Pill,
} from '@/lib/agent/report/doc-pdf';

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// ─── Agrupa mensagens em pares pergunta/resposta ─────────────────────────────
interface Msg { role: 'user' | 'assistant'; content: string }
const WELCOME = 'Olá, Sou a Gabi! Assessora Virtual do seu Gabinete, como posso te ajudar hoje?';

function agruparPares(msgs: Msg[]): Array<{ pergunta: string | null; resposta: string }> {
  const pares: Array<{ pergunta: string | null; resposta: string }> = [];
  let perguntaPendente: string | null = null;
  for (const msg of msgs) {
    if (msg.role === 'user') {
      perguntaPendente = msg.content;
    } else if (msg.role === 'assistant' && msg.content.trim() !== WELCOME) {
      pares.push({ pergunta: perguntaPendente, resposta: msg.content });
      perguntaPendente = null;
    }
  }
  return pares;
}

function extractFirstValue(text: string): string | null {
  const m = text.match(/R\$\s*[\d.,]+(?:\s*(?:milhões?|bilhões?|mil))?/i);
  return m ? m[0] : null;
}

// ─── Documento ───────────────────────────────────────────────────────────────
function GabiPDF({ titulo, messages, geradoEm }: { titulo: string; messages: Msg[]; geradoEm: string }) {
  const pares = agruparPares(messages);

  const firstQuestion = pares[0]?.pergunta ?? '';
  const reportTitle = firstQuestion.length > 0 ? clip(firstQuestion, 90) : titulo;
  const firstValue = extractFirstValue(pares[0]?.resposta ?? '');

  const pills: Pill[] = [
    ...(firstValue ? [{ label: 'Valor:', value: firstValue }] : []),
    { label: 'Emitido:', value: geradoEm },
    { label: 'Consultas:', value: String(pares.length) },
  ];

  return React.createElement(Document, null,
    React.createElement(Page, { size: 'A4', style: S.page },
      HeaderBand({ titulo: reportTitle, pills }),

      ...pares.map((par, i) =>
        React.createElement(View, { key: i },
          i > 0 ? React.createElement(View, { style: [S.hr, { marginVertical: 12 }] }) : null,
          par.pergunta
            ? React.createElement(View, { style: S.sectionLabel, wrap: false },
                React.createElement(View, { style: S.sectionBar }),
                React.createElement(Text, { style: S.sectionLabelText }, 'Consulta'),
                React.createElement(Text, { style: S.sectionQuestion }, clip(stripEmoji(par.pergunta), 110)),
              )
            : null,
          ...renderContent(par.resposta),
        ),
      ),

      DocFooter(),
    ),
  );
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await request.json();
    const messages: Msg[] = Array.isArray(body?.messages) ? body.messages : [];
    const titulo = body?.titulo ?? 'Relatório — Gabi IA';

    if (messages.length === 0) return NextResponse.json({ error: 'Sem mensagens para exportar' }, { status: 400 });

    const geradoEm = new Date().toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    const pdfBuffer = await renderToBuffer(React.createElement(GabiPDF, { titulo, messages, geradoEm }) as any);

    return new NextResponse(pdfBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="gabi-${Date.now()}.pdf"`,
      },
    });
  } catch (err) {
    console.error('[/api/agent/pdf]', err);
    return NextResponse.json({ error: 'Erro ao gerar PDF.' }, { status: 500 });
  }
}
