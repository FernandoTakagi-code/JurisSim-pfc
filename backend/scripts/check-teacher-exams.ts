import 'dotenv/config';
import {prisma} from '../src/lib/prisma';
// Auditoria somente leitura solicitada para a avaliação publicada existente. Nunca grava.
prisma.avaliacao.findMany({where:{titulo:{equals:'Simulado teste',mode:'insensitive'}},select:{titulo:true,descricao:true,duracaoSegundos:true,publishedAt:true,_count:{select:{questoes:true,tentativas:true}}}})
  .then(rows=>console.log(JSON.stringify({readOnly:true,exams:rows})))
  .catch(()=>{console.error('Não foi possível consultar o simulado configurado. Nenhuma alteração foi realizada.');process.exitCode=1;})
  .finally(()=>prisma.$disconnect());
