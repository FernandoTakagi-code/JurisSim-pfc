import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './account-actions.css';

export function AccountConfirmationDialog({ title, description, busy, close, children }: {
  title: string; description: string; busy: boolean; close: () => void; children: ReactNode;
}) {
  const titleId = useId(), descriptionId = useId();
  const dialog = useRef<HTMLElement>(null), closeRef = useRef(close), busyRef = useRef(busy);
  const [dark, setDark] = useState(() => typeof document !== 'undefined' && document.querySelector('.v0-app:not(.account-confirmation-layer)')?.classList.contains('v0-dark') === true);
  closeRef.current = close; busyRef.current = busy;
  useEffect(() => {
    const app = document.querySelector<HTMLElement>('.v0-app:not(.account-confirmation-layer)') ?? document.querySelector<HTMLElement>('.teacher-invitation');
    const opener = document.activeElement as HTMLElement | null;
    const priorInert = app?.inert, priorOverflow = document.body.style.overflow;
    if (app) app.inert = true;
    document.body.style.overflow = 'hidden';
    const theme = () => setDark(app?.classList.contains('v0-dark') === true);
    theme(); const observer = new MutationObserver(theme);
    if (app) observer.observe(app, { attributes: true, attributeFilter: ['class'] });
    dialog.current?.querySelector<HTMLElement>('[data-confirmation-cancel]')?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (!busyRef.current) closeRef.current(); }
      if (event.key !== 'Tab') return;
      const nodes = [...dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]') ?? []].filter(node => node.getClientRects().length > 0);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (!nodes.length) { event.preventDefault(); dialog.current?.focus(); }
      else if (!dialog.current?.contains(document.activeElement)) { event.preventDefault(); first?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', keyboard);
    return () => {
      window.removeEventListener('keydown', keyboard); observer.disconnect();
      if (app) app.inert = priorInert ?? false;
      document.body.style.overflow = priorOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return createPortal(<div className={`v0-app account-confirmation-layer${dark ? ' v0-dark' : ''}`}>
    <div className="account-confirmation-backdrop">
      <section ref={dialog} className="account-confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} aria-busy={busy} tabIndex={-1}>
        <header><h2 id={titleId}>{title}</h2><button type="button" className="account-action-button" aria-label="Fechar confirmação" disabled={busy} onClick={close}>×</button></header>
        <p id={descriptionId}>{description}</p>
        {children}
      </section>
    </div>
  </div>, document.body);
}
