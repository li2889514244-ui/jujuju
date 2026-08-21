require('./load-secrets');
const Core = require('@alicloud/pop-core');
const client = new Core({
  accessKeyId: process.env.ALI_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALI_ACCESS_KEY_SECRET,
  endpoint: 'https://ecs.cn-guangzhou.aliyuncs.com',
  apiVersion: '2014-05-26',
});

(async () => {
  const script = Buffer.from('pm2 status; echo "---LOGS---"; pm2 logs --lines 30 --nostream 2>&1').toString('base64');
  const c = await client.request('CreateCommand', { RegionId: process.env.ALI_REGION || 'cn-guangzhou', Name: 'check-logs2', Type: 'RunShellScript', CommandContent: script, ContentEncoding: 'Base64', Timeout: '60' });
  const inv = await client.request('InvokeCommand', { RegionId: process.env.ALI_REGION || 'cn-guangzhou', CommandId: c.CommandId, 'InstanceId.1': process.env.ECS_INSTANCE_ID, Timed: false });
  console.log('InvokeId:', inv.InvokeId);
  await new Promise(r => setTimeout(r, 12000));
  const res = await client.request('DescribeInvocationResults', { RegionId: process.env.ALI_REGION || 'cn-guangzhou', InvokeId: inv.InvokeId });
  const result = res.Invocation?.InvocationResults?.InvocationResult?.[0];
  if (result?.Output) console.log(Buffer.from(result.Output, 'base64').toString());
  console.log('Exit:', result?.ExitCode);
})();
