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
    RegionId: 'cn-guangzhou',
    InstanceId: ['i-7xvb9wno2duq8msd35l1'],
    Type: 'RunShellScript',
    CommandContent: script,
    Timeout: 90,
    WorkingDir: '/root',
  });
  console.log('CommandId:', result.CommandId);
  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const inv = await client.request('DescribeInvocationResults', {
      RegionId: 'cn-guangzhou', CommandId: result.CommandId, InstanceId: 'i-7xvb9wno2duq8msd35l1',
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
