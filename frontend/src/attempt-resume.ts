import { useEffect, useState, useSyncExternalStore } from 'react';
import { ApiError, apiRequest } from './api';
import type { StudyResult } from './student-progress';

type Question = { id: string; position: number; statement: string; discipline: string; topic: string;
  difficulty: string; alternatives: { id: string; text: string }[]; selectedOptionId: string | null };
type Restored = { kind: 'diagnostico' | 'trilha'; id: string; questions: Question[]; result?: StudyResult };
const subscribeLocation = (listener: () => void) => {
  window.addEventListener('popstate', listener);
  return () => window.removeEventListener('popstate', listener);
};

// Only an opaque ID is put in the URL. Answers and keys always come from the
// authenticated API; no answer cache is persisted in browser storage.
export function useAttemptResume(route: string) {
  const search = useSyncExternalStore(subscribeLocation, () => window.location.search);
  const params = new URLSearchParams(search);
  const id = params.get('tentativa') ?? params.get('trilha');
  const requested = route === '/diagnostico' && Boolean(id);
  const [restored, setRestored] = useState<Restored | null>(null);
  const [loading, setLoading] = useState(requested);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    if (!requested || !id) { setLoading(false); setError(''); setRestored(null); return; }
    const kind = params.has('tentativa') ? 'diagnostico' : 'trilha';
    const endpoint = kind === 'diagnostico' ? `/diagnostics/${encodeURIComponent(id)}` : `/trilhas/attempts/${encodeURIComponent(id)}`;
    setLoading(true); setError(''); setRestored(null);
    void (async () => {
      try {
        try {
          const result = await apiRequest<StudyResult>(`${endpoint}/result`);
          if (active) setRestored({ kind, id, questions: [], result });
        } catch (cause) {
          if (!(cause instanceof ApiError) || cause.status !== 409) throw cause;
          const { questions } = await apiRequest<{ questions: Question[] }>(`${endpoint}/questions`);
          if (!questions.length) throw new Error('Esta tentativa não possui questões disponíveis.');
          if (active) setRestored({ kind, id, questions });
        }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível retomar a tentativa.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
    // Parameters are derived from the location, never from cached answers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, search, revision]);
  return { requested, restored, loading, error, retry: () => setRevision(value => value + 1) };
}
