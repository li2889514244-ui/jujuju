const fs = require('fs');
const path = require('path');

const configPath = path.join(require('os').homedir(), '.aliyun', 'config.json');
if (!fs.existsSync(configPath)) { console.log('ERROR: no config'); process.exit(1); }

const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const profile = config.profiles.find(p => p.name === config.current) || config.profiles[1];
const Core = require('@alicloud/pop-core');

const script = fs.readFileSync(path.join(__dirname, 'test-wechat-api.sh'), 'utf-8');

const client = new Core({
  accessKeyId: profile.access_key_id,
  accessKeySecret: profile.access_key_secret,
  endpoint: 'https://ecs.cn-guangzhou.aliyuncs.com',
  apiVersion: '2014-05-26'
});

async function main() {
  const createResp = await client.request('CreateCommand', {
    RegionId: 'cn-guangzhou',
    Name: 'test-wechat-api-' + Date.now(),
    Type: 'RunShellScript',
    CommandContent: Buffer.from(script).toString('base64'),
    Timeout: '120'
  }, { method: 'POST' });

  const inv = await client.request('InvokeCommand', {
    RegionId: 'cn-guangzhou',
    CommandId: createResp.CommandId,
    InstanceId: ['i-7xvb9wno2duq8msd35l1'],
    Timed: false
  }, { method: 'POST' });

  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const resp = await client.request('DescribeInvocationResults', {
      RegionId: 'cn-guangzhou',
      InvokeId: inv.InvokeId
    }, { method: 'POST' });
    const r = resp.Invocation.InvocationResults.InvocationResult[0];
    if (r && (r.InvocationStatus === 'Success' || r.InvocationStatus === 'Failed')) {
      const out = Buffer.from(r.Output || '', 'base64').toString('utf-8');
      console.log(out);
      process.exit(0);
    }
  }
  console.log('Timeout');
  process.exit(1);
}

main().catch(e => { console.error(e.message); process.exit(1); });
