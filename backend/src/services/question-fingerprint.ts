import { createHash } from 'node:crypto';

export type FingerprintQuestion = {
  enunciado: string;
  disciplina: string;
  assunto: string;
  nivel: string;
  alternativas: { texto: string; correta: boolean }[];
};

export function fingerprintQuestionContent(question: FingerprintQuestion): string {
  const normalize = (value: string) => value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('pt-BR');
  const material = JSON.stringify({
    enunciado: normalize(question.enunciado),
    disciplina: normalize(question.disciplina),
    assunto: normalize(question.assunto),
    nivel: question.nivel,
    alternativas: question.alternativas.map(alternative => ({
      texto: normalize(alternative.texto),
      correta: alternative.correta,
    })),
  });
  return createHash('sha256').update(material, 'utf8').digest('hex');
}
