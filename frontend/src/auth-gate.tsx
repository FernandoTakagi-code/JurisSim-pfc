import { useState } from 'react';

const api = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';

function VisualPanel() {
  return <section className="auth-pitch">
    <div className="auth-brand"><b>⚖</b><span><strong>JurisSim</strong><small>Plataforma adaptativa de preparação para o Exame da OAB</small></span></div>
    <div className="auth-pitch-copy"><p>DIAGNÓSTICO INTELIGENTE</p><h1>Prepare-se para a OAB <em>No seu ritmo.</em></h1><span>Identifique suas dificuldades, pratique de forma personalizada e acompanhe sua evolução.</span></div>
    <div className="auth-stats"><div><b>5</b><small>Matérias</small></div><div><b>2.000+</b><small>Questões</small></div><div><b>94%</b><small>Evolução</small></div></div>
  </section>;
}

export function AuthGate() {
  const [mode, setMode] = useState<'login' | 'register' | 'confirm'>('login');
  const [nome, setNome] = useState(''); const [email, setEmail] = useState(''); const [senha, setSenha] = useState(''); const [confirmacaoSenha, setConfirmacaoSenha] = useState(''); const [codigo, setCodigo] = useState(''); const [showPassword, setShowPassword] = useState(false); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const post = async (path: string, body: object) => { const response = await fetch(`${api}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) throw new Error(data.message ?? 'Não foi possível concluir a operação.'); return data; };
  const submit = async () => { setLoading(true); setError(''); try { if (mode === 'register') { await post('/auth/register', { nome, email, senha, confirmacaoSenha }); setMode('confirm'); } else if (mode === 'confirm') { await post('/auth/confirm-email', { email, codigo }); setMode('login'); } else { const login = await post('/auth/login', { email, senha }); const response = await fetch(`${api}/auth/session`, { headers: { Authorization: `Bearer ${login.token}` } }); const session = await response.json(); if (!response.ok) throw new Error(session.message ?? 'Sessão inválida.'); sessionStorage.setItem('jurissim_token', login.token); sessionStorage.setItem('jurissim_next_step', session.nextStep); window.location.reload(); } } catch (cause) { setError(cause instanceof Error ? cause.message : 'Erro inesperado.'); } finally { setLoading(false); } };
  const isLogin = mode === 'login'; const isRegister = mode === 'register'; const isConfirm = mode === 'confirm';
  const title = isLogin ? 'Login' : isRegister ? 'Crie sua conta' : 'Confirme seu e-mail';
  const subtitle = isLogin ? 'Acesse sua conta para continuar' : isRegister ? 'Comece sua preparação para a OAB' : 'Digite o código enviado para seu e-mail';
  return <main className="auth-layout"><VisualPanel /><section className="auth-content"><div className="auth-form-wrap"><header><h2>{title}</h2><p>{subtitle}</p></header><div className="auth-card">
    {isRegister && <label>Nome completo<input placeholder="Digite seu nome completo" value={nome} onChange={event => setNome(event.target.value)} /></label>}
    {!isConfirm && <label>E-mail<input type="email" placeholder="Digite seu e-mail" value={email} onChange={event => setEmail(event.target.value)} /></label>}
    {isConfirm && <label>E-mail<input type="email" placeholder="Digite seu e-mail" value={email} onChange={event => setEmail(event.target.value)} /></label>}
    {!isConfirm && <label>Sua senha<span className="password-field"><input type={showPassword ? 'text' : 'password'} placeholder="Digite sua senha" value={senha} onChange={event => setSenha(event.target.value)} /><button type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? '◉' : '◌'}</button></span></label>}
    {isRegister && <label>Confirme sua senha<span className="password-field"><input type={showPassword ? 'text' : 'password'} placeholder="Digite sua senha novamente" value={confirmacaoSenha} onChange={event => setConfirmacaoSenha(event.target.value)} /><button type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? '◉' : '◌'}</button></span></label>}
    {isConfirm && <label>Código de confirmação<input inputMode="numeric" maxLength={6} placeholder="Digite o código de 6 dígitos" value={codigo} onChange={event => setCodigo(event.target.value)} /></label>}
    {isLogin && <div className="auth-options"><label><input type="checkbox" /> Lembrar de mim</label><button type="button">Esqueceu a senha?</button></div>}
    <button className="auth-submit" disabled={loading} onClick={submit}>{loading ? 'Aguarde...' : isLogin ? 'Entrar' : isRegister ? 'Criar conta' : 'Confirmar e-mail'}</button>{error && <small className="error">{error}</small>}
    {!isConfirm && <><div className="auth-divider"><span>ou</span></div><button type="button" className="google-button"><b>G</b> Entrar com o Google</button></>}
  </div>{isLogin && <p className="auth-switch">Ainda não tem uma conta? <button type="button" onClick={() => setMode('register')}>Cadastre-se</button></p>}{isRegister && <p className="auth-switch">Já possui uma conta? <button type="button" onClick={() => setMode('login')}>Entrar</button></p>}{isConfirm && <p className="auth-switch"><button type="button" onClick={() => setMode('login')}>Voltar ao login</button></p>}</div></section></main>;
}
