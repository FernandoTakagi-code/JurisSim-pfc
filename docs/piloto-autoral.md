# Piloto do diagnóstico autoral

O responsável pelo projeto autorizou em 11/11/2026 cadastrar as 30 questões no Supabase e ativar o diagnóstico para alunos antes da confirmação do orientador. A ativação é um piloto explícito; não representa aprovação jurídica ou pedagógica.

## Política e rastreabilidade

O acervo normal continua exigindo revisão jurídica, pedagógica e liberação. A exceção de piloto é restrita a um lote IA explicitamente escolhido por `INITIAL_DIAGNOSTIC_PILOT_BATCH_ID`, com composição `AUTORAL_30` e `INITIAL_DIAGNOSTIC_PILOT_ENABLED=true`. Não admite questões oficiais, privadas, incompletas ou anuladas. O lote não entra automaticamente na prática de questões revisadas.

Os responsáveis, datas e evidências de revisão permanecem nulos. A origem continua IA. A importação não preenche aprovações fictícias nem altera os itens antigos. Cada questão recebe fingerprint, vínculo ao lote e evento de criação atribuído ao administrador real da operação. Repetir o mesmo lote recupera seu identificador, sem duplicar registros ou sobrescrever conteúdo.

Novas tentativas do piloto congelam `provisional: true` nos snapshots. Essa indicação é recuperada e devolvida com respostas e resultado mesmo se a configuração do piloto mudar. A interface identifica o conteúdo em revisão e apresenta o resultado como provisório. As respostas continuam no servidor, sem gabarito durante a resolução.

## Preparação e importação

Dentro de `backend`, os comandos de manutenção são:

```powershell
npm.cmd run account:bootstrap-pilot-admin -- --email <email-escolhido>
npm.cmd run question-bank:pilot
```

O primeiro faz uma consulta de existência sem criar conta. O segundo prepara uma prévia local sem conectar ao banco. Ambos informam a impressão digital do destino sem exibir a URL. A gravação requer `--apply`, `--target-id <impressao-conferida>` e, para o lote, `--operator-id <admin-existente>`.

O criador de conta recusa modificar uma conta existente de outro perfil. A senha inicial é aleatória, protegida por bcrypt no banco e salva somente em `backend/.local/pilot-admin.credentials.json`, ignorado pelo Git. O script não inventa confirmação de e-mail nem aceite de termos. O administrador deve concluir essas etapas pelo fluxo normal de primeiro acesso. Nenhum script usa a conta de outro membro como responsável sem sua autorização.

## Configuração do ambiente ativo

As flags abaixo foram aplicadas somente aos arquivos privados do ambiente local, mantendo URLs e credenciais de conexão:

```dotenv
INITIAL_DIAGNOSTIC_COMPOSITION_MODE=AUTORAL_30
INITIAL_DIAGNOSTIC_API_ENABLED=true
INITIAL_DIAGNOSTIC_REQUIRED=true
INITIAL_DIAGNOSTIC_PILOT_ENABLED=true
INITIAL_DIAGNOSTIC_PILOT_BATCH_ID=<lote-importado>
```

No frontend local:

```dotenv
VITE_INITIAL_DIAGNOSTIC_UI_ENABLED=true
VITE_INITIAL_DIAGNOSTIC_PILOT_UI_ENABLED=true
```

As flags anteriores ficam registradas privadamente em `backend/.local/pilot-activation.previous-flags.json`. As flags de exemplo versionadas continuam desligadas. A ativação local não é um deploy de um site hospedado; outro ambiente precisa receber a configuração em seu próprio processo de implantação.

Alunos sem identidade de diagnóstico inicial são encaminhados ao fluxo obrigatório conforme a regra existente. Tentativas existentes são retomadas; não são apagadas para forçar repetição. A conta ALUNO do responsável foi preservada. A conta ADMIN é separada.

## Validação

- Builds do backend e frontend aprovados; tipos dos scripts de manutenção conferidos.
- 69 testes direcionados de diagnóstico/snapshot/piloto aprovados na verificação inicial do fluxo novo.
- PostgreSQL 17.11 descartável: importação pendente de revisão, idempotência, recusa de operador ALUNO, exclusão do acervo normal, seleção do lote, snapshots provisórios, retomada e resultado provisório passaram. O cluster foi encerrado.
- Navegador com API isolada: seis verificações aprovadas, incluindo 30 questões, bloqueio de finalização incompleta, retomada de resposta, tela de 390 px, resultado 15/30 e 50% e retomada do resultado provisório.
- Suíte completa: 1004 testes, 997 aprovados e as mesmas sete falhas anteriores em autenticação de frontend, prévia CSV descontinuada e mensagens de autorização de trilhas.
- As flags de teste são explicitamente isoladas das flags do piloto local, para a configuração privada de uso não contaminar fixtures de autenticação.

Na verificação somente de leitura do Supabase após importar, havia 63 questões: 33 anteriores e 30 do piloto. As 30 tinham quatro alternativas A–D, um gabarito e revisões pendentes; a seleção ficou pronta e nenhuma entrou no inventário normal revisado. Não foram criadas tentativas fictícias de alunos no banco compartilhado. Os testes completos de resolução ocorreram em banco descartável e no navegador com respostas simuladas.

## Desativação e decisão do orientador

Se o conteúdo ou a composição forem rejeitados, desative a obrigatoriedade e o piloto antes de retirar o lote de novas seleções. Use o identificador registrado para tornar apenas as questões desse lote não públicas. Preserve questões já usadas, snapshots, tentativas, respostas e eventos de auditoria; não exclua o histórico dos alunos. A desativação efetiva deve ser conferida no processo que atende o ambiente.

Depois de revisão real, registre as evidências pelo processo de acervo revisado. Não copie aprovações sintéticas dos testes. Quando a `entrega0911` for integrada, repita a validação de retomada, motor e resultados; esta implementação não incorporou os commits daquela branch.
