const Core = require('@alicloud/pop-core');
const client = new Core({
  accessKeyId: 'LTAI5tAA3vrwKomAL4mqq2c2',
  accessKeySecret: 'lz1LJwW9pDwEC2DXU2optOIbXcDeIHv',
  endpoint: 'https://ecs.cn-guangzhou.aliyuncs.com',
  apiVersion: '2014-05-26',
});

const script = `#!/bin/bash
set -e
cd /opt/matrixflow
git fetch origin
git reset --hard origin/master
echo "Git: $(git log -1 --format='%h %s')"

docker start matrixflow-db matrixflow-redis 2>/dev/null || true
sleep 2

cd /opt/matrixflow/backend
npx prisma db push 2>&1
echo "=== DB PUSH OK ==="
npx prisma generate 2>&1
echo "=== PRISMA GENERATE OK ==="

cd /opt/matrixflow
pm2 delete matrixflow 2>/dev/null || true
pm2 start backend/dist/main.js --name matrixflow
echo "=== BACKEND RESTARTED ==="
sleep 2
pm2 status
`;

async function main() {
  const b64 = Buffer.from(script).toString('base64');
  const c = await client.request('CreateCommand', { RegionId: 'cn-guangzhou', Name: 'deploy-pixing2', Type: 'RunShellScript', CommandContent: b64, ContentEncoding: 'Base64', Timeout: '300' });
  console.log('CommandId:', c.CommandId);
  const inv = await client.request('InvokeCommand', { RegionId: 'cn-guangzhou', CommandId: c.CommandId, 'InstanceId.1': 'i-7xvb9wno2duq8msd35l1', Timed: false });
  console.log('InvokeId:', inv.InvokeId);

  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 8000));
    const res = await client.request('DescribeInvocationResults', { RegionId: 'cn-guangzhou', InvokeId: inv.InvokeId });
    const result = res.Invocation?.InvocationResults?.InvocationResult?.[0];
    if (result) {
      console.log(`[${i * 8 + 8}s] ${result.InvocationStatus}`);
      if (result.Output) {
        const out = Buffer.from(result.Output, 'base64').toString();
        console.log(out);
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
