import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ArrowUpRight,
  Bookmark,
  BriefcaseBusiness,
  Building2,
  Check,
  Download,
  FileText,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react'
import { api, ApiError, setCsrfToken } from './api'
import { AuthPage } from './components/AuthPage'
import { Dialog, EmptyState, Field, StatusBadge } from './components/common'
import { Sidebar, TopBar } from './components/WorkspaceShell'
import type { Application, AuthResponse, Company, Job, Snapshot, User } from './types'
import {
  APPLICATION_TRANSITIONS,
  EMPTY_SNAPSHOT,
  formatDate,
  getFormValues,
  getInitials,
} from './utils'
function App() {
  const [user, setUser] = useState<User | null>(null)
  const [boot, setBoot] = useState(true)
  const [authError, setAuthError] = useState('')
  const [register, setRegister] = useState(false)
  const [registrationRole, setRegistrationRole] = useState('student')
  const [data, setData] = useState<Snapshot>(EMPTY_SNAPSHOT)
  const [active, setActive] = useState('Overview')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All')
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [menu, setMenu] = useState(false)
  const [modal, setModal] = useState<'job' | 'company' | Application | null>(null)
  const busyRef = useRef(false)
  const generation = useRef(0)
  const refresh = useCallback(async () => {
    if (!user) return
    const version = ++generation.current
    try {
      const [jobs, applications, companies, saved, students, me] = await Promise.all([
        api<Job[]>('/jobs'),
        api<Application[]>('/applications'),
        api<Company[]>('/companies'),
        api<number[]>('/saved'),
        user.role === 'officer' ? api<User[]>('/students') : Promise.resolve([]),
        api<AuthResponse>('/auth/me'),
      ])
      if (version !== generation.current) return
      setData({ jobs, applications, companies, saved, students })
      setUser((previous) => previous && { ...previous, ...me.user })
      setCsrfToken(me.csrf)
      setLoaded(true)
      setError('')
    } catch (e) {
      if (version !== generation.current) return
      if (e instanceof ApiError && e.status === 401) {
        setUser(null)
        setData(EMPTY_SNAPSHOT)
        setLoaded(false)
      } else setError(e instanceof Error ? e.message : 'Unable to load your workspace.')
    }
  }, [user?.id, user?.role])
  useEffect(() => {
    api<AuthResponse>('/auth/me')
      .then((result) => {
        setCsrfToken(result.csrf)
        setUser(result.user)
      })
      .catch((e) => {
        if (!(e instanceof ApiError && e.status === 401))
          setAuthError('The server is unavailable. Check the connection and try again.')
      })
      .finally(() => setBoot(false))
  }, [])
  useEffect(() => {
    if (!user) return
    void refresh()
    const stream = new EventSource('/api/events')
    stream.addEventListener('change', () => void refresh())
    const timer = window.setInterval(() => void refresh(), 30000)
    const focus = () => void refresh()
    window.addEventListener('focus', focus)
    return () => {
      stream.close()
      clearInterval(timer)
      window.removeEventListener('focus', focus)
      generation.current++
    }
  }, [refresh, user?.id])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 4000)
    return () => clearTimeout(timer)
  }, [toast])
  useEffect(() => {
    setQuery('')
    setFilter('All')
  }, [active])
  async function act(action: () => Promise<unknown>, message: string, close = false) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      await action()
      await refresh()
      setToast(message)
      if (close) setModal(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.')
    } finally {
      setBusy(false)
      busyRef.current = false
    }
  }
  async function authenticate(event: FormEvent<HTMLFormElement>) {
    const values = getFormValues(event)
    setBusy(true)
    setAuthError('')
    try {
      const result = await api<AuthResponse>(register ? '/auth/register' : '/auth/login', 'POST', {
        ...values,
        role: registrationRole,
      })
      setCsrfToken(result.csrf)
      setUser(result.user)
      setActive('Overview')
      setData(EMPTY_SNAPSHOT)
      setLoaded(false)
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Unable to sign in.')
    } finally {
      setBusy(false)
    }
  }
  function exportReport() {
    const rows = [
      ['Student', 'Email', 'Role', 'Company', 'Status', 'Applied', 'Interview', 'Location'],
      ...data.applications.map((a) => [
        a.student_name,
        a.student_email,
        a.title,
        a.company_name,
        a.status,
        a.created_at,
        a.interview_at || '',
        a.interview_location,
      ]),
    ]
    const csv = rows
      .map((row) =>
        row
          .map(
            (value) =>
              '"' + (/^[=+@\-\t\r]/.test(value) ? "'" : '') + value.replaceAll('"', '""') + '"',
          )
          .join(','),
      )
      .join('\r\n')
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'placement-applications.csv'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  if (boot)
    return (
      <div className="loading-screen">
        <Sparkles />
        <p>Opening your workspace…</p>
      </div>
    )
  if (!user) {
    return (
      <AuthPage
        isRegistering={register}
        registrationRole={registrationRole}
        error={authError}
        busy={busy}
        onSubmit={authenticate}
        onRoleChange={setRegistrationRole}
        onToggleMode={() => {
          setRegister((current) => !current)
          setAuthError('')
        }}
      />
    )
  }
  const student = user.role === 'student',
    officer = user.role === 'officer'
  const available = data.jobs.filter(
    (j) => !j.closed && j.deadline >= new Date().toISOString().slice(0, 10),
  )
  const interviews = data.applications
    .filter((a) => a.status === 'Interview scheduled')
    .sort((a, b) => (a.interview_at || '').localeCompare(b.interview_at || ''))
  const complete = [
    user.name,
    user.education,
    user.skills,
    user.cgpa > 0,
    user.graduation_year,
    user.resume_name,
  ].filter(Boolean).length
  const jobs = data.jobs.filter(
    (j) =>
      (active !== 'Saved roles' || data.saved.includes(j.id)) &&
      `${j.title} ${j.company_name} ${j.location} ${j.required_skills}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter !== 'Open' || (!j.closed && j.deadline >= new Date().toISOString().slice(0, 10))) &&
      (filter !== 'Eligible' ||
        (!j.closed &&
          j.deadline >= new Date().toISOString().slice(0, 10) &&
          user.cgpa >= j.min_cgpa)),
  )
  const applications = data.applications.filter(
    (a) =>
      `${a.title} ${a.company_name} ${a.student_name}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (active === 'Overview' || filter === 'All' || a.status === filter),
  )
  const showJobs = ['Overview', 'Opportunities', 'Saved roles', 'Job openings'].includes(active)
  const showApplications =
    ['Applications', 'My applications'].includes(active) || (active === 'Overview' && !student)
  return (
    <div className="app-shell">
      <Sidebar
        user={user}
        activePage={active}
        open={menu}
        busy={busy}
        onNavigate={(page) => {
          setActive(page)
          setMenu(false)
        }}
        onClose={() => setMenu(false)}
        onSignOut={() =>
          void act(async () => {
            await api('/auth/logout', 'POST', {})
            generation.current++
            setUser(null)
            setData(EMPTY_SNAPSHOT)
            setLoaded(false)
            setCsrfToken('')
          }, 'Signed out')
        }
      />
      <main className="main-content">
        <TopBar
          user={user}
          activePage={active}
          menuOpen={menu}
          onToggleMenu={() => setMenu((current) => !current)}
          onRefresh={() => void refresh()}
        />
        <div className="page-wrap">
          <div className="welcome-row">
            <div>
              <p className="eyebrow">
                {new Date()
                  .toLocaleDateString(undefined, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })
                  .toUpperCase()}
              </p>
              <h1>
                {active === 'Overview' ? `Welcome, ${user.name.split(' ')[0]}` : active}{' '}
                <span>✦</span>
              </h1>
              <p className="subtitle">
                {student
                  ? 'Your next opportunity is closer than you think.'
                  : 'Keep your placement cycle moving with clarity.'}
              </p>
            </div>
            {student ? (
              <button className="primary-action" onClick={() => setActive('Opportunities')}>
                <BriefcaseBusiness size={17} />
                Explore opportunities
              </button>
            ) : active === 'Companies' ? (
              <button
                className="primary-action"
                onClick={() => {
                  setError('')
                  setModal('company')
                }}
              >
                <Plus size={17} />
                Add company
              </button>
            ) : ['Overview', 'Job openings'].includes(active) ? (
              <button
                className="primary-action"
                onClick={() => {
                  setError('')
                  setModal('job')
                }}
              >
                <Plus size={17} />
                Post a job opening
              </button>
            ) : null}
          </div>
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button onClick={() => void refresh()}>Retry</button>
            </div>
          )}
          {!loaded ? (
            <EmptyState>Loading your workspace…</EmptyState>
          ) : (
            <>
              {user.role === 'company' &&
                !data.companies.find((c) => c.id === user.company_id)?.approved && (
                  <div className="notice">
                    Your company is awaiting placement officer approval. You can publish openings
                    after approval.
                  </div>
                )}
              {active === 'Overview' && (
                <section className="metrics">
                  {[
                    ['Open roles', available.length],
                    ['Applications', data.applications.length],
                    ['Interviews', interviews.length],
                    [
                      student ? 'Profile completion' : 'Offers made',
                      student
                        ? `${Math.round((complete / 6) * 100)}%`
                        : data.applications.filter((a) => a.status === 'Selected').length,
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <span className="metric-label">{label}</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </section>
              )}
              {showJobs && (
                <div className={student && active === 'Overview' ? 'content-grid' : ''}>
                  <section className="panel opportunities">
                    <div className="panel-header">
                      <div>
                        <h2>
                          {active === 'Saved roles'
                            ? 'Saved for later'
                            : student
                              ? 'Find your next opportunity'
                              : 'Job openings'}
                        </h2>
                        <p>
                          {student
                            ? 'Explore roles from approved recruiting partners'
                            : 'Manage your recruitment opportunities'}
                        </p>
                      </div>
                      <span className="result-count">{jobs.length} roles</span>
                    </div>
                    <div className="search-box">
                      <Search size={16} />
                      <input
                        aria-label="Search jobs"
                        placeholder="Search roles, companies, locations or skills"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                      <select
                        aria-label="Filter jobs"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      >
                        <option>All</option>
                        <option>Open</option>
                        {student && <option>Eligible</option>}
                      </select>
                    </div>
                    {!jobs.length && (
                      <EmptyState>
                        {active === 'Saved roles'
                          ? 'Save roles using the bookmark button to find them here.'
                          : 'No opportunities found. New openings will appear here as they are published.'}
                      </EmptyState>
                    )}
                    {jobs.map((job) => {
                      const applied = data.applications.some((a) => a.job_id === job.id),
                        closed = job.closed || job.deadline < new Date().toISOString().slice(0, 10)
                      return (
                        <article className="job-card" key={job.id}>
                          <div className="job-heading">
                            <span className="company-logo blue">{job.company_name[0]}</span>
                            <div>
                              <h3>{job.title}</h3>
                              <p>
                                {job.company_name} · {job.location}
                              </p>
                            </div>
                            {student && (
                              <button
                                className={`save-button ${data.saved.includes(job.id) ? 'saved' : ''}`}
                                aria-label={
                                  data.saved.includes(job.id)
                                    ? `Unsave ${job.title}`
                                    : `Save ${job.title}`
                                }
                                disabled={busy}
                                onClick={() =>
                                  void act(
                                    () =>
                                      api(
                                        `/saved/${job.id}`,
                                        data.saved.includes(job.id) ? 'DELETE' : 'PUT',
                                        {},
                                      ),
                                    'Saved roles updated',
                                  )
                                }
                              >
                                <Bookmark
                                  size={19}
                                  fill={data.saved.includes(job.id) ? 'currentColor' : 'none'}
                                />
                              </button>
                            )}
                          </div>
                          <p className="job-description">{job.description}</p>
                          <div className="tags">
                            <span>CGPA {job.min_cgpa}+</span>
                            {job.required_skills
                              .split(',')
                              .filter(Boolean)
                              .map((skill, i) => (
                                <span key={i}>{skill.trim()}</span>
                              ))}
                          </div>
                          <div className="job-footer">
                            <span>
                              {closed ? 'Closed' : `Apply by ${formatDate(job.deadline)}`}
                            </span>
                            {student ? (
                              <button
                                disabled={busy || applied || Boolean(closed)}
                                className={`apply-button ${applied ? 'done' : ''}`}
                                onClick={() =>
                                  void act(
                                    () => api('/applications', 'POST', { job_id: job.id }),
                                    'Application submitted',
                                  )
                                }
                              >
                                {applied ? (
                                  <>
                                    <Check size={14} />
                                    Applied
                                  </>
                                ) : closed ? (
                                  'Closed'
                                ) : (
                                  'Apply now'
                                )}
                              </button>
                            ) : (
                              <button
                                className="outline-button compact"
                                disabled={busy}
                                onClick={() =>
                                  void act(
                                    () => api(`/jobs/${job.id}`, 'PATCH', { closed: !job.closed }),
                                    job.closed ? 'Opening reopened' : 'Opening closed',
                                  )
                                }
                              >
                                {job.closed ? 'Reopen' : 'Close opening'}
                              </button>
                            )}
                          </div>
                        </article>
                      )
                    })}
                  </section>
                  {student && active === 'Overview' && (
                    <aside className="right-column">
                      <section className="profile-card">
                        <div className="profile-top">
                          <div className="profile-avatar">{getInitials(user.name)}</div>
                          <div>
                            <h2>Your profile</h2>
                            <p>Make your experience count</p>
                          </div>
                        </div>
                        <progress value={complete} max={6} />
                        <div className="progress-label">
                          <strong>{Math.round((complete / 6) * 100)}% complete</strong>
                          <span>{6 - complete} steps left</span>
                        </div>
                        <ul>
                          {[
                            ['Basic information', true],
                            ['Education & skills', Boolean(user.education && user.skills)],
                            ['Resume uploaded', Boolean(user.resume_name)],
                          ].map(([label, done]) => (
                            <li key={String(label)} className={done ? 'checked' : ''}>
                              {done ? <Check size={14} /> : <span className="step-dot" />}
                              {label}
                            </li>
                          ))}
                        </ul>
                        <button className="outline-button" onClick={() => setActive('My profile')}>
                          {complete === 6 ? 'View profile' : 'Finish profile'}
                        </button>
                      </section>
                      <section className="tip-card">
                        <Sparkles size={22} />
                        <div>
                          <strong>Your application checklist</strong>
                          <p>Add your education, accurate CGPA, and PDF resume before applying.</p>
                          <button
                            className="text-button"
                            onClick={() => setActive('My applications')}
                          >
                            Track applications <ArrowUpRight size={14} />
                          </button>
                        </div>
                      </section>
                    </aside>
                  )}
                </div>
              )}
              {showApplications && (
                <section className="panel applications">
                  <div className="panel-header">
                    <div>
                      <h2>{student ? 'My applications' : 'Application pipeline'}</h2>
                      <p>
                        {student
                          ? 'Track every step of your journey'
                          : 'Review applicants and manage next steps'}
                      </p>
                    </div>
                    {!student && (
                      <button className="text-button" onClick={exportReport}>
                        <Download size={16} />
                        Export CSV
                      </button>
                    )}
                  </div>
                  <div className="search-box">
                    <Search size={16} />
                    <input
                      aria-label="Search applications"
                      placeholder="Search applications"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <select
                      aria-label="Filter application status"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option>All</option>
                      {Object.keys(APPLICATION_TRANSITIONS).map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  {!applications.length && (
                    <EmptyState>
                      No applications yet. Submitted applications will appear here.
                    </EmptyState>
                  )}
                  {applications.map((item) => (
                    <article className="application-card" key={item.id}>
                      <div>
                        <h3>{item.title}</h3>
                        <p>
                          {item.company_name}
                          {!student && ` · ${item.student_name} (${item.student_email})`}
                        </p>
                        <small>
                          Applied {formatDate(item.created_at)}
                          {!student &&
                            ` · CGPA ${item.cgpa} · ${item.skills || 'No skills listed'}`}
                        </small>
                        {item.interview_at && (
                          <p>
                            Interview: {new Date(item.interview_at).toLocaleString()} ·{' '}
                            {item.interview_location}
                          </p>
                        )}
                      </div>
                      <div className="application-actions">
                        <StatusBadge value={item.status} />
                        {!student && item.resume_name && (
                          <a className="text-button" href={`/api/resumes/${item.student_id}`}>
                            Download resume
                          </a>
                        )}
                        {student &&
                          !['Selected', 'Rejected', 'Withdrawn'].includes(item.status) && (
                            <button
                              disabled={busy}
                              className="text-button danger"
                              onClick={() =>
                                void act(
                                  () =>
                                    api(`/applications/${item.id}`, 'PATCH', {
                                      status: 'Withdrawn',
                                    }),
                                  'Application withdrawn',
                                )
                              }
                            >
                              Withdraw application
                            </button>
                          )}
                        {!student && (APPLICATION_TRANSITIONS[item.status] || []).length > 0 && (
                          <select
                            aria-label={`Update application for ${item.student_name}`}
                            disabled={busy}
                            value=""
                            onChange={(e) => {
                              const status = e.target.value
                              if (status === 'Interview scheduled') {
                                setError('')
                                setModal(item)
                              } else
                                void act(
                                  () => api(`/applications/${item.id}`, 'PATCH', { status }),
                                  'Application status updated',
                                )
                            }}
                          >
                            <option value="">Update status…</option>
                            {(APPLICATION_TRANSITIONS[item.status] || []).map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </article>
                  ))}
                </section>
              )}
              {active === 'Interviews' && (
                <section className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>Interview schedule</h2>
                      <p>
                        Times are displayed in your local timezone.{' '}
                        {student ? '' : 'Schedule interviews from shortlisted applications.'}
                      </p>
                    </div>
                    {!student && (
                      <button className="text-button" onClick={() => setActive('Applications')}>
                        Review applications <ArrowUpRight size={16} />
                      </button>
                    )}
                  </div>
                  {!interviews.length && <EmptyState>No interviews scheduled yet.</EmptyState>}
                  {interviews.map((a) => (
                    <article className="application-card" key={a.id}>
                      <div>
                        <h3>{a.title}</h3>
                        <p>
                          {a.company_name}
                          {!student && ` · ${a.student_name}`}
                        </p>
                        <p>{new Date(a.interview_at!).toLocaleString()}</p>
                        <p>{a.interview_location}</p>
                      </div>
                      <StatusBadge
                        value={
                          Date.parse(a.interview_at!) < Date.now()
                            ? 'Past interview'
                            : 'Interview scheduled'
                        }
                      />
                    </article>
                  ))}
                </section>
              )}
              {active === 'Companies' && (
                <section className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>Recruiting partners</h2>
                      <p>Approve recruiters before they publish opportunities</p>
                    </div>
                  </div>
                  {!data.companies.length && (
                    <EmptyState>
                      Companies will appear here when recruiters register, or you add a partner.
                    </EmptyState>
                  )}
                  {data.companies.map((c) => (
                    <div className="admin-row" key={c.id}>
                      <span className="company-logo blue">
                        <Building2 size={20} />
                      </span>
                      <div>
                        <strong>{c.name}</strong>
                        <span>
                          {c.industry} · {c.location}
                        </span>
                      </div>
                      <StatusBadge value={c.approved ? 'Approved' : 'Awaiting approval'} />
                      <button
                        disabled={busy}
                        className="text-button"
                        onClick={() =>
                          void act(
                            () => api(`/companies/${c.id}`, 'PATCH', { approved: !c.approved }),
                            c.approved ? 'Company approval revoked' : 'Company approved',
                          )
                        }
                      >
                        {c.approved ? 'Revoke approval' : 'Approve'}
                      </button>
                    </div>
                  ))}
                </section>
              )}
              {active === 'Students' && (
                <section className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>Student directory</h2>
                      <p>{data.students.length} registered students</p>
                    </div>
                  </div>
                  <div className="search-box">
                    <Search size={16} />
                    <input
                      aria-label="Search students"
                      placeholder="Search name, email or skills"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  {!data.students.length && (
                    <EmptyState>No students have registered yet.</EmptyState>
                  )}
                  {data.students
                    .filter((s) =>
                      `${s.name} ${s.email} ${s.skills}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .map((s) => (
                      <div className="admin-row" key={s.id}>
                        <span className="company-logo green">{getInitials(s.name)}</span>
                        <div>
                          <strong>{s.name}</strong>
                          <span>
                            {s.email} · CGPA {s.cgpa}
                          </span>
                          <span>
                            {s.education} · {s.skills}
                          </span>
                        </div>
                        {s.resume_name && (
                          <a className="text-button" href={`/api/resumes/${s.id}`}>
                            Resume <Download size={14} />
                          </a>
                        )}
                      </div>
                    ))}
                </section>
              )}
              {active === 'My profile' && (
                <section className="panel profile-page">
                  <h2>Your profile</h2>
                  <p className="subtitle">
                    {user.email} · {user.role} account
                  </p>
                  <form
                    className="profile-form"
                    onSubmit={(e) => {
                      const values = getFormValues(e)
                      void act(
                        () =>
                          api('/profile', 'PATCH', {
                            ...values,
                            cgpa: Number(values.cgpa || user.cgpa),
                            skills: values.skills ?? user.skills,
                            education: values.education ?? user.education,
                            graduation_year: values.graduation_year ?? user.graduation_year,
                          }),
                        'Profile saved',
                      )
                    }}
                  >
                    <Field label="Full name" name="name" value={user.name} />
                    {student && (
                      <>
                        <div className="form-row">
                          <Field
                            label="Education / degree"
                            name="education"
                            value={user.education}
                            required={false}
                          />
                          <Field
                            label="Graduation year"
                            name="graduation_year"
                            value={user.graduation_year}
                            maxLength={4}
                            required={false}
                          />
                        </div>
                        <div className="form-row">
                          <Field
                            label="CGPA (out of 10)"
                            name="cgpa"
                            type="number"
                            value={user.cgpa}
                          />
                          <Field
                            label="Skills, separated by commas"
                            name="skills"
                            value={user.skills}
                            maxLength={1000}
                            required={false}
                          />
                        </div>
                      </>
                    )}
                    <button className="primary-action" disabled={busy}>
                      {busy ? 'Saving…' : 'Save profile'}
                    </button>
                  </form>
                  <form
                    className="profile-form"
                    onSubmit={(e) => {
                      const values = getFormValues(e)
                      const form = e.currentTarget
                      void act(async () => {
                        await api('/auth/password', 'POST', values)
                        form.reset()
                      }, 'Password updated. Other sessions signed out.')
                    }}
                  >
                    <h3>Change password</h3>
                    <div className="form-row">
                      <Field
                        label="Current password"
                        name="current_password"
                        type="password"
                        maxLength={128}
                      />
                      <label>
                        New password
                        <input
                          name="new_password"
                          type="password"
                          minLength={12}
                          maxLength={128}
                          required
                          autoComplete="new-password"
                        />
                      </label>
                    </div>
                    <button className="primary-action" disabled={busy}>
                      Update password
                    </button>
                  </form>
                  {student && (
                    <div className="resume-upload">
                      <h3>Resume</h3>
                      <p className="hint">
                        PDF only, up to 2 MB. Your resume is shared with recruiters you apply to and
                        placement officers.
                      </p>
                      {user.resume_name && (
                        <a className="text-button" href={`/api/resumes/${user.id}`}>
                          <FileText size={16} />
                          {user.resume_name}
                        </a>
                      )}
                      <label className="upload-label">
                        {user.resume_name ? 'Replace resume' : 'Upload resume'}
                        <input
                          aria-label="Upload PDF resume"
                          type="file"
                          accept="application/pdf,.pdf"
                          disabled={busy}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            e.target.value = ''
                            if (!file) return
                            if (file.size > 2 * 1024 * 1024) {
                              setError('Upload a PDF up to 2 MB.')
                              return
                            }
                            void act(async () => {
                              const encoded = await new Promise<string>((resolve, reject) => {
                                const reader = new FileReader()
                                reader.onload = () => resolve(String(reader.result).split(',')[1])
                                reader.onerror = () => reject(new Error('Could not read the file.'))
                                reader.readAsDataURL(file)
                              })
                              await api('/resume', 'POST', { name: file.name, data: encoded })
                            }, 'Resume uploaded')
                          }}
                        />
                      </label>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </main>
      {modal && (
        <Dialog
          title={
            typeof modal === 'object'
              ? 'Schedule interview'
              : modal === 'job'
                ? 'Post a job opening'
                : 'Add a company'
          }
          busy={busy}
          onClose={() => {
            setModal(null)
            setError('')
          }}
        >
          <form
            onSubmit={(e) => {
              const values = getFormValues(e)
              if (typeof modal === 'object') {
                void act(
                  () =>
                    api(`/applications/${modal.id}`, 'PATCH', {
                      ...values,
                      status: 'Interview scheduled',
                      interview_at: new Date(String(values.interview_at)).toISOString(),
                    }),
                  'Interview scheduled',
                  true,
                )
              } else if (modal === 'company') {
                void act(() => api('/companies', 'POST', values), 'Company added', true)
              } else {
                void act(
                  () =>
                    api('/jobs', 'POST', {
                      ...values,
                      company_id: Number(values.company_id || user.company_id),
                      min_cgpa: Number(values.min_cgpa),
                    }),
                  'Job opening published',
                  true,
                )
              }
            }}
          >
            {error && (
              <div className="error-banner" role="alert">
                {error}
              </div>
            )}
            {typeof modal === 'object' ? (
              <>
                <p className="subtitle">
                  {modal.student_name} · {modal.title}
                </p>
                <Field
                  label="Interview date and time (your timezone)"
                  name="interview_at"
                  type="datetime-local"
                />
                <Field label="Location or meeting link" name="interview_location" maxLength={500} />
              </>
            ) : modal === 'company' ? (
              <>
                <Field label="Company name" name="name" />
                <Field label="Industry" name="industry" />
                <Field label="Location" name="location" />
              </>
            ) : (
              <>
                {officer && (
                  <label>
                    Company
                    <select aria-label="Company" name="company_id" required>
                      <option value="">Select an approved company</option>
                      {data.companies
                        .filter((c) => c.approved)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                <Field label="Role title" name="title" />
                <label>
                  Job description
                  <textarea name="description" required maxLength={10000} rows={4} />
                </label>
                <div className="form-row">
                  <Field label="Minimum CGPA" name="min_cgpa" type="number" value={0} />
                  <Field label="Application deadline" name="deadline" type="date" />
                </div>
                <Field
                  label="Skills (comma separated)"
                  name="required_skills"
                  maxLength={1000}
                  required={false}
                />
              </>
            )}
            <button className="primary-action modal-submit" disabled={busy}>
              {busy
                ? 'Saving…'
                : typeof modal === 'object'
                  ? 'Schedule interview'
                  : modal === 'job'
                    ? 'Publish opening'
                    : 'Add company'}
              <ArrowUpRight size={16} />
            </button>
          </form>
        </Dialog>
      )}
      {toast && (
        <div role="status" className="toast">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  )
}
export default App
