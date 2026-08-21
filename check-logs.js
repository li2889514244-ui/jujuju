const Core = require('@alicloud/pop-core');
const client = new Core({
  accessKeyId: process.env.ALI_AK_ID,
  accessKeySecret: process.env.ALI_AK_SECRET,
  endpoint: 'https://ecs.cn-guangzhou.aliyuncs.com',
  apiVersion: '2014-05-26'
});

const script = `#!/bin/bash
pm2 logs matrixflow --lines 30 --nostream 2>&1 | tail -40
`;

(async () => {
  const createResp = await client.request('CreateCommand', {
    RegionId: 'cn-guangzhou',
    Name: 'logs-' + Date.now(),
    Type: 'RunShellScript',
    CommandContent: Buffer.from(script).toString('base64'),
    Timeout: '30'
  }, { method: 'POST' });

  const inv = await client.request('InvokeCommand', {
    RegionId: 'cn-guangzhou',
    CommandId: createResp.CommandId,
    InstanceId: ['i-7xvb9wno2duq8msd35l1'],
    Timed: false
  }, { method: 'POST' });

  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const resp = await client.request('DescribeInvocationResults', {
      RegionId: 'cn-guangzhou', InvokeId: inv.InvokeId
    }, { method: 'POST' });
    const results = resp.Invocation?.InvocationResults?.InvocationResult;
    if (results?.[0]?.InvocationStatus) {
      console.log(Buffer.from(results[0].Output || '', 'base64').toString());
      return;
    }
  }
})().catch(console.error);
