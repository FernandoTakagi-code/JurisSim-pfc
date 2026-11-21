const fs = require('node:fs');
const path = require('node:path');

// Remove apenas a saída gerada deste backend, para que arquivos-fonte movidos/excluídos
// não deixem módulos ou testes antigos em um build posterior.
const backend = path.resolve(__dirname, '..');
const output = path.resolve(backend, 'dist');
if (path.dirname(output) !== backend || path.basename(output) !== 'dist') {
  throw new Error('Diretório de build inválido.');
}
if (fs.existsSync(output)) {
  if (fs.lstatSync(output).isSymbolicLink()) {
    throw new Error('O diretório de build não pode ser um link.');
  }
  fs.rmSync(output, { recursive: true });
}
