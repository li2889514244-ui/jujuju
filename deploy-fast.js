require('./load-secrets');
const Core = require('@alicloud/pop-core');
const client = new Core({
  accessKeyId: process.env.ALI_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALI_ACCESS_KEY_SECRET,
  endpoint: 'https://ecs.cn-guangzhou.aliyuncs.com',
  apiVersion: '2014-05-26',
});

const script = `#!/bin/bash
cd /opt/matrixflow && git fetch origin && git reset --hard origin/master
cd /opt/matrixflow/backend && npm run build 2>&1 | tail -1
echo "BUILD_DONE"
cd /opt/matrixflow && pm2 restart matrixflow
sleep 2 && pm2 status | grep matrixflow
curl -s -o /dev/null -w "API:%{http_code}" http://localhost:3001/api/v1/health
`;

async function main() {
  const b64 = Buffer.from(script).toString('base64');
  const c = await client.request('CreateCommand', { RegionId: process.env.ALI_REGION || 'cn-guangzhou', Name: 'fast-build-' + Date.now(), Type: 'RunShellScript', CommandContent: b64, ContentEncoding: 'Base64', Timeout: '300', WorkingDir: '/root' });
  const inv = await client.request('InvokeCommand', { RegionId: process.env.ALI_REGION || 'cn-guangzhou', CommandId: c.CommandId, 'InstanceId.1': process.env.ECS_INSTANCE_ID, Timed: false });

  await new Promise(r => setTimeout(r, 30000));
  const res = await client.request('DescribeInvocationResults', { RegionId: process.env.ALI_REGION || 'cn-guangzhou', InvokeId: inv.InvokeId });
  const r = res.Invocation?.InvocationResults?.InvocationResult?.[0];
  console.log('Status:', r?.InvocationStatus, 'Exit:', r?.ExitCode);
  if (r?.Output) console.log(Buffer.from(r.Output, 'base64').toString());
}
main();
