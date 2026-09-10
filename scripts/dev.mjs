import { spawn } from 'node:child_process';
const python=process.platform==='win32'?'backend/.venv-flask/Scripts/python.exe':'backend/.venv-flask/bin/python';
const children=[spawn(python,['backend/app.py'],{stdio:'inherit'}),spawn(process.execPath,['node_modules/vite/bin/vite.js'],{stdio:'inherit'})];
let stopping=false;
const stop=()=>{if(stopping)return;stopping=true;for(const child of children)child.kill();};
for(const child of children)child.on('exit',stop);
process.on('SIGINT',stop);process.on('SIGTERM',stop);
