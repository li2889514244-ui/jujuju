// Auto-deploy MatrixFlow backend to Alibaba Cloud ECS
import Core from '@alicloud/pop-core';

const client = new Core({
  accessKeyId: process.env.ALI_ACCESS_KEY,
  accessKeySecret: process.env.ALI_SECRET_KEY,
  endpoint: 'https://ecs.cn-guangzhou.aliyuncs.com',
  apiVersion: '2014-05-26',
});

const INSTANCE = 'i-7xvb9wno2duq8msd35l1';
const PROJECT = '/opt/matrixflow';

async function runCommand(script, timeout = 120) {
  const b64 = Buffer.from('#!/bin/bash\n' + script).toString('base64');

  const create = await client.request('CreateCommand', {
    RegionId: 'cn-guangzhou',
    Name: 'auto-deploy-' + Date.now(),
    Type: 'RunShellScript',
    CommandContent: b64,
    ContentEncoding: 'Base64',
    Timeout: String(timeout),
    WorkingDir: '/root',
  });

  const invoke = await client.request('InvokeCommand', {
    RegionId: 'cn-guangzhou',
    CommandId: create.CommandId,
    'InstanceId.1': INSTANCE,
    Timed: false,
  });

  console.log('InvokeId:', invoke.InvokeId);

  // Poll for result
  const maxWait = timeout + 30;
  for (let i = 0; i < maxWait / 10; i++) {
    await new Promise(r => setTimeout(r, 10000));
    try {
      const result = await client.request('DescribeInvocationResults', {
        RegionId: 'cn-guangzhou',
        InvokeId: invoke.InvokeId,
      });
      const r = result.Invocation?.InvocationResults?.InvocationResult?.[0];
      const status = r?.InvocationStatus;
      if (status === 'Finished' || status === 'Failed') {
        const out = r?.Output ? Buffer.from(r.Output, 'base64').toString() : '';
        console.log('ExitCode:', r?.ExitCode);
        console.log(out);
        if (r?.ExitCode !== 0) process.exit(1);
        return;
      }
    } catch (e) {
      console.log('Poll error:', e.message);
    }
    if (i % 3 === 0) console.log('  ...waiting', (i + 1) * 10, 's');
  }
  console.log('TIMEOUT');
  process.exit(1);
}

async function main() {
  console.log('=== Deploying MatrixFlow Backend ===\n');

  // Step 1: Update code
  console.log('--- git pull ---');
  await runCommand(`cd ${PROJECT} && git fetch origin master && git reset --hard origin/master`, 30);

  // Step 2: Install + build
  console.log('\n--- npm install + build ---');
  await runCommand(`cd ${PROJECT}/backend && npm install --omit=dev && npx prisma generate && npx prisma migrate deploy && npm run build`, 600);

  // Step 3: Restart
  console.log('\n--- pm2 restart ---');
  await runCommand('pm2 restart all || (cd /opt/matrixflow/backend && pm2 start dist/main.js --name matrixflow)', 30);

  // Step 4: Health check
  console.log('\n--- Health ---');
  await runCommand('sleep 5 && curl -sf http://localhost:3000/api/v1/health', 15);

  console.log('\n✅ Deploy complete!');
}

main().catch(e => {
  console.error('DEPLOY FAILED:', e.message);
  process.exit(1);
});
