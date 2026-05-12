import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

interface CandidatoData {
  nome: string;
  nomeUrna: string;
  partido: string;
  cargo: string;
  ano: number;
  uf: string;
  totalVotos: number;
  situacao: string;
  numero: number;
}

async function importData() {
  console.log('Iniciando importação de dados eleitorais...');
  
  const candidatosPath = path.join(process.cwd(), 'data', 'candidatos.json');
  const votosPath = path.join(process.cwd(), 'data', 'votos_municipio.json');
  
  // Limpar dados existentes
  console.log('Limpando dados existentes...');
  await prisma.votoMunicipio.deleteMany({});
  await prisma.candidato.deleteMany({});
  
  // Ler e processar candidatos em chunks
  console.log('Carregando candidatos...');
  const candidatosRaw = fs.readFileSync(candidatosPath, 'utf-8');
  const candidatos: CandidatoData[] = JSON.parse(candidatosRaw);
  console.log(`Total de candidatos: ${candidatos.length}`);
  
  // Ler votos por município
  console.log('Carregando votos por município...');
  const votosRaw = fs.readFileSync(votosPath, 'utf-8');
  const votosMunicipio: Record<string, Record<string, number>> = JSON.parse(votosRaw);
  console.log(`Total de entradas de votos: ${Object.keys(votosMunicipio).length}`);
  
  // Inserir candidatos em lotes
  const BATCH_SIZE = 500;
  let insertedCandidatos = 0;
  let insertedVotos = 0;
  
  for (let i = 0; i < candidatos.length; i += BATCH_SIZE) {
    const batch = candidatos.slice(i, i + BATCH_SIZE);
    
    // Criar candidatos
    for (const cand of batch) {
      try {
        const created = await prisma.candidato.create({
          data: {
            nome: cand.nome,
            nomeUrna: cand.nomeUrna,
            partido: cand.partido,
            cargo: cand.cargo,
            ano: cand.ano,
            uf: cand.uf,
            totalVotos: cand.totalVotos,
            situacao: cand.situacao,
            numero: cand.numero,
          }
        });
        
        // Inserir votos por município para este candidato
        const votoKey = `${cand.nomeUrna}_${cand.ano}_${cand.uf}`;
        const votos = votosMunicipio[votoKey];
        
        if (votos) {
          const votosToInsert = Object.entries(votos)
            .filter(([, v]) => v > 0)
            .map(([municipio, votoCount]) => ({
              candidatoId: created.id,
              municipio,
              votos: votoCount
            }));
          
          if (votosToInsert.length > 0) {
            await prisma.votoMunicipio.createMany({
              data: votosToInsert,
              skipDuplicates: true
            });
            insertedVotos += votosToInsert.length;
          }
        }
        
        insertedCandidatos++;
      } catch (error: any) {
        // Skip duplicates
        if (!error.message?.includes('Unique constraint')) {
          console.error(`Erro ao inserir candidato ${cand.nome}:`, error.message);
        }
      }
    }
    
    console.log(`Processados ${Math.min(i + BATCH_SIZE, candidatos.length)}/${candidatos.length} candidatos...`);
  }
  
  console.log(`\nImportação concluída!`);
  console.log(`Candidatos inseridos: ${insertedCandidatos}`);
  console.log(`Votos por município inseridos: ${insertedVotos}`);
}

importData()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
