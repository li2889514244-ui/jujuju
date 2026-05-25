const Core = require('@alicloud/pop-core');
const client = new Core({
  accessKeyId: 'LTAI5tAA3vrwKomAL4mqq2c2',
  accessKeySecret: 'lz1LJwW9pDwEC2DXU2optOIbXcDeIHv',
  endpoint: 'https://ecs.cn-guangzhou.aliyuncs.com',
  apiVersion: '2014-05-26',
});

(async () => {
  const script = Buffer.from('pm2 status; echo "---LOGS---"; pm2 logs --lines 30 --nostream 2>&1').toString('base64');
  const c = await client.request('CreateCommand', { RegionId: 'cn-guangzhou', Name: 'check-logs2', Type: 'RunShellScript', CommandContent: script, ContentEncoding: 'Base64', Timeout: '60' });
  const inv = await client.request('InvokeCommand', { RegionId: 'cn-guangzhou', CommandId: c.CommandId, 'InstanceId.1': 'i-7xvb9wno2duq8msd35l1', Timed: false });
  console.log('InvokeId:', inv.InvokeId);
  await new Promise(r => setTimeout(r, 12000));
  const res = await client.request('DescribeInvocationResults', { RegionId: 'cn-guangzhou', InvokeId: inv.InvokeId });
  const result = res.Invocation?.InvocationResults?.InvocationResult?.[0];
  if (result?.Output) console.log(Buffer.from(result.Output, 'base64').toString());
  console.log('Exit:', result?.ExitCode);
})();
