/**
 * 压力测试脚本
 * 
 * 逐步增加负载直到系统崩溃，找到系统瓶颈
 * 测试系统在极端负载下的行为和恢复能力
 * 
 * 安装依赖: npm install -D autocannon
 * 运行: npx ts-node test/performance/stress-test.ts
 */

import * as autocannon from 'autocannon';

// ==================== 配置 ====================
const BASE_URL = process.env.STRESS_TEST_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.STRESS_TEST_TOKEN || '';

interface StressPhase {
  name: string;
  connections: number;
  duration: number;
  description: string;
}

// ==================== 压力测试阶段 ====================
// 逐步增加并发，找到系统崩溃点
const stressPhases: StressPhase[] = [
  { name: '预热', connections: 10, duration: 10, description: '系统预热' },
  { name: '低负载', connections: 50, duration: 15, description: '正常负载' },
  { name: '中等负载', connections: 100, duration: 15, description: '中等压力' },
  { name: '高负载', connections: 200, duration: 15, description: '高压力' },
  { name: '超高负载', connections: 500, duration: 15, description: '超高压力' },
  { name: '极限负载', connections: 1000, duration: 15, description: '极限压力' },
  { name: '过载', connections: 2000, duration: 15, description: '过载测试' },
  { name: '崩溃点', connections: 5000, duration: 15, description: '崩溃点测试' },
];

interface PhaseResult {
  phase: string;
  connections: number;
  rps: number;
  avgLatency: number;
  p99Latency: number;
  errors: number;
  timeouts: number;
  errorRate: number;
  throughput: number;
}

// ==================== 测试目标端点 ====================
const testEndpoints = [
  {
    name: 'GET /api/v1/users/me（认证接口）',
    url: `${BASE_URL}/api/v1/users/me`,
    method: 'GET' as const,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`,
    },
  },
  {
    name: 'GET /api/v1/accounts（列表查询）',
    url: `${BASE_URL}/api/v1/accounts?take=10`,
    method: 'GET' as const,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`,
    },
  },
  {
    name: 'POST /api/v1/auth/login（登录接口）',
    url: `${BASE_URL}/api/v1/auth/login`,
    method: 'POST' as const,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'stresstest@matrixflow.com',
      password: 'Test123!',
    }),
  },
];

// ==================== 执行单个阶段 ====================
async function runPhase(
  endpoint: typeof testEndpoints[0],
  phase: StressPhase
): Promise<PhaseResult> {
  return new Promise((resolve, reject) => {
    const instance = autocannon({
      url: endpoint.url,
      method: endpoint.method,
      headers: endpoint.headers,
      body: endpoint.body,
      connections: phase.connections,
      duration: phase.duration,
      pipelining: 1,
      timeout: 10,
    }, (err, result) => {
      if (err) {
        reject(err);
        return;
      }

      const totalRequests = result.requests.total;
      const errorRate = totalRequests > 0 ? (result.errors / totalRequests) * 100 : 0;

      resolve({
        phase: phase.name,
        connections: phase.connections,
        rps: result.requests.average,
        avgLatency: result.latency.average,
        p99Latency: result.latency.p99,
        errors: result.errors,
        timeouts: result.timeouts,
        errorRate,
        throughput: result.throughput.average,
      });
    });
  });
}

// ==================== 压力测试执行 ====================
async function runStressTest(endpoint: typeof testEndpoints[0]) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`🔥 压力测试: ${endpoint.name}`);
  console.log(`${'═'.repeat(70)}`);

  const results: PhaseResult[] = [];
  let breakingPoint: StressPhase | null = null;

  for (const phase of stressPhases) {
    console.log(`\n▶ 阶段: ${phase.name} (${phase.connections} 连接, ${phase.duration}s)`);
    console.log(`  ${phase.description}`);

    try {
      const result = await runPhase(endpoint, phase);
      results.push(result);

      // 输出阶段结果
      const latencyOk = result.avgLatency < 200;
      const errorOk = result.errorRate < 1;
      const status = latencyOk && errorOk ? '✅' : '⚠️';

      console.log(`  ${status} RPS: ${result.rps.toFixed(0)} | 延迟: ${result.avgLatency.toFixed(1)}ms | P99: ${result.p99Latency.toFixed(1)}ms | 错误率: ${result.errorRate.toFixed(2)}%`);

      // 检测崩溃点
      if (result.errorRate > 50 || result.avgLatency > 5000) {
        breakingPoint = phase;
        console.log(`  🚨 检测到系统瓶颈！错误率 ${result.errorRate.toFixed(2)}%`);
        break;
      }

      // 如果错误率超过10%，记录但继续
      if (result.errorRate > 10) {
        console.log(`  ⚠️  错误率过高 (${result.errorRate.toFixed(2)}%)，系统可能接近极限`);
      }
    } catch (error) {
      console.error(`  ❌ 阶段执行失败: ${error}`);
      breakingPoint = phase;
      break;
    }
  }

  return { endpoint: endpoint.name, results, breakingPoint };
}

// ==================== 恢复测试 ====================
async function runRecoveryTest(endpoint: typeof testEndpoints[0]) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`🔄 恢复测试: ${endpoint.name}`);
  console.log(`${'═'.repeat(70)}`);

  // 1. 施加高负载
  console.log('\n▶ 施加高负载 (1000连接, 10s)...');
  const stressResult = await new Promise<autocannon.Result>((resolve, reject) => {
    autocannon({
      url: endpoint.url,
      method: endpoint.method,
      headers: endpoint.headers,
      body: endpoint.body,
      connections: 1000,
      duration: 10,
      timeout: 10,
    }, (err, result) => err ? reject(err) : resolve(result));
  });

  console.log(`  高负载期间: RPS ${stressResult.requests.average.toFixed(0)}, 错误 ${stressResult.errors}`);

  // 2. 等待恢复
  console.log('\n▶ 等待5秒恢复...');
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // 3. 低负载验证
  console.log('▶ 低负载验证 (10连接, 10s)...');
  const recoveryResult = await new Promise<autocannon.Result>((resolve, reject) => {
    autocannon({
      url: endpoint.url,
      method: endpoint.method,
      headers: endpoint.headers,
      body: endpoint.body,
      connections: 10,
      duration: 10,
      timeout: 10,
    }, (err, result) => err ? reject(err) : resolve(result));
  });

  console.log(`  恢复后: RPS ${recoveryResult.requests.average.toFixed(0)}, 延迟 ${recoveryResult.latency.average.toFixed(1)}ms, 错误 ${recoveryResult.errors}`);

  const recovered = recoveryResult.errors === 0 && recoveryResult.latency.average < 500;
  console.log(`  ${recovered ? '✅ 系统恢复正常' : '❌ 系统未完全恢复'}`);

  return recovered;
}

// ==================== 生成报告 ====================
function generateReport(allResults: Awaited<ReturnType<typeof runStressTest>>[]) {
  console.log('\n\n' + '═'.repeat(70));
  console.log('📋 压力测试汇总报告');
  console.log('═'.repeat(70));

  for (const { endpoint, results, breakingPoint } of allResults) {
    console.log(`\n📊 ${endpoint}`);
    console.log('-'.repeat(70));
    console.log('连接数    RPS        延迟(ms)   P99(ms)    错误率     状态');
    console.log('-'.repeat(70));

    for (const r of results) {
      const status = r.errorRate < 1 && r.avgLatency < 200 ? '✅' :
                     r.errorRate < 10 && r.avgLatency < 1000 ? '⚠️' : '❌';
      console.log(
        `${String(r.connections).padStart(8)}  ` +
        `${r.rps.toFixed(0).padStart(10)}  ` +
        `${r.avgLatency.toFixed(1).padStart(10)}  ` +
        `${r.p99Latency.toFixed(1).padStart(10)}  ` +
        `${(r.errorRate.toFixed(2) + '%').padStart(10)}  ` +
        `${status}`
      );
    }

    if (breakingPoint) {
      console.log(`\n  🚨 崩溃点: ${breakingPoint.name} (${breakingPoint.connections} 连接)`);
    } else {
      console.log(`\n  ✅ 未达到崩溃点`);
    }
  }

  // 性能建议
  console.log('\n\n' + '═'.repeat(70));
  console.log('💡 性能优化建议');
  console.log('═'.repeat(70));

  const allLatencies = allResults.flatMap((r) => r.results.map((x) => x.avgLatency));
  const maxRps = Math.max(...allResults.flatMap((r) => r.results.map((x) => x.rps)));

  if (Math.max(...allLatencies) > 200) {
    console.log('  • 高延迟问题: 考虑添加Redis缓存层');
    console.log('  • 数据库优化: 检查查询索引和N+1问题');
  }

  if (maxRps < 1000) {
    console.log('  • 吞吐量偏低: 考虑启用集群模式');
    console.log('  • 连接池优化: 增加数据库连接池大小');
  }

  console.log('  • 建议: 使用PM2集群模式部署');
  console.log('  • 建议: 配置Nginx反向代理和负载均衡');
  console.log('  • 建议: 启用HTTP/2和gzip压缩');
  console.log('═'.repeat(70));
}

// ==================== 主函数 ====================
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║              MatrixFlow ERP - 压力测试                          ║');
  console.log('║              逐步增加负载找到系统瓶颈                            ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  if (!AUTH_TOKEN) {
    console.log('\n⚠️  警告: 未设置 STRESS_TEST_TOKEN 环境变量');
    console.log('   设置方法: export STRESS_TEST_TOKEN=your-jwt-token\n');
  }

  const allResults: Awaited<ReturnType<typeof runStressTest>>[] = [];

  // 执行压力测试
  for (const endpoint of testEndpoints) {
    const result = await runStressTest(endpoint);
    allResults.push(result);

    // 阶段间冷却
    console.log('\n⏳ 冷却 5 秒...');
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  // 执行恢复测试
  console.log('\n\n' + '═'.repeat(70));
  console.log('🔄 系统恢复能力测试');
  console.log('═'.repeat(70));

  for (const endpoint of testEndpoints.slice(0, 1)) {
    await runRecoveryTest(endpoint);
  }

  // 生成报告
  generateReport(allResults);

  // 保存JSON报告
  const fs = require('fs');
  const report = {
    timestamp: new Date().toISOString(),
    environment: {
      baseUrl: BASE_URL,
      nodeVersion: process.version,
    },
    results: allResults.map((r) => ({
      endpoint: r.endpoint,
      phases: r.results,
      breakingPoint: r.breakingPoint?.name || null,
    })),
  };

  const reportPath = `./test/performance/stress-test-report-${Date.now()}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 报告已保存: ${reportPath}`);
}

main().catch(console.error);
