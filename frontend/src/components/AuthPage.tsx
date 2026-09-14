import type { FormEvent } from 'react'
import { ArrowUpRight, BriefcaseBusiness, CalendarDays, Sparkles, Users } from 'lucide-react'
import { Field } from './common'

interface AuthPageProps {
  isRegistering: boolean
  registrationRole: string
  error: string
  busy: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onRoleChange: (role: string) => void
  onToggleMode: () => void
}

export function AuthPage({
  isRegistering,
  registrationRole,
  error,
  busy,
  onSubmit,
  onRoleChange,
  onToggleMode,
}: AuthPageProps) {
  return (
    <div className="auth-page">
      <section className="auth-story">
        <div className="brand">
          <span className="brand-mark">
            <Sparkles size={18} />
          </span>
          campus.flow
        </div>
        <div className="auth-story-copy">
          <p className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</p>
          <h1>
            Great potential.
            <br />
            Real opportunities.
          </h1>
          <p>
            One shared space for students, recruiters, and placement teams to make the next move
            happen.
          </p>
          <div className="auth-features">
            <span>
              <BriefcaseBusiness />
              Discover your next role
            </span>
            <span>
              <CalendarDays />
              Stay ready for interviews
            </span>
            <span>
              <Users />
              Build meaningful connections
            </span>
          </div>
        </div>
        <div className="auth-footer">The campus placement workspace</div>
      </section>

      <section className="auth-form-wrap">
        <form className="auth-form" onSubmit={onSubmit}>
          <p className="eyebrow">WELCOME TO CAMPUS.FLOW</p>
          <h2>{isRegistering ? 'Create your account' : 'Welcome back'}</h2>
          <p className="subtitle">
            {isRegistering
              ? 'Start your placement journey.'
              : 'Sign in to your placement workspace.'}
          </p>

          {error && (
            <div role="alert" className="error-banner">
              {error}
            </div>
          )}
          {isRegistering && (
            <>
              <Field label="Full name" name="name" />
              <label>
                Account type
                <select
                  value={registrationRole}
                  onChange={(event) => onRoleChange(event.target.value)}
                >
                  <option value="student">Student</option>
                  <option value="company">Company recruiter</option>
                </select>
              </label>
              {registrationRole === 'company' && (
                <>
                  <Field label="Company name" name="company_name" />
                  <Field label="Industry" name="industry" />
                  <Field label="Location" name="location" />
                  <p className="hint">
                    A placement officer will approve your company before you can publish jobs.
                  </p>
                </>
              )}
            </>
          )}

          <Field label="Email address" name="email" type="email" maxLength={254} />
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={isRegistering ? 12 : 1}
              maxLength={128}
              autoComplete={isRegistering ? 'new-password' : 'current-password'}
            />
          </label>
          {isRegistering && <p className="hint">Use at least 12 characters.</p>}
          <button disabled={busy} className="primary-action auth-submit">
            {busy ? 'Please wait…' : isRegistering ? 'Create account' : 'Sign in'}
            <ArrowUpRight size={16} />
          </button>
          <button type="button" className="auth-toggle" onClick={onToggleMode}>
            {isRegistering ? 'Already have an account? Sign in' : 'New here? Create an account'}
          </button>
        </form>
      </section>
    </div>
  )
}
