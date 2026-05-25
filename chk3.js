const Core = require('@alicloud/pop-core');
const c = new Core({ accessKeyId:'LTAI5tAA3vrwKomAL4mqq2c2', accessKeySecret:'lz1LJwW9pDwEC2DXU2optOIbXcDeIHv', endpoint:'https://ecs.cn-guangzhou.aliyuncs.com', apiVersion:'2014-05-26' });
(async()=>{
  const s = Buffer.from('grep "pixing" /root/.pm2/logs/matrixflow-out.log 2>/dev/null | tail -8').toString('base64');
  const r1 = await c.request('CreateCommand',{RegionId:'cn-guangzhou',Name:'chk5'+Date.now(),Type:'RunShellScript',CommandContent:s,ContentEncoding:'Base64',Timeout:'60'});
  const r2 = await c.request('InvokeCommand',{RegionId:'cn-guangzhou',CommandId:r1.CommandId,'InstanceId.1':'i-7xvb9wno2duq8msd35l1',Timed:false});
  await new Promise(r=>setTimeout(r,12000));
  const r3 = await c.request('DescribeInvocationResults',{RegionId:'cn-guangzhou',InvokeId:r2.InvokeId});
  const o = r3.Invocation?.InvocationResults?.InvocationResult?.[0];
  if(o?.Output) console.log(Buffer.from(o.Output,'base64').toString());
})();
