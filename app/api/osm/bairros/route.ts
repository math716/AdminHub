import { NextResponse } from 'next/server';

// OSM/Overpass desabilitado: a API Overpass demora 20-60s e requer plano Pro
// do Vercel (maxDuration=60). Os dados TSE cobrem o mesmo caso de uso.
export async function GET() {
  return NextResponse.json({ bairros: [], total: 0, message: 'OSM desabilitado' });
}
