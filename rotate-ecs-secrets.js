// ============================================================
// MatrixFlow — ECS 密钥轮换（分步执行，避免命令过长）
// 用法: node rotate-ecs-secrets.js
// ============================================================
require('./load-secrets');
const Core = require('@alicloud/pop-core');

const CONFIG = {
  region: process.env.ALI_REGION || 'cn-guangzhou',
  instanceId: process.env.ECS_INSTANCE_ID,
  projectDir: '/opt/matrixflow/backend',
};

const S = {
  DB: process.env.DB_PASSWORD,
  REDIS: process.env.REDIS_PASSWORD,
  JWT: process.env.JWT_SECRET,
  JWT_R: process.env.JWT_REFRESH_SECRET,
  COOKIE: process.env.COOKIE_ENCRYPTION_KEY,
  TOKEN: process.env.TOKEN_ENCRYPTION_KEY,
  ADMIN: process.env.ADMIN_PASSWORD,
};

const client = new Core({
  accessKeyId: process.env.ALI_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALI_ACCESS_KEY_SECRET,
  endpoint: 'https://ecs.cn-guangzhou.aliyuncs.com',
  apiVersion: '2014-05-26',
  opts: { timeout: 30000 },
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run(script, timeout = 120) {
  const r = await client.request('RunCommand', {
    RegionId: CONFIG.region,
    InstanceId: [CONFIG.instanceId],
    Type: 'RunShellScript',
    CommandContent: script,
    Timeout: timeout,
    WorkingDir: '/root',
  });
  return r.CommandId;
}

async function poll(cmdId, maxWait = 120) {
  for (let i = 0; i < maxWait / 5; i++) {
    await sleep(5000);
    try {
      const inv = await client.request('DescribeInvocationResults', {
        RegionId: CONFIG.region,
        CommandId: cmdId,
        InstanceId: CONFIG.instanceId,
      });
      const res = inv.Invocation?.InvocationResults?.InvocationResult;
      const r = Array.isArray(res) ? res[0] : res;
      const elapsed = (i + 1) * 5;
      process.stdout.write(`  [${elapsed}s] ${r?.InvocationStatus}  \r`);
      if (r?.InvocationStatus === 'Success') {
        console.log(`OK (${elapsed}s)`);
        return Buffer.from(r.Output, 'base64').toString();
      }
      if (r?.InvocationStatus === 'Failed') {
        console.log(`FAIL`);
        return Buffer.from(r.Output || '', 'base64').toString();
      }
    } catch (e) {
      console.log(`\n  Retry: ${e.message?.slice(0, 40)}`);
      await sleep(10000);
    }
  }
  return 'Timeout';
}

async function main() {
  const DIR = CONFIG.projectDir;

  // Step 1: Write .env line by line
  console.log('=== [1] Write .env ===');
  const c1 = await run(`cd ${DIR} && echo "DB_PASS=${S.DB}" > .env && echo "REDIS_PASS=${S.REDIS}" >> .env && echo "JWT_SECRET=${S.JWT}" >> .env && echo "JWT_REFRESH_SECRET=${S.JWT_R}" >> .env && echo "COOKIE_ENCRYPTION_KEY=${S.COOKIE}" >> .env && echo "TOKEN_ENCRYPTION_KEY=${S.TOKEN}" >> .env && echo "CORS_ORIGIN=https://ddddkiii.com" >> .env && echo "DATABASE_URL=postgresql://postgres:${S.DB}@db:5432/matrixflow" >> .env && echo "REDIS_URL=redis://:${S.REDIS}@redis:6379" >> .env && echo "NODE_ENV=production" >> .env && echo "PORT=3000" >> .env && echo "PYTHON_BRIDGE_URL=http://localhost:8000" >> .env && echo "LOG_LEVEL=warn" >> .env && echo "env OK"`, 30);
  let o = await poll(c1);
  console.log(o.slice(-300));

  // Step 2: Update docker-compose.yml
  console.log('\n=== [2] Update docker-compose.yml ===');
  const c2 = await run(`cd ${DIR} && sed -i "s/POSTGRES_PASSWORD: .*/POSTGRES_PASSWORD: ${S.DB}/" docker-compose.yml && sed -i "s/REDIS_PASSWORD: .*/REDIS_PASSWORD: ${S.REDIS}/" docker-compose.yml && echo "dc OK"`, 30);
  o = await poll(c2);
  console.log(o.slice(-200));

  // Step 3: Update admin password in DB
  console.log('\n=== [3] Update admin password ===');
  const c3 = await run(`cd ${DIR} && docker exec $(docker ps -qf name=db) psql -U postgres -d matrixflow -c "UPDATE users SET password = crypt('${S.ADMIN}', gen_salt('bf')) WHERE email = '${process.env.ADMIN_EMAIL}';" 2>&1 && echo "db OK"`, 60);
  o = await poll(c3, 120);
  console.log(o.slice(-400));

  // Step 4: Restart containers
  console.log('\n=== [4] Restart ===');
  const c4 = await run(`cd ${DIR} && docker compose down && docker compose up -d && sleep 10 && curl -sf http://localhost:3000/api/v1/health && echo "restart OK"`, 300);
  o = await poll(c4, 300);
  console.log(o.slice(-500));

  console.log('\n' + '='.repeat(50));
  console.log('  ALL DONE');
  console.log('='.repeat(50));
}

main().catch(e => console.error('FATAL:', e.message));
