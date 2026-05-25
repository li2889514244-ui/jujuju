require('./load-secrets');
const Core = require('@alicloud/pop-core');
const client = new Core({
  accessKeyId: process.env.ALI_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALI_ACCESS_KEY_SECRET,
  endpoint: 'https://ecs.cn-guangzhou.aliyuncs.com',
  apiVersion: '2014-05-26',
});

const commitMsg = process.argv[2] || 'deploy pixing-video';

const script = `#!/bin/bash
set -e
cd /opt/matrixflow

# 拉取新分支
git fetch origin
git checkout feat/pixing-video 2>/dev/null || git checkout -b feat/pixing-video origin/feat/pixing-video
git reset --hard origin/feat/pixing-video
echo "Git: $(git log -1 --format='%h %s')"

# 启动数据库（如果没运行）
docker start matrixflow-db matrixflow-redis 2>/dev/null || true
sleep 2

# 运行数据库迁移
cd /opt/matrixflow/backend
npx prisma migrate deploy 2>&1
echo "Migration done"

# 重新生成 Prisma Client
npx prisma generate 2>&1
echo "Prisma generate done"

# 重启后端
pm2 delete matrixflow 2>/dev/null || true
pm2 start dist/main.js --name matrixflow
echo "Backend restarted"
sleep 3
pm2 status

# 部署前端
rm -rf /var/www/matrixflow/*
cp -r /opt/matrixflow/frontend/dist/* /var/www/matrixflow/
echo "Frontend deployed: $(ls /var/www/matrixflow/index.html)"

# 重载 nginx
nginx -s reload 2>/dev/null || (nginx -t && nginx -s reload)
echo "Nginx reloaded"

# 健康检查
sleep 2
curl -s http://localhost:3001/api/v1/health | head -c 200
`;

async function main() {
  console.log('Deploying pixing-video to ECS...');

  // Step 1: Create command
  const cmdResult = await client.request('CreateCommand', {
    RegionId: process.env.ALI_REGION || 'cn-guangzhou',
    Name: 'deploy-pixing-' + Date.now(),
    Type: 'RunShellScript',
    CommandContent: Buffer.from(script).toString('base64'),
    ContentEncoding: 'Base64',
    Timeout: '300',
    WorkingDir: '/root',
  });
  console.log('Command created:', cmdResult.CommandId);

  // Step 2: Invoke command
  const invResult = await client.request('InvokeCommand', {
    RegionId: process.env.ALI_REGION || 'cn-guangzhou',
    CommandId: cmdResult.CommandId,
    'InstanceId.1': process.env.ECS_INSTANCE_ID,
    Timed: false,
  });
  console.log('Command invoked:', invResult.InvokeId);

  // Step 3: Poll for results
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const resResult = await client.request('DescribeInvocationResults', {
      RegionId: process.env.ALI_REGION || 'cn-guangzhou',
      InvokeId: invResult.InvokeId,
    });

    const inv = resResult.Invocation?.InvocationResults?.InvocationResult?.[0];
    if (inv) {
      console.log(`Status: ${inv.InvocationStatus} (${i * 5 + 5}s)`);
      if (inv.Output) {
        console.log(Buffer.from(inv.Output, 'base64').toString('utf-8'));
      }
      if (inv.InvocationStatus === 'Finished' || inv.InvocationStatus === 'Failed' || inv.InvocationStatus === 'Stopped') {
        console.log(`Exit code: ${inv.ExitCode}`);
        process.exit(inv.ExitCode === '0' ? 0 : 1);
      }
    }
  }
  console.log('Timeout waiting for deployment');
  process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
