import 'dotenv/config';
import {prisma} from '../src/lib/prisma';

// Verificação do schema somente leitura. Nunca executa migrações nem lê registros pessoais.
async function main(){
  const [state]=await prisma.$queryRaw<{lifecycle:boolean;activities:boolean}[]>`
    SELECT to_regclass('public."ClassLifecycle"') IS NOT NULL AS lifecycle,
           to_regclass('public."ClassActivity"') IS NOT NULL AS activities`;
  console.log(JSON.stringify({classLifecycleReady:state.lifecycle,classActivitiesReady:state.activities,
    requiredMigrations:[...(!state.lifecycle?['20261115193000_class_lifecycle']:[]),...(!state.activities?['20261115203000_class_activities']:[])],readOnly:true}));
}
main().catch(()=>{console.error('Não foi possível verificar o schema do banco configurado. Nenhuma alteração foi realizada.');process.exitCode=1;}).finally(()=>prisma.$disconnect());
