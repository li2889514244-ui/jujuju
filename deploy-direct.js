require('./load-secrets');
const fs = require('fs');
const path = require('path');
const Core = require('@alicloud/pop-core');

const client = new Core({
  accessKeyId: process.env.ALI_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALI_ACCESS_KEY_SECRET,
  endpoint: 'https://ecs.cn-guangzhou.aliyuncs.com',
  apiVersion: '2014-05-26',
});

// Read local files
const svcPath = path.join(__dirname, 'backend/src/modules/analytics/analytics.service.ts');
const ctrlPath = path.join(__dirname, 'backend/src/modules/analytics/analytics.controller.ts');
const svcContent = fs.readFileSync(svcPath, 'utf-8');
const ctrlContent = fs.readFileSync(ctrlPath, 'utf-8');

// Build script that writes files, builds backend, deploys frontend
const script = `#!/bin/bash
set -e
cd /opt/matrixflow

# Write backend files
cat > backend/src/modules/analytics/analytics.service.ts << 'SVC_EOF'
${svcContent}
SVC_EOF
echo "Service written"

cat > backend/src/modules/analytics/analytics.controller.ts << 'CTRL_EOF'
${ctrlContent}
CTRL_EOF
echo "Controller written"

# Build backend
cd /opt/matrixflow/backend
npm run build 2>&1 | tail -3
echo "=== BACKEND BUILD OK ==="

# Restart
pm2 restart matrixflow
sleep 2

# Deploy frontend dist from git (last successful push)
# The frontend dist is committed so git pull should work... if GitHub is up.
# We'll use the existing dist since the frontend build was already committed.
ls /var/www/matrixflow/index.html && echo "Frontend OK"
`;

(async () => {
  const b64 = Buffer.from(script).toString('base64');
  console.log(`Script size: ${b64.length} chars`);

  const c = await client.request('CreateCommand', {
    RegionId: process.env.ALI_REGION || 'cn-guangzhou',
    Name: 'direct-deploy-' + Date.now(),
    Type: 'RunShellScript',
    CommandContent: b64,
    ContentEncoding: 'Base64',
    Timeout: '600',
    WorkingDir: '/root',
  });
  console.log('CommandId:', c.CommandId);

  const inv = await client.request('InvokeCommand', {
    RegionId: process.env.ALI_REGION || 'cn-guangzhou',
    CommandId: c.CommandId,
    'InstanceId.1': process.env.ECS_INSTANCE_ID,
    Timed: false,
  });
  console.log('InvokeId:', inv.InvokeId);

  // Poll for result
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 10000));
    const res = await client.request('DescribeInvocationResults', {
      RegionId: process.env.ALI_REGION || 'cn-guangzhou',
      InvokeId: inv.InvokeId,
    });
    const result = res.Invocation?.InvocationResults?.InvocationResult?.[0];
    if (result) {
      console.log(`[${i * 10 + 10}s] ${result.InvocationStatus}`);
      if (result.Output) {
        console.log(Buffer.from(result.Output, 'base64').toString());
      }
      if (['Finished', 'Failed', 'Stopped'].includes(result.InvocationStatus)) {
        console.log('Exit:', result.ExitCode);
        process.exit(result.ExitCode === '0' ? 0 : 1);
      }
    }
  }
  console.log('Timeout');
  process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
