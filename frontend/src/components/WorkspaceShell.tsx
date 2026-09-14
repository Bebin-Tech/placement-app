import {
  Bookmark,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Sparkles,
  UserRound,
} from 'lucide-react'
import type { ComponentType } from 'react'
import type { User, UserRole } from '../types'
import { getInitials } from '../utils'

const NAVIGATION: Record<UserRole, string[]> = {
  student: [
    'Overview',
    'Opportunities',
    'My applications',
    'Saved roles',
    'Interviews',
    'My profile',
  ],
  officer: [
    'Overview',
    'Companies',
    'Students',
    'Job openings',
    'Applications',
    'Interviews',
    'My profile',
  ],
  company: ['Overview', 'Job openings', 'Applications', 'Interviews', 'My profile'],
}

const NAVIGATION_ICONS: Record<string, ComponentType<{ size?: number }>> = {
  Overview: LayoutDashboard,
  Opportunities: BriefcaseBusiness,
  Companies: Building2,
  Students: GraduationCap,
  'Job openings': BriefcaseBusiness,
  Applications: FileText,
  'My applications': FileText,
  'Saved roles': Bookmark,
  Interviews: CalendarDays,
  'My profile': UserRound,
}

interface SidebarProps {
  user: User
  activePage: string
  open: boolean
  busy: boolean
  onNavigate: (page: string) => void
  onClose: () => void
  onSignOut: () => void
}

export function Sidebar({
  user,
  activePage,
  open,
  busy,
  onNavigate,
  onClose,
  onSignOut,
}: SidebarProps) {
  return (
    <>
      {open && <button className="nav-backdrop" aria-label="Close navigation" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <span className="brand-mark">
            <Sparkles size={17} />
          </span>
          <span className="brand-name">
            campus<span className="brand-dot">.</span>flow
          </span>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <div className="role-picker">
          <div className="avatar">{getInitials(user.name)}</div>
          <div className="role-details">
            <strong>{user.role[0].toUpperCase() + user.role.slice(1)} workspace</strong>
            <span>{new Date().getFullYear()} placement cycle</span>
          </div>
        </div>
        <nav>
          {NAVIGATION[user.role].map((label) => {
            const Icon = NAVIGATION_ICONS[label]
            return (
              <button
                key={label}
                title={label}
                className={activePage === label ? 'active' : ''}
                onClick={() => onNavigate(label)}
              >
                <Icon size={18} />
                <span className="nav-label">{label}</span>
              </button>
            )
          })}
        </nav>
        <div className="sidebar-bottom">
          <button className="logout" title="Sign out" disabled={busy} onClick={onSignOut}>
            <LogOut size={18} />
            <span className="nav-label">Sign out</span>
          </button>
        </div>
      </aside>
    </>
  )
}

interface TopBarProps {
  user: User
  activePage: string
  menuOpen: boolean
  onToggleMenu: () => void
  onRefresh: () => void
}

export function TopBar({ user, activePage, menuOpen, onToggleMenu, onRefresh }: TopBarProps) {
  return (
    <header className="topbar">
      <button
        className="mobile-menu"
        onClick={onToggleMenu}
        aria-expanded={menuOpen}
        aria-label="Toggle navigation"
      >
        <Menu size={20} />
      </button>
      <div className="breadcrumb">
        Workspace <span>/</span>
        {activePage}
      </div>
      <div className="top-actions">
        <button className="icon-button" onClick={onRefresh} aria-label="Refresh workspace">
          <RefreshCw size={18} />
        </button>
        <div className="top-avatar">{getInitials(user.name)}</div>
        <span className="top-name">{user.name}</span>
      </div>
    </header>
  )
}
