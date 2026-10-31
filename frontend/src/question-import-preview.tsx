import { useState, type ChangeEvent, type FormEvent } from 'react';
import { apiRequest } from './api';

type Preview = {
  totals: { total: number; valid: number; invalid: number; duplicated: number };
  rows: {
    line: number;
    status: 'VALID' | 'INVALID' | 'DUPLICATE';
    question?: {
      enunciado: string;
      disciplina: string;
      assunto: string;
      nivel: string;
      alternativas: { letra: string; texto: string }[];
      gabarito: string;
      fonte_nome: string;
      fonte_referencia: string;
      licenca_ou_autorizacao: string;
    };
    errors: { field: string; message: string }[];
  }[];
};

const maxBytes = 2 * 1024 * 1024;
const statusLabel = { VALID: 'Válida', INVALID: 'Inválida', DUPLICATE: 'Duplicada' };

export function QuestionImportPreview({ role }: { role: string }) {
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (role !== 'ADMIN') return <main className="v0-page"><h1>Acesso restrito</h1><p role="alert">A pré-validação de questões está disponível somente para administradores.</p></main>;

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    setFile(selected);
    setPreview(undefined);
    setError(selected && selected.size > maxBytes ? 'O arquivo deve ter no máximo 2 MiB.' : '');
  };

  const validate = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || file.size > maxBytes) return;
    setLoading(true);
    setError('');
    setPreview(undefined);
    try {
      const csv = await file.text();
      const result = await apiRequest<Preview>('/questoes/importacao/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv; charset=utf-8' },
        body: csv,
      });
      setPreview(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível validar o CSV.');
    } finally {
      setLoading(false);
    }
  };

  return <main className="v0-page question-import-page">
    <p className="gold">ADMINISTRAÇÃO · BANCO DE QUESTÕES</p>
    <h1>Pré-validar arquivo CSV</h1>
    <p className="v0-description">Confira o formato e os dados antes de qualquer etapa de importação. Esta prévia não grava questões.</p>
    <section className="v0-panel question-import-panel" aria-labelledby="question-import-file-title">
      <h2 id="question-import-file-title">Selecionar arquivo</h2>
      <p>Use o modelo CSV. São aceitos arquivos de até 2 MiB e 200 questões por arquivo.</p>
      <a className="outline-button question-import-template" href="/modelos/importacao-questoes.csv" download>Baixar modelo CSV</a>
      <form onSubmit={validate}>
        <label htmlFor="question-import-file">Arquivo CSV</label>
        <input id="question-import-file" type="file" accept=".csv,text/csv" onChange={chooseFile} aria-describedby="question-import-help" />
        <small id="question-import-help">O arquivo é lido em memória e não é armazenado pelo servidor.</small>
        {file && <p className="question-import-filename">Selecionado: {file.name} ({(file.size / 1024).toFixed(1)} KiB)</p>}
        <button className="primary" type="submit" disabled={!file || file.size > maxBytes || loading}>{loading ? 'Validando…' : 'Validar e pré-visualizar'}</button>
      </form>
      {error && <p className="question-import-error" role="alert">{error}</p>}
    </section>

    {preview && <section className="question-import-results" aria-labelledby="question-import-results-title" aria-live="polite">
      <h2 id="question-import-results-title">Resultado da pré-validação</h2>
      <div className="question-import-totals">
        <article><strong>{preview.totals.valid}</strong><span>Válidas</span></article>
        <article><strong>{preview.totals.invalid}</strong><span>Inválidas</span></article>
        <article><strong>{preview.totals.duplicated}</strong><span>Duplicadas</span></article>
      </div>
      {!preview.totals.total && <p>Nenhuma questão encontrada no arquivo.</p>}
      <ol className="question-import-list">
        {preview.rows.map(row => <li key={row.line} className={`question-import-row is-${row.status.toLowerCase()}`}>
          <div className="question-import-row-heading"><strong>Linha {row.line}</strong><span>{statusLabel[row.status]}</span></div>
          {row.question && <>
            <p className="question-import-statement">{row.question.enunciado}</p>
            <small>{row.question.disciplina} · {row.question.assunto} · {row.question.nivel}</small>
            <ul>{row.question.alternativas.map(item => <li key={item.letra}>{item.letra}{item.letra === row.question?.gabarito ? ' · gabarito' : ''}: {item.texto}</li>)}</ul>
            <small>Fonte: {row.question.fonte_nome} · {row.question.fonte_referencia} · Autorização/licença: {row.question.licenca_ou_autorizacao}</small>
          </>}
          {row.errors.length > 0 && <ul className="question-import-errors">{row.errors.map((item, index) => <li key={`${item.field}-${index}`}><strong>{item.field}:</strong> {item.message}</li>)}</ul>}
        </li>)}
      </ol>
      <p className="question-import-no-write">A pré-visualização não salva dados. A gravação será implementada em uma etapa posterior.</p>
    </section>}
  </main>;
}
