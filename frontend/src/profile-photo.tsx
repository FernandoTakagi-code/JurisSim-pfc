import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { apiRequest } from './api';
import './profile-photo.css';

export type Photo = { kind: 'default' } | { kind: 'avatar'; avatarId: string; version: string } | { kind: 'image'; dataUrl: string; version: string };
const avatars = [
  ['scholar-1', 'Estudante com óculos'], ['scholar-2', 'Estudante de cabelo castanho'],
  ['scholar-3', 'Estudante de cabelo curto'], ['scholar-4', 'Estudante de cabelo grisalho'],
  ['scholar-5', 'Estudante de blazer dourado'], ['scholar-6', 'Estudante de cabelo ruivo'],
  ['books', 'Livros abertos'], ['justice', 'Balança da justiça'],
] as const;
const defaultPhoto: Photo = { kind: 'default' };
const photoContext = createContext<{ photo: Photo; loading: boolean; error: string; reload: () => void; save: (method: string, body?: BodyInit, type?: string) => Promise<void> }>({ photo: defaultPhoto, loading: true, error: '', reload: () => {}, save: async () => {} });
function validatePhoto(photo: Photo): Photo {
  if (photo?.kind === 'default') return photo;
  if (photo?.kind === 'avatar' && avatars.some(([id]) => id === photo.avatarId)) return photo;
  if (photo?.kind === 'image' && /^data:image\/webp;base64,[A-Za-z0-9+/]+=*$/.test(photo.dataUrl) && photo.dataUrl.length < 360000) return photo;
  throw new Error('Não foi possível carregar a imagem de perfil.');
}
export function PhotoProvider({ children }: { children: ReactNode }) {
  const [photo, setPhoto] = useState<Photo>(defaultPhoto), [loading, setLoading] = useState(true), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const active = useRef(true);
  const revision = useRef(0);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    const requestRevision = ++revision.current;
    setLoading(true); setError('');
    apiRequest<Photo>('/profile/photo').then(validatePhoto).then(value => { if (!cancelled && requestRevision === revision.current) setPhoto(value); }).catch(e => { if (!cancelled && requestRevision === revision.current) setError(e.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [attempt]);
  const save = async (method: string, body?: BodyInit, type = 'application/json') => {
    const requestRevision = ++revision.current;
    const value = validatePhoto(await apiRequest<Photo>('/profile/photo' + (method === 'DELETE' ? '' : type === 'application/json' ? '/avatar' : '/image'), { method, body, headers: { 'Content-Type': type } }));
    if (active.current && requestRevision === revision.current) { setPhoto(value); setError(''); }
  };
  return <photoContext.Provider value={{ photo, loading, error, reload: () => setAttempt(n => n + 1), save }}>{children}</photoContext.Provider>;
}
function source(photo: Photo) {
  return photo.kind === 'avatar' && avatars.some(([id]) => id === photo.avatarId) ? `/avatars/${photo.avatarId}.svg` : photo.kind === 'image' ? photo.dataUrl : undefined;
}
export function ProfileAvatar({ name, photo: selected }: { name: string; photo?: Photo }) {
  const { photo } = useContext(photoContext), value = selected ?? photo;
  const src = source(value);
  return <span className="v0-avatar profile-avatar">{src ? <img src={src} alt={`Imagem de perfil de ${name}`} /> : <span aria-label={`Avatar padrão de ${name}`}>{name.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase() || 'JS'}</span>}</span>;
}

export function ProfilePhotoEditor({ name }: { name: string }) {
  const { photo, loading, error: loadError, reload, save } = useContext(photoContext);
  const [open, setOpen] = useState(false), [draft, setDraft] = useState<Photo>(defaultPhoto), [file, setFile] = useState<Blob | null>(null), [preview, setPreview] = useState('');
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [camera, setCamera] = useState(false), [starting, setStarting] = useState(false), [ready, setReady] = useState(false);
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null), cameraGeneration = useRef(0), trigger = useRef<HTMLButtonElement>(null), editor = useRef<HTMLDivElement>(null), alive = useRef(true);
  const stopCamera = useCallback(() => {
    cameraGeneration.current++;
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    if (video.current) video.current.srcObject = null;
    setCamera(false); setStarting(false); setReady(false);
  }, []);
  useEffect(() => { alive.current = true; return () => { alive.current = false; cameraGeneration.current++; stream.current?.getTracks().forEach(track => track.stop()); }; }, []);
  useEffect(() => { if (open) editor.current?.focus(); }, [open]);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const close = () => { if (busy) return; stopCamera(); setFile(null); setOpen(false); setError(''); trigger.current?.focus(); };
  const select = (next: Photo) => { stopCamera(); setFile(null); setDraft(next); setError(''); };
  const chooseFile = (next?: File) => {
    if (!next) return;
    stopCamera(); setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(next.type)) { setError('Use uma imagem JPEG, PNG ou WebP.'); return; }
    if (next.size > 5 * 1024 * 1024) { setError('A imagem deve ter no máximo 5 MB.'); return; }
    if (!next.size) { setError('O arquivo de imagem está vazio.'); return; }
    setFile(next);
  };
  const startCamera = async () => {
    stopCamera(); setError('');
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setError('Câmera indisponível. Use HTTPS ou localhost em um navegador compatível, ou envie uma imagem.'); return; }
    setStarting(true); const generation = ++cameraGeneration.current;
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } }, audio: false });
      if (!alive.current || generation !== cameraGeneration.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media; setCamera(true); setStarting(false); setFile(null);
    } catch (e) {
      if (!alive.current || generation !== cameraGeneration.current) return;
      setStarting(false);
      const code = (e as DOMException).name;
      setError(code === 'NotAllowedError' ? 'Permissão da câmera negada. Autorize no navegador ou envie uma imagem.' : code === 'NotFoundError' ? 'Nenhuma câmera encontrada. Envie uma imagem do dispositivo.' : 'Não foi possível acessar a câmera. Verifique se está disponível.');
    }
  };
  useEffect(() => {
    if (camera && video.current && stream.current) {
      video.current.srcObject = stream.current;
      void video.current.play().catch(() => { stopCamera(); setError('Não foi possível iniciar a prévia da câmera.'); });
    }
  }, [camera, stopCamera]);
  const capture = () => {
    if (!video.current?.videoWidth || !video.current.videoHeight) { setError('Aguarde a câmera ficar pronta.'); return; }
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d'); if (!ctx) { setError('Captura indisponível neste navegador.'); return; }
    const size = Math.min(video.current.videoWidth, video.current.videoHeight);
    ctx.drawImage(video.current, (video.current.videoWidth - size) / 2, (video.current.videoHeight - size) / 2, size, size, 0, 0, 512, 512);
    const generation = cameraGeneration.current;
    canvas.toBlob(blob => { if (!alive.current || generation !== cameraGeneration.current) return; if (!blob) { setError('Não foi possível capturar a foto.'); return; } stopCamera(); setFile(blob); setError(''); }, 'image/png');
  };
  const confirm = async () => {
    stopCamera(); setBusy(true); setError('');
    try {
      if (file) await save('PUT', file, ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ? file.type : 'application/octet-stream');
      else if (draft.kind === 'avatar') await save('PUT', JSON.stringify({ avatarId: draft.avatarId }));
      else if (draft.kind === 'default') await save('DELETE');
      if (alive.current) { setOpen(false); setFile(null); setMessage('Imagem de perfil atualizada.'); trigger.current?.focus(); }
    } catch (e) { if (alive.current) setError((e as Error).message); }
    finally { if (alive.current) setBusy(false); }
  };
  return <div className="profile-photo-feature">
    <div className="v0-photo"><ProfileAvatar name={name} /><div><strong>Foto de perfil</strong><p>Escolha um avatar ou uma foto. JPEG, PNG ou WebP, até 5 MB.</p>
      <button ref={trigger} type="button" disabled={loading || busy} aria-expanded={open} onClick={() => { stopCamera(); setDraft(photo); setFile(null); setError(''); setMessage(''); setOpen(true); }}>Alterar foto</button>
    </div></div>
    {loadError && <p role="alert">{loadError} <button type="button" onClick={reload}>Tentar novamente</button></p>}
    {message && <p role="status">{message}</p>}
    {open && <div className="photo-editor" ref={editor} tabIndex={-1} role="region" aria-label="Personalizar foto de perfil" aria-busy={busy} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
      <h3>Personalizar foto</h3><p>A imagem fica privada na sua conta. Só é salva ao confirmar.</p>
      <fieldset disabled={busy}><legend>Avatares disponíveis</legend><div className="photo-gallery">
        <button type="button" aria-pressed={!file && draft.kind === 'default'} onClick={() => select(defaultPhoto)}><ProfileAvatar name={name} photo={defaultPhoto} /><span>Padrão</span></button>
        {avatars.map(([id, label]) => <button type="button" key={id} aria-label={label} aria-pressed={!file && draft.kind === 'avatar' && draft.avatarId === id} onClick={() => select({ kind: 'avatar', avatarId: id, version: '' })}><img src={`/avatars/${id}.svg`} alt="" /><span>{label}</span></button>)}
      </div><div className="photo-source-actions"><label className="photo-upload">Enviar imagem<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { chooseFile(e.target.files?.[0]); e.target.value = ''; }} /></label>
        <button type="button" onClick={startCamera} disabled={starting}>{starting ? 'Solicitando câmera...' : 'Usar câmera'}</button>
        <button type="button" onClick={() => select(defaultPhoto)}>Remover foto</button>
      </div></fieldset>
      {camera ? <div className="photo-camera"><video ref={video} autoPlay muted playsInline aria-label="Prévia da câmera" onLoadedData={() => setReady(true)} /><div><button type="button" onClick={capture} disabled={!ready}>Capturar foto</button><button type="button" onClick={stopCamera}>Fechar câmera</button></div></div>
        : <div className="photo-preview">{preview ? <img src={preview} alt="Pré-visualização da nova foto" onError={() => { setFile(null); setError('Não foi possível visualizar a imagem. Escolha outro arquivo.'); }} /> : <ProfileAvatar name={name} photo={draft} />}<span>Pré-visualização</span>{file && <button type="button" disabled={busy} onClick={startCamera}>Repetir pela câmera</button>}</div>}
      {error && <p role="alert">{error}</p>}
      <div className="photo-confirm"><button type="button" onClick={close} disabled={busy}>Cancelar</button><button className="primary" type="button" onClick={confirm} disabled={busy || camera || starting || (!file && draft === photo)}> {busy ? 'Salvando foto...' : 'Salvar foto'}</button></div>
    </div>}
  </div>;
}
