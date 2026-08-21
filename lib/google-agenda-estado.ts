// Assinatura do parâmetro `state` do OAuth.
//
// Vive fora do arquivo de rota porque, no App Router, um route.ts deve exportar
// apenas os handlers HTTP.

import { randomBytes, createHmac } from 'crypto';

/**
 * `state` assinado: leva o gabinete e um nonce, com HMAC. Sem assinatura,
 * qualquer um poderia forjar o parâmetro no callback e ligar a própria conta a
 * um gabinete alheio.
 */
export function assinarEstado(gabineteId: string, userId: string): string {
  const nonce = randomBytes(8).toString('hex');
  const dados = `${gabineteId}.${userId}.${nonce}`;
  const assinatura = createHmac('sha256', process.env.NEXTAUTH_SECRET ?? 'dev')
    .update(dados).digest('hex').slice(0, 32);
  return Buffer.from(`${dados}.${assinatura}`).toString('base64url');
}

export function conferirEstado(estado: string): { gabineteId: string; userId: string } | null {
  try {
    const cru = Buffer.from(estado, 'base64url').toString('utf8');
    const [gabineteId, userId, nonce, assinatura] = cru.split('.');
    if (!gabineteId || !userId || !nonce || !assinatura) return null;
    const esperada = createHmac('sha256', process.env.NEXTAUTH_SECRET ?? 'dev')
      .update(`${gabineteId}.${userId}.${nonce}`).digest('hex').slice(0, 32);
    return assinatura === esperada ? { gabineteId, userId } : null;
  } catch {
    return null;
  }
}

