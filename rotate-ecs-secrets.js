// ============================================================
// MatrixFlow — ECS 密钥轮换脚本
// 用法: node rotate-ecs-secrets.js
// 更新 ECS 上所有已泄密的密钥并重启服务
// ============================================================
const Core = require('@alicloud/pop-core');

const CONFIG = {
  region: 'cn-guangzhou',
  instanceId: 'i-7xvb9wno2duq8msd35l1',
  projectDir: '/opt/matrixflow/backend',
};

const NEW_SECRETS = {
  DB_PASS: 'f72d30b15368c8ab71c795aa78b25f0e4ec19d791e3c86d9cd869d277a487639',
  REDIS_PASS: '753b1bf3e3ed95b88d8821983ac553c1',
  JWT_SECRET: '97c8b81752478a5567e8383274541183689a3baca2bc11947ba7a7ed9dc30117ef44002f6e0ce856ddf6da652110e3049210dad8f9f9f9a099831225b01a0fa9',
  JWT_REFRESH_SECRET: '3c4f4dc094305c2e8f7548106d257932b9312b1a1d7b9fdbdd8c55af22496e2f767cdc02b1f549436ac9f12ceeb52a59d88e12931d2ba8a7071bb1d27fc5fa77',
  COOKIE_ENCRYPTION_KEY: '0eab89600307abfa3e3fb9195530f4bafd016fa336b892006fb7637dc22d0cde',
  TOKEN_ENCRYPTION_KEY: '80fd7dda56d65ef45f0c4f5e90f07895b42c8814ec13b50c35f1d08299359bd7',
  ADMIN_PASSWORD: 'DY5p7eknNe0pdFiW',
  CORS_ORIGIN: 'https://ddddkiii.com',
};

const client = new Core({
  accessKeyId: 'LTAI5tAA3vrwKomAL4mqq2c2',
  accessKeySecret: 'lz1LJwW9pDwEC2DXU2optOIbXcDeIHv',
  endpoint: `https://ecs.${CONFIG.region}.aliyuncs.com`,
  apiVersion: '2014-05-26',
  opts: { timeout: 30000 },
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runCommand(script, timeout = 120) {
  const result = await client.request('RunCommand', {
    RegionId: CONFIG.region,
    InstanceId: [CONFIG.instanceId],
    Type: 'RunShellScript',
    CommandContent: script,
    Timeout: timeout,
    WorkingDir: '/root',
  });
  return result.CommandId;
}

async function pollResult(commandId, maxWait = 300) {
  for (let i = 0; i < maxWait / 5; i++) {
    await sleep(5000);
    try {
      const inv = await client.request('DescribeInvocationResults', {
        RegionId: CONFIG.region,
        CommandId: commandId,
        InstanceId: CONFIG.instanceId,
      });
      const results = inv.Invocation?.InvocationResults?.InvocationResult;
      const res = Array.isArray(results) ? results[0] : results;
      const status = res?.InvocationStatus;
      const elapsed = (i + 1) * 5;
      process.stdout.write(`  [${elapsed}s] ${status}   \r`);

      if (status === 'Success') {
        console.log(`\nOK (${elapsed}s)`);
        return { success: true, output: Buffer.from(res.Output, 'base64').toString() };
      } else if (status === 'Failed' || status === 'Timeout' || status === 'Stopped') {
        console.log(`\nFAIL: ${status}`);
        return { success: false, output: Buffer.from(res.Output || '', 'base64').toString() };
      }
    } catch (e) {
      console.log(`\n  Network retry... (${e.message?.slice(0, 40)})`);
      await sleep(10000);
    }
  }
  return { success: false, output: 'Timeout' };
}

async function main() {
  console.log('=== [1/4] 更新 .env 配置 ===');
  const envCmd = await runCommand(`#!/bin/bash
set -e
cd ${CONFIG.projectDir}

cat > .env << 'ENVEOF'
DB_PASS=${NEW_SECRETS.DB_PASS}
REDIS_PASS=${NEW_SECRETS.REDIS_PASS}
JWT_SECRET=${NEW_SECRETS.JWT_SECRET}
JWT_REFRESH_SECRET=${NEW_SECRETS.JWT_REFRESH_SECRET}
COOKIE_ENCRYPTION_KEY=${NEW_SECRETS.COOKIE_ENCRYPTION_KEY}
TOKEN_ENCRYPTION_KEY=${NEW_SECRETS.TOKEN_ENCRYPTION_KEY}
CORS_ORIGIN=${NEW_SECRETS.CORS_ORIGIN}
DATABASE_URL=postgresql://postgres:${NEW_SECRETS.DB_PASS}@db:5432/matrixflow
REDIS_URL=redis://:${NEW_SECRETS.REDIS_PASS}@redis:6379
NODE_ENV=production
PORT=3000
PYTHON_BRIDGE_URL=http://localhost:8000
LOG_LEVEL=warn
ENVEOF

echo ".env updated"
cat .env | sed 's/\\(SECRET\\|PASS\\|KEY\\)=.*/\\1=***/g'
echo "=== ENV_DONE ==="
`, 30);
  const envResult = await pollResult(envCmd);
  console.log(envResult.output?.slice(-500) || envResult.output || '');

  console.log('\n=== [2/4] 更新 docker-compose.yml 密码 ===');
  const dcCmd = await runCommand(`#!/bin/bash
set -e
cd ${CONFIG.projectDir}

# 更新 docker-compose.yml 中的 DB 密码
sed -i 's/POSTGRES_PASSWORD: .*/POSTGRES_PASSWORD: ${NEW_SECRETS.DB_PASS}/' docker-compose.yml 2>/dev/null || true
sed -i 's/REDIS_PASSWORD: .*/REDIS_PASSWORD: ${NEW_SECRETS.REDIS_PASS}/' docker-compose.yml 2>/dev/null || true
sed -i 's/requirepass .*/requirepass ${NEW_SECRETS.REDIS_PASS}/' docker-compose.yml 2>/dev/null || true

echo "docker-compose.yml updated"
grep -E 'POSTGRES_PASSWORD|REDIS_PASSWORD|requirepass' docker-compose.yml | sed 's/:.*/: ***/g'
echo "=== DC_DONE ==="
`, 30);
  const dcResult = await pollResult(dcCmd);
  console.log(dcResult.output?.slice(-300) || dcResult.output || '');

  console.log('\n=== [3/4] 更新数据库管理员密码 ===');
  const dbCmd = await runCommand(`#!/bin/bash
set -e
cd ${CONFIG.projectDir}

# 等待 DB 启动
echo "Waiting for PostgreSQL..."
for i in $(seq 1 15); do
  if docker compose exec -T db pg_isready -U postgres 2>/dev/null; then
    echo "PostgreSQL ready"
    break
  fi
  sleep 2
done

# 更新管理员密码
docker compose exec -T db psql -U postgres -d matrixflow -c "UPDATE users SET password = crypt('${NEW_SECRETS.ADMIN_PASSWORD}', gen_salt('bf')) WHERE email = '2889514244@qq.com';" 2>&1 || echo "WARNING: DB update failed, trying direct connection..."

# Fallback: via docker exec
docker exec \$(docker ps -qf "name=db") psql -U postgres -d matrixflow -c "UPDATE users SET password = crypt('${NEW_SECRETS.ADMIN_PASSWORD}', gen_salt('bf')) WHERE email = '2889514244@qq.com';" 2>&1 || echo "Direct update also failed"

echo "=== DB_DONE ==="
`, 60);
  const dbResult = await pollResult(dbCmd, 120);
  console.log(dbResult.output?.slice(-500) || dbResult.output || '');

  console.log('\n=== [4/4] 重启容器 ===');
  const restartCmd = await runCommand(`#!/bin/bash
set -e
cd ${CONFIG.projectDir}

echo "Stopping..."
docker compose down 2>/dev/null || true

echo "Starting with new config..."
docker compose up -d

echo "Waiting for health..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3000/api/v1/health > /dev/null 2>&1; then
    echo "Backend healthy after $((i * 2))s"
    break
  fi
  sleep 2
done

echo ""
echo "=== STATUS ==="
docker compose ps
echo ""
echo "=== HEALTH ==="
curl -s http://localhost:3000/api/v1/health | head -c 300
echo ""
echo "=== DONE ==="
`, 300);
  const restartResult = await pollResult(restartCmd, 300);
  
  if (restartResult.success) {
    console.log('\n' + '='.repeat(50));
    console.log('  ECS 密钥轮换成功!');
    console.log('='.repeat(50));
  } else {
    console.log('\n轮换失败！');
    console.log(restartResult.output?.slice(-1000) || '');
  }
}

main().catch(e => {
  console.error('脚本错误:', e.message);
});
