// De onde vêm os arquivos públicos de dados: a base do TSE (/data/tse/…) e
// os mapas (/geojson/…).
//
// Ficavam em public/, dentro do repositório: ~840 MB e 46 mil arquivos que
// cada deploy precisava clonar (7 min só em "Cloning" numa atualização da
// base). Com NEXT_PUBLIC_DADOS_URL apontando para o Storage do Supabase (a
// mesma estrutura de pastas: geojson/… e data/tse/…), tudo passa a ser
// buscado de lá. Sem a variável, o próprio site — como sempre foi.
//
// O índice da Gabi (public/data/tse-index) NÃO sai: é lido do disco do
// servidor (outputFileTracingIncludes em next.config.js).

/** Raiz no Storage, sem barra no fim; vazio = o próprio site. */
export const DADOS_URL = (process.env.NEXT_PUBLIC_DADOS_URL ?? '').replace(/\/+$/, '');

/** Endereço de um arquivo de dados para o NAVEGADOR ("/geojson/x.json" → URL). */
export function urlDados(caminho: string): string {
  return DADOS_URL ? `${DADOS_URL}${caminho}` : caminho;
}

/** Raiz para o SERVIDOR: o Storage, ou o domínio do site que o chamador já sabe montar. */
export function baseDados(baseDoSite: string): string {
  return DADOS_URL || baseDoSite;
}
