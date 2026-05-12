import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Buscar o gabinete padrão
  const gabinete = await prisma.gabinete.findFirst({ where: { nome: 'Gabinete Padrão' } });
  console.log('Gabinete:', gabinete);
  
  if (!gabinete) {
    console.log('Gabinete não encontrado');
    return;
  }
  
  // Atualizar todos os usuários sem gabinete
  const result = await prisma.user.updateMany({
    where: { gabineteId: null },
    data: { gabineteId: gabinete.id }
  });
  console.log('Usuários atualizados:', result.count);
  
  // Listar todos os usuários
  const users = await prisma.user.findMany({
    select: { email: true, name: true, role: true, gabineteId: true }
  });
  console.log('Usuários:', users);
}

main().finally(() => prisma.$disconnect());
