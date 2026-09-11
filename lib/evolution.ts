const BASE = () => (process.env.EVOLUTION_API_URL ?? '').replace(/\/$/, '');
const KEY  = () => process.env.EVOLUTION_API_KEY ?? '';

function headers() {
  return { apikey: KEY(), 'Content-Type': 'application/json' };
}

export function isConfigured(): boolean {
  return !!(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY &&
    !process.env.EVOLUTION_API_URL.includes('SEU_IP_VPS'));
}

export async function createInstance(instanceName: string) {
  const res = await fetch(`${BASE()}/instance/create`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
    }),
  });
  return res.json();
}

export async function getQrCode(instanceName: string) {
  const res = await fetch(`${BASE()}/instance/connect/${instanceName}`, {
    headers: headers(),
  });
  return res.json();
}

export async function getConnectionState(instanceName: string): Promise<'open' | 'close' | 'connecting' | 'unknown'> {
  try {
    const res = await fetch(`${BASE()}/instance/connectionState/${instanceName}`, {
      headers: headers(),
    });
    if (!res.ok) return 'unknown';
    const data = await res.json();
    return data?.instance?.state ?? data?.state ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Envia uma mensagem de texto.
 *
 * O corpo é `{ number, text }`, com o texto na raiz. Na v1 da Evolution ele
 * ficava aninhado em `textMessage: { text }`, e foi assim que este arquivo
 * nasceu — mas na v2 esse campo não existe mais: a API não acha o texto,
 * recusa o envio e o motivo não aparece em lugar nenhum.
 */
export async function sendText(instanceName: string, number: string, text: string) {
  const res = await fetch(`${BASE()}/message/sendText/${instanceName}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ number, text }),
  });
  return { ok: res.ok, data: await res.json() };
}

/**
 * Tira da resposta de erro da Evolution uma frase que sirva para quem usa o
 * sistema. Ela devolve o motivo em formatos diferentes conforme o caso
 * (`response.message` costuma ser uma lista), e quando nada serve é melhor
 * uma frase honesta e vaga do que inventar uma causa.
 */
export function motivoDaFalha(data: any): string {
  const bruto = data?.response?.message ?? data?.message ?? data?.error;
  const texto = Array.isArray(bruto) ? bruto.filter(Boolean).join('; ') : bruto;
  if (typeof texto === 'string' && texto.trim() && texto.length < 200) return texto.trim();
  return 'Não consegui enviar para este número.';
}

export async function logoutInstance(instanceName: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE()}/instance/logout/${instanceName}`, {
      method: 'DELETE',
      headers: headers(),
    });
    return res.ok;
  } catch { return false; }
}

export async function deleteInstance(instanceName: string) {
  const res = await fetch(`${BASE()}/instance/delete/${instanceName}`, {
    method: 'DELETE',
    headers: headers(),
  });
  return res.ok;
}

export function makeInstanceName(gabineteId: string): string {
  return `gabinete-${gabineteId.slice(0, 12)}`;
}
