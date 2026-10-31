import { fingerprintQuestionContent } from './question-fingerprint';
import { INITIAL_DIAGNOSTIC_COMPOSITION, INITIAL_DIAGNOSTIC_DISCIPLINES } from './initial-diagnostic-composition';
import { isEligiblePublicQuestion } from './question-eligibility';

type Letter = 'A' | 'B' | 'C' | 'D';
export type Level = 'BASICO' | 'INTERMEDIARIO' | 'AVANCADO';
export type Origin = 'IA' | 'OAB_OFICIAL';
type Review = { reviewerId: string; reviewedAt: string; evidenceRef: string };
export type Question = {
  enunciado: string; disciplina: string; assunto: string; nivel: Level; fundamentacaoJuridica: string;
  origem: Origin; alternativas: { letra: Letter; texto: string; correta: boolean }[];
  source: { name: string; reference: string; licenseOrAuthorization: string };
  legalReview: Review; pedagogicalReview: Review;
  release: { releasedById: string; releasedAt: string; evidenceRef: string };
  oab?: { exam: string; edition: string; examType: string; questionNumber: number; officialUrl: string;
    officialStatus: 'VALIDA'; rightsStatus: 'AUTORIZADA' | 'DOMINIO_PUBLICO_VERIFICADO';
    rightsVerifiedById: string; rightsVerifiedAt: string; rightsEvidenceRef: string };
};
export type Manifest = { questions: Question[]; practiceTopics: { disciplina: string; assunto: string }[] };

const letters = ['A', 'B', 'C', 'D'];
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isDate = (value: string) => Number.isFinite(Date.parse(value)) && /^\d{4}-\d\d-\d\dT/.test(value);
const key = (discipline: string, topic: string) => `${discipline}\u0000${topic}`;

function safeProtocol(value: string): string {
  try { return new URL(value).protocol; } catch { return ''; }
}

export function validateQuestionBatch(input: unknown) {
  const errors: string[] = [];
  if (!input || typeof input !== 'object' || !Array.isArray((input as Partial<Manifest>).questions)
    || !Array.isArray((input as Partial<Manifest>).practiceTopics)) {
    return { errors: ['manifest.questions/practiceTopics'], valid: [] as Question[] };
  }
  const manifest = input as Manifest;
  const valid: Question[] = [];
  const fingerprints = new Set<string>();

  for (const [index, raw] of manifest.questions.entries()) {
    const q = raw as Question;
    const path = `questions[${index}]`;
    if (!q || !INITIAL_DIAGNOSTIC_DISCIPLINES.includes(q.disciplina as typeof INITIAL_DIAGNOSTIC_DISCIPLINES[number])
      || !['BASICO', 'INTERMEDIARIO', 'AVANCADO'].includes(q.nivel)
      || !['IA', 'OAB_OFICIAL'].includes(q.origem)
      || !isText(q.enunciado) || q.enunciado.trim().length < 10 || !isText(q.assunto) || !isText(q.fundamentacaoJuridica)) {
      errors.push(`${path}.conteudo_disciplina_nivel_origem`); continue;
    }
    if (!Array.isArray(q.alternativas) || q.alternativas.length !== 4
      || q.alternativas.some(a => !a || typeof a !== 'object')
      || new Set(q.alternativas.map(a => a.letra)).size !== 4
      || q.alternativas.some(a => !letters.includes(a.letra) || !isText(a.texto) || typeof a.correta !== 'boolean')
      || !letters.every(letter => q.alternativas.some(a => a.letra === letter))
      || q.alternativas.filter(a => a.correta).length !== 1) {
      errors.push(`${path}.alternativas_A-D_gabarito`); continue;
    }
    const reviews = [q.legalReview, q.pedagogicalReview];
    if (reviews.some(r => !r || !isText(r.reviewerId) || !isDate(r.reviewedAt) || !isText(r.evidenceRef))
      || !q.release || !isText(q.release.releasedById) || !isDate(q.release.releasedAt) || !isText(q.release.evidenceRef)
      || !q.source || !isText(q.source.name) || !isText(q.source.reference) || !isText(q.source.licenseOrAuthorization)) {
      errors.push(`${path}.revisoes_publicacao_fonte_evidencias`); continue;
    }
    if (q.origem === 'OAB_OFICIAL' && (!q.oab || !isText(q.oab.exam) || !isText(q.oab.edition) || !isText(q.oab.examType)
      || !Number.isInteger(q.oab.questionNumber) || q.oab.questionNumber < 1 || q.oab.officialStatus !== 'VALIDA'
      || !['AUTORIZADA', 'DOMINIO_PUBLICO_VERIFICADO'].includes(q.oab.rightsStatus)
      || !isText(q.oab.rightsVerifiedById) || !isDate(q.oab.rightsVerifiedAt) || !isText(q.oab.rightsEvidenceRef)
      || !isText(q.oab.officialUrl) || !['http:', 'https:'].includes(safeProtocol(q.oab.officialUrl)))) {
      errors.push(`${path}.identidade_oficial_direitos`); continue;
    }
    if (q.origem === 'IA' && q.oab !== undefined) { errors.push(`${path}.origem_ia_com_dados_oficiais`); continue; }
    const candidate = {
      id: `batch-${index}`, origin: q.origem, level: q.nivel, public: true, complete: true,
      annulled: false, published: true, legalReviewApproved: true, pedagogicalReviewApproved: true,
      reproductionRightsDocumented: q.origem === 'OAB_OFICIAL',
    } as const;
    if (!isEligiblePublicQuestion(candidate)) { errors.push(`${path}.criterios_elegibilidade`); continue; }
    const fingerprint = fingerprintQuestionContent({ enunciado: q.enunciado, disciplina: q.disciplina,
      assunto: q.assunto, nivel: q.nivel, alternativas: [...q.alternativas].sort((a,b) => a.letra.localeCompare(b.letra))
        .map(({ texto, correta }) => ({ texto, correta })) });
    if (fingerprints.has(fingerprint)) { errors.push(`${path}.duplicada_no_lote`); continue; }
    fingerprints.add(fingerprint);
    valid.push(q);
  }

  for (const slot of INITIAL_DIAGNOSTIC_COMPOSITION) {
    const available = valid.filter(q => q.disciplina === slot.discipline && q.nivel === slot.level && q.origem === slot.origin).length;
    if (available < slot.quantity) errors.push(`diagnostico:${slot.discipline}:${slot.level}:${slot.origin}:${available}/${slot.quantity}`);
  }
  const coverageKeys = new Set<string>();
  for (const topic of manifest.practiceTopics) {
    if (!topic || !INITIAL_DIAGNOSTIC_DISCIPLINES.includes(topic.disciplina as typeof INITIAL_DIAGNOSTIC_DISCIPLINES[number]) || !isText(topic.assunto)) {
      errors.push('practiceTopics:item_invalido'); continue;
    }
    const group = key(topic.disciplina, topic.assunto);
    if (coverageKeys.has(group)) { errors.push(`practiceTopics:duplicado:${topic.disciplina}`); continue; }
    coverageKeys.add(group);
    const count = valid.filter(q => q.disciplina === topic.disciplina && q.assunto === topic.assunto).length;
    if (count < 5) errors.push(`pratica:${topic.disciplina}:${count}/5`);
  }
  for (const discipline of INITIAL_DIAGNOSTIC_DISCIPLINES) {
    if (![...coverageKeys].some(item => item.startsWith(`${discipline}\u0000`))) errors.push(`pratica:assunto_declarado_ausente:${discipline}`);
  }
  return { errors, valid };
}
