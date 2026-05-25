require('./load-secrets');
const Core = require('@alicloud/pop-core');
const c = new Core({ accessKeyId: process.env.ALI_ACCESS_KEY_ID, accessKeySecret: process.env.ALI_ACCESS_KEY_SECRET, endpoint:'https://ecs.cn-guangzhou.aliyuncs.com', apiVersion:'2014-05-26' });
(async()=>{
  const s = Buffer.from('cd /opt/matrixflow && git fetch origin && git reset --hard origin/master && cd backend && npm run build 2>&1 && echo OK && pm2 restart matrixflow && sleep 2 && curl -s -o /dev/null -w %{http_code} http://localhost:3001/api/v1/health').toString('base64');
  const r1 = await c.request('CreateCommand',{RegionId: process.env.ALI_REGION || 'cn-guangzhou',Name:'fb'+Date.now(),Type:'RunShellScript',CommandContent:s,ContentEncoding:'Base64',Timeout:'300'});
  const r2 = await c.request('InvokeCommand',{RegionId: process.env.ALI_REGION || 'cn-guangzhou',CommandId:r1.CommandId,'InstanceId.1': process.env.ECS_INSTANCE_ID,Timed:false});
  await new Promise(r=>setTimeout(r,45000));
  const r3 = await c.request('DescribeInvocationResults',{RegionId: process.env.ALI_REGION || 'cn-guangzhou',InvokeId:r2.InvokeId});
  const o = r3.Invocation?.InvocationResults?.InvocationResult?.[0];
  console.log(o?.InvocationStatus, o?.ExitCode);
  if(o?.Output) console.log(Buffer.from(o.Output,'base64').toString());
})();
