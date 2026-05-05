/**
 * 负载测试脚本
 * 
 * 使用 autocannon 进行HTTP负载测试
 * 测试目标：并发用户 > 1000，响应时间 < 200ms
 * 
 * 安装依赖: npm install -D autocannon
 * 运行: npx ts-node test/performance/load-test.ts
 */

import * as autocannon from 'autocannon';

// ==================== 配置 ====================
const BASE_URL = process.env.LOAD_TEST_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.LOAD_TEST_TOKEN || '';

interface TestConfig {
  title: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  connections: number;
  duration: number; // 秒
  pipelining: number;
}

// ==================== 测试场景 ====================
const testScenarios: TestConfig[] = [
  {
    title: '1. 登录接口负载测试',
    url: `${BASE_URL}/api/v1/auth/login`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'loadtest@matrixflow.com',
      password: 'Test123!',
    }),
    connections: 100,
    duration: 30,
    pipelining: 1,
  },
  {
    title: '2. 用户信息查询（需认证）',
    url: `${BASE_URL}/api/v1/users/me`,
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`,
    },
    connections: 500,
    duration: 30,
    pipelining: 1,
  },
  {
    title: '3. 账号列表查询',
    url: `${BASE_URL}/api/v1/accounts?take=20&skip=0`,
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`,
    },
    connections: 300,
    duration: 30,
    pipelining: 1,
  },
  {
    title: '4. 内容列表查询',
    url: `${BASE_URL}/api/v1/content?take=20&skip=0`,
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`,
    },
    connections: 300,
    duration: 30,
    pipelining: 1,
  },
  {
    title: '5. 团队列表查询',
    url: `${BASE_URL}/api/v1/teams`,
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`,
    },
    connections: 200,
    duration: 30,
    pipelining: 1,
  },
  {
    title: '6. 高并发混合场景（1000连接）',
    url: `${BASE_URL}/api/v1/users/me`,
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`,
    },
    connections: 1000,
    duration: 60,
    pipelining: 1,
  },
  {
    title: '7. 管道化请求测试（高吞吐量）',
    url: `${BASE_URL}/api/v1/accounts?take=10`,
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`,
    },
    connections: 200,
    duration: 30,
    pipelining: 10,
  },
];

// ==================== 测试执行 ====================
async function runTest(config: TestConfig): Promise<autocannon.Result> {
  return new Promise((resolve, reject) => {
    console.log(`\n🚀 开始测试: ${config.title}`);
    console.log(`   URL: ${config.url}`);
    console.log(`   并发连接: ${config.connections}`);
    console.log(`   持续时间: ${config.duration}s`);
    console.log(`   管道化: ${config.pipelining}`);

    const instance = autocannon({
      url: config.url,
      method: config.method,
      headers: config.headers || {},
      body: config.body,
      connections: config.connections,
      duration: config.duration,
      pipelining: config.pipelining,
      timeout: 10,
    }, (err, result) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(result);
    });

    // 实时输出进度
    autocannon.track(instance, { renderProgressBar: true });
  });
}

function formatResult(title: string, result: autocannon.Result) {
  const avgLatency = result.latency.average;
  const p99Latency = result.latency.p99;
  const rps = result.requests.average;
  const totalRequests = result.requests.total;
  const errors = result.errors;
  const timeouts = result.timeouts;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 ${title}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  总请求数:     ${totalRequests.toLocaleString()}`);
  console.log(`  平均RPS:      ${rps.toLocaleString()} req/s`);
  console.log(`  平均延迟:     ${avgLatency.toFixed(2)} ms`);
  console.log(`  P50延迟:      ${result.latency.p50?.toFixed(2) || 'N/A'} ms`);
  console.log(`  P99延迟:      ${p99Latency.toFixed(2)} ms`);
  console.log(`  最大延迟:     ${result.latency.max?.toFixed(2) || 'N/A'} ms`);
  console.log(`  错误数:       ${errors}`);
  console.log(`  超时数:       ${timeouts}`);
  console.log(`  吞吐量:       ${(result.throughput.average / 1024 / 1024).toFixed(2)} MB/s`);
  console.log(`${'='.repeat(60)}`);

  // 性能基准检查
  const issues: string[] = [];
  if (avgLatency > 200) {
    issues.push(`⚠️  平均延迟 ${avgLatency.toFixed(2)}ms 超过200ms阈值`);
  }
  if (p99Latency > 500) {
    issues.push(`⚠️  P99延迟 ${p99Latency.toFixed(2)}ms 超过500ms阈值`);
  }
  if (errors > 0) {
    issues.push(`❌ 存在 ${errors} 个错误`);
  }
  if (timeouts > 0) {
    issues.push(`❌ 存在 ${timeouts} 个超时`);
  }

  if (issues.length > 0) {
    console.log('\n  性能问题:');
    issues.forEach((issue) => console.log(`    ${issue}`));
  } else {
    console.log('\n  ✅ 所有性能指标达标');
  }

  return { avgLatency, p99Latency, rps, errors, timeouts, passed: issues.length === 0 };
}

// ==================== 主函数 ====================
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║        MatrixFlow ERP - 负载测试                        ║');
  console.log('║        目标: 响应时间 < 200ms, 并发 > 1000              ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (!AUTH_TOKEN) {
    console.log('\n⚠️  警告: 未设置 LOAD_TEST_TOKEN 环境变量');
    console.log('   需要认证的测试将返回401错误');
    console.log('   设置方法: export LOAD_TEST_TOKEN=your-jwt-token\n');
  }

  const results: Array<{ title: string; passed: boolean; avgLatency: number; p99Latency: number }> = [];

  for (const scenario of testScenarios) {
    try {
      const result = await runTest(scenario);
      const summary = formatResult(scenario.title, result);
      results.push({ title: scenario.title, ...summary });
    } catch (error) {
      console.error(`\n❌ 测试失败: ${scenario.title}`);
      console.error(`   错误: ${error}`);
      results.push({
        title: scenario.title,
        passed: false,
        avgLatency: Infinity,
        p99Latency: Infinity,
      });
    }
  }

  // 汇总报告
  console.log('\n\n' + '═'.repeat(60));
  console.log('📋 测试汇总报告');
  console.log('═'.repeat(60));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  results.forEach((r) => {
    const status = r.passed ? '✅' : '❌';
    console.log(`  ${status} ${r.title}`);
    console.log(`     平均延迟: ${r.avgLatency.toFixed(2)}ms | P99: ${r.p99Latency.toFixed(2)}ms`);
  });

  console.log(`\n  总计: ${results.length} 项测试`);
  console.log(`  通过: ${passed} ✅`);
  console.log(`  失败: ${failed} ❌`);
  console.log('═'.repeat(60));

  // 生成JSON报告
  const report = {
    timestamp: new Date().toISOString(),
    environment: {
      baseUrl: BASE_URL,
      nodeVersion: process.version,
      platform: process.platform,
    },
    results: results.map((r) => ({
      title: r.title,
      passed: r.passed,
      avgLatency: r.avgLatency,
      p99Latency: r.p99Latency,
    })),
    summary: {
      total: results.length,
      passed,
      failed,
    },
  };

  // 保存报告
  const fs = require('fs');
  const reportPath = `./test/performance/load-test-report-${Date.now()}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 报告已保存: ${reportPath}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
