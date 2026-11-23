import { useEffect, useRef, useState } from "react";
import { apiRequest } from "./api";
import { navigate } from "./navigation";

/** O endpoint existente retorna a tentativa vinculada quando ela já foi gerada. */
export function TrailLaunchButton({ trail, completed = false, generated = false }: {
  trail: { id: string; simuladoGeradoId?: string | null };
  completed?: boolean;
  generated?: boolean;
}) {
  const pending = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function launch() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      // IDs de recomendação e IDs de tentativa são distintos. Usa apenas o vínculo
      // explícito persistido para abrir uma tentativa/resultado existente sem gerar outra.
      const existingAttemptId = trail.simuladoGeradoId;
      const attempt = existingAttemptId ? { id: existingAttemptId }
        : await apiRequest<{ id: string }>(`/trilhas/${encodeURIComponent(trail.id)}/gerar`, { method: "POST" });
      if (!active.current) return;
      if (!attempt || typeof attempt.id !== "string" || !attempt.id) throw new Error("A tentativa não foi confirmada pelo servidor. Tente novamente.");
      navigate(completed ? `/resultados/trilha/${encodeURIComponent(attempt.id)}` : `/diagnostico?trilha=${encodeURIComponent(attempt.id)}`);
    } catch (cause) {
      if (active.current) setError(cause instanceof Error ? cause.message : "Não foi possível abrir os exercícios. Tente novamente.");
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  return <div className="trail-launch">
    <button className="primary" disabled={busy} onClick={() => void launch()}>{busy ? "Carregando..." : completed ? "Ver resultado" : (generated || trail.simuladoGeradoId) ? "Retomar exercícios" : "Gerar exercícios"}</button>
    {error && <p role="alert" className="error">{error}</p>}
  </div>;
}
