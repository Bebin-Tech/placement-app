import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, hashPassword, verifyPassword, digest, publicUser } from './db.mjs';
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
function text(value, name, max = 200, optional = false) {
  if (typeof value !== 'string' || (!optional && !value.trim()) || value.length > max) fail(400, `${name} is required and must be at most ${max} characters.`);
  return value.trim();
}
function number(value, name, max = Number.MAX_SAFE_INTEGER) { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) fail(400, `Invalid ${name}.`); return value; }
function date(value) { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) fail(400, 'A valid deadline is required.'); return value; }
export function createApp({ db = openDatabase(), production = process.env.NODE_ENV === 'production' } = {}) {
  const streams = new Map(), attempts = new Map();
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const broadcast = () => { for (const [response, session] of streams) { if (!one('SELECT token FROM sessions WHERE token=? AND expires>?', session, Date.now())) { response.end(); streams.delete(response); } else response.write('event: change\ndata: {}\n\n'); } };
  const audit = (user, action, id = null) => run('INSERT INTO audit(actor_id,action,entity_id) VALUES(?,?,?)', user.id, action, id);
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    const send = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    try {
      const url = new URL(req.url, 'http://localhost'), path = url.pathname, method = req.method;
      if (!path.startsWith('/api/')) {
        if (!['GET','HEAD'].includes(method)) fail(405, 'Method not allowed.');
        const root = resolve('dist');
        const file = resolve(root, '.' + decodeURIComponent(path));
        if (file !== root && !file.startsWith(root + sep)) fail(403, 'Forbidden.');
        let content, extension = extname(file);
        try { content = await readFile(file); } catch { if (extension) fail(404,'File not found.'); content = await readFile(resolve(root,'index.html')); extension = '.html'; }
        res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'}[extension] || 'application/octet-stream'));
        res.setHeader('Cache-Control', path.startsWith('/assets/') ? 'public,max-age=31536000,immutable' : 'no-cache');
        res.end(method === 'HEAD' ? undefined : content); return;
      }
      if (path === '/api/health') { one('SELECT 1'); send({status:'ok', service:'campus.flow'}); return; }
      let body = {};
      if (['POST','PATCH','PUT','DELETE'].includes(method)) {
        if (!req.headers['content-type']?.startsWith('application/json')) fail(415, 'Send application/json.');
        if (req.headers.origin && req.headers.origin !== (process.env.APP_ORIGIN || `${production ? 'https' : 'http'}://${req.headers.host}`)) fail(403,'Untrusted request origin.');
        let raw = ''; for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 4 * 1024 * 1024) fail(413,'Request too large.'); }
        try { body = JSON.parse(raw || '{}'); } catch { fail(400,'Invalid JSON.'); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400,'Expected a JSON object.');
      }
      const cookie = req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('campus_session='))?.slice(15);
      const token = cookie ? digest(cookie) : '';
      const session = one('SELECT * FROM sessions WHERE token=? AND expires>?', token, Date.now());
      const user = session ? one('SELECT * FROM users WHERE id=?', session.user_id) : null;
      if (['/api/auth/login','/api/auth/register'].includes(path) && method === 'POST') {
        const key = req.socket.remoteAddress, now = Date.now();
        const limit = attempts.get(key) || {count:0, until:now+900000};
        if (limit.until < now) { limit.count=0; limit.until=now+900000; }
        if (++limit.count > 30) fail(429,'Too many attempts. Try again in 15 minutes.'); attempts.set(key,limit);
        const email = text(body.email,'Email',254).toLowerCase(), password = text(body.password,'Password',128);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400,'Enter a valid email address.');
        let account;
        if (path.endsWith('register')) {
          const name = text(body.name,'Name',100);
          if (password.length < 12) fail(400,'Use a password with at least 12 characters.');
          if (!['student','company'].includes(body.role)) fail(400,'Choose student or company. Officers are provisioned by an administrator.');
          if (one('SELECT id FROM users WHERE email=?',email)) fail(409,'An account with this email already exists.');
          const company = body.role === 'company' ? [text(body.company_name,'Company name'),text(body.industry,'Industry'),text(body.location,'Location')] : null;
          const hash = await hashPassword(password);
          db.exec('BEGIN IMMEDIATE');
          try {
            const companyId = company ? Number(run('INSERT INTO companies(name,industry,location) VALUES(?,?,?)',...company).lastInsertRowid) : null;
            const id = Number(run('INSERT INTO users(name,email,password,role,company_id) VALUES(?,?,?,?,?)',name,email,hash,body.role,companyId).lastInsertRowid);
            account = one('SELECT * FROM users WHERE id=?',id); db.exec('COMMIT');
          } catch(e) { db.exec('ROLLBACK'); throw e; }
        } else {
          account = one('SELECT * FROM users WHERE email=?',email);
          // Always perform a password derivation, including for unknown accounts.
          const hash = account?.password || `${'0'.repeat(32)}:${'0'.repeat(128)}`;
          if (!await verifyPassword(password,hash) || !account) fail(401,'Invalid email or password.');
        }
        const rawToken = randomBytes(32).toString('hex'), csrf = randomBytes(24).toString('hex');
        run('DELETE FROM sessions WHERE expires<?',Date.now());
        if (session) run('DELETE FROM sessions WHERE token=?', token);
        run('INSERT INTO sessions VALUES(?,?,?,?)',digest(rawToken),account.id,csrf,Date.now()+86400000);
        res.setHeader('Set-Cookie',`campus_session=${rawToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${production ? '; Secure' : ''}`);
        broadcast(); send({user:publicUser(account),csrf},path.endsWith('register')?201:200); return;
      }
      if (!user) fail(401,'Please sign in.');
      if (!['GET','HEAD'].includes(method) && req.headers['x-csrf-token'] !== session.csrf) fail(403,'Invalid security token. Refresh and try again.');
      const requireRole = (...roles) => { if (!roles.includes(user.role)) fail(403,'You do not have permission for this action.'); };
      const ownedJob = id => { const job = one('SELECT * FROM jobs WHERE id=?',id); if (!job) fail(404,'Job not found.'); if (user.role === 'company' && job.company_id !== user.company_id) fail(403,'This job belongs to another company.'); return job; };
      if (path === '/api/auth/me' && method === 'GET') { send({user:publicUser(user),csrf:session.csrf}); return; }
      if (path === '/api/auth/logout' && method === 'POST') { run('DELETE FROM sessions WHERE token=?',token); res.setHeader('Set-Cookie','campus_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'); broadcast(); send({ok:true}); return; }
      if (path === '/api/auth/password' && method === 'POST') {
        const current = text(body.current_password,'Current password',128), next = text(body.new_password,'New password',128);
        if (next.length < 12) fail(400,'Use a password with at least 12 characters.');
        if (!await verifyPassword(current,user.password)) fail(403,'Current password is incorrect.');
        const password = await hashPassword(next);
        run('UPDATE users SET password=? WHERE id=?',password,user.id);
        run('DELETE FROM sessions WHERE user_id=? AND token<>?',user.id,token);
        audit(user,'password.changed',user.id); broadcast(); send({ok:true}); return;
      }
      if (path === '/api/events' && method === 'GET') {
        if ([...streams.values()].filter(t=>t===token).length >= 5) fail(429,'Too many live connections.');
        res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});
        res.write('event: change\ndata: {}\n\n'); streams.set(res,token);
        const timer = setInterval(()=> { if (!one('SELECT token FROM sessions WHERE token=? AND expires>?',token,Date.now())) res.end(); else res.write(': heartbeat\n\n'); },20000);
        res.on('close',()=>{clearInterval(timer);streams.delete(res);}); return;
      }
      if (path === '/api/profile' && method === 'PATCH') {
        const name = text(body.name,'Name',100), cgpa = number(body.cgpa,'CGPA',10), skills = text(body.skills,'Skills',1000,true), education = text(body.education,'Education',200,true), year = text(body.graduation_year,'Graduation year',4,true);
        if (year && !/^20\d{2}$/.test(year)) fail(400,'Enter a four-digit graduation year.');
        run('UPDATE users SET name=?,cgpa=?,skills=?,education=?,graduation_year=? WHERE id=?',name,cgpa,skills,education,year,user.id);
        audit(user,'profile.updated',user.id); broadcast(); send(publicUser(one('SELECT * FROM users WHERE id=?',user.id))); return;
      }
      if (path === '/api/resume' && method === 'POST') {
        requireRole('student'); const name = text(body.name,'Filename',150), encoded = text(body.data,'PDF',3000000);
        const pdf = Buffer.from(encoded,'base64');
        if (pdf.length > 2*1024*1024 || pdf.subarray(0,5).toString() !== '%PDF-') fail(400,'Upload a PDF up to 2 MB.');
        run('UPDATE users SET resume=?,resume_name=? WHERE id=?',pdf,name,user.id); audit(user,'resume.updated',user.id); broadcast(); send({ok:true}); return;
      }
      const resumeMatch = path.match(/^\/api\/resumes\/(\d+)$/);
      if (resumeMatch && method === 'GET') {
        const id = Number(resumeMatch[1]);
        if (user.id !== id && user.role !== 'officer' && !(user.role === 'company' && one('SELECT a.id FROM applications a JOIN jobs j ON j.id=a.job_id WHERE a.student_id=? AND j.company_id=?',id,user.company_id))) fail(403,'Resume access denied.');
        const student = one('SELECT resume FROM users WHERE id=?',id); if (!student?.resume) fail(404,'Resume not uploaded.');
        res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="resume.pdf"','Cache-Control':'no-store'}); res.end(student.resume); return;
      }
      if (path === '/api/companies' && method === 'GET') { send(all('SELECT * FROM companies WHERE approved=1 OR ?=\'officer\' OR id=? ORDER BY name',user.role,user.company_id)); return; }
      if (path === '/api/companies' && method === 'POST') {
        requireRole('officer'); const id=Number(run('INSERT INTO companies(name,industry,location,approved) VALUES(?,?,?,1)',text(body.name,'Name'),text(body.industry,'Industry'),text(body.location,'Location')).lastInsertRowid); audit(user,'company.created',id); broadcast(); send({id},201); return;
      }
      const companyMatch = path.match(/^\/api\/companies\/(\d+)$/);
      if (companyMatch && method === 'PATCH') { requireRole('officer'); const id=Number(companyMatch[1]); if (!one('SELECT id FROM companies WHERE id=?',id)) fail(404,'Company not found.'); if (typeof body.approved !== 'boolean') fail(400,'Approval must be true or false.'); run('UPDATE companies SET approved=? WHERE id=?',Number(body.approved),id); audit(user,'company.approval',id); broadcast(); send({ok:true}); return; }
      if (path === '/api/students' && method === 'GET') { requireRole('officer'); send(all("SELECT id,name,email,cgpa,skills,education,graduation_year,resume_name FROM users WHERE role='student' ORDER BY name")); return; }
      if (path === '/api/jobs' && method === 'GET') {
        send(all(`SELECT j.*,c.name company_name,c.industry,c.location FROM jobs j JOIN companies c ON c.id=j.company_id WHERE (?='officer' OR (?='company' AND j.company_id=?) OR (?='student' AND c.approved=1)) ORDER BY j.id DESC`,user.role,user.role,user.company_id,user.role)); return;
      }
      if (path === '/api/jobs' && method === 'POST') {
        requireRole('officer','company'); const companyId = user.role==='company' ? user.company_id : number(body.company_id,'Company');
        if (!one('SELECT id FROM companies WHERE id=? AND approved=1',companyId)) fail(403,'The company must be approved before publishing.');
        const deadline=date(body.deadline); if (deadline < new Date().toISOString().slice(0,10)) fail(400,'Deadline must be today or later.');
        const id=Number(run('INSERT INTO jobs(company_id,title,description,min_cgpa,required_skills,deadline) VALUES(?,?,?,?,?,?)',companyId,text(body.title,'Title'),text(body.description,'Description',10000),number(body.min_cgpa,'CGPA',10),text(body.required_skills,'Skills',1000,true),deadline).lastInsertRowid);
        audit(user,'job.created',id); broadcast(); send({id},201); return;
      }
      const jobMatch=path.match(/^\/api\/jobs\/(\d+)$/);
      if (jobMatch && method==='PATCH') { requireRole('officer','company'); const job=ownedJob(Number(jobMatch[1])); if (typeof body.closed!=='boolean') fail(400,'Closed must be true or false.'); run('UPDATE jobs SET closed=? WHERE id=?',Number(body.closed),job.id); audit(user,'job.closed',job.id); broadcast(); send({ok:true}); return; }
      if (path==='/api/saved' && method==='GET') { send(all('SELECT job_id FROM saved WHERE user_id=?',user.id).map(j=>j.job_id)); return; }
      const savedMatch=path.match(/^\/api\/saved\/(\d+)$/);
      if (savedMatch && ['PUT','DELETE'].includes(method)) { requireRole('student'); const job=ownedJob(Number(savedMatch[1])); if (method==='PUT') run('INSERT OR IGNORE INTO saved VALUES(?,?)',user.id,job.id); else run('DELETE FROM saved WHERE user_id=? AND job_id=?',user.id,job.id); broadcast(); send({ok:true}); return; }
      if (path==='/api/applications' && method==='GET') { send(all(`SELECT a.*,j.title,c.name company_name,u.name student_name,u.email student_email,u.cgpa,u.skills,u.resume_name FROM applications a JOIN jobs j ON j.id=a.job_id JOIN companies c ON c.id=j.company_id JOIN users u ON u.id=a.student_id WHERE (?='officer' OR (?='student' AND a.student_id=?) OR (?='company' AND j.company_id=?)) ORDER BY a.id DESC`,user.role,user.role,user.id,user.role,user.company_id)); return; }
      if (path==='/api/applications' && method==='POST') {
        requireRole('student'); const job=ownedJob(number(body.job_id,'Job'));
        if (job.closed || job.deadline < new Date().toISOString().slice(0,10) || !one('SELECT id FROM companies WHERE id=? AND approved=1',job.company_id)) fail(409,'This role is no longer accepting applications.');
        if (user.cgpa < job.min_cgpa) fail(400,'Your CGPA does not meet the minimum requirement.');
        if (!user.resume_name || !user.education) fail(400,'Complete your education and upload your resume first.');
        if (one('SELECT id FROM applications WHERE job_id=? AND student_id=?',job.id,user.id)) fail(409,'You already applied for this role.');
        const id=Number(run('INSERT INTO applications(job_id,student_id) VALUES(?,?)',job.id,user.id).lastInsertRowid); audit(user,'application.created',id); broadcast(); send({id},201); return;
      }
      const applicationMatch=path.match(/^\/api\/applications\/(\d+)$/);
      if (applicationMatch && method==='PATCH') {
        const item=one('SELECT * FROM applications WHERE id=?',Number(applicationMatch[1])); if (!item) fail(404,'Application not found.');
        ownedJob(item.job_id);
        if (user.role==='student' && (item.student_id!==user.id || body.status!=='Withdrawn')) fail(403,'You can only withdraw your own application.');
        const transitions={'Under review':['Shortlisted','Rejected','Withdrawn'],'Shortlisted':['Interview scheduled','Selected','Rejected','Withdrawn'],'Interview scheduled':['Interview scheduled','Selected','Rejected','Withdrawn'],'Selected':[],'Rejected':[],'Withdrawn':[]};
        if (!transitions[item.status]?.includes(body.status)) fail(409,'This status transition is not allowed.');
        let at=null, location='';
        if (body.status==='Interview scheduled') { at=text(body.interview_at,'Interview time',40); if (!Number.isFinite(Date.parse(at)) || Date.parse(at)<=Date.now()) fail(400,'Interview time must be in the future.'); at=new Date(at).toISOString(); location=text(body.interview_location,'Interview location or meeting link',500); }
        run('UPDATE applications SET status=?,interview_at=?,interview_location=? WHERE id=?',body.status,at,location,item.id); audit(user,`application.${body.status}`,item.id); broadcast(); send({ok:true}); return;
      }
      fail(404,'Endpoint not found.');
    } catch(error) {
      const status=error.status || (error.code?.includes('CONSTRAINT') ? 409 : 500);
      if (status===500) console.error(error);
      if (!res.headersSent) send({error:status===500 ? 'Something went wrong. Please try again.' : error.message},status); else res.end();
    }
  });
  const cleanup=setInterval(()=>{ for (const [key,item] of attempts) if(item.until<Date.now()) attempts.delete(key); },60000); cleanup.unref();
  server.on('close',()=>{ clearInterval(cleanup); for (const response of streams.keys()) response.end(); });
  return {server,db,closeStreams:()=>{for(const response of streams.keys()) response.end();}};
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const {server,db,closeStreams}=createApp();
  server.listen(Number(process.env.PORT || 5000),process.env.HOST || '127.0.0.1',()=>console.log(`campus.flow running at http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 5000}`));
  for(const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>{closeStreams();server.close(()=>{db.close();process.exit(0);});});
}
