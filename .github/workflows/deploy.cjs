// Auto-deploy using CommonJS
const Core = require('@alicloud/pop-core');

const client = new Core({
  accessKeyId: process.env.ALI_ACCESS_KEY,
  accessKeySecret: process.env.ALI_SECRET_KEY,
  endpoint: 'https://ecs.cn-guangzhou.aliyuncs.com',
  apiVersion: '2014-05-26',
});

const IID = 'i-7xvb9wno2duq8msd35l1';
const PROJECT = '/opt/matrixflow';

async function run(script, timeout = 300) {
  const b64 = Buffer.from('#!/bin/bash\n' + script).toString('base64');
  const create = await client.request('CreateCommand', {
    RegionId: 'cn-guangzhou', Name: 'dep-' + Date.now(), Type: 'RunShellScript',
    CommandContent: b64, ContentEncoding: 'Base64', Timeout: String(timeout), WorkingDir: '/root',
  });
  const invoke = await client.request('InvokeCommand', {
    RegionId: 'cn-guangzhou', CommandId: create.CommandId, 'InstanceId.1': IID, Timed: false,
  });
  console.log('  InvokeId:', invoke.InvokeId);

  for (let i = 0; i < (timeout + 60) / 10; i++) {
    await new Promise(r => setTimeout(r, 10000));
    const res = await client.request('DescribeInvocationResults', {
      RegionId: 'cn-guangzhou', InvokeId: invoke.InvokeId,
    });
    const r = res.Invocation?.InvocationResults?.InvocationResult?.[0];
    if (r?.InvocationStatus === 'Finished') {
      const out = r?.Output ? Buffer.from(r.Output, 'base64').toString() : '';
      console.log('  Exit:', r?.ExitCode);
      if (out) console.log(out.substring(0, 500));
      return r?.ExitCode === 0;
    }
    if (r?.InvocationStatus === 'Failed') {
      console.log('  FAILED');
      return false;
    }
    if (i % 6 === 5) console.log('  ...', (i+1)*10, 's');
  }
  console.log('  TIMEOUT');
  return false;
}

async function main() {
  console.log('=== Deploy MatrixFlow Backend ===\n');

  console.log('--- git update ---');
  const ok1 = await run(`cd ${PROJECT} && git fetch origin master && git reset --hard origin/master`, 60);
  if (!ok1) { console.log('Git failed, continuing...'); }

  console.log('\n--- install + build ---');
  const ok2 = await run(`cd ${PROJECT}/backend && npm install --omit=dev 2>&1 | tail -3 && npx prisma generate && npx prisma migrate deploy && npm run build 2>&1 | tail -5`, 600);
  if (!ok2) process.exit(1);

  console.log('\n--- restart ---');
  await run('pm2 restart all || (cd /opt/matrixflow/backend && pm2 start dist/main.js --name matrixflow)', 30);

  console.log('\n--- health ---');
  await run('sleep 5 && curl -sf http://localhost:3000/api/v1/health && echo "OK" || echo "FAIL"', 20);

  console.log('\n✅ Done');
}

main().catch(e => { console.error(e); process.exit(1); });
