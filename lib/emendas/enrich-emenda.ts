/**
 * Orchestrator: pra cada emenda, busca seus documentos no Portal e persiste
 * tudo no banco.
 *
 * Fluxo:
 *   1. GET /api-de-dados/emendas/documentos/{codigoEmenda}  → lista de docs
 *   2. Pra cada doc (empenho), GET /api-de-dados/despesas/documentos/{cod}
 *      → detalhe (favorecido, subTítulo, observação, etc)
 *   3. upsertDocumento no banco, resolvendo município via cascata
 *
 * Custo: 1 + N requests por emenda (N = nº de documentos, tipicamente 1-15).
 * Backpressure: respeitar rate limit do Portal (~700 req/min na chave grátis).
 * O `portal-fetcher` já faz backoff em 429.
 */

import { portalFetch, portalFetchAllPages } from './portal-fetcher';
import { upsertDocumento, type PortalDocumentoRow } from './emenda-store';

interface DocumentoRelacionado {
  id: number;
  data: string;
  fase: string;
  codigoDocumento: string;
  codigoDocumentoResumido?: string;
  especieTipo?: string;
  tipoEmenda?: string;
}

export interface EnrichResult {
  codigoEmenda: string;
  docsEncontrados: number;
  docsPersistidos: number;
  erros: Array<{ codigoDocumento: string; mensagem: string }>;
}

/**
 * Enrich uma única emenda — busca docs e persiste detalhes.
 *
 * @param codigoEmenda código no Portal (campo `codigoEmenda` de /emendas)
 * @param opts.emendaId id interno do EmendaParlamentar (FK pro EmendaDocumento)
 * @param opts.emendaUf uf da emenda (fallback se documento não tiver)
 * @param opts.maxDocsPagina limite de páginas a buscar de documentos (default 5)
 */
export async function enrichEmenda(
  codigoEmenda: string,
  opts: {
    emendaId: string;
    emendaUf: string | null;
    maxDocsPagina?: number;
  },
): Promise<EnrichResult> {
  const result: EnrichResult = {
    codigoEmenda,
    docsEncontrados: 0,
    docsPersistidos: 0,
    erros: [],
  };

  // 1. Lista documentos da emenda
  let documentos: DocumentoRelacionado[];
  try {
    documentos = await portalFetchAllPages<DocumentoRelacionado>(
      `/api-de-dados/emendas/documentos/${encodeURIComponent(codigoEmenda)}`,
      {},
      { maxPages: opts.maxDocsPagina ?? 5, empty404: true },
    );
  } catch (err) {
    result.erros.push({
      codigoDocumento: '(listagem)',
      mensagem: err instanceof Error ? err.message : String(err),
    });
    return result;
  }

  result.docsEncontrados = documentos.length;
  if (documentos.length === 0) return result;

  // 2. Pra cada doc, busca detalhe e persiste.
  // Sequencial — paralelizar aqui aumenta risco de 429. Paralelismo está no
  // nível externo (cron processa várias emendas em paralelo).
  for (const doc of documentos) {
    try {
      const detalhe = await portalFetch<PortalDocumentoRow>(
        `/api-de-dados/despesas/documentos/${encodeURIComponent(doc.codigoDocumento)}`,
        {},
        { empty404: true },
      );

      // /despesas/documentos/{cod} retorna objeto direto, não array.
      // empty404 retorna [] então tratamos:
      const detalheObj = Array.isArray(detalhe)
        ? (detalhe[0] as PortalDocumentoRow | undefined)
        : (detalhe as PortalDocumentoRow);

      if (!detalheObj) {
        // doc existe na listagem mas detalhe não — persiste só o que veio da listagem
        await upsertDocumento({
          emendaId: opts.emendaId,
          emendaUf: opts.emendaUf,
          row: {
            documento: doc.codigoDocumento,
            documentoResumido: doc.codigoDocumentoResumido ?? null,
            fase: doc.fase,
            data: doc.data,
          },
        });
      } else {
        // mescla: prioriza detalhe, mas usa metadados da listagem como fallback
        await upsertDocumento({
          emendaId: opts.emendaId,
          emendaUf: opts.emendaUf,
          row: {
            ...detalheObj,
            documento: detalheObj.documento ?? doc.codigoDocumento,
            documentoResumido: detalheObj.documentoResumido ?? doc.codigoDocumentoResumido ?? null,
            fase: detalheObj.fase ?? doc.fase,
            data: detalheObj.data ?? doc.data,
          },
        });
      }

      result.docsPersistidos++;
    } catch (err) {
      result.erros.push({
        codigoDocumento: doc.codigoDocumento,
        mensagem: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
