import { openDatabase, hashPassword } from './db.mjs';
const [email,name]=process.argv.slice(2);
const password=process.env.ADMIN_PASSWORD;
if (!email || !name || !password || password.length<12 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
 console.error('Set ADMIN_PASSWORD (at least 12 characters), then run npm run admin -- email@example.com "Officer name"'); process.exit(1);
}
const db=openDatabase();
try { db.prepare("INSERT INTO users(name,email,password,role) VALUES(?,?,?,'officer')").run(name,email.toLowerCase(),await hashPassword(password)); console.log('Officer account created.'); } finally {db.close();}
