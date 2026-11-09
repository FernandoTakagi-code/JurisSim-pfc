'use client'

import { useState } from 'react'
import {
  Activity, ArrowUpRight, Bell, BookOpen, Building2, CalendarDays, Check,
  ChevronDown, ChevronRight, CircleHelp, ClipboardList, Clock3, Download,
  FileBarChart, Filter, GraduationCap, LayoutDashboard, Mail, Menu, MoreHorizontal,
  Moon, PanelLeftClose, Plus, Search, Settings, ShieldCheck, Sun, Users, UserPlus,
  X, Zap,
} from 'lucide-react'

type Section = 'Visão geral' | 'Minha instituição' | 'Professores' | 'Convites' | 'Turmas' | 'Alunos' | 'Desempenho acadêmico' | 'Simulados' | 'Relatórios' | 'Notificações' | 'Configurações'

const navGroups = [
  { label: 'Gestão', items: [
    ['Visão geral', LayoutDashboard], ['Minha instituição', Building2], ['Professores', GraduationCap], ['Convites', Mail], ['Turmas', BookOpen], ['Alunos', Users],
  ] },
  { label: 'Acompanhamento', items: [
    ['Desempenho acadêmico', Activity], ['Simulados', ClipboardList], ['Relatórios', FileBarChart],
  ] },
  { label: 'Sistema', items: [['Notificações', Bell], ['Configurações', Settings]] },
] as const

const activities = [
  { icon: UserPlus, title: 'Novo professor convidado', detail: 'Mariana Costa foi convidada para a instituição', time: 'Hoje, 10:42', tone: 'gold' },
  { icon: Check, title: 'Convite aceito', detail: 'Rafael Mendes aceitou o convite', time: 'Hoje, 09:18', tone: 'green' },
  { icon: BookOpen, title: 'Turma criada', detail: 'OAB 1ª Fase — Intensivo 2025', time: 'Ontem, 16:30', tone: 'blue' },
  { icon: Users, title: 'Aluno vinculado', detail: 'Beatriz Nunes entrou na turma OAB-24', time: 'Ontem, 14:08', tone: 'purple' },
]

const professors = [
  ['Mariana Costa', 'mariana.costa@faculdadealfa.edu.br', '3 turmas', 'Ativo', 'Hoje, 09:40', 'MC'],
  ['Rafael Mendes', 'rafael.mendes@faculdadealfa.edu.br', '2 turmas', 'Ativo', 'Ontem, 18:12', 'RM'],
  ['Juliana Prado', 'juliana.prado@faculdadealfa.edu.br', '1 turma', 'Ativo', '22 jun, 15:30', 'JP'],
  ['Carlos Eduardo', 'carlos.eduardo@faculdadealfa.edu.br', '—', 'Convite pendente', '21 jun, 11:06', 'CE'],
]

const invitations = [
  ['Carlos Eduardo', 'carlos.eduardo@faculdadealfa.edu.br', '21 jun 2025', '05 jul 2025', 'Pendente'],
  ['Ana Beatriz Lima', 'ana.lima@outlook.com', '18 jun 2025', '02 jul 2025', 'Aceito'],
  ['Felipe Ramos', 'felipe.ramos@gmail.com', '12 jun 2025', '26 jun 2025', 'Expirado'],
]

function Logo({ compact = false }: { compact?: boolean }) {
  return <div className="brand"><div className="brand-mark">J</div>{!compact && <div><strong>JurisSim</strong><span>Painel Institucional</span></div>}</div>
}

function MetricCard({ icon: Icon, label, value, trend, tone }: { icon: typeof Users; label: string; value: string; trend: string; tone: string }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}><Icon /></div><div className="metric-copy"><span>{label}</span><strong>{value}</strong><small className={trend.startsWith('+') ? 'positive' : ''}>{trend}</small></div><ArrowUpRight className="metric-arrow" /></div>
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><div className="empty-icon"><Search /></div><strong>{title}</strong><span>{detail}</span></div>
}

export default function Page() {
  const [active, setActive] = useState<Section>('Visão geral')
  const [dark, setDark] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [modal, setModal] = useState<'invite' | 'class' | null>(null)
  const [period, setPeriod] = useState('Últimos 30 dias')
  const [toast, setToast] = useState('')

  const action = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2600) }
  const isOverview = active === 'Visão geral'

  return <div className={`app-shell ${dark ? 'dark-mode' : ''}`}>
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="sidebar-top"><Logo compact={collapsed} /><button className="icon-button sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Fechar menu"><X /></button><button className="collapse-button" onClick={() => setCollapsed(!collapsed)} aria-label="Recolher menu"><PanelLeftClose /></button></div>
      <div className="institution-switch"><div className="institution-logo">FA</div>{!collapsed && <div><strong>Faculdade Alfa</strong><span>Instituição aprovada</span></div>}{!collapsed && <ChevronDown />}</div>
      <nav className="nav-groups">{navGroups.map(group => <div className="nav-group" key={group.label}><span className="nav-label">{group.label}</span>{group.items.map(([label, Icon]) => <button key={label} className={`nav-item ${active === label ? 'active' : ''}`} onClick={() => { setActive(label as Section); setMobileOpen(false) }} title={collapsed ? label : undefined}><Icon /><span>{label}</span>{label === 'Convites' && !collapsed && <b>3</b>}</button>)}</div>)}</nav>
      {!collapsed && <div className="sidebar-footer"><div className="user-mini"><div className="avatar">AS</div><div><strong>André Soares</strong><span>Responsável institucional</span></div><MoreHorizontal /></div></div>}
    </aside>
    <main className="main-content">
      <header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Abrir menu"><Menu /></button><div className="breadcrumb"><span>Painel Institucional</span><ChevronRight /><strong>{active}</strong></div><div className="top-actions"><button className="icon-button" aria-label="Ajuda"><CircleHelp /></button><button className="icon-button notification-button" aria-label="Notificações" onClick={() => setActive('Notificações')}><Bell /><i /></button><button className="theme-toggle" onClick={() => setDark(!dark)} aria-label="Alternar tema">{dark ? <Sun /> : <Moon />}</button><div className="top-profile"><div className="avatar">AS</div><div><strong>André Soares</strong><span>Instituição</span></div><ChevronDown /></div></div></header>
      <div className="page-body">
        {isOverview ? <Overview period={period} setPeriod={setPeriod} onAction={action} setModal={setModal} /> : <SectionPage active={active} onAction={action} setModal={setModal} />}
      </div>
    </main>
    {toast && <div className="toast"><Check /> {toast}</div>}
    {modal && <Modal type={modal} onClose={() => setModal(null)} onAction={action} />}
  </div>
}

function Overview({ period, setPeriod, onAction, setModal }: { period: string; setPeriod: (s: string) => void; onAction: (s: string) => void; setModal: (m: 'invite' | 'class') => void }) {
  return <>
    <div className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-dot" /> TERÇA-FEIRA, 24 DE JUNHO DE 2025</div><h1>Bem-vindo ao Painel Institucional</h1><p>Acompanhe sua instituição, organize sua equipe e monitore a evolução dos seus alunos.</p></div><div className="period-filter"><CalendarDays /><select value={period} onChange={e => setPeriod(e.target.value)} aria-label="Período"><option>Últimos 7 dias</option><option>Últimos 30 dias</option><option>Últimos 90 dias</option></select><ChevronDown /></div></div>
    <div className="metric-grid"><MetricCard icon={Users} label="Alunos vinculados" value="248" trend="+12,4% vs. mês anterior" tone="navy" /><MetricCard icon={GraduationCap} label="Professores ativos" value="18" trend="+2 este mês" tone="gold" /><MetricCard icon={BookOpen} label="Turmas em andamento" value="12" trend="+1 este mês" tone="blue" /><MetricCard icon={Mail} label="Convites pendentes" value="3" trend="Aguardando resposta" tone="purple" /></div>
    <div className="content-grid"><div className="panel performance-panel"><div className="panel-head"><div><h2>Evolução acadêmica</h2><span>Média de acertos dos alunos por período</span></div><button className="outline-button"><Filter /> Filtrar <ChevronDown /></button></div><div className="chart-legend"><span><i className="legend-dot navy-dot" /> Média geral</span><span><i className="legend-dot gold-dot" /> Meta institucional</span></div><div className="line-chart"><div className="y-axis"><span>90%</span><span>75%</span><span>60%</span><span>45%</span><span>30%</span></div><div className="chart-area"><div className="grid-lines"><i /><i /><i /><i /><i /></div><svg viewBox="0 0 700 220" preserveAspectRatio="none" aria-label="Gráfico de evolução acadêmica"><path className="target-line" d="M0 92 L700 92" /><path className="area-path" d="M0 172 C55 158, 75 161, 120 145 S190 150, 230 126 S300 135, 345 119 S420 128, 465 90 S535 108, 580 77 S650 88, 700 53 L700 220 L0 220 Z" /><path className="main-line" d="M0 172 C55 158, 75 161, 120 145 S190 150, 230 126 S300 135, 345 119 S420 128, 465 90 S535 108, 580 77 S650 88, 700 53" /><circle cx="700" cy="53" r="5" /></svg><div className="x-axis"><span>Mai 27</span><span>Jun 03</span><span>Jun 10</span><span>Jun 17</span><span>Jun 24</span></div></div></div></div>
      <div className="panel discipline-panel"><div className="panel-head"><div><h2>Desempenho por disciplina</h2><span>Média de acertos no último mês</span></div><button className="more-button" aria-label="Mais opções"><MoreHorizontal /></button></div><div className="discipline-list">{[['Direito Constitucional','78%','78'],['Direito Administrativo','72%','72'],['Direito Civil','68%','68'],['Ética Profissional','64%','64'],['Direito Penal','59%','59']].map(([name, value, width]) => <div className="discipline" key={name}><div><span>{name}</span><strong>{value}</strong></div><div className="bar"><i style={{ width: `${width}%` }} /></div></div>)}</div><button className="text-button" onClick={() => onAction('Abrindo análise detalhada')}>Ver análise detalhada <ArrowUpRight /></button></div></div>
    <div className="bottom-grid"><div className="panel activity-panel"><div className="panel-head"><div><h2>Atividade recente</h2><span>Últimas movimentações da instituição</span></div><button className="text-button" onClick={() => onAction('Todas as atividades carregadas')}>Ver tudo <ArrowUpRight /></button></div><div className="activity-list">{activities.map(item => <div className="activity" key={item.title}><div className={`activity-icon ${item.tone}`}><item.icon /></div><div><strong>{item.title}</strong><span>{item.detail}</span></div><time>{item.time}</time></div>)}</div></div><div className="panel quick-panel"><div className="panel-head"><div><h2>Ações rápidas</h2><span>Atalhos para sua gestão</span></div><Zap /></div><div className="quick-actions"><button onClick={() => setModal('invite')}><UserPlus /><span><strong>Convidar professor</strong><small>Adicione novos profissionais</small></span><ChevronRight /></button><button onClick={() => setModal('class')}><Plus /><span><strong>Criar nova turma</strong><small>Organize seus alunos</small></span><ChevronRight /></button><button onClick={() => onAction('Relatório preparado para visualização')}><Download /><span><strong>Consultar relatórios</strong><small>Dados de desempenho</small></span><ChevronRight /></button></div></div></div>
  </>
}

function SectionPage({ active, onAction, setModal }: { active: Section; onAction: (s: string) => void; setModal: (m: 'invite' | 'class') => void }) {
  const config: Record<string, { title: string; desc: string; icon: typeof Users }> = { 'Minha instituição': { title: 'Minha instituição', desc: 'Gerencie os dados e informações cadastrais da sua instituição.', icon: Building2 }, Professores: { title: 'Professores', desc: 'Acompanhe os profissionais vinculados à sua instituição.', icon: GraduationCap }, Convites: { title: 'Convites institucionais', desc: 'Convide professores e acompanhe o status das ativações.', icon: Mail }, Turmas: { title: 'Turmas', desc: 'Organize turmas, professores responsáveis e alunos.', icon: BookOpen }, Alunos: { title: 'Alunos', desc: 'Visualize e acompanhe os alunos vinculados à instituição.', icon: Users }, 'Desempenho acadêmico': { title: 'Desempenho acadêmico', desc: 'Entenda a evolução dos alunos e identifique oportunidades de acompanhamento.', icon: Activity }, Simulados: { title: 'Simulados', desc: 'Acompanhe a participação e o desempenho consolidado.', icon: ClipboardList }, Relatórios: { title: 'Relatórios acadêmicos', desc: 'Acesse análises para apoiar suas decisões pedagógicas.', icon: FileBarChart }, Notificações: { title: 'Notificações', desc: 'Acompanhe as atualizações importantes da sua instituição.', icon: Bell }, Configurações: { title: 'Configurações', desc: 'Gerencie suas preferências e dados de acesso.', icon: Settings } }
  const item = config[active]; const Icon = item.icon
  const isInvite = active === 'Convites'; const isProf = active === 'Professores';
  return <><div className="welcome-row section-title"><div><div className="section-icon"><Icon /></div><h1>{item.title}</h1><p>{item.desc}</p></div><div className="header-actions">{(isInvite || isProf) && <button className="primary-button" onClick={() => setModal('invite')}><Plus /> Convidar professor</button>}{active === 'Turmas' && <button className="primary-button" onClick={() => setModal('class')}><Plus /> Criar turma</button>}{active === 'Relatórios' && <button className="outline-button" onClick={() => onAction('Filtros de relatório abertos')}><Filter /> Filtros</button>}</div></div>{isInvite ? <InviteTable onAction={onAction} /> : isProf ? <ProfessorTable onAction={onAction} /> : active === 'Minha instituição' ? <InstitutionCard onAction={onAction} /> : <GenericSection active={active} onAction={onAction} />}</>
}

function ProfessorTable({ onAction }: { onAction: (s: string) => void }) { return <div className="panel table-panel"><div className="table-toolbar"><div className="search-box"><Search /><input placeholder="Buscar professor..." aria-label="Buscar professor" /></div><button className="outline-button"><Filter /> Filtros</button></div><div className="table-scroll"><table><thead><tr><th>Professor</th><th>Situação</th><th>Turmas</th><th>Última atividade</th><th /></tr></thead><tbody>{professors.map(p => <tr key={p[0]}><td><div className="person-cell"><div className="avatar soft">{p[5]}</div><div><strong>{p[0]}</strong><span>{p[1]}</span></div></div></td><td><span className={`status ${p[3] === 'Ativo' ? 'success' : 'warning'}`}><i />{p[3]}</span></td><td>{p[2]}</td><td>{p[4]}</td><td><button className="more-button" onClick={() => onAction(`Detalhes de ${p[0]} abertos`)}><MoreHorizontal /></button></td></tr>)}</tbody></table></div></div> }
function InviteTable({ onAction }: { onAction: (s: string) => void }) { return <div className="panel table-panel"><div className="invite-head"><div><div className="eyebrow"><span className="eyebrow-dot" /> 3 CONVITES ATIVOS</div><h2>Acompanhe suas solicitações</h2><p>Convites demonstrativos para aprovação visual do protótipo.</p></div><button className="outline-button"><Download /> Exportar</button></div><div className="table-scroll"><table><thead><tr><th>Professor</th><th>Enviado em</th><th>Expira em</th><th>Status</th><th /></tr></thead><tbody>{invitations.map(p => <tr key={p[0]}><td><div className="person-cell"><div className="avatar soft">{p[0].split(' ').map(x => x[0]).join('').slice(0,2)}</div><div><strong>{p[0]}</strong><span>{p[1]}</span></div></div></td><td>{p[2]}</td><td>{p[3]}</td><td><span className={`status ${p[4] === 'Aceito' ? 'success' : p[4] === 'Pendente' ? 'warning' : 'neutral'}`}><i />{p[4]}</span></td><td><button className="more-button" onClick={() => onAction(`Opções de ${p[0]} abertas`)}><MoreHorizontal /></button></td></tr>)}</tbody></table></div></div> }
function InstitutionCard({ onAction }: { onAction: (s: string) => void }) { return <div className="institution-layout"><div className="panel profile-card"><div className="profile-hero"><div className="large-institution">FA</div><div><h2>Faculdade Alfa de Direito</h2><span>Instituição de ensino superior</span><div className="approved"><ShieldCheck /> Cadastro aprovado</div></div></div><div className="info-grid"><div><span>Identificação institucional</span><strong>JUR-FA-2024-0081</strong></div><div><span>E-mail institucional</span><strong>contato@faculdadealfa.edu.br</strong></div><div><span>Telefone</span><strong>(11) 3456-7890</strong></div><div><span>Data de aprovação</span><strong>14 de março de 2024</strong></div><div className="wide"><span>Endereço</span><strong>Av. Paulista, 1000 — Bela Vista, São Paulo — SP</strong></div></div><button className="primary-button" onClick={() => onAction('Solicitação de edição enviada')}>Solicitar alteração</button></div><div className="panel contact-card"><h2>Responsável institucional</h2><div className="person-cell"><div className="avatar">AS</div><div><strong>André Soares</strong><span>Diretor acadêmico</span></div></div><div className="contact-row"><Mail /> andre.soares@faculdadealfa.edu.br</div><div className="contact-row"><ShieldCheck /> Acesso autorizado</div></div></div> }
function GenericSection({ active, onAction }: { active: Section; onAction: (s: string) => void }) { return <div className="generic-grid"><div className="panel empty-main"><EmptyState title={`Nenhum dado de ${active.toLowerCase()} encontrado`} detail="Os dados demonstrativos desta área serão exibidos quando estiverem disponíveis." /><button className="outline-button" onClick={() => onAction('Filtros atualizados')}>Atualizar filtros</button></div><div className="panel side-note"><div className="note-icon"><ShieldCheck /></div><h2>Ambiente demonstrativo</h2><p>Esta prévia usa dados fictícios para validar a experiência visual. Nenhuma ação altera dados reais.</p><button className="text-button" onClick={() => onAction('Documentação consultada')}>Saiba mais <ArrowUpRight /></button></div></div> }

function Modal({ type, onClose, onAction }: { type: 'invite' | 'class'; onClose: () => void; onAction: (s: string) => void }) { const invite = type === 'invite'; return <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal"><div className="modal-head"><div className="modal-title-icon">{invite ? <UserPlus /> : <BookOpen />}</div><div><h2>{invite ? 'Convidar professor' : 'Criar nova turma'}</h2><p>{invite ? 'Envie um convite para fazer parte da sua instituição.' : 'Configure os dados básicos da nova turma.'}</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X /></button></div><div className="form-grid">{invite && <label>Nome completo<input placeholder="Ex.: Marina Costa" /></label>}<label>{invite ? 'E-mail profissional' : 'Nome da turma'}<input placeholder={invite ? 'professor@instituicao.edu.br' : 'Ex.: OAB 1ª Fase — Intensivo'} /></label>{invite && <label>Turma inicial <select><option>Selecionar turma (opcional)</option><option>OAB 1ª Fase — Intensivo</option><option>Revisão Final OAB</option></select></label>}<label>{invite ? 'Mensagem personalizada' : 'Professor responsável'}<textarea placeholder={invite ? 'Escreva uma mensagem de boas-vindas...' : 'Selecionar professor'} /></label></div><div className="modal-footer"><span>Prévia demonstrativa</span><button className="outline-button" onClick={onClose}>Cancelar</button><button className="primary-button" onClick={() => { onClose(); onAction(invite ? 'Convite enviado com sucesso' : 'Turma criada com sucesso') }}>{invite ? 'Enviar convite' : 'Criar turma'}</button></div></div></div> }
