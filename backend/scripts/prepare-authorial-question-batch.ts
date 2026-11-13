import { readFileSync, writeFileSync } from 'node:fs';
import { prepareAuthorialDraftBatch } from '../src/services/authorial-draft-batch';

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--input' || args[2] !== '--output' || !args[1] || !args[3]) {
    throw new Error('Use --input <selecao-editorial.json> --output <novo-lote.json>.');
  }
  const batch = prepareAuthorialDraftBatch(JSON.parse(readFileSync(args[1], 'utf8')));
  writeFileSync(args[3], JSON.stringify(batch, null, 2) + '\n', { flag: 'wx' });
  console.log('30 rascunhos preparados; revisões preservadas. Nenhum banco consultado. Arquivo existente não é sobrescrito.');
}
try { main(); }
catch { console.error('Preparação recusada: confira argumentos, seleção, fontes e se o arquivo de saída já existe. Nenhum banco foi consultado.'); process.exitCode = 1; }
