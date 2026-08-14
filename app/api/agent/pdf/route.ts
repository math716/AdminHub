export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import React from 'react';

// ---------------------------------------------------------------------------
// Estilos do PDF
// ---------------------------------------------------------------------------
const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    padding: 40,
    backgroundColor: '#ffffff',
    color: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: '#1d6fd8',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#1d6fd8',
  },
  headerSub: {
    fontSize: 9,
    color: '#64748b',
    marginTop: 3,
  },
  titulo: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
    marginBottom: 16,
  },
  msgWrapper: {
    marginBottom: 12,
  },
  msgUser: {
    alignSelf: 'flex-end',
    backgroundColor: '#1d6fd8',
    borderRadius: 10,
    padding: 10,
    maxWidth: '75%',
    marginLeft: 'auto',
  },
  msgAssistant: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 10,
    maxWidth: '85%',
    borderLeftWidth: 3,
    borderLeftColor: '#1d6fd8',
  },
  msgLabel: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  msgLabelUser: {
    color: '#bfdbfe',
  },
  msgLabelAssistant: {
    color: '#1d6fd8',
  },
  msgText: {
    fontSize: 9.5,
    lineHeight: 1.5,
  },
  msgTextUser: {
    color: '#ffffff',
  },
  msgTextAssistant: {
    color: '#1e293b',
  },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 8,
  },
  footerText: {
    fontSize: 7.5,
    color: '#94a3b8',
  },
});

// ---------------------------------------------------------------------------
// Componente PDF
// ---------------------------------------------------------------------------
interface Msg { role: 'user' | 'assistant'; content: string }

function GabiPDF({ titulo, messages, geradoEm }: {
  titulo: string;
  messages: Msg[];
  geradoEm: string;
}) {
  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: 'A4', style: S.page },

      // Header
      React.createElement(View, { style: S.header },
        React.createElement(View, null,
          React.createElement(Text, { style: S.headerTitle }, 'Gabi — Assistente IA'),
          React.createElement(Text, { style: S.headerSub }, 'AdminHub · Exportação de Conversa'),
        ),
      ),

      // Título
      titulo
        ? React.createElement(Text, { style: S.titulo }, titulo)
        : null,

      // Mensagens
      ...messages.map((msg, i) =>
        React.createElement(
          View,
          { key: i, style: S.msgWrapper },
          React.createElement(
            View,
            { style: msg.role === 'user' ? S.msgUser : S.msgAssistant },
            React.createElement(
              Text,
              { style: [S.msgLabel, msg.role === 'user' ? S.msgLabelUser : S.msgLabelAssistant] },
              msg.role === 'user' ? 'Você' : 'Gabi',
            ),
            React.createElement(
              Text,
              { style: [S.msgText, msg.role === 'user' ? S.msgTextUser : S.msgTextAssistant] },
              msg.content,
            ),
          ),
        ),
      ),

      // Footer
      React.createElement(
        View,
        { style: S.footer, fixed: true },
        React.createElement(Text, { style: S.footerText }, 'AdminHub — Gabi IA'),
        React.createElement(Text, { style: S.footerText }, `Gerado em ${geradoEm}`),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// POST /api/agent/pdf
// Body: { messages: { role, content }[], titulo?: string }
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const messages: Msg[] = Array.isArray(body?.messages) ? body.messages : [];
    const titulo: string  = body?.titulo ?? '';

    if (messages.length === 0) {
      return NextResponse.json({ error: 'Sem mensagens para exportar' }, { status: 400 });
    }

    const geradoEm = new Date().toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const pdfBuffer = await renderToBuffer(
      React.createElement(GabiPDF, { titulo, messages, geradoEm }),
    );

    return new NextResponse(pdfBuffer, {
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
