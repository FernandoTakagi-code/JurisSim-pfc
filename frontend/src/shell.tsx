import { useState } from "react";
import { LegalLinks } from "./legal";

const api = import.meta.env.VITE_API_URL ?? "http://localhost:3333";

export function Brand() {
  return (
    <div className="brand">
      <b>⚖</b>
      <span>
        <strong>JurisSim</strong>
        <small>Plataforma adaptativa para o Exame da OAB.</small>
      </span>
    </div>
  );
}

export function SettingsModal({
  nome,
  email,
  role,
  onClose,
}: {
  nome: string;
  email: string;
  role: string;
  onClose: () => void;
}) {
  const [nomeEditavel, setNomeEditavel] = useState(nome);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const salvarNome = async () => {
    setSalvando(true);
    setErro("");
    try {
      const response = await fetch(`${api}/auth/nome`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionStorage.getItem("jurissim_token") ?? ""}`,
        },
        body: JSON.stringify({ nome: nomeEditavel }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.erro ?? "Não foi possível salvar.");
      sessionStorage.setItem("jurissim_user_name", body.usuario.nome);
      window.location.reload();
    } catch (cause) {
      setErro(cause instanceof Error ? cause.message : "Erro inesperado.");
      setSalvando(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 30,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          minWidth: 320,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 style={{ marginTop: 0 }}>Configurações da conta</h2>
        <label style={{ display: "block", marginBottom: 12 }}>
          <b>Nome</b>
          <input
            style={{ display: "block", width: "100%", marginTop: 4 }}
            value={nomeEditavel}
            onChange={(event) => setNomeEditavel(event.target.value)}
          />
        </label>
        <p>
          <b>E-mail:</b> {email}
        </p>
        <p>
          <b>Papel:</b> {role}
        </p>
        {erro && <small style={{ color: "crimson" }}>{erro}</small>}
        <hr />
        <section aria-labelledby="privacy-settings-title">
          <h3 id="privacy-settings-title">Privacidade e dados</h3>
          <LegalLinks />
          <p style={{ fontSize: 13, color: "#68758a", lineHeight: 1.5 }}>
            Para orientações sobre seus direitos, inclusive pedidos de exclusão quando aplicável, consulte a seção “Como exercer seus direitos” do Aviso de Privacidade. Esta tela não registra solicitações nem exclui dados.
          </p>
        </section>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            disabled={salvando || nomeEditavel === nome}
            onClick={salvarNome}
          >
            {salvando ? "Salvando..." : "Salvar nome"}
          </button>
          <button type="button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
