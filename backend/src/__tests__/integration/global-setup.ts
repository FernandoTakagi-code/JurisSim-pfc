import { execSync } from 'node:child_process';

// Executado uma única vez antes dos testes de integração.
// Recria o banco de TESTE do zero a partir do schema.prisma, garantindo que
// nenhum teste dependa de dados cadastrados previamente.
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'Defina TEST_DATABASE_URL no backend/.env para rodar os testes de integração. ' +
      'Ex.: postgresql://postgres:postgres@localhost:5432/jurissim_test',
    );
  }

  // Trava de segurança: o banco é APAGADO a cada execução, então só aceitamos
  // bancos/schemas cujo nome contenha "test".
  const parsed = new URL(url);
  const database = parsed.pathname.replace(/^\//, '');
  const schema = parsed.searchParams.get('schema') ?? 'public';
  if (!/test/i.test(database) && !/test/i.test(schema)) {
    throw new Error(
      `Recusado: o banco "${database}" (schema "${schema}") não parece ser de teste. ` +
      'Use um banco ou schema com "test" no nome, pois ele será apagado.',
    );
  }

  execSync('npx prisma db push --force-reset --skip-generate', {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: process.env.TEST_DIRECT_URL ?? url },
  });
}