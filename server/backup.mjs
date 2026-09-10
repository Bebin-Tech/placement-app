import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openDatabase } from './db.mjs';
const target=process.argv[2];
if (!target) { console.error('Usage: node server/backup.mjs path/to/backup.db'); process.exit(1); }
const destination=resolve(target);
if (existsSync(destination)) { console.error('Backup destination already exists. Choose a new filename.'); process.exit(1); }
mkdirSync(dirname(destination),{recursive:true});
const db=openDatabase();
try {db.prepare('VACUUM INTO ?').run(destination); console.log(`Consistent database backup written to ${destination}`);} finally {db.close();}
