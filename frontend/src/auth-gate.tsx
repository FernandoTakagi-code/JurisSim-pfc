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
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [nome, setNome] = useState(''); const [email, setEmail] = useState(''); const [senha, setSenha] = useState(''); const [confirmacaoSenha, setConfirmacaoSenha] = useState(''); const [role, setRole] = useState<'ALUNO' | 'PROFESSOR'>('ALUNO'); const [showPassword, setShowPassword] = useState(false); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const post = async (path: string, body: object) => { let response: Response; try { response = await fetch(`${api}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); } catch { throw new Error('Não foi possível conectar ao servidor. Verifique se o backend está rodando na porta 3333.'); } const data = await response.json(); if (!response.ok) throw new Error(data.message ?? 'Não foi possível concluir a operação.'); return data; };
  const submit = async () => { setLoading(true); setError(''); try { if (mode === 'register') { await post('/auth/register', { nome, email, senha, confirmacaoSenha, role }); setMode('login'); setSenha(''); setConfirmacaoSenha(''); } else { const login = await post('/auth/login', { email, senha }); let session: Response; try { session = await fetch(`${api}/auth/session`, { headers: { Authorization: `Bearer ${login.token}` } }); } catch { throw new Error('Login realizado, mas não foi possível consultar a sessão. Verifique se o backend está rodando na porta 3333.'); } const body = await session.json(); if (!session.ok) throw new Error(body.message ?? 'Sessão inválida.'); sessionStorage.setItem('jurissim_token', login.token); sessionStorage.setItem('jurissim_next_step', body.nextStep); window.location.reload(); } } catch (cause) { setError(cause instanceof Error ? cause.message : 'Erro inesperado.'); } finally { setLoading(false); } };
  const isLogin = mode === 'login';
  return <main className="auth-layout"><VisualPanel /><section className="auth-content"><div className="auth-form-wrap"><header><h2>{isLogin ? 'Login' : 'Crie sua conta'}</h2><p>{isLogin ? 'Acesse sua conta para continuar' : 'Comece sua preparação para a OAB'}</p></header><div className="auth-card">
    {!isLogin && <><label>Nome completo<input placeholder="Digite seu nome completo" value={nome} onChange={event => setNome(event.target.value)} /></label><label>Tipo de usuário<select value={role} onChange={event => setRole(event.target.value as 'ALUNO' | 'PROFESSOR')}><option value="ALUNO">Aluno</option><option value="PROFESSOR">Professor</option></select></label></>}
    <label>E-mail<input type="email" placeholder="Digite seu e-mail" value={email} onChange={event => setEmail(event.target.value)} /></label>
    <label>Sua senha<span className="password-field"><input type={showPassword ? 'text' : 'password'} placeholder="Digite sua senha" value={senha} onChange={event => setSenha(event.target.value)} /><button type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? '◉' : '◌'}</button></span></label>
    {!isLogin && <label>Confirme sua senha<span className="password-field"><input type={showPassword ? 'text' : 'password'} placeholder="Digite sua senha novamente" value={confirmacaoSenha} onChange={event => setConfirmacaoSenha(event.target.value)} /><button type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? '◉' : '◌'}</button></span></label>}
    {isLogin && <div className="auth-options"><label><input type="checkbox" /> Lembrar de mim</label><button type="button">Esqueceu a senha?</button></div>}
    <button className="auth-submit" disabled={loading} onClick={submit}>{loading ? 'Aguarde...' : isLogin ? 'Entrar' : 'Criar conta'}</button>{error && <small className="error">{error}</small>}
    <div className="auth-divider"><span>ou</span></div><button type="button" className="google-button"><b>G</b> Entrar com o Google</button>
  </div><p className="auth-switch">{isLogin ? 'Ainda não tem uma conta?' : 'Já possui uma conta?'} <button type="button" onClick={() => setMode(isLogin ? 'register' : 'login')}>{isLogin ? 'Cadastre-se' : 'Entrar'}</button></p></div></section></main>;
}
