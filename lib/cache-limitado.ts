/**
 * Cache em memória com teto de entradas, descartando o uso mais antigo.
 *
 * Existe por causa de uma queda em produção: o cache de arquivos do TSE era um
 * `Map` de módulo que só crescia. SP/2018 sozinho ocupa 428 MB de heap depois
 * de descomprimido; uma pergunta que varre os 27 estados enchia a memória até
 * a instância morrer, e quem estava do outro lado via "falha de conexão" —
 * nenhuma resposta chegava a sair.
 *
 * A correção foi feita naquele cache, à mão. Este arquivo existe porque a mesma
 * lógica estava faltando em outros cinco lugares que leem os mesmos arquivos, e
 * um deles ficava na linha de baixo do que já havia sido corrigido. Com o
 * descarte num lugar só, ou todos têm teto ou nenhum tem — não dá para corrigir
 * pela metade sem perceber.
 *
 * O teto é de ENTRADAS, não de bytes: medir o tamanho real de um objeto em JS
 * custa mais do que o cache economiza. Então cada uso escolhe o seu teto pelo
 * peso do que guarda — 2 para arquivos de centenas de MB, 40 para respostas de
 * poucos KB.
 */
export class CacheLimitado<V> {
  private readonly itens = new Map<string, V>();

  constructor(private readonly teto: number) {}

  /**
   * Devolve o valor e o marca como o mais recente. Reinserir move a chave para
   * o fim da ordem do Map, então o que está em uso não é o primeiro a sair
   * quando o teto é atingido.
   */
  get(chave: string): V | undefined {
    if (!this.itens.has(chave)) return undefined;
    const valor = this.itens.get(chave)!;
    this.itens.delete(chave);
    this.itens.set(chave, valor);
    return valor;
  }

  has(chave: string): boolean {
    return this.itens.has(chave);
  }

  set(chave: string, valor: V): void {
    // Map preserva a ordem de inserção: o primeiro da fila é o uso mais antigo.
    this.itens.delete(chave);
    while (this.itens.size >= this.teto) {
      const maisAntigo = this.itens.keys().next().value;
      if (maisAntigo === undefined) break;
      this.itens.delete(maisAntigo);
    }
    this.itens.set(chave, valor);
  }

  delete(chave: string): void {
    this.itens.delete(chave);
  }

  get tamanho(): number {
    return this.itens.size;
  }
}
