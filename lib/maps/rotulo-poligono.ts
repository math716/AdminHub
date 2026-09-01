// Onde colocar o rótulo (número de votos) dentro de um polígono.
//
// Duas abordagens erradas que já estiveram em uso aqui:
//
//   getBounds().getCenter()  — centro da CAIXA que envolve o polígono. Num
//                              município alongado ou curvo, cai fora da área.
//   média dos vértices       — puxada para onde há mais pontos. Uma borda
//                              recortada (represa, divisa sinuosa) concentra
//                              vértices e arrasta o rótulo para lá.
//
// O que funciona é o "polo de inacessibilidade": o ponto INTERNO mais distante
// de qualquer borda. É o mesmo critério que os atlas usam para posicionar o
// nome de um país, e garante que o rótulo fique dentro e com folga em volta.

export type Anel = [number, number][];   // pares [lng, lat], como no GeoJSON

/** Ponto dentro do anel? Ray casting. */
function dentro(x: number, y: number, anel: Anel): boolean {
  let d = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i];
    const [xj, yj] = anel[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) d = !d;
  }
  return d;
}

/** Distância de um ponto ao segmento, no plano das coordenadas. */
function distSegmento(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const t = dx === 0 && dy === 0
    ? 0
    : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Menor distância do ponto até qualquer borda do anel. Negativa se fora. */
function folga(x: number, y: number, anel: Anel): number {
  let menor = Infinity;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    menor = Math.min(menor, distSegmento(x, y, anel[j][0], anel[j][1], anel[i][0], anel[i][1]));
  }
  return dentro(x, y, anel) ? menor : -menor;
}

/** Área do anel (fórmula do agrimensor). Serve para escolher o maior pedaço. */
export function areaDoAnel(anel: Anel): number {
  let a = 0;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    a += anel[j][0] * anel[i][1] - anel[i][0] * anel[j][1];
  }
  return Math.abs(a) / 2;
}

/**
 * Ponto interno com a maior folga até as bordas — onde o rótulo cabe melhor.
 *
 * Faz uma varredura em grade e depois refina em torno do melhor candidato.
 * Precisão suficiente para posicionar um número, e barato: um município tem
 * centenas de vértices, não milhões.
 *
 * Devolve [lat, lng], na ordem que o Leaflet espera.
 */
export function pontoParaRotulo(anel: Anel): [number, number] | null {
  if (!anel || anel.length < 3) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of anel) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const larg = maxX - minX, alt = maxY - minY;
  if (larg === 0 || alt === 0) return null;

  let melhorX = (minX + maxX) / 2;
  let melhorY = (minY + maxY) / 2;
  let melhorFolga = folga(melhorX, melhorY, anel);

  // Varredura inicial: 16x16 cobre bem formatos irregulares.
  const N = 16;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const x = minX + (larg * i) / N;
      const y = minY + (alt * j) / N;
      const f = folga(x, y, anel);
      if (f > melhorFolga) { melhorFolga = f; melhorX = x; melhorY = y; }
    }
  }

  // Refino: encolhe a janela ao redor do melhor ponto.
  let passoX = larg / N, passoY = alt / N;
  for (let volta = 0; volta < 4; volta++) {
    passoX /= 2; passoY /= 2;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const x = melhorX + dx * passoX;
        const y = melhorY + dy * passoY;
        const f = folga(x, y, anel);
        if (f > melhorFolga) { melhorFolga = f; melhorX = x; melhorY = y; }
      }
    }
  }

  // Nenhum ponto interno encontrado (polígono degenerado): melhor não chutar.
  if (melhorFolga <= 0) return null;
  return [melhorY, melhorX];   // [lat, lng]
}

/**
 * Melhor ponto entre vários anéis — usa o de maior área.
 * Municípios com ilhas ou enclaves têm mais de um anel externo.
 */
export function pontoParaRotuloMultiplo(aneis: Anel[]): [number, number] | null {
  const validos = aneis.filter(a => a && a.length >= 3);
  if (validos.length === 0) return null;
  const maior = validos.reduce((a, b) => (areaDoAnel(b) > areaDoAnel(a) ? b : a));
  return pontoParaRotulo(maior);
}
