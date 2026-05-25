require('./load-secrets');
const Core = require('@alicloud/pop-core');
const client = new Core({
  accessKeyId: process.env.ALI_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALI_ACCESS_KEY_SECRET,
  endpoint: 'https://ecs.cn-guangzhou.aliyuncs.com',
  apiVersion: '2014-05-26',
});

const script = `#!/bin/bash
set -e
cd /opt/matrixflow
git fetch origin
git reset --hard origin/master
echo "Git: $(git log -1 --format='%h %s')"

cd /opt/matrixflow/backend
npm run build 2>&1
echo "=== BUILD OK ==="

docker start matrixflow-db matrixflow-redis 2>/dev/null || true
sleep 2

npx prisma db push 2>&1
echo "=== DB PUSH OK ==="
npx prisma generate 2>&1
echo "=== PRISMA GENERATE OK ==="

cd /opt/matrixflow
rm -rf /var/www/matrixflow/*
cp -r frontend/dist/* /var/www/matrixflow/
echo "Frontend deployed"

pm2 delete matrixflow 2>/dev/null || true
pm2 start backend/dist/main.js --name matrixflow
echo "=== BACKEND RESTARTED ==="
sleep 2
pm2 status
`;

async function main() {
  const b64 = Buffer.from(script).toString('base64');
  const c = await client.request('CreateCommand', { RegionId: process.env.ALI_REGION || 'cn-guangzhou', Name: 'deploy-backend-build', Type: 'RunShellScript', CommandContent: b64, ContentEncoding: 'Base64', Timeout: '600' });
  console.log('CommandId:', c.CommandId);
  const inv = await client.request('InvokeCommand', { RegionId: process.env.ALI_REGION || 'cn-guangzhou', CommandId: c.CommandId, 'InstanceId.1': process.env.ECS_INSTANCE_ID, Timed: false });
  console.log('InvokeId:', inv.InvokeId);

  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 10000));
    const res = await client.request('DescribeInvocationResults', { RegionId: process.env.ALI_REGION || 'cn-guangzhou', InvokeId: inv.InvokeId });
    const result = res.Invocation?.InvocationResults?.InvocationResult?.[0];
    if (result) {
      console.log(`[${i * 10 + 10}s] ${result.InvocationStatus}`);
      if (result.Output) {
        const out = Buffer.from(result.Output, 'base64').toString();
        // Only show the last 1000 chars to avoid flooding
        const trimmed = out.length > 2000 ? '...(truncated)\n' + out.slice(-1500) : out;
        console.log(trimmed);
      }
      if (['Finished','Failed','Stopped'].includes(result.InvocationStatus)) {
        console.log('Exit:', result.ExitCode);
        process.exit(result.ExitCode === '0' ? 0 : 1);
      }
    }
  }
  process.exit(1);
}
main().catch(e => { console.error(e); process.exit(1); });
