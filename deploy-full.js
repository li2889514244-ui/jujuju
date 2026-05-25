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

# Deploy frontend
rm -rf /var/www/matrixflow/*
cp -r frontend/dist/* /var/www/matrixflow/
echo "Frontend deployed: $(ls /var/www/matrixflow/index.html)"

# Restart NestJS backend
pm2 restart matrixflow-backend 2>/dev/null || pm2 restart all
echo "Backend restarted"
sleep 2
pm2 status

# Reload nginx
nginx -s reload 2>/dev/null || (nginx -t && nginx -s reload)
echo "Nginx reloaded"
`;

async function main() {
  const result = await client.request('RunCommand', {
    RegionId: process.env.ALI_REGION || 'cn-guangzhou',
    InstanceId: [process.env.ECS_INSTANCE_ID],
    Type: 'RunShellScript',
    CommandContent: script,
    Timeout: 90,
    WorkingDir: '/root',
  });
  console.log('CommandId:', result.CommandId);
  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const inv = await client.request('DescribeInvocationResults', {
      RegionId: process.env.ALI_REGION || 'cn-guangzhou', CommandId: result.CommandId, InstanceId: process.env.ECS_INSTANCE_ID,
    });
    const results = inv.Invocation?.InvocationResults?.InvocationResult;
    const res = Array.isArray(results) ? results[0] : results;
    if (res?.InvocationStatus === 'Success' || res?.InvocationStatus === 'Failed') {
      const out = Buffer.from(res.Output || '', 'base64').toString();
      console.log(out);
      return;
    }
  }
}
main().catch(e => console.error(e));
