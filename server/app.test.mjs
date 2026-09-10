import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './index.mjs';
import { openDatabase, hashPassword } from './db.mjs';
async function fixture(t) {
 const db=openDatabase(':memory:');const app=createApp({db});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
 const base=`http://127.0.0.1:${app.server.address().port}`;
 t.after(async()=>{app.closeStreams();app.server.closeAllConnections();await new Promise(resolve=>app.server.close(resolve));db.close();});
 function client(){let cookie='',csrf='';return {async request(path,method='GET',body,headers={}){const res=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':csrf,...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});const value=await res.json();if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];if(value.csrf)csrf=value.csrf;return {status:res.status,value};},async register(email,role='student'){return this.request('/auth/register','POST',{email,password:'Test-password-123',name:email.split('@')[0],role,company_name:'Test Labs',industry:'Technology',location:'Chennai'});},stream(signal){return fetch(base+'/api/events',{headers:{Cookie:cookie},signal})}};}
 const officer=client();db.prepare("INSERT INTO users(name,email,password,role) VALUES(?,?,?,'officer')").run('Officer','officer@test.com',await hashPassword('Test-password-123'));await officer.request('/auth/login','POST',{email:'officer@test.com',password:'Test-password-123'});
 return {db,base,client,officer};
}
const opening={title:'Software Engineer',description:'Build software.',min_cgpa:7,required_skills:'TypeScript, SQL',deadline:'2099-12-31'};
async function profile(student){await student.request('/profile','PATCH',{name:'Student',cgpa:8.5,skills:'TypeScript',education:'B.Tech',graduation_year:'2027'});await student.request('/resume','POST',{name:'resume.pdf',data:Buffer.from('%PDF-1.4\nTest resume').toString('base64')});}
test('authenticated placement lifecycle, privacy, approval, eligibility and ownership',async t=>{
 const {client,officer,db}=await fixture(t);const student=client(),other=client(),company=client(),outsider=client();
 assert.equal((await student.request('/jobs')).status,401);
 assert.equal((await student.register('bad@test.com','officer')).status,400);
 const account=await student.register('student@test.com');assert.equal(account.status,201);assert.equal(account.value.user.password,undefined);
 await other.register('other@test.com');const recruiter=await company.register('recruiter@test.com','company');await outsider.register('outsider@test.com','company');
 assert.notEqual(db.prepare('SELECT password FROM users WHERE id=?').get(account.value.user.id).password,'Test-password-123');
 assert.equal((await company.request('/jobs','POST',opening)).status,403);
 await officer.request(`/companies/${recruiter.value.user.company_id}`,'PATCH',{approved:true});
 const job=await company.request('/jobs','POST',opening);assert.equal(job.status,201);
 assert.equal((await outsider.request(`/jobs/${job.value.id}`,'PATCH',{closed:true})).status,403);
 assert.equal((await student.request('/jobs','POST',opening)).status,403);
 assert.equal((await student.request('/students')).status,403);
 assert.equal((await student.request('/applications','POST',{job_id:job.value.id})).status,400);
 await profile(student);
 assert.equal((await student.request('/saved/'+job.value.id,'PUT',{})).status,200);
 assert.deepEqual((await student.request('/saved')).value,[job.value.id]);
 const application=await student.request('/applications','POST',{job_id:job.value.id,student_id:999});assert.equal(application.status,201);
 assert.equal((await student.request('/applications','POST',{job_id:job.value.id})).status,409);
 assert.equal((await other.request('/applications')).value.length,0);
 assert.equal((await outsider.request('/applications')).value.length,0);
 assert.equal((await other.request('/resumes/'+account.value.user.id)).status,403);
 assert.equal((await outsider.request(`/applications/${application.value.id}`,'PATCH',{status:'Rejected'})).status,403);
 assert.equal((await student.request(`/applications/${application.value.id}`,'PATCH',{status:'Selected'})).status,403);
 assert.equal((await company.request(`/applications/${application.value.id}`,'PATCH',{status:'Selected'})).status,409);
 assert.equal((await company.request(`/applications/${application.value.id}`,'PATCH',{status:'Shortlisted'})).status,200);
 assert.equal((await company.request(`/applications/${application.value.id}`,'PATCH',{status:'Interview scheduled',interview_at:'2020-01-01',interview_location:'Campus'})).status,400);
 assert.equal((await company.request(`/applications/${application.value.id}`,'PATCH',{status:'Interview scheduled',interview_at:'2099-10-01T10:00:00Z',interview_location:'Campus room 1'})).status,200);
 assert.equal((await student.request('/applications')).value[0].status,'Interview scheduled');
 assert.equal((await company.request(`/applications/${application.value.id}`,'PATCH',{status:'Selected'})).status,200);
 assert.equal((await student.request(`/applications/${application.value.id}`,'PATCH',{status:'Withdrawn'})).status,409);
 assert.equal((await officer.request('/applications')).value.length,1);
 assert.ok(db.prepare('SELECT COUNT(*) n FROM audit').get().n>=6);
});
test('CSRF, malformed inputs, expired sessions and revoked logout',async t=>{
 const {client,db}=await fixture(t);const student=client();await student.register('student@test.com');
 assert.equal((await student.request('/profile','PATCH',{}, {'X-CSRF-Token':''})).status,403);
 assert.equal((await student.request('/profile','PATCH',{}, {Origin:'https://evil.example'})).status,403);
 assert.equal((await student.request('/profile','PATCH',null)).status,400);
 assert.equal((await student.request('/profile','PATCH',{name:'Test',cgpa:11,skills:'',education:'',graduation_year:''})).status,400);
 assert.equal((await student.request('/resume','POST',{name:'bad.pdf',data:Buffer.from('not pdf').toString('base64')})).status,400);
 assert.equal((await student.request('/auth/logout','POST',{})).status,200);assert.equal((await student.request('/auth/me')).status,401);
 await student.request('/auth/login','POST',{email:'student@test.com',password:'Test-password-123'});
 db.prepare('UPDATE sessions SET expires=0').run();assert.equal((await student.request('/auth/me')).status,401);
});
test('closed jobs, withdrawal and live events',async t=>{
 const {client,officer}=await fixture(t);const student=client();await student.register('student@test.com');await profile(student);
 const company=await officer.request('/companies','POST',{name:'Partner',industry:'Technology',location:'Remote'});
 const job=await officer.request('/jobs','POST',{...opening,company_id:company.value.id});
 const controller=new AbortController();const stream=await student.stream(controller.signal);assert.equal(stream.status,200);const reader=stream.body.getReader();await reader.read();
 await officer.request(`/jobs/${job.value.id}`,'PATCH',{closed:true});
 const event=await Promise.race([reader.read(),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('No live update')),3000);timer.unref();})]);assert.match(new TextDecoder().decode(event.value),/event: change/);controller.abort();
 assert.equal((await student.request('/applications','POST',{job_id:job.value.id})).status,409);
 await officer.request(`/jobs/${job.value.id}`,'PATCH',{closed:false});
 const app=await student.request('/applications','POST',{job_id:job.value.id});assert.equal(app.status,201);
 assert.equal((await student.request(`/applications/${app.value.id}`,'PATCH',{status:'Withdrawn'})).status,200);
 assert.equal((await officer.request(`/applications/${app.value.id}`,'PATCH',{status:'Shortlisted'})).status,409);
});
test('database records survive reopening',()=>{const dir=mkdtempSync(join(tmpdir(),'campus-test-'));try{const file=join(dir,'test.db');let db=openDatabase(file);db.prepare('INSERT INTO companies(name,industry,location) VALUES(?,?,?)').run('Persistent','Tech','Remote');db.close();db=openDatabase(file);assert.equal(db.prepare('SELECT name FROM companies').get().name,'Persistent');db.close();}finally{rmSync(dir,{recursive:true,force:true});}});

test('password changes revoke other sessions and reject old credentials',async t=>{
 const {client}=await fixture(t);const first=client(),second=client(),third=client();await first.register('password@test.com');await second.request('/auth/login','POST',{email:'password@test.com',password:'Test-password-123'});
 assert.equal((await first.request('/auth/password','POST',{current_password:'incorrect',new_password:'Changed-password-456'})).status,403);
 assert.equal((await first.request('/auth/password','POST',{current_password:'Test-password-123',new_password:'Changed-password-456'})).status,200);
 assert.equal((await second.request('/auth/me')).status,401);assert.equal((await first.request('/auth/me')).status,200);
 assert.equal((await third.request('/auth/login','POST',{email:'password@test.com',password:'Test-password-123'})).status,401);
 assert.equal((await third.request('/auth/login','POST',{email:'password@test.com',password:'Changed-password-456'})).status,200);
});

test('administrator provisioning, recovery and consistent backup commands',async()=>{
 const {execFileSync}=await import('node:child_process');const dir=mkdtempSync(join(tmpdir(),'campus-admin-'));
 try{
  const file=join(dir,'campus.db'),backup=join(dir,'backup.db');const env={...process.env,DATABASE_PATH:file,ADMIN_PASSWORD:'Administrator-test-123'};
  execFileSync(process.execPath,['server/admin.mjs','admin@example.com','Admin'],{env});
  execFileSync(process.execPath,['server/reset-password.mjs','admin@example.com'],{env:{...env,ADMIN_PASSWORD:'Recovered-password-456'}});
  execFileSync(process.execPath,['server/backup.mjs',backup],{env});
  const db=openDatabase(backup);try{assert.equal(db.prepare('SELECT role FROM users').get().role,'officer');assert.equal(db.prepare('SELECT action FROM audit').get().action,'password.admin_reset');}finally{db.close();}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
