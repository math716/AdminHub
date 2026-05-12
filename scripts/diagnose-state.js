const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function diagnoseCurrentState() {
  console.log('\n========================================');
  console.log('DIAGNÓSTICO DO ESTADO ATUAL');
  console.log('========================================\n');

  try {
    // 1. Verificar parcerias existentes
    const parcerias = await prisma.parceria.findMany({
      include: { projecaoMunicipio: true }
    });
    
    console.log('Total de parcerias:', parcerias.length);
    
    const parceriasVans = parcerias.filter(p => 
      (p.nome && p.nome.toLowerCase().includes('van')) || 
      p.tipo === 'TRANSPORTE'
    );
    console.log('Parcerias Vans ou TRANSPORTE:', parceriasVans.length);
    
    // Agrupar por tipo
    const porTipo = {};
    parcerias.forEach(p => {
      const tipo = p.tipo || 'SEM_TIPO';
      porTipo[tipo] = (porTipo[tipo] || 0) + 1;
    });
    console.log('Por tipo:', porTipo);

    // Agrupar por nome
    const porNome = {};
    parcerias.forEach(p => {
      const nome = p.nome || 'SEM_NOME';
      porNome[nome] = (porNome[nome] || 0) + 1;
    });
    console.log('Por nome:', porNome);

    // 2. Verificar municípios com metas zeradas
    const municipiosZerados = await prisma.projecaoMunicipio.count({
      where: {
        metaConservadora: 0,
        metaPossivel: 0,
        metaArrojada: 0
      }
    });
    console.log('\nMunicípios com metas zeradas:', municipiosZerados);

    // Total de municipios
    const totalMunicipios = await prisma.projecaoMunicipio.count();
    console.log('Total de municípios:', totalMunicipios);

    // 3. Totais das parcerias Vans
    const totaisVans = parceriasVans.reduce((acc, p) => ({
      conservadora: acc.conservadora + (p.metaConservadora || 0),
      possivel: acc.possivel + (p.metaPossivel || 0),
      arrojada: acc.arrojada + (p.metaArrojada || 0)
    }), { conservadora: 0, possivel: 0, arrojada: 0 });
    
    console.log('\nTotais das parcerias Vans/TRANSPORTE:');
    console.log('  Meta Conservadora:', totaisVans.conservadora.toLocaleString());
    console.log('  Meta Possível:', totaisVans.possivel.toLocaleString());
    console.log('  Meta Arrojada:', totaisVans.arrojada.toLocaleString());

    // 4. Verificar votos base (2022)
    const votosBase = await prisma.projecaoMunicipio.aggregate({
      _sum: { votosBase: true }
    });
    console.log('\nTotal Votos Base 2022:', (votosBase._sum.votosBase || 0).toLocaleString());

    // 5. Totais das metas dos municípios
    const totaisMunicipios = await prisma.projecaoMunicipio.aggregate({
      _sum: { 
        metaConservadora: true,
        metaPossivel: true,
        metaArrojada: true
      }
    });
    console.log('\nTotais das metas dos municípios:');
    console.log('  Meta Conservadora:', (totaisMunicipios._sum.metaConservadora || 0).toLocaleString());
    console.log('  Meta Possível:', (totaisMunicipios._sum.metaPossivel || 0).toLocaleString());
    console.log('  Meta Arrojada:', (totaisMunicipios._sum.metaArrojada || 0).toLocaleString());

    // 6. Listar exemplos
    console.log('\n--- Exemplos de parcerias Vans ---');
    const exemplos = parceriasVans.slice(0, 5);
    for (const p of exemplos) {
      console.log(`${p.projecaoMunicipio.municipio}: Parceria ${p.nome} = Cons:${p.metaConservadora}, Poss:${p.metaPossivel}, Arr:${p.metaArrojada}`);
    }

    // 7. Verificar se os valores das parcerias correspondem ao esperado da planilha
    console.log('\n--- Valores esperados da planilha ---');
    console.log('  Meta Conservadora esperada: 67,990');
    console.log('  Meta Possível esperada: 83,103');
    console.log('  Meta Arrojada esperada: 97,425');

  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

diagnoseCurrentState();
