const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");

function setupEnvironment(root) {
  const results = [];
  for (const folder of ["backend", "frontend"]) {
    const target = path.join(root, folder, ".env");
    const template = fs.readFileSync(
      path.join(root, folder, ".env.example"),
      "utf8",
    );
    const content =
      folder === "backend"
        ? template.replace(
            /^JWT_SECRET=.*$/m,
            `JWT_SECRET="${randomBytes(48).toString("hex")}"`,
          )
        : template;
    try {
      fs.writeFileSync(target, content, { flag: "wx", mode: 0o600 });
      results.push(`${folder}/.env criado`);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      results.push(`${folder}/.env existente preservado`);
    }
  }
  return results;
}
if (require.main === module) {
  try {
    for (const result of setupEnvironment(path.resolve(__dirname, "..")))
      console.log(result);
    console.log(
      "Preencha DATABASE_URL e DIRECT_URL localmente. Depois instale as dependências e execute npm run config:check. Nenhum valor privado foi exibido.",
    );
  } catch {
    console.error(
      "Não foi possível preparar os arquivos de ambiente. Confira os modelos e as permissões da pasta.",
    );
    process.exitCode = 1;
  }
}
module.exports = { setupEnvironment };
