// Gráficos montados no SERVIDOR, a partir dos dados que as ferramentas já
// devolveram.
//
// Antes, o system prompt mandava a Gabi chamar `gerar_visualizacao` depois de
// toda busca — duas vezes (rosca + barras). Só que essa ferramenta não consulta
// nada: ela devolve exatamente o que recebeu. Ou seja, o modelo gastava DUAS
// idas à API só para REDIGITAR dados que já estavam no servidor. Numa lista de
// 20 candidatos isso dá ~332 tokens de saída, uns 5,5s de digitação, além da
// latência e do raciocínio das duas chamadas.
//
// Aqui os mesmos gráficos saem de graça, no fim do turno. A ferramenta continua
// existindo para recortes fora do padrão (série temporal, tabela, KPIs).

export interface Visualizacao {
  tipo: 'barras' | 'donut' | 'serie_temporal' | 'cards_kpi' | 'tabela';
  titulo?: string;
  dados: any;
}

const AREA_LABEL: Record<string, string> = {
  SAUDE: 'Saúde', EDUCACAO: 'Educação', SEGURANCA: 'Segurança', INFRAESTRUTURA: 'Infraestrutura',
  ASSISTENCIA_SOCIAL: 'Assistência Social', AGRICULTURA: 'Agricultura', CULTURA: 'Cultura',
  ESPORTE: 'Esporte', MEIO_AMBIENTE: 'Meio Ambiente', TRANSPORTE: 'Transporte',
  HABITACAO: 'Habitação', SANEAMENTO: 'Saneamento', OUTROS: 'Outros',
};

/** Soma valores por chave, devolvendo os maiores primeiro. */
function agrupar<T>(itens: T[], chave: (i: T) => string, valor: (i: T) => number) {
  const m: Record<string, number> = {};
  for (const i of itens) {
    const k = chave(i);
    if (!k) continue;
    m[k] = (m[k] ?? 0) + (valor(i) || 0);
  }
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}

// ── Eleitoral ────────────────────────────────────────────────────────────────
function deVotacao(d: any): Visualizacao[] {
  const cands: any[] = d?.candidatos ?? [];
  if (cands.length === 0) return [];
  const vis: Visualizacao[] = [];

  if (cands.length >= 2) {
    // Rosca: distribuição entre os candidatos consultados
    vis.push({
      tipo: 'donut',
      titulo: 'Distribuição de votos',
      dados: { itens: cands.slice(0, 20).map(c => ({ label: c.nomeUrna || c.nome, valor: c.totalVotos || 0 })) },
    });
    // Barras: os mais votados
    vis.push({
      tipo: 'barras',
      titulo: 'Votação total',
      dados: { itens: cands.slice(0, 8).map(c => ({ label: c.nomeUrna || c.nome, valor: c.totalVotos || 0 })) },
    });
    return vis;
  }

  // Um candidato: a distribuição útil é a dele por município (ou por zona,
  // quando a consulta foi de um município).
  const c = cands[0];
  const zonas: any[] = c.votosPorZona ?? [];
  if (zonas.length > 0) {
    vis.push({
      tipo: 'barras',
      titulo: 'Votos por zona eleitoral',
      dados: { itens: zonas.slice(0, 10).map(z => ({ label: `Zona ${z.zona}`, valor: z.votos || 0 })) },
    });
  }
  const muns: any[] = c.votosPorMunicipio ?? [];
  if (muns.length >= 2) {
    vis.push({
      tipo: 'donut',
      titulo: 'Votos por município (principais)',
      dados: { itens: muns.slice(0, 8).map(m => ({ label: m.municipio, valor: m.votos || 0 })) },
    });
  }
  return vis;
}

// ── Emendas ──────────────────────────────────────────────────────────────────
function deEmendas(d: any): Visualizacao[] {
  const emendas: any[] = d?.emendas ?? [];
  if (emendas.length === 0) return [];
  const vis: Visualizacao[] = [];

  const porArea = agrupar(emendas, e => String(e.area ?? ''), e => e.valorEmpenhado || e.valorPago || 0);
  if (porArea.length > 0) {
    vis.push({
      tipo: 'donut',
      titulo: 'Distribuição por área',
      dados: { itens: porArea.map(([a, v]) => ({ label: AREA_LABEL[a] ?? a, valor: v })) },
    });
  }

  // Barras: por parlamentar quando há vários; por município quando é um só.
  const nomes = new Set(emendas.map(e => String(e.parlamentar ?? '').trim()).filter(n => n && n !== 'N/A'));
  const porQuem = nomes.size > 1
    ? { titulo: 'Total por parlamentar', dados: agrupar(emendas, e => String(e.parlamentar ?? ''), e => e.valorEmpenhado || 0) }
    : { titulo: 'Destinos principais',   dados: agrupar(emendas, e => String(e.municipio ?? ''),  e => e.valorEmpenhado || 0) };
  if (porQuem.dados.length > 0) {
    vis.push({
      tipo: 'barras',
      titulo: porQuem.titulo,
      dados: { itens: porQuem.dados.slice(0, 8).map(([k, v]) => ({ label: k, valor: v })) },
    });
    // Comparando poucos parlamentares, a pergunta real é "quanto cada um pesa
    // no total" — a rosca responde isso de relance; a barra, não.
    if (nomes.size > 1 && nomes.size <= 6) {
      vis.push({
        tipo: 'donut',
        titulo: 'Participação de cada parlamentar no total',
        dados: { itens: porQuem.dados.map(([k, v]) => ({ label: k, valor: v })) },
      });
    }
  }
  return vis;
}

// ── Comparativo de emendas ───────────────────────────────────────────────────
function deComparativo(d: any): Visualizacao[] {
  const parls: any[] = (d?.parlamentares ?? []).filter((p: any) => !p.naoEncontrado);
  if (parls.length === 0) return [];
  return [{
    tipo: 'barras',
    titulo: 'Empenhado x pago',
    dados: {
      itens: parls.map(p => ({
        label: p.nome,
        empenhado: p.totalEmpenhado || 0,
        pago: p.totalPago || 0,
      })),
    },
  }];
}

// ── Gabinete ─────────────────────────────────────────────────────────────────
function deDemandas(d: any): Visualizacao[] {
  const cont: Record<string, number> = d?.contagemPorStatus ?? {};
  const itens = Object.entries(cont).map(([label, valor]) => ({ label, valor }));
  return itens.length > 0
    ? [{ tipo: 'donut', titulo: 'Demandas por status', dados: { itens } }]
    : [];
}

function deAgenda(d: any): Visualizacao[] {
  if (!d?.encontrado) return [];
  const vis: Visualizacao[] = [];
  const porTipo = Object.entries(d.contagemPorTipo ?? {}).map(([label, valor]) => ({ label, valor: Number(valor) }));
  if (porTipo.length > 0) vis.push({ tipo: 'donut', titulo: 'Compromissos por tipo', dados: { itens: porTipo } });
  const porMes = Object.entries(d.contagemPorMes ?? {}).map(([label, valor]) => ({ label, valor: Number(valor) }));
  if (porMes.length > 0) vis.push({ tipo: 'barras', titulo: 'Compromissos por mês', dados: { itens: porMes.slice(0, 12) } });
  return vis;
}

function deContatos(d: any): Visualizacao[] {
  if (!d?.encontrado) return [];
  const r = d.resumoDaBase ?? {};
  return [{
    tipo: 'cards_kpi',
    titulo: 'Base de contatos',
    dados: {
      cards: [
        { label: 'Contatos', valor: r.totalNoGabinete ?? d.total },
        { label: 'Com e-mail', valor: r.comEmail ?? 0 },
        { label: 'No mapa', valor: r.comLocalizacao ?? 0 },
      ],
    },
  }];
}

/**
 * Gráficos padrão para o que as ferramentas trouxeram. Vazio quando não há
 * número que renda visualização.
 */
export function visualizacoesAutomaticas(dadosBrutos: Record<string, unknown>): Visualizacao[] {
  const d = dadosBrutos ?? {};
  // Ordem de prioridade: o assunto principal do turno vem primeiro.
  const vis = [
    ...deVotacao(d.buscar_votacao),
    ...deComparativo(d.comparar_parlamentares),
    ...deEmendas(d.buscar_emendas),
    ...deAgenda(d.buscar_agenda),
    ...deDemandas(d.buscar_demandas),
    ...deContatos(d.buscar_contatos),
  ];
  // Só faz sentido mostrar gráfico com mais de um valor a comparar.
  return vis.filter(v => {
    const itens = v.dados?.itens ?? v.dados?.cards ?? [];
    return itens.length >= 2;
  }).slice(0, 4);
}
