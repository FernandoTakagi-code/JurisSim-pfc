import Groq from 'groq-sdk';

const apiKey = process.env.GROQ_API_KEY;
const groq = apiKey ? new Groq({ apiKey }) : null;

interface DadosTrilha {
  priorityDiscipline: string;
  priorityTopic: string | null;
  recommendedLevel: string;
  reason: string;
}

export async function gerarJustificativaComIA(trail: DadosTrilha): Promise<string | null> {
  if (!groq) {
    console.warn('GROQ_API_KEY nao configurada — usando justificativa padrao.');
    return null;
  }

  try {
    const prompt = `Você é um tutor de Direito que ajuda estudantes a se prepararem para o Exame da OAB.
Um aluno acabou de terminar um simulado com o seguinte resultado:
- Disciplina prioritária para revisão: ${trail.priorityDiscipline}
- Assunto prioritário: ${trail.priorityTopic ?? 'não identificado'}
- Nível recomendado de estudo: ${trail.recommendedLevel}
- Observação técnica: ${trail.reason}

Escreva um feedback curto (máximo 3 frases), em português, direto ao aluno, explicando de forma clara e motivadora o que ele deve estudar e por quê. Não use saudações nem despedidas, vá direto ao feedback.`;

    const completion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: prompt }],
    });

    const texto = completion.choices[0]?.message?.content?.trim();
    return texto && texto.length > 0 ? texto : null;
  } catch (error) {
    console.error('Erro ao gerar feedback com IA:', error);
    return null;
  }
}