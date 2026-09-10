import { openDatabase, hashPassword } from './db.mjs';
const email=process.argv[2],password=process.env.ADMIN_PASSWORD;
if(!email || !password || password.length<12){console.error('After verifying the account owner, set ADMIN_PASSWORD (12+ characters) and run: node server/reset-password.mjs email@example.com');process.exit(1);}
const db=openDatabase();
try{
 const user=db.prepare('SELECT id FROM users WHERE email=?').get(email.toLowerCase());
 if(!user)throw new Error('Account not found.');
 const hash=await hashPassword(password);
 db.exec('BEGIN IMMEDIATE');
 try{db.prepare('UPDATE users SET password=? WHERE id=?').run(hash,user.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);db.prepare("INSERT INTO audit(action,entity_id) VALUES('password.admin_reset',?)").run(user.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 console.log('Password reset. All sessions revoked.');
}finally{db.close();}
