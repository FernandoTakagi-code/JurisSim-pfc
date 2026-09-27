# Integração com API externa — Groq (feedback com IA)

## Objetivo

Ao final do **simulado diagnóstico**, o motor adaptativo do JurisSim calcula, por regras determinísticas, qual disciplina, assunto e nível o aluno deve priorizar. A integração com a **API da Groq** transforma esse resultado técnico em um **feedback curto, claro e motivador em português**, exibido ao aluno na tela de resultado.

A IA **não decide** nada: a recomendação (disciplina, assunto, nível e quantidade de questões) continua sendo calculada pelo motor de regras. A IA apenas redige o texto de orientação.

## Serviço utilizado

| Item | Valor |
|---|---|
| Provedor | [Groq](https://groq.com) — API compatível com o formato OpenAI Chat Completions |
| SDK | [`groq-sdk`](https://www.npmjs.com/package/groq-sdk) (dependência do backend) |
| Endpoint | `POST https://api.groq.com/openai/v1/chat/completions` (chamado pelo SDK) |
| Modelo | `openai/gpt-oss-120b` |
| Autenticação | Chave de API no cabeçalho `Authorization: Bearer <GROQ_API_KEY>` (feita pelo SDK) |

## Onde está no código

| Arquivo | Papel |
|---|---|
| `backend/src/services/feedback-service.ts` | Cliente da API. Função `gerarJustificativaComIA(trail)` monta o prompt, chama a Groq e devolve o texto (ou `null`). |
| `backend/src/services/diagnostic-service.ts` | No método `finalize`, após o motor adaptativo calcular a trilha, chama `gerarJustificativaComIA` e, se houver texto, substitui a justificativa padrão. |
| `backend/.env` | Variável `GROQ_API_KEY`. |

## Fluxo

```
Aluno finaliza o diagnóstico
        │
        ▼
POST /diagnostics/:id/finalize
        │
        ▼
DiagnosticService.finalize()
  1. analyzeDiagnostic()  → motor de regras calcula desempenho e trilha
  2. gerarJustificativaComIA(trilha)  ──►  API Groq (chat.completions)
        │                                   │
        │◄──────── texto do feedback ───────┘
  3. Se veio texto: trail.reason e recommendation = texto da IA
     Se não veio:   mantém a justificativa padrão do motor
  4. Salva o resultado e a trilha no banco
        │
        ▼
GET /diagnostics/:id/result  → frontend exibe "recommendation"
```

## Dados enviados

Apenas dados **não pessoais**, derivados do resultado:

| Campo | Exemplo |
|---|---|
| Disciplina prioritária | `Direito Civil` |
| Assunto prioritário | `Contratos` (ou "não identificado") |
| Nível recomendado | `INTERMEDIARIO` |
| Observação técnica | Texto gerado pelo motor de regras |

**Não são enviados** nome, e-mail, identificador do usuário, respostas individuais ou qualquer outro dado pessoal. Isso está descrito no Aviso de Privacidade (seção "Feedback gerado por inteligência artificial").

### Exemplo de requisição (formato enviado pelo SDK)

```json
{
  "model": "openai/gpt-oss-120b",
  "messages": [
    {
      "role": "user",
      "content": "Você é um tutor de Direito ... - Disciplina prioritária para revisão: Direito Civil - Assunto prioritário: Contratos - Nível recomendado de estudo: INTERMEDIARIO ... Escreva um feedback curto (máximo 3 frases) ..."
    }
  ]
}
```

### Exemplo de resposta (trecho usado)

```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "Seu desempenho mostra que Contratos, em Direito Civil, é o ponto que mais vai render agora. Revise os princípios contratuais e resolva questões de nível intermediário..."
      }
    }
  ]
}
```

O sistema usa somente `choices[0].message.content`.

## Tratamento de falhas

A integração foi feita para **nunca impedir** o aluno de ver o resultado:

| Situação | Comportamento |
|---|---|
| `GROQ_API_KEY` não configurada | Não chama a API; registra aviso no console e usa a justificativa padrão. |
| Erro de rede, limite de uso ou erro da API | Captura a exceção, registra no console e usa a justificativa padrão. |
| Resposta vazia | Usa a justificativa padrão. |

## Configuração

1. Crie uma conta em <https://console.groq.com> e gere uma chave em **API Keys**.
2. No arquivo `backend/.env`, adicione:
   ```env
   GROQ_API_KEY=gsk_sua_chave_aqui
   ```
3. Reinicie o backend (`npm run dev`).
4. Faça um simulado diagnóstico como aluno. Na tela de resultado, o texto em "Seu nível atual" passa a ser gerado pela IA.

A chave **não deve ser versionada**: o `.env` está no `.gitignore`.

## Como demonstrar

1. Com a `GROQ_API_KEY` configurada, finalize um diagnóstico e mostre o feedback personalizado.
2. Remova a chave, reinicie e finalize outro diagnóstico: o sistema continua funcionando com o texto padrão do motor de regras (tolerância a falhas).