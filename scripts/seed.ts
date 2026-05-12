import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create default gabinete
  let gabinete = await prisma.gabinete.findFirst({
    where: { nome: 'Gabinete Padrão' }
  });

  if (!gabinete) {
    gabinete = await prisma.gabinete.create({
      data: {
        nome: 'Gabinete Padrão',
        descricao: 'Gabinete padrão do sistema'
      }
    });
    console.log('Default gabinete created');
  } else {
    console.log('Default gabinete already exists');
  }

  // Create default admin user (Chefe de Gabinete)
  const existingAdmin = await prisma.user.findUnique({
    where: { email: 'john@doe.com' }
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash('johndoe123', 10);
    await prisma.user.create({
      data: {
        email: 'john@doe.com',
        password: hashedPassword,
        name: 'Chefe de Gabinete',
        role: 'CHEFE',
        approved: true,
        gabineteId: gabinete.id
      }
    });
    console.log('Admin user created');
  } else {
    // Update existing admin to have gabinete if missing
    if (!existingAdmin.gabineteId) {
      await prisma.user.update({
        where: { id: existingAdmin.id },
        data: { gabineteId: gabinete.id }
      });
      console.log('Admin user updated with gabinete');
    } else {
      console.log('Admin user already exists');
    }
  }

  // Create sample demands
  const admin = await prisma.user.findUnique({ where: { email: 'john@doe.com' } });
  
  if (admin) {
    const existingDemands = await prisma.demand.count();

    if (existingDemands === 0) {
      const sampleDemands = [
        {
          title: 'Reparo de iluminação pública na Rua das Flores',
          description: 'Moradores reclamam de falta de iluminação em toda a extensão da rua',
          solicitante: 'Maria Silva',
          contato: '(11) 99999-1234',
          estado: 'SP',
          municipio: 'São Paulo',
          bairro: 'Vila Mariana',
          category: 'INFRAESTRUTURA' as const,
          status: 'PENDENTE' as const,
          priority: 'ALTA' as const,
          createdById: admin.id,
          gabineteId: gabinete.id
        },
        {
          title: 'Solicitação de ambulatório médico no bairro',
          description: 'Comunidade solicita instalação de ambulatório para atendimento básico',
          solicitante: 'João Santos',
          contato: '(11) 98888-5678',
          estado: 'SP',
          municipio: 'Campinas',
          bairro: 'Taquaral',
          category: 'SAUDE' as const,
          status: 'EM_ANDAMENTO' as const,
          priority: 'MEDIA' as const,
          createdById: admin.id,
          gabineteId: gabinete.id
        },
        {
          title: 'Melhoria na escola estadual do centro',
          description: 'Necessidade de reforma no telhado e pintura geral',
          solicitante: 'Ana Costa',
          contato: '(11) 97777-9012',
          estado: 'SP',
          municipio: 'Santos',
          bairro: 'Centro',
          category: 'EDUCACAO' as const,
          status: 'RESOLVIDA' as const,
          priority: 'BAIXA' as const,
          closedAt: new Date(),
          createdById: admin.id,
          gabineteId: gabinete.id
        },
        {
          title: 'Reforço na segurança do bairro',
          description: 'Moradores pedem mais patrulhamento na região',
          solicitante: 'Carlos Oliveira',
          contato: '(11) 96666-3456',
          estado: 'SP',
          municipio: 'São Paulo',
          bairro: 'Mooca',
          category: 'SEGURANCA' as const,
          status: 'PENDENTE' as const,
          priority: 'ALTA' as const,
          createdById: admin.id,
          gabineteId: gabinete.id
        },
        {
          title: 'Nova linha de ônibus para o bairro',
          description: 'Solicitação de nova rota de transporte público',
          solicitante: 'Pedro Almeida',
          contato: '(11) 95555-7890',
          estado: 'SP',
          municipio: 'Guarulhos',
          bairro: 'Bonsucesso',
          category: 'TRANSPORTE' as const,
          status: 'EM_ANDAMENTO' as const,
          priority: 'MEDIA' as const,
          createdById: admin.id,
          gabineteId: gabinete.id
        }
      ];

      for (const demand of sampleDemands) {
        await prisma.demand.create({ data: demand });
      }
      console.log('Sample demands created');
    } else {
      console.log('Demands already exist');
    }
  }

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
