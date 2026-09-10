import argparse, os, sqlite3
from pathlib import Path
from werkzeug.security import generate_password_hash
from app import DB, init_db

def main():
    parser=argparse.ArgumentParser(description='campus.flow administration');sub=parser.add_subparsers(dest='command',required=True)
    add=sub.add_parser('create-officer');add.add_argument('email');add.add_argument('name')
    reset=sub.add_parser('reset-password');reset.add_argument('email')
    backup=sub.add_parser('backup');backup.add_argument('destination')
    args=parser.parse_args();init_db();connection=sqlite3.connect(DB);connection.row_factory=sqlite3.Row
    try:
        if args.command=='backup':
            target=Path(args.destination).resolve()
            if target.exists():raise SystemExit('Backup destination already exists.')
            target.parent.mkdir(parents=True,exist_ok=True);connection.execute('VACUUM INTO ?',(str(target),));print(f'Backup written to {target}')
        else:
            password=os.getenv('ADMIN_PASSWORD','')
            if len(password)<12:raise SystemExit('Set ADMIN_PASSWORD to at least 12 characters.')
            if args.command=='create-officer':connection.execute("INSERT INTO users(name,email,password,role) VALUES(?,?,?,'officer')",(args.name,args.email.lower(),generate_password_hash(password,method='scrypt')));print('Officer account created.')
            else:
                user=connection.execute('SELECT id FROM users WHERE email=?',(args.email.lower(),)).fetchone()
                if not user:raise SystemExit('Account not found.')
                connection.execute('UPDATE users SET password=? WHERE id=?',(generate_password_hash(password,method='scrypt'),user['id']));connection.execute('DELETE FROM sessions WHERE user_id=?',(user['id'],));connection.execute("INSERT INTO audit(action,entity_id) VALUES('password.admin_reset',?)",(user['id'],));print('Password reset. All sessions revoked.')
        connection.commit()
    finally:connection.close()
if __name__=='__main__':main()
