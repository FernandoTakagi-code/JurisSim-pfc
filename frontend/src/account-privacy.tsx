import { useState } from 'react';
import { apiRequest } from './api';
import { LegalLinks } from './legal';

type ExportPage = { page: number; nextPage: number | null; scope: string };
export function AccountPrivacy() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const download = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const data = await apiRequest<ExportPage>(`/auth/dados?page=${page}`);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `jurissim-meus-dados-${page}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(data.nextPage ? `Página ${page} baixada. Há mais registros; baixe a próxima página para completar a cópia.` : 'Cópia concluída. Guarde os arquivos em local seguro; eles contêm seus dados pessoais.');
      setPage(data.nextPage ?? 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível baixar seus dados.'); }
    finally { setBusy(false); }
  };
  return <article className="v0-panel" aria-labelledby="privacy-settings-title">
    <h2 id="privacy-settings-title">Seus dados e sua conta</h2>
    <p>Baixe seu perfil, respostas, resultados, trilhas, metas, revisões e eventos pessoais. O arquivo JSON organiza os registros para consulta e reutilização. Contas com muitos registros recebem arquivos em páginas de até 100 itens por categoria.</p>
    <button className="outline-button" disabled={busy} onClick={download}>{busy ? 'Processando…' : page > 1 ? `Baixar página ${page} dos meus dados` : 'Baixar meus dados'}</button>
    <p>Para outros dados, correções ou pedidos de exclusão, escreva para <a href="mailto:jurissimplataforma@gmail.com">jurissimplataforma@gmail.com</a>. Não envie sua senha.</p>
    <LegalLinks />
    {message && <p role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}
  </article>;
}
