import { useEffect, useRef, useState, type ReactNode } from "react";
import { apiRequest } from "./api";
import { refreshSession, type Session } from "./auth-session";
import { LegalLinks } from "./legal";
import { navigate, usePath } from "./navigation";
import "./integration-shell.css";
import { PhotoProvider, ProfileAvatar, ProfilePhotoEditor } from "./profile-photo";
import { setLocalDiagnosticDemoMode } from "./auth-session";

// Adapted from NavItem, UserProfileDropdown and ProfileSettings in the aluno
// v0 export. Routing, account data and mutations belong to the existing app.
type User = Session["user"];
type Theme = "light" | "dark" | "system";
type Item = { path: string; label: string; icon: string };
const roleLabel = (role: User["role"]) =>
  ({ ALUNO: "Aluno", PROFESSOR: "Professor", ADMIN: "Administrador" })[role];

function readPreference(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function writePreference(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Preferences are optional. */
  }
}

export function IntegrationShell({
  user,
  children,
  onSair,
  localDiagnosticDemoActive = false,
  onExitLocalDemo,
}: {
  user: User;
  children: ReactNode;
  onSair: () => void;
  localDiagnosticDemoActive?: boolean;
  onExitLocalDemo?: () => void;
}) {
  const path = usePath();
  const teacher = user.role !== "ALUNO";
  const base = teacher ? "/professor" : "";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => readPreference("jurissim-sidebar-collapsed", "false") === "true",
  );
  const [theme, setTheme] = useState<Theme>(() => {
    const value = readPreference("jurissim-theme", "system");
    return value === "dark" || value === "light" ? value : "system";
  });
  const [dark, setDark] = useState(false);
  const [dropdown, setDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const wasMobileOpen = useRef(false);
  const primary: Item[] = teacher
    ? [
        { path: base, label: "Início", icon: "home" },
        { path: base + "/questoes", label: "Banco de questões", icon: "book" },
        {
          path: base + "/questoes/nova",
          label: "Cadastrar questão",
          icon: "plus",
        },
        { path: base + "/turmas", label: "Turmas", icon: "users" },
        { path: base + "/alunos", label: "Alunos", icon: "users" },
        { path: base + "/simulados", label: "Simulados", icon: "file" },
        ...(user.role === "ADMIN" ? [{ path: "/professor/questoes/importar", label: "Importar questões", icon: "file" }] : []),
      ]
    : [
        { path: "/dashboard", label: "Início", icon: "home" },
        { path: "/estudar", label: "Estudar", icon: "book" },
        { path: "/turmas", label: "Minhas turmas", icon: "users" },
        { path: "/simulados", label: "Simulados", icon: "file" },
        { path: "/questoes", label: "Questões", icon: "file" },
        { path: "/desempenho", label: "Meu desempenho", icon: "chart" },
        { path: "/trilha", label: "Minha Trilha de Estudos", icon: "target" },
      ];
  const secondary: Item[] = teacher
    ? [
        { path: base + "/desempenho", label: "Desempenho", icon: "chart" },
        { path: base + "/relatorios", label: "Relatórios", icon: "file" },
      ]
    : [
        { path: "/historico", label: "Histórico de atividades", icon: "chart" },
        { path: "/metas", label: "Metas de estudo", icon: "target" },
      ];
  const profilePath = base + "/perfil";
  const settingsPath = base + "/configuracoes";
  const utility = path === profilePath || path === settingsPath;
  const currentNav = [...primary, ...secondary].filter(item => path === item.path || (item.path !== base && item.path !== "/" && path.startsWith(item.path + "/"))).sort((a, b) => b.path.length - a.path.length)[0];
  const title = utility ? "Perfil e configura\u00e7\u00f5es" : path.endsWith("/editar") ? "Editar quest\u00e3o" : currentNav?.label ?? "JurisSim";

  useEffect(() => {
    setMobileOpen(false);
    setDropdown(false);
  }, [path]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 761px)");
    const update = () => {
      if (desktop.matches) setMobileOpen(false);
    };
    desktop.addEventListener("change", update);
    return () => desktop.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () =>
      setDark(theme === "dark" || (theme === "system" && media.matches));
    update();
    media.addEventListener("change", update);
    writePreference("jurissim-theme", theme);
    return () => media.removeEventListener("change", update);
  }, [theme]);
  useEffect(() => {
    writePreference("jurissim-sidebar-collapsed", String(collapsed));
  }, [collapsed]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node))
        setDropdown(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebarRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        menuButtonRef.current?.focus();
      }
      if (event.key === "Tab") {
        const buttons = Array.from(
          sidebarRef.current?.querySelectorAll<HTMLButtonElement>("button") ??
            [],
        ).filter((button) => button.offsetParent !== null);
        const first = buttons[0],
          last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", escape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", escape);
    };
  }, [mobileOpen]);
  useEffect(() => {
    mainRef.current?.setAttribute("data-page", path);
    if (mainRef.current) mainRef.current.inert = mobileOpen;
    if (wasMobileOpen.current && !mobileOpen) menuButtonRef.current?.focus();
    wasMobileOpen.current = mobileOpen;
  }, [mobileOpen, path]);

  const navItem = (item: Item) => (
    <button
      key={item.path}
      title={item.label}
      aria-current={path === item.path || currentNav?.path === item.path ? "page" : undefined}
      className={path === item.path || currentNav?.path === item.path ? "active" : ""}
      onClick={() => navigate(item.path)}
    >
      <Icon name={item.icon} />
      <span>{item.label}</span>
    </button>
  );
  return (
    <PhotoProvider key={user.id}><div
      className={`v0-app ${dark ? "v0-dark" : ""} ${collapsed ? "v0-collapsed" : ""}`}
      data-theme={theme}
    >
      {mobileOpen && (
        <button
          className="v0-backdrop"
          aria-label="Fechar menu"
          onClick={() => {
            setMobileOpen(false);
            menuButtonRef.current?.focus();
          }}
        />
      )}
      <aside
        ref={sidebarRef}
        className={`v0-sidebar ${mobileOpen ? "v0-open" : ""}`}
        aria-label="Navegação principal"
      >
        <div className="v0-brand">
          <button
            onClick={() => navigate(teacher ? base : "/dashboard")}
            title="JurisSim — início"
          >
            <span className="v0-logo" aria-hidden="true"><img src="/brand/jurissim-logo.png" alt="" /></span>
            <span>
              <strong>
                Juris<span>Sim</span>
              </strong>
              <small>EDUCAÇÃO JURÍDICA</small>
            </span>
          </button>
          <button
            className="v0-close"
            aria-label="Fechar menu"
            onClick={() => {
              setMobileOpen(false);
              menuButtonRef.current?.focus();
            }}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="v0-nav-scroll">
          <p className="v0-nav-label">
            {teacher ? "Área do professor" : "Área do aluno"}
          </p>
          <nav aria-label="Estudos">{primary.map(navItem)}</nav>
          <p className="v0-nav-label">Mais opções</p>
          <nav aria-label="Conta e preferências">
            {secondary.map(navItem)}
            {navItem({ path: profilePath, label: "Meu perfil", icon: "user" })}
            {navItem({
              path: settingsPath,
              label: "Configurações",
              icon: "settings",
            })}
          </nav>
        </div>
        <div className="v0-sidebar-bottom">
          <div className="v0-sidebar-account">
            <ProfileAvatar name={user.nome} />
            <span>
              <strong>{user.nome}</strong>
              <small>{roleLabel(user.role)}</small>
            </span>
          </div>
          <button title="Sair" onClick={onSair}>
            <Icon name="logout" />
            <span>Sair</span>
          </button>
        </div>
      </aside>
      <div ref={mainRef} className="v0-workspace">
        <header className="v0-header">
          <button
            ref={menuButtonRef}
            className="v0-mobile-menu"
            aria-label="Abrir menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <Icon name="menu" />
          </button>
          <button
            className="v0-collapse"
            title={collapsed ? "Expandir menu" : "Recolher menu"}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            onClick={() => setCollapsed(!collapsed)}
          >
            <Icon name="menu" />
          </button>
          <div className="v0-breadcrumb">
            <span className="v0-header-mark" aria-hidden="true"><img src="/brand/jurissim-logo.png" alt="" /></span>
            <span className="v0-header-brand-name">JurisSim</span><span>/</span> <b>{title}</b>
          </div>
          <div
            className="v0-user-menu"
            ref={dropdownRef}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setDropdown(false);
                dropdownRef.current?.querySelector("button")?.focus();
              }
            }}
          >
            <button
              className="v0-user-trigger"
              aria-label="Menu do usuário"
              aria-expanded={dropdown}
              onClick={() => setDropdown(!dropdown)}
            >
              <ProfileAvatar name={user.nome} />
              <span>
                <strong>{user.nome}</strong>
                <small>{roleLabel(user.role)}</small>
              </span>
              <Icon name="chevron" />
            </button>
            {dropdown && (
              <div className="v0-dropdown">
                <p>{user.email}</p>
                <button onClick={() => navigate(profilePath)}>
                  <Icon name="user" />
                  Meu perfil
                </button>
                <button onClick={() => navigate(settingsPath)}>
                  <Icon name="settings" />
                  Configurações
                </button>
                <button onClick={onSair}>
                  <Icon name="logout" />
                  Sair
                </button>
              </div>
            )}
          </div>
        </header>
        {localDiagnosticDemoActive && user.role === 'ALUNO' && <div className="v0-demo-banner" role="status">
          <span>Modo de demonstração local — diagnóstico pendente</span>
          <button type="button" onClick={() => { setLocalDiagnosticDemoMode(false); onExitLocalDemo?.(); }}>Voltar ao diagnóstico obrigatório</button>
        </div>}
        <div className="v0-original" hidden={utility}>
          {children}
        </div>
        {utility && (
          <ProfileSettings
            key={user.id + path}
            user={user}
            settings={path === settingsPath}
            theme={theme}
            setTheme={setTheme}
            collapsed={collapsed}
            setCollapsed={setCollapsed}
            onSair={onSair}
          />
        )}
        <footer className="app-legal-footer"><LegalLinks /></footer>
      </div>
    </div></PhotoProvider>
  );
}

function ProfileSettings({
  user,
  settings,
  theme,
  setTheme,
  collapsed,
  setCollapsed,
  onSair,
}: {
  user: User;
  settings: boolean;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  onSair: () => void;
}) {
  const [tab, setTab] = useState(settings ? "appearance" : "personal");
  const [name, setName] = useState(user.nome);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setName(user.nome);
  }, [user.nome]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await apiRequest("/auth/nome", {
        method: "PUT",
        body: JSON.stringify({ nome: name.trim() }),
      });
      await refreshSession();
      setMessage("Nome atualizado com sucesso.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível atualizar o nome.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="v0-page">
      <p className="gold">{roleLabel(user.role)}</p>
      <h1>Perfil e configurações</h1>
      <p className="v0-description">
        Gerencie seus dados, segurança e preferências do JurisSim.
      </p>
      <nav className="v0-tabs" aria-label="Seções do perfil">
        {[
          ["personal", "Dados pessoais"],
          ["security", "Segurança"],
          ["appearance", "Aparência"],
          ["preferences", "Preferências"],
        ].map(([key, label]) => (
          <button
            key={key}
            aria-current={tab === key ? "page" : undefined}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "personal" && (
        <div className="v0-profile-grid">
          <article className="v0-panel">
            <h2>Meus dados pessoais</h2>
            <p>Dados da sua sessão autenticada.</p>
            <ProfilePhotoEditor name={user.nome} />
            <form onSubmit={save}>
              <label htmlFor="profile-name">Nome completo</label>
              <input
                id="profile-name"
                name="nome"
                autoComplete="name"
                required
                minLength={2}
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={busy}
              />
              <label htmlFor="profile-email">E-mail cadastrado</label>
              <input id="profile-email" value={user.email} readOnly />
              <label htmlFor="profile-role">Tipo de conta</label>
              <input id="profile-role" value={roleLabel(user.role)} readOnly />
              <button
                className="primary"
                disabled={
                  busy || name.trim().length < 2 || name.trim() === user.nome
                }
              >
                {busy ? "Salvando..." : "Salvar nome"}
              </button>
              {message && <p role="status">{message}</p>}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
            </form>
          </article>
          <article className="v0-panel">
            <h2>Resumo da conta</h2>
            <dl>
              <dt>E-mail verificado</dt>
              <dd>{user.emailVerificado ? "Confirmado" : "Pendente"}</dd>
              <dt>Sessão atual</dt>
              <dd>Ativa</dd>
              <dt>Perfil autenticado</dt>
              <dd>{roleLabel(user.role)}</dd>
            </dl>
            <p>
              As permissões são verificadas pelo backend em cada operação
              protegida.
            </p>
          </article>
        </div>
      )}
      {tab === "security" && (
        <div className="v0-profile-grid">
          <article className="v0-panel">
            <h2>Segurança da conta</h2>
            <p>
              E-mail{" "}
              {user.emailVerificado ? "confirmado" : "pendente de confirmação"}.
            </p>
            <p>
              Para redefinir sua senha, saia e use “Esqueci minha senha” no
              login. A redefinição revoga as sessões anteriores.
            </p>
            <button className="outline-button" onClick={onSair}>
              Sair da conta
            </button>
          </article>
          <Privacy />
        </div>
      )}
      {tab === "appearance" && (
        <article className="v0-panel">
          <h2>Aparência</h2>
          <p>A preferência é salva neste navegador.</p>
          <div className="v0-theme-options">
            {(
              [
                ["light", "Tema claro", "Identidade clara do JurisSim"],
                ["dark", "Tema escuro", "Contraste confortável"],
                [
                  "system",
                  "Usar tema do sistema",
                  "Segue a preferência do dispositivo",
                ],
              ] as const
            ).map(([value, label, text]) => (
              <button
                key={value}
                aria-pressed={theme === value}
                onClick={() => setTheme(value)}
              >
                <strong>{label}</strong>
                <small>{text}</small>
              </button>
            ))}
          </div>
          <div className="v0-menu-preference">
            <div>
              <strong>Menu lateral</strong>
              <p>Preferência visual da navegação no desktop.</p>
            </div>
            <button onClick={() => setCollapsed(!collapsed)}>
              {collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
            </button>
          </div>
        </article>
      )}
      {tab === "preferences" && (
        <div className="v0-profile-grid">
          <Privacy />
          <article className="v0-panel">
            <h2>Notificações</h2>
            <p>
              Preferências de notificações ainda indisponíveis. Nenhuma
              alteração é enviada ou simulada.
            </p>
          </article>
        </div>
      )}
    </section>
  );
}

function Privacy() {
  return (
    <article className="v0-panel" aria-labelledby="privacy-settings-title">
      <h2 id="privacy-settings-title">Privacidade e proteção de dados</h2>
      <p>
        Consulte as informações sobre o uso da plataforma e o tratamento dos
        seus dados.
      </p>
      <LegalLinks />
    </article>
  );
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    home: "m3 10 9-7 9 7v10h-6v-6H9v6H3z",
    book: "M12 5C8 2 3 3 3 3v16s5-1 9 2c4-3 9-2 9-2V3s-5-1-9 2zm0 0v16",
    plus: "M12 5v14M5 12h14",
    users:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-4M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8m8 0a4 4 0 0 1 0 8",
    user: "M20 21v-2a7 7 0 0 0-14 0v2m6-18a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
    file: "M14 2H5v20h14V7zm0 0v6h5M8 12h8M8 16h8",
    chart: "M3 3v18h18M7 16v-5m5 5V7m5 9V4",
    target:
      "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
    settings:
      "m9 3-1 3-3 1-2 4 2 2 1 4 3 1 1 3h4l1-3 3-1 1-4 2-2-2-4-3-1-1-3zm3 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
    logout: "M9 3H3v18h6m6-14 5 5-5 5M8 12h12",
    menu: "M3 6h18M3 12h18M3 18h18",
    close: "m6 6 12 12M6 18 18 6",
    chevron: "m6 9 6 6 6-6",
  };
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name] ?? paths.file} />
    </svg>
  );
}
