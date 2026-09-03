import { useState } from 'react'
import {
  ArrowUpRight,
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  Users,
} from 'lucide-react'

const companies = [
  { name: 'Northstar Labs', role: 'Product Design Intern', type: 'Technology', location: 'Bengaluru', salary: '₹45k / month', tags: ['Figma', 'UX Research'], logo: 'N', color: 'blue' },
  { name: 'Aster & Co.', role: 'Business Analyst', type: 'Consulting', location: 'Mumbai', salary: '₹40k / month', tags: ['Excel', 'SQL'], logo: 'A', color: 'orange' },
  { name: 'Lumina Finance', role: 'Financial Analyst', type: 'Finance', location: 'Gurugram', salary: '₹50k / month', tags: ['Python', 'Financial Modelling'], logo: 'L', color: 'green' },
]

const statuses = [
  { company: 'Northstar Labs', role: 'Product Design Intern', date: 'Applied 14 Aug', status: 'Under review', tone: 'amber', logo: 'N', color: 'blue' },
  { company: 'Verve Mobility', role: 'UX Research Intern', date: 'Applied 08 Aug', status: 'Interview scheduled', tone: 'blue', logo: 'V', color: 'violet' },
  { company: 'Aster & Co.', role: 'Business Analyst', date: 'Applied 01 Aug', status: 'Application viewed', tone: 'slate', logo: 'A', color: 'orange' },
]

function Logo({ letter, color }: { letter: string; color: string }) {
  return <span className={`company-logo ${color}`}>{letter}</span>
}

function App() {
  const [role, setRole] = useState('Student')
  const [active, setActive] = useState('Overview')
  const [applied, setApplied] = useState<string[]>([])
  const [menuOpen, setMenuOpen] = useState(false)

  const filteredCompanies = companies

  const nav = role === 'Student'
    ? [{ label: 'Overview', icon: LayoutDashboard }, { label: 'Opportunities', icon: BriefcaseBusiness }, { label: 'My applications', icon: FileText }, { label: 'My profile', icon: GraduationCap }]
    : role === 'Officer'
      ? [{ label: 'Overview', icon: LayoutDashboard }, { label: 'Companies', icon: Building2 }, { label: 'Students', icon: Users }, { label: 'Interviews', icon: CalendarDays }]
      : [{ label: 'Overview', icon: LayoutDashboard }, { label: 'Job openings', icon: BriefcaseBusiness }, { label: 'Shortlisted', icon: Users }, { label: 'Interviews', icon: CalendarDays }]

  function apply(company: string) {
    setApplied((current) => current.includes(company) ? current : [...current, company])
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand"><span className="brand-mark"><Sparkles size={17} /></span><span>campus<span className="brand-dot">.</span>flow</span></div>
        <div className="workspace-label">WORKSPACE</div>
        <div className="role-picker">
          <div className="avatar">AK</div>
          <div><strong>{role} workspace</strong><span>2024–25 placement cycle</span></div>
          <ChevronDown size={15} />
          <select value={role} onChange={(event) => setRole(event.target.value)} aria-label="Select workspace role"><option>Student</option><option>Officer</option><option>Company</option></select>
        </div>
        <nav>{nav.map(({ label, icon: Icon }) => <button key={label} className={active === label ? 'active' : ''} onClick={() => { setActive(label); setMenuOpen(false) }}><Icon size={18} />{label}{label === 'My applications' && <span className="nav-count">3</span>}</button>)}</nav>
        <div className="sidebar-bottom"><button><Settings size={18} />Settings</button><button><CircleHelp size={18} />Help center</button><button className="logout"><LogOut size={18} />Sign out</button></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Open menu"><Menu size={20} /></button><div className="breadcrumb">2024–25 <span>/</span> {role} dashboard</div><div className="top-actions"><button className="icon-button" aria-label="Notifications"><Bell size={19} /><i /></button><div className="top-avatar">AK</div><span className="top-name">Aarav Kapoor</span><ChevronDown size={15} /></div></header>
        <div className="page-wrap">
          <div className="welcome-row"><div><p className="eyebrow">THURSDAY, 22 AUGUST 2024</p><h1>Good morning, Aarav <span>✦</span></h1><p className="subtitle">Your next opportunity is closer than you think.</p></div><button className="primary-action"><BriefcaseBusiness size={17} />Explore opportunities</button></div>

          {role === 'Student' ? <>
            <section className="metrics"><div><span className="metric-label">Applications</span><strong>12</strong><small className="positive">+3 <em>this month</em></small></div><div><span className="metric-label">Interviews</span><strong>04</strong><small className="positive">+1 <em>this month</em></small></div><div><span className="metric-label">Profile completion</span><strong>82<span className="unit">%</span></strong><small className="neutral">Almost there</small></div><div><span className="metric-label">Saved roles</span><strong>07</strong><small className="neutral">3 closing soon</small></div></section>
            <div className="content-grid"><section className="panel opportunities"><div className="panel-header"><div><h2>Recommended for you</h2><p>Roles matching your profile and preferences</p></div><button className="text-button" onClick={() => setActive('Opportunities')}>View all <ArrowUpRight size={16} /></button></div><div className="company-list">{filteredCompanies.map((company) => <article className="opportunity" key={company.name}><Logo letter={company.logo} color={company.color} /><div className="opportunity-main"><div className="role-line"><div><h3>{company.role}</h3><p>{company.name} <span>·</span> {company.type}</p></div><button className="save-button" aria-label={`Save ${company.role}`}>♡</button></div><div className="role-meta"><span>{company.location}</span><span>{company.salary}</span><div className="tags">{company.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div></div><button className={`apply-button ${applied.includes(company.name) ? 'done' : ''}`} onClick={() => apply(company.name)}>{applied.includes(company.name) ? <><Check size={15} />Applied</> : 'Apply now'}</button></article>)}</div></section><aside className="right-column"><section className="profile-card"><div className="profile-top"><div className="profile-avatar">AK</div><div><h2>Complete your profile</h2><p>Stand out to top companies</p></div></div><div className="progress-track"><span /></div><div className="progress-label"><strong>82% complete</strong><span>2 steps left</span></div><ul><li className="checked"><Check size={14} />Basic information</li><li className="checked"><Check size={14} />Education & skills</li><li><span className="step-dot" />Upload your resume <ArrowUpRight size={14} /></li></ul><button className="outline-button">Finish profile</button></section><section className="tip-card"><div className="tip-icon"><Sparkles size={18} /></div><div><strong>Make your profile work harder</strong><p>Students with complete profiles get 2.4× more recruiter views.</p><button className="text-button">View profile tips <ArrowUpRight size={14} /></button></div></section></aside></div>
            <section className="panel applications"><div className="panel-header"><div><h2>Recent applications</h2><p>Keep an eye on your placement journey</p></div><button className="text-button" onClick={() => setActive('My applications')}>View all <ArrowUpRight size={16} /></button></div><div className="status-table"><div className="table-head"><span>ROLE & COMPANY</span><span>APPLIED ON</span><span>STATUS</span><span /></div>{statuses.map((item) => <div className="table-row" key={item.company}><div className="role-cell"><Logo letter={item.logo} color={item.color} /><div><strong>{item.role}</strong><span>{item.company}</span></div></div><span className="date-cell">{item.date.replace('Applied ', '')}</span><span className={`status ${item.tone}`}><i />{item.status}</span><button className="row-menu">•••</button></div>)}</div></section>
          </> : <section className="panel role-placeholder"><div className="empty-icon"><Users size={26} /></div><h2>{role} workspace</h2><p>Your {role.toLowerCase()} tools are ready for the 2024–25 placement cycle.</p><button className="primary-action" onClick={() => setRole('Student')}>Switch to student view</button></section>}
        </div>
      </main>
    </div>
  )
}

export default App
