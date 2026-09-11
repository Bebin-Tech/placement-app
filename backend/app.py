import base64, hashlib, os, re, secrets, sqlite3, threading, time
from datetime import datetime, timezone
from functools import wraps
from io import BytesIO
from pathlib import Path
from urllib.parse import urlsplit
from flask import Flask, Response, g, jsonify, request, send_file, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

ROOT=Path(__file__).resolve().parent.parent
DB=Path(os.getenv('DATABASE_PATH',ROOT/'data'/'campus.db'))
DIST=ROOT/'dist'; SESSION_AGE=86400
TRANSITIONS={'Under review':{'Shortlisted','Rejected','Withdrawn'},'Shortlisted':{'Interview scheduled','Selected','Rejected','Withdrawn'},'Interview scheduled':{'Interview scheduled','Selected','Rejected','Withdrawn'},'Selected':set(),'Rejected':set(),'Withdrawn':set()}
app=Flask(__name__,static_folder=None);app.config['MAX_CONTENT_LENGTH']=4*1024*1024
event_condition=threading.Condition();event_version=0;attempts={}

def init_db(path=None):
    target=Path(path or DB);target.parent.mkdir(parents=True,exist_ok=True);db=sqlite3.connect(target)
    db.executescript("""PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS companies(id INTEGER PRIMARY KEY,name TEXT NOT NULL,industry TEXT NOT NULL,location TEXT NOT NULL,approved INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('student','company','officer')),company_id INTEGER REFERENCES companies(id),cgpa REAL NOT NULL DEFAULT 0,skills TEXT NOT NULL DEFAULT '',education TEXT NOT NULL DEFAULT '',graduation_year TEXT NOT NULL DEFAULT '',resume_name TEXT,resume BLOB);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS jobs(id INTEGER PRIMARY KEY,company_id INTEGER NOT NULL REFERENCES companies(id),title TEXT NOT NULL,description TEXT NOT NULL,min_cgpa REAL NOT NULL CHECK(min_cgpa BETWEEN 0 AND 10),required_skills TEXT NOT NULL,deadline TEXT NOT NULL,closed INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE IF NOT EXISTS applications(id INTEGER PRIMARY KEY,job_id INTEGER NOT NULL REFERENCES jobs(id),student_id INTEGER NOT NULL REFERENCES users(id),status TEXT NOT NULL DEFAULT 'Under review',interview_at TEXT,interview_location TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),UNIQUE(job_id,student_id));
CREATE TABLE IF NOT EXISTS saved(user_id INTEGER REFERENCES users(id),job_id INTEGER REFERENCES jobs(id),PRIMARY KEY(user_id,job_id));
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,actor_id INTEGER REFERENCES users(id),action TEXT NOT NULL,entity_id INTEGER,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE INDEX IF NOT EXISTS application_student ON applications(student_id);CREATE INDEX IF NOT EXISTS job_company ON jobs(company_id);CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires);PRAGMA user_version=1;""");db.close()

def db():
    if 'db' not in g:
        g.db=sqlite3.connect(DB,timeout=5);g.db.row_factory=sqlite3.Row;g.db.execute('PRAGMA foreign_keys=ON');g.db.execute('PRAGMA busy_timeout=5000')
    return g.db
@app.teardown_appcontext
def close_db(_=None):
    connection=g.pop('db',None)
    if connection:connection.close()
def out(row):return dict(row) if row else None
def user_out(row):
    value=out(row);value.pop('password',None);value.pop('resume',None);return value
def fail(status,message):
    error=RuntimeError(message);error.status=status;raise error
def txt(value,name,limit=200,optional=False):
    if not isinstance(value,str) or (not optional and not value.strip()) or len(value)>limit:fail(400,f'{name} is required and must be at most {limit} characters.')
    return value.strip()
def num(value,name,limit=10**9):
    if isinstance(value,bool) or not isinstance(value,(int,float)) or value<0 or value>limit:fail(400,f'Invalid {name}.')
    return value
def digest(value):return hashlib.sha256(value.encode()).hexdigest()
def current():
    raw=request.cookies.get('campus_session','');session=db().execute('SELECT * FROM sessions WHERE token=? AND expires>?',(digest(raw),int(time.time()))).fetchone() if raw else None
    user=db().execute('SELECT * FROM users WHERE id=?',(session['user_id'],)).fetchone() if session else None
    if not user:fail(401,'Please sign in.')
    return user,session,raw
def auth(*roles):
    def deco(fn):
        @wraps(fn)
        def wrapped(*args,**kwargs):
            g.user,g.session,g.raw_session=current()
            if request.method not in {'GET','HEAD'} and request.headers.get('X-CSRF-Token')!=g.session['csrf']:fail(403,'Invalid security token. Refresh and try again.')
            if roles and g.user['role'] not in roles:fail(403,'You do not have permission for this action.')
            return fn(*args,**kwargs)
        return wrapped
    return deco
def audit(action,entity=None):db().execute('INSERT INTO audit(actor_id,action,entity_id) VALUES(?,?,?)',(g.user['id'],action,entity))
def notify():
    global event_version
    with event_condition:event_version+=1;event_condition.notify_all()
def job_owned(job_id):
    job=db().execute('SELECT * FROM jobs WHERE id=?',(job_id,)).fetchone()
    if not job:fail(404,'Job not found.')
    if g.user['role']=='company' and job['company_id']!=g.user['company_id']:fail(403,'This job belongs to another company.')
    return job

@app.before_request
def secure_mutation():
    if request.method in {'POST','PATCH','PUT','DELETE'}:
        if not request.is_json:fail(415,'Send application/json.')
        origin=request.headers.get('Origin');expected=os.getenv('APP_ORIGIN',request.host_url.rstrip('/'))
        local_origin=False
        if origin and os.getenv('FLASK_ENV')!='production':
            parsed=urlsplit(origin)
            local_origin=parsed.scheme=='http' and parsed.hostname in {'localhost','127.0.0.1','::1'}
        if origin and origin!=expected and not local_origin:fail(403,'Untrusted request origin.')
@app.after_request
def headers(response):
    response.headers.update({'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self';style-src 'self' 'unsafe-inline';img-src 'self' data:;connect-src 'self';frame-ancestors 'none';base-uri 'self';form-action 'self'"})
    if request.path.startswith('/api/'):response.headers['Cache-Control']='no-store'
    if os.getenv('FLASK_ENV')=='production':response.headers['Strict-Transport-Security']='max-age=31536000'
    return response
@app.errorhandler(Exception)
def errors(error):
    status=getattr(error,'status',getattr(error,'code',500));message='Request too large.' if status==413 else ('Something went wrong. Please try again.' if status>=500 else getattr(error,'description',str(error)))
    if status>=500:app.logger.exception(error)
    return jsonify(error=message),status

@app.get('/api/health')
def health():db().execute('SELECT 1');return jsonify(status='ok',service='campus.flow',backend='flask')
def throttle():
    key=request.remote_addr or 'unknown';now=time.time();count,until=attempts.get(key,(0,now+900))
    if until<now:count,until=0,now+900
    attempts[key]=(count+1,until)
    if count+1>30:fail(429,'Too many attempts. Try again in 15 minutes.')
def session(user_id,status=200):
    raw,csrf=secrets.token_hex(32),secrets.token_hex(24);connection=db();connection.execute('DELETE FROM sessions WHERE expires<?',(int(time.time()),));connection.execute('INSERT INTO sessions VALUES(?,?,?,?)',(digest(raw),user_id,csrf,int(time.time())+SESSION_AGE));connection.commit()
    response=jsonify(user=user_out(connection.execute('SELECT * FROM users WHERE id=?',(user_id,)).fetchone()),csrf=csrf);response.status_code=status;response.set_cookie('campus_session',raw,max_age=SESSION_AGE,httponly=True,samesite='Lax',secure=os.getenv('FLASK_ENV')=='production');notify();return response
@app.post('/api/auth/register')
def register():
    throttle();data=request.get_json(silent=True) or {};email=txt(data.get('email'),'Email',254).lower();password=txt(data.get('password'),'Password',128);name=txt(data.get('name'),'Name',100);role=data.get('role')
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email):fail(400,'Enter a valid email address.')
    if len(password)<12:fail(400,'Use a password with at least 12 characters.')
    if role not in {'student','company'}:fail(400,'Choose student or company. Officers are provisioned by an administrator.')
    connection=db()
    if connection.execute('SELECT 1 FROM users WHERE email=?',(email,)).fetchone():fail(409,'An account with this email already exists.')
    try:
        connection.execute('BEGIN IMMEDIATE');company_id=None
        if role=='company':company_id=connection.execute('INSERT INTO companies(name,industry,location) VALUES(?,?,?)',(txt(data.get('company_name'),'Company name'),txt(data.get('industry'),'Industry'),txt(data.get('location'),'Location'))).lastrowid
        user_id=connection.execute('INSERT INTO users(name,email,password,role,company_id) VALUES(?,?,?,?,?)',(name,email,generate_password_hash(password,method='scrypt'),role,company_id)).lastrowid;connection.commit()
    except Exception:connection.rollback();raise
    return session(user_id,201)
@app.post('/api/auth/login')
def login():
    throttle();data=request.get_json(silent=True) or {};email=txt(data.get('email'),'Email',254).lower();password=txt(data.get('password'),'Password',128);user=db().execute('SELECT * FROM users WHERE email=?',(email,)).fetchone()
    if not user or not check_password_hash(user['password'],password):fail(401,'Invalid email or password.')
    return session(user['id'])
@app.get('/api/auth/me')
@auth()
def me():return jsonify(user=user_out(g.user),csrf=g.session['csrf'])
@app.post('/api/auth/logout')
@auth()
def logout():
    db().execute('DELETE FROM sessions WHERE token=?',(digest(g.raw_session),));db().commit();notify();response=jsonify(ok=True);response.delete_cookie('campus_session',path='/');return response
@app.post('/api/auth/password')
@auth()
def password():
    data=request.get_json(silent=True) or {};old=txt(data.get('current_password'),'Current password',128);new=txt(data.get('new_password'),'New password',128)
    if len(new)<12:fail(400,'Use a password with at least 12 characters.')
    if not check_password_hash(g.user['password'],old):fail(403,'Current password is incorrect.')
    db().execute('UPDATE users SET password=? WHERE id=?',(generate_password_hash(new,method='scrypt'),g.user['id']));db().execute('DELETE FROM sessions WHERE user_id=? AND token<>?',(g.user['id'],digest(g.raw_session)));audit('password.changed',g.user['id']);db().commit();notify();return jsonify(ok=True)
@app.get('/api/events')
@auth()
def events_stream():
    session_hash=digest(g.raw_session)
    def generate():
        seen=-1
        while True:
            with event_condition:event_condition.wait_for(lambda:event_version!=seen,timeout=20);seen=event_version
            connection=sqlite3.connect(DB);valid=connection.execute('SELECT 1 FROM sessions WHERE token=? AND expires>?',(session_hash,int(time.time()))).fetchone();connection.close()
            if not valid:return
            yield 'event: change\ndata: {}\n\n'
    return Response(generate(),mimetype='text/event-stream',headers={'X-Accel-Buffering':'no'})

@app.patch('/api/profile')
@auth()
def profile():
    data=request.get_json(silent=True) or {};values=(txt(data.get('name'),'Name',100),num(data.get('cgpa'),'CGPA',10),txt(data.get('skills',''),'Skills',1000,True),txt(data.get('education',''),'Education',200,True),txt(data.get('graduation_year',''),'Graduation year',4,True));year=values[4]
    if year and not re.fullmatch(r'20\d{2}',year):fail(400,'Enter a four-digit graduation year.')
    db().execute('UPDATE users SET name=?,cgpa=?,skills=?,education=?,graduation_year=? WHERE id=?',(*values,g.user['id']));audit('profile.updated',g.user['id']);db().commit();notify();return jsonify(user_out(db().execute('SELECT * FROM users WHERE id=?',(g.user['id'],)).fetchone()))
@app.post('/api/resume')
@auth('student')
def resume_upload():
    data=request.get_json(silent=True) or {};name=txt(data.get('name'),'Filename',150);encoded=txt(data.get('data'),'PDF',3_000_000)
    try:pdf=base64.b64decode(encoded,validate=True)
    except Exception:fail(400,'Upload a valid PDF up to 2 MB.')
    if len(pdf)>2*1024*1024 or not pdf.startswith(b'%PDF-'):fail(400,'Upload a PDF up to 2 MB.')
    db().execute('UPDATE users SET resume=?,resume_name=? WHERE id=?',(pdf,name,g.user['id']));audit('resume.updated',g.user['id']);db().commit();notify();return jsonify(ok=True)
@app.get('/api/resumes/<int:student_id>')
@auth()
def resume_download(student_id):
    if g.user['id']!=student_id and g.user['role']!='officer':
        allowed=g.user['role']=='company' and db().execute('SELECT 1 FROM applications a JOIN jobs j ON j.id=a.job_id WHERE a.student_id=? AND j.company_id=?',(student_id,g.user['company_id'])).fetchone()
        if not allowed:fail(403,'Resume access denied.')
    student=db().execute('SELECT resume FROM users WHERE id=?',(student_id,)).fetchone()
    if not student or not student['resume']:fail(404,'Resume not uploaded.')
    return send_file(BytesIO(student['resume']),mimetype='application/pdf',as_attachment=True,download_name='resume.pdf',max_age=0)

@app.get('/api/companies')
@auth()
def companies():return jsonify([out(r) for r in db().execute("SELECT * FROM companies WHERE approved=1 OR ?='officer' OR id=? ORDER BY name",(g.user['role'],g.user['company_id'])).fetchall()])
@app.post('/api/companies')
@auth('officer')
def company_create():
    data=request.get_json(silent=True) or {};company_id=db().execute('INSERT INTO companies(name,industry,location,approved) VALUES(?,?,?,1)',(txt(data.get('name'),'Name'),txt(data.get('industry'),'Industry'),txt(data.get('location'),'Location'))).lastrowid;audit('company.created',company_id);db().commit();notify();return jsonify(id=company_id),201
@app.patch('/api/companies/<int:company_id>')
@auth('officer')
def company_approve(company_id):
    data=request.get_json(silent=True) or {}
    if not db().execute('SELECT 1 FROM companies WHERE id=?',(company_id,)).fetchone():fail(404,'Company not found.')
    if not isinstance(data.get('approved'),bool):fail(400,'Approval must be true or false.')
    db().execute('UPDATE companies SET approved=? WHERE id=?',(int(data['approved']),company_id));audit('company.approval',company_id);db().commit();notify();return jsonify(ok=True)
@app.get('/api/students')
@auth('officer')
def students():return jsonify([out(r) for r in db().execute("SELECT id,name,email,cgpa,skills,education,graduation_year,resume_name FROM users WHERE role='student' ORDER BY name").fetchall()])
@app.get('/api/jobs')
@auth()
def jobs():return jsonify([out(r) for r in db().execute("SELECT j.*,c.name company_name,c.industry,c.location FROM jobs j JOIN companies c ON c.id=j.company_id WHERE (?='officer' OR (?='company' AND j.company_id=?) OR (?='student' AND c.approved=1)) ORDER BY j.id DESC",(g.user['role'],g.user['role'],g.user['company_id'],g.user['role'])).fetchall()])
@app.post('/api/jobs')
@auth('officer','company')
def job_create():
    data=request.get_json(silent=True) or {};company_id=g.user['company_id'] if g.user['role']=='company' else num(data.get('company_id'),'Company')
    if not db().execute('SELECT 1 FROM companies WHERE id=? AND approved=1',(company_id,)).fetchone():fail(403,'The company must be approved before publishing.')
    deadline=txt(data.get('deadline'),'Deadline',10)
    try:datetime.strptime(deadline,'%Y-%m-%d')
    except ValueError:fail(400,'A valid deadline is required.')
    if deadline<datetime.now(timezone.utc).date().isoformat():fail(400,'Deadline must be today or later.')
    job_id=db().execute('INSERT INTO jobs(company_id,title,description,min_cgpa,required_skills,deadline) VALUES(?,?,?,?,?,?)',(company_id,txt(data.get('title'),'Title'),txt(data.get('description'),'Description',10000),num(data.get('min_cgpa'),'CGPA',10),txt(data.get('required_skills',''),'Skills',1000,True),deadline)).lastrowid;audit('job.created',job_id);db().commit();notify();return jsonify(id=job_id),201
@app.patch('/api/jobs/<int:job_id>')
@auth('officer','company')
def job_close(job_id):
    job=job_owned(job_id);data=request.get_json(silent=True) or {}
    if not isinstance(data.get('closed'),bool):fail(400,'Closed must be true or false.')
    db().execute('UPDATE jobs SET closed=? WHERE id=?',(int(data['closed']),job['id']));audit('job.closed',job['id']);db().commit();notify();return jsonify(ok=True)
@app.get('/api/saved')
@auth()
def saved():return jsonify([r['job_id'] for r in db().execute('SELECT job_id FROM saved WHERE user_id=?',(g.user['id'],)).fetchall()])
@app.route('/api/saved/<int:job_id>',methods=['PUT','DELETE'])
@auth('student')
def saved_change(job_id):
    job_owned(job_id)
    if request.method=='PUT':db().execute('INSERT OR IGNORE INTO saved VALUES(?,?)',(g.user['id'],job_id))
    else:db().execute('DELETE FROM saved WHERE user_id=? AND job_id=?',(g.user['id'],job_id))
    db().commit();notify();return jsonify(ok=True)
@app.get('/api/applications')
@auth()
def applications():return jsonify([out(r) for r in db().execute("SELECT a.*,j.title,c.name company_name,u.name student_name,u.email student_email,u.cgpa,u.skills,u.resume_name FROM applications a JOIN jobs j ON j.id=a.job_id JOIN companies c ON c.id=j.company_id JOIN users u ON u.id=a.student_id WHERE (?='officer' OR (?='student' AND a.student_id=?) OR (?='company' AND j.company_id=?)) ORDER BY a.id DESC",(g.user['role'],g.user['role'],g.user['id'],g.user['role'],g.user['company_id'])).fetchall()])
@app.post('/api/applications')
@auth('student')
def application_create():
    data=request.get_json(silent=True) or {};job=job_owned(num(data.get('job_id'),'Job'));today=datetime.now(timezone.utc).date().isoformat()
    if job['closed'] or job['deadline']<today or not db().execute('SELECT 1 FROM companies WHERE id=? AND approved=1',(job['company_id'],)).fetchone():fail(409,'This role is no longer accepting applications.')
    if g.user['cgpa']<job['min_cgpa']:fail(400,'Your CGPA does not meet the minimum requirement.')
    if not g.user['resume_name'] or not g.user['education']:fail(400,'Complete your education and upload your resume first.')
    if db().execute('SELECT 1 FROM applications WHERE job_id=? AND student_id=?',(job['id'],g.user['id'])).fetchone():fail(409,'You already applied for this role.')
    app_id=db().execute('INSERT INTO applications(job_id,student_id) VALUES(?,?)',(job['id'],g.user['id'])).lastrowid;audit('application.created',app_id);db().commit();notify();return jsonify(id=app_id),201
@app.patch('/api/applications/<int:app_id>')
@auth('student','officer','company')
def application_update(app_id):
    item=db().execute('SELECT * FROM applications WHERE id=?',(app_id,)).fetchone()
    if not item:fail(404,'Application not found.')
    job_owned(item['job_id']);data=request.get_json(silent=True) or {};status=data.get('status')
    if g.user['role']=='student' and (item['student_id']!=g.user['id'] or status!='Withdrawn'):fail(403,'You can only withdraw your own application.')
    if status not in TRANSITIONS.get(item['status'],set()):fail(409,'This status transition is not allowed.')
    interview_at=None;location=''
    if status=='Interview scheduled':
        interview_at=txt(data.get('interview_at'),'Interview time',40);location=txt(data.get('interview_location'),'Interview location or meeting link',500)
        try:parsed=datetime.fromisoformat(interview_at.replace('Z','+00:00'))
        except ValueError:fail(400,'Interview time must be in the future.')
        if not parsed.tzinfo or parsed<=datetime.now(timezone.utc):fail(400,'Interview time must be in the future.')
        interview_at=parsed.astimezone(timezone.utc).isoformat().replace('+00:00','Z')
    db().execute('UPDATE applications SET status=?,interview_at=?,interview_location=? WHERE id=?',(status,interview_at,location,app_id));audit(f'application.{status}',app_id);db().commit();notify();return jsonify(ok=True)

@app.get('/')
def index():return send_from_directory(DIST,'index.html')
@app.get('/<path:path>')
def frontend(path):
    target=(DIST/path).resolve()
    return send_from_directory(DIST,path) if DIST.resolve() in target.parents and target.is_file() else send_from_directory(DIST,'index.html')
def main():
    host=os.getenv('HOST','127.0.0.1');port=int(os.getenv('PORT','5000'))
    if os.getenv('FLASK_ENV')=='production':
        from waitress import serve;serve(app,host=host,port=port,threads=8)
    else:app.run(host=host,port=port,debug=os.getenv('FLASK_DEBUG')=='1',threaded=True,use_reloader=os.getenv('FLASK_DEBUG')=='1')
init_db()
if __name__=='__main__':main()
