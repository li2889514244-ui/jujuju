require('./load-secrets');
const Core = require('@alicloud/pop-core');
const c = new Core({ accessKeyId: process.env.ALI_ACCESS_KEY_ID, accessKeySecret: process.env.ALI_ACCESS_KEY_SECRET, endpoint:'https://ecs.cn-guangzhou.aliyuncs.com', apiVersion:'2014-05-26' });
(async()=>{
  const s = Buffer.from('cd /opt/matrixflow && grep -r "pixing" /root/.pm2/logs/matrixflow-error.log 2>/dev/null | tail -10; echo "---OUT---"; grep -r "pixing" /root/.pm2/logs/matrixflow-out.log 2>/dev/null | tail -10; echo "---API---"; curl -s http://localhost:3001/api/v1/pixing-video/tasks/next | head -c 200').toString('base64');
  const r1 = await c.request('CreateCommand',{RegionId: process.env.ALI_REGION || 'cn-guangzhou',Name:'chk3'+Date.now(),Type:'RunShellScript',CommandContent:s,ContentEncoding:'Base64',Timeout:'60'});
  const r2 = await c.request('InvokeCommand',{RegionId: process.env.ALI_REGION || 'cn-guangzhou',CommandId:r1.CommandId,'InstanceId.1': process.env.ECS_INSTANCE_ID,Timed:false});
  await new Promise(r=>setTimeout(r,15000));
  const r3 = await c.request('DescribeInvocationResults',{RegionId: process.env.ALI_REGION || 'cn-guangzhou',InvokeId:r2.InvokeId});
  const o = r3.Invocation?.InvocationResults?.InvocationResult?.[0];
  if(o?.Output) console.log(Buffer.from(o.Output,'base64').toString());
})();
