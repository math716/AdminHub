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

export async function sendText(instanceName: string, number: string, text: string) {
  const res = await fetch(`${BASE()}/message/sendText/${instanceName}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ 
      number, 
      textMessage: { 
        text: text 
      } 
    }),
  });
  return { ok: res.ok, data: await res.json() };
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
