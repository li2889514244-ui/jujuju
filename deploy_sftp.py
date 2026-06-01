import paramiko, os, time
from dotenv import dotenv_values

secrets = dotenv_values(r'C:\Users\EDY\jujuju\secrets.env')
base = r'C:\Users\EDY\jujuju'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(secrets['ECS_HOST'], username=secrets['ECS_SSH_USER'], 
            password=secrets['ECS_SSH_PASSWORD'], timeout=10)
sftp = ssh.open_sftp()

# Upload the fixed frontend file + .gitignore
extra = [
    'frontend/src/views/monetization/MonetizationView.vue',
    '.gitignore',
]
for f in extra:
    local = os.path.join(base, f.replace('/', os.sep))
    remote = f'/opt/matrixflow/{f}'
    remote_dir = os.path.dirname(remote)
    try: sftp.stat(remote_dir)
    except: ssh.exec_command(f'mkdir -p {remote_dir}')
    sftp.put(local, remote)
    print(f'OK: {f}')

sftp.close()

print('\n=== NPM INSTALL ===')
i, o, e = ssh.exec_command('cd /opt/matrixflow && npm install 2>&1 | tail -5', timeout=120)
ot = o.read().decode()
er = e.read().decode()
print(ot.strip())
if er: print('STDERR:', er.strip()[:200])

print('\n=== BUILD BACKEND ===')
i, o, e = ssh.exec_command('cd /opt/matrixflow/backend && npx nest build 2>&1', timeout=120)
ot = o.read().decode()
for line in ot.strip().split('\n')[-8:]:
    print(line)

print('\n=== BUILD FRONTEND ===')
i, o, e = ssh.exec_command('cd /opt/matrixflow/frontend && npx vue-tsc --noEmit 2>&1 && npx vite build 2>&1', timeout=180)
ot = o.read().decode()
er = e.read().decode()
for line in ot.strip().split('\n')[-8:]:
    print(line)
if er and 'warning' not in er.lower():
    print('STDERR:', er)

print('\n=== RESTART PM2 ===')
i, o, e = ssh.exec_command('pm2 restart matrixflow --update-env')
print(o.read().decode().strip())

time.sleep(4)
print('\n=== HEALTH ===')
i, o, e = ssh.exec_command('curl -s http://localhost:3001/api/v1/health')
print(o.read().decode().strip())

# Verify page loads
print('\n=== FRONTEND PAGE ===')
i, o, e = ssh.exec_command('curl -s -o /dev/null -w "%{http_code}" https://ddddkiii.com/')
print(f'HTTP: {o.read().decode().strip()}')

ssh.close()
print('\n=== DONE ===')
