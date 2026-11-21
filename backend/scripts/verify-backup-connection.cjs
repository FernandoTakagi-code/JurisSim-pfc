// Apenas diagnóstico. Sem pg_dump, consultas a tabelas da aplicação, backup ou execução de fallback.
const fs = require('node:fs');
const path = require('node:path');
const { diagnose } = require('./lib/backup-preflight.cjs');

function main() {
  const args = process.argv.slice(2);
  if (!(args.length === 0 || (args.length === 2 && args[0] === '--ca'))) throw new Error();
  const caPath = args[1] ? path.resolve(args[1]) : 'system';
  if (caPath !== 'system' && !fs.statSync(caPath).isFile()) throw new Error();
  // A CA deve vir do painel oficial; nunca confie em um certificado obtido de um
  // handshake de banco não verificado nem altere o repositório global de confiança.
  const config = require('dotenv').parse(fs.readFileSync(path.resolve(__dirname, '../.env')));
  for (const mode of ['require', 'verify-full']) {
    console.log(JSON.stringify(diagnose({ url: config.DIRECT_URL, mode, caPath,
      psqlPath: 'C:/Program Files/PostgreSQL/17/bin/psql.exe' })));
  }
}
if (require.main === module) {
  try { main(); } catch { console.error('Backup connection diagnosis stopped; private details suppressed.'); process.exitCode = 1; }
}
