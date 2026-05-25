/**
 * load-secrets.js — 从 secrets.env 加载密钥到 process.env
 * 用法: 在脚本顶部 require('./load-secrets')
 * 
 * 不依赖 dotenv，纯 Node.js fs 读取
 * 如果 secrets.env 不存在，会打印错误并退出
 */
const fs = require('fs');
const path = require('path');

function loadSecrets() {
  const envPath = path.join(__dirname, 'secrets.env');
  if (!fs.existsSync(envPath)) {
    console.error('❌ secrets.env not found at', envPath);
    console.error('   Run: cp secrets.env.example secrets.env');
    console.error('   Then fill in the actual values.');
    process.exit(1);
  }
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
    // 不覆盖已有的环境变量（允许通过系统环境变量覆盖）
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadSecrets();
