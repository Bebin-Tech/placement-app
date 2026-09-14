export type UserRole = 'student' | 'officer' | 'company'

export interface User {
  id: number
  name: string
  email: string
  role: UserRole
  company_id: number | null
  cgpa: number
  skills: string
  education: string
  graduation_year: string
  resume_name: string | null
}

export interface Company {
  id: number
  name: string
  industry: string
  location: string
  approved: number
}

export interface Job {
  id: number
  company_id: number
  title: string
  description: string
  company_name: string
  industry: string
  location: string
  min_cgpa: number
  required_skills: string
  deadline: string
  closed: number
}

export interface Application {
  id: number
  job_id: number
  student_id: number
  title: string
  company_name: string
  student_name: string
  student_email: string
  cgpa: number
  skills: string
  resume_name: string | null
  status: string
  interview_at: string | null
  interview_location: string
  created_at: string
}

export interface Snapshot {
  jobs: Job[]
  applications: Application[]
  companies: Company[]
  saved: number[]
  students: User[]
}

export interface AuthResponse {
  user: User
  csrf: string
}
