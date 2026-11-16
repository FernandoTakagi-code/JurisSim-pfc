import {createContext,useContext,useEffect,useRef,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Icon} from '../ui-icon';

export const ModalTheme = createContext(false);

export function Dialog({
  title,
  subtitle,
  icon,
  className,
  footer,
  close,
  children,
  busy = false,
}: {
  title: string;
  subtitle?: string;
  icon?: string;
  className?: string;
  footer?: ReactNode;
  close: () => void;
  children: ReactNode;
  busy?: boolean;
}) {
  const dark = useContext(ModalTheme);
  const dialog = useRef<HTMLDivElement>(null),
    closeRef = useRef(close);
  const busyRef = useRef(busy);
  closeRef.current = close;
  busyRef.current = busy;
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    const workspace = document.querySelector<HTMLElement>('.institution-workspace:not(.institution-dialog-layer)');
    const priorInert = workspace?.inert;
    const priorOverflow = document.body.style.overflow;
    if (workspace) workspace.inert = true;
    document.body.style.overflow = 'hidden';
    const focusable = () =>
      Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
        ) ?? [],
      ).filter(element => element.getClientRects().length > 0);
    (dialog.current?.querySelector<HTMLElement>('[data-dialog-autofocus], input:not(:disabled)') ?? focusable()[0] ?? dialog.current)?.focus();
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); if (!busyRef.current) closeRef.current(); }
      if (e.key === "Tab") {
        const nodes = focusable(),
          first = nodes[0],
          last = nodes[nodes.length - 1];
        if (!nodes.length) { e.preventDefault(); dialog.current?.focus(); }
        else if (!dialog.current?.contains(document.activeElement)) { e.preventDefault(); first?.focus(); }
        else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => {
      window.removeEventListener("keydown", keyboard);
      if (workspace) workspace.inert = priorInert ?? false;
      document.body.style.overflow = priorOverflow;
      if (prior?.isConnected) prior.focus();
    };
  }, []);
  return createPortal(
    <div className={`institution-workspace institution-dialog-layer${dark ? ' dark-mode' : ''}`}><div className="modal-backdrop" role="presentation">
      <div
        ref={dialog}
        className={`modal${className ? ` ${className}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="institution-modal-title"
        aria-describedby={subtitle ? "institution-modal-subtitle" : undefined}
        aria-busy={busy}
        tabIndex={-1}
      >
        <div className="modal-head">
          {icon && <span className="modal-title-icon"><Icon name={icon} /></span>}
          <div>
            <h2 id="institution-modal-title">{title}</h2>
            {subtitle && <p id="institution-modal-subtitle">{subtitle}</p>}
          </div>
          <button type="button" className="icon-button" aria-label="Fechar" disabled={busy} onClick={close}>
            <Icon name="close" />
          </button>
        </div>
        <div className="institution-dialog-body">{children}</div>
        <div className="modal-footer">
          {busy && <p role="status">Aguarde a confirma??o do envio.</p>}
          {footer ?? <button type="button" className="outline-button" disabled={busy} onClick={close}>Fechar</button>}
        </div>
      </div>
    </div></div>, document.body
  );
}
