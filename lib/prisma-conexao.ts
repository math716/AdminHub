// Conexão do Prisma 7 com o banco (driver `pg`). Fica separada de lib/db.ts
// para os scripts criarem o próprio cliente sem abrir também o do sistema.
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './prisma-gerado/client'

/** Configuração aceita pelo driver (o tipo do `pg` que o adapter usa). */
type PoolConfig = Exclude<ConstructorParameters<typeof PrismaPg>[0], string | { query: unknown }>

/**
 * Conexão do driver `pg` (Prisma 7) a partir do DATABASE_URL, reproduzindo o
 * que o Prisma 6 fazia com os parâmetros da URL.
 *
 * - Porta 6543 do Supabase = PgBouncer em modo transação. O Prisma 6 precisava
 *   de `pgbouncer=true` para não usar prepared statements com nome; o `pg` não
 *   os usa por padrão, então o parâmetro só é retirado da URL.
 * - Conexões por instância: 5 (`connection_limit`). O pooler do Supabase tem um
 *   teto somando TODAS as instâncias da Vercel; 10 por instância esgotava o
 *   teto (EMAXCONN). 5 ainda cobre as telas que fazem várias consultas ao mesmo
 *   tempo e deixa folga para o dobro de instâncias.
 * - Espera por uma conexão livre: 20 s (`pool_timeout`). O `pg` não tem limite
 *   por padrão — uma consulta podia ficar pendurada para sempre.
 * - SSL como no Prisma 6: criptografado, sem conferir o certificado (o do
 *   Supabase não está na lista de autoridades do Node). Sem isso o `pg` conecta
 *   SEM criptografia. Banco local (localhost) segue sem SSL.
 */
export function opcoesDeConexao(url = process.env.DATABASE_URL ?? ''): PoolConfig {
  let u: URL
  try { u = new URL(url) } catch { return { connectionString: url } } // sem URL (ex.: build): nada a ajustar
  const p = u.searchParams
  const max = Number(p.get('connection_limit')) || 5
  const esperaMs = (Number(p.get('pool_timeout')) || 20) * 1000
  for (const k of ['pgbouncer', 'connection_limit', 'pool_timeout', 'sslmode']) p.delete(k)
  const local = ['localhost', '127.0.0.1', '::1'].includes(u.hostname)
  return {
    connectionString: u.toString(),
    max,
    connectionTimeoutMillis: esperaMs,
    ...(local ? {} : { ssl: { rejectUnauthorized: false } }),
  }
}

/** Cliente novo (scripts que precisam de outra URL, ex.: DIRECT_URL). */
export function criarPrismaClient(url?: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg(opcoesDeConexao(url)) })
}
