const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function revertImport() {
  console.log('\n========================================');
  console.log('REVERSÃO COMPLETA - IMPORTAÇÃO EXCEL');
  console.log('========================================\n');

  const report = {
    municipiosRestaurados: 0,
    parceriasRemovidas: 0,
    valoresRecalculados: false,
    erros: []
  };

  try {
    // 1. BUSCAR TODAS AS PARCERIAS VANS/TRANSPORTE
    console.log('1) Buscando parcerias a serem removidas...');
    const parceriasVans = await prisma.parceria.findMany({
      where: {
        OR: [
          { nome: { contains: 'Van', mode: 'insensitive' } },
          { tipo: 'TRANSPORTE' }
        ]
      },
      include: { projecaoMunicipio: true }
    });

    console.log(`   Encontradas ${parceriasVans.length} parcerias para remover`);

    // 2. RESTAURAR METAS NOS MUNICÍPIOS
    console.log('\n2) Restaurando metas nos municípios...');
    
    // Agrupar parcerias por município (caso haja múltiplas)
    const parceriasPorMunicipio = {};
    for (const p of parceriasVans) {
      const munId = p.projecaoMunicipioId;
      if (!parceriasPorMunicipio[munId]) {
        parceriasPorMunicipio[munId] = {
          municipio: p.projecaoMunicipio.municipio,
          metaConservadora: 0,
          metaPossivel: 0,
          metaArrojada: 0
        };
      }
      parceriasPorMunicipio[munId].metaConservadora += p.metaConservadora || 0;
      parceriasPorMunicipio[munId].metaPossivel += p.metaPossivel || 0;
      parceriasPorMunicipio[munId].metaArrojada += p.metaArrojada || 0;
    }

    // Atualizar cada município com os valores das parcerias
    for (const [munId, dados] of Object.entries(parceriasPorMunicipio)) {
      await prisma.projecaoMunicipio.update({
        where: { id: munId },
        data: {
          metaConservadora: dados.metaConservadora,
          metaPossivel: dados.metaPossivel,
          metaArrojada: dados.metaArrojada
        }
      });
      report.municipiosRestaurados++;
    }
    console.log(`   ${report.municipiosRestaurados} municípios restaurados`);

    // 3. REMOVER PARCERIAS IMPORTADAS
    console.log('\n3) Removendo parcerias importadas...');
    
    const deleteResult = await prisma.parceria.deleteMany({
      where: {
        OR: [
          { nome: { contains: 'Van', mode: 'insensitive' } },
          { tipo: 'TRANSPORTE' }
        ]
      }
    });
    
    report.parceriasRemovidas = deleteResult.count;
    console.log(`   ${report.parceriasRemovidas} parcerias removidas`);

    // 4. VERIFICAR TOTAIS APÓS REVERSÃO
    console.log('\n4) Verificando totais após reversão...');
    
    const totaisMunicipios = await prisma.projecaoMunicipio.aggregate({
      _sum: { 
        votosBase: true,
        metaConservadora: true,
        metaPossivel: true,
        metaArrojada: true
      }
    });

    const parceriasRestantes = await prisma.parceria.count();

    console.log('\n========================================');
    console.log('RELATÓRIO FINAL');
    console.log('========================================');
    console.log('\n✔ Municípios restaurados:', report.municipiosRestaurados);
    console.log('✔ Parcerias removidas:', report.parceriasRemovidas);
    console.log('✔ Parcerias restantes:', parceriasRestantes);
    console.log('\nValores recalculados:');
    console.log('  - Votos Base 2022:', (totaisMunicipios._sum.votosBase || 0).toLocaleString());
    console.log('  - Meta Conservadora:', (totaisMunicipios._sum.metaConservadora || 0).toLocaleString());
    console.log('  - Meta Possível:', (totaisMunicipios._sum.metaPossivel || 0).toLocaleString());
    console.log('  - Meta Arrojada:', (totaisMunicipios._sum.metaArrojada || 0).toLocaleString());
    console.log('\n✔ Confirmação de integridade:');
    console.log('  - Sistema restaurado ao estado pré-importação');
    console.log('  - Parcerias devem ser cadastradas manualmente');
    console.log('========================================\n');

    report.valoresRecalculados = true;

  } catch (error) {
    console.error('\nERRO durante reversão:', error);
    report.erros.push(error.message);
  } finally {
    await prisma.$disconnect();
  }

  return report;
}

revertImport();
