# JurisSim

Projeto Final de Curso de Engenharia de Software — UMC. Plataforma de preparação para a primeira fase da OAB, com diagnóstico, prática de questões, simulados, atividades de turma e acompanhamento do desempenho.

## Estrutura

| Pasta | Responsabilidade |
| --- | --- |
| `frontend/src` | Interface React e navegação dos perfis |
| `backend/src` | API Express, autenticação e regras de negócio |
| `backend/tests` | Testes isolados, integração, fixtures e preparação |
| `backend/prisma` | Modelo de dados e histórico de migrations |
| `scripts` | Preparação do ambiente |
| `backend/scripts` | Operação do acervo, verificações e testes auxiliares |
| `frontend/tests` | Verificações de interface e navegação |
| `.github/workflows` | Validações automatizadas do repositório |
| `docs` | Guias essenciais, cadernos de questões e evidências |

## Preparar o ambiente

Requisitos: Node.js 24 ou superior, npm e configuração de banco PostgreSQL fornecida pela equipe. As dependências devem ser instaladas com os lockfiles versionados.

Na raiz do repositório:

```powershell
npm run setup
npm ci --prefix backend
npm ci --prefix frontend
npm --prefix backend run prisma:generate
```

O setup cria apenas configurações locais ausentes. Preencha o `backend/.env` com as credenciais autorizadas e configure `VITE_API_URL` no frontend. Não substitua arquivos de ambiente que já estejam configurados.

```powershell
npm run config:check
```

Esse comando valida o formato das variáveis; não comprova conexão com o banco ou autenticação dos provedores.

## Executar localmente

Em dois terminais na raiz:

```powershell
npm --prefix backend run dev
```

```powershell
npm --prefix frontend run dev
```

Abra `http://localhost:5173`. A API usa a porta 3333 por padrão. Configure a origem do frontend em `CORS_ORIGINS` e a URL de retorno dos e-mails em `APP_PUBLIC_URL`. O endereço do banco depende do `.env`: executar localmente não torna o banco descartável.

Migrations e importações são operações de manutenção separadas. Não execute reset ou seed no banco compartilhado. Consulte o [guia da equipe](docs/execucao-equipe.md).

## Verificações

```powershell
npm --prefix backend run build
npm --prefix backend run test:no-db
npm --prefix backend run check:tests
npm --prefix frontend run build
npm --prefix frontend run test:delivery-static
```

As verificações sem banco não substituem testes dos fluxos reais. Testes de integração e carga usam ambiente descartável próprio; não devem apontar para o Supabase compartilhado.

## Documentação

- [Execução da equipe](docs/execucao-equipe.md)
- [Variáveis de ambiente e publicação](docs/variaveis-de-ambiente.md)
- [Arquitetura e responsabilidades](docs/arquitetura.md)
- [Acervo e regras do piloto](docs/acervo.md)
- [Segurança e privacidade](docs/seguranca-e-privacidade.md)
- [Conferência da entrega](docs/entrega.md)
- [Testes de carga](docs/testes-de-carga.md)
- [Modelo completo do banco](backend/prisma/schema.prisma)

## Publicação

Frontend: [JurisSim na Vercel](https://jurissim.vercel.app). API: [health no Render](https://jurissim-pfc.onrender.com/health).

Configurações locais não são enviadas automaticamente para a hospedagem. Credenciais ficam fora do Git; variáveis `VITE_*` são públicas no navegador. A existência de uma função no código não comprova que ela esteja ativada ou validada no site publicado.

O acervo piloto continua sujeito à revisão humana. O estado e os limites da entrega estão no [checklist](docs/entrega.md).
