require('./load-secrets');
const Core = require('@alicloud/pop-core');
const client = new Core({
  accessKeyId: process.env.ALI_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALI_ACCESS_KEY_SECRET,
  endpoint: 'https://ecs.cn-guangzhou.aliyuncs.com',
  apiVersion: '2014-05-26',
});

async function run(script) {
  const b64 = Buffer.from(script).toString('base64');
  if (b64.length > 24000) throw new Error('Script too big: ' + b64.length);
  const c = await client.request('CreateCommand', {
    RegionId: process.env.ALI_REGION || 'cn-guangzhou', Name: 'dc-' + Date.now(),
    Type: 'RunShellScript', CommandContent: b64, ContentEncoding: 'Base64', Timeout: '120',
  });
  const inv = await client.request('InvokeCommand', {
    RegionId: process.env.ALI_REGION || 'cn-guangzhou', CommandId: c.CommandId,
    'InstanceId.1': process.env.ECS_INSTANCE_ID, Timed: false,
  });
  await new Promise(r => setTimeout(r, 15000));
  const res = await client.request('DescribeInvocationResults', {
    RegionId: process.env.ALI_REGION || 'cn-guangzhou', InvokeId: inv.InvokeId,
  });
  const o = res.Invocation?.InvocationResults?.InvocationResult?.[0];
  console.log(o?.InvocationStatus, 'Exit:', o?.ExitCode);
  if (o?.Output) console.log(Buffer.from(o.Output, 'base64').toString());
  return o?.ExitCode === '0';
}

(async () => {
  // Step 1: Update controller.ts - replace import line and add route
  console.log('=== Step 1: Update controller ===');
  const ok1 = await run(`#!/bin/bash
cd /opt/matrixflow
# Fix imports - add Post, Body, BadRequestException
sed -i 's/import {/import {\\n  Post,\\n  Body,/' backend/src/modules/analytics/analytics.controller.ts
sed -i 's/ForbiddenException,/ForbiddenException,\\n  BadRequestException,/' backend/src/modules/analytics/analytics.controller.ts
# Add route before @Get('views-ranking')
sed -i '/@Get..views-ranking./i\\
  @Post('\\''monetization/manual'\\'')\\
  async createManualMonetization(\\
    @CurrentUser('\\''id'\\'') userId: string,\\
    @Body() dto: any,\\
  ) {\\
    if (!dto.date || !dto.platform) throw new BadRequestException('\\''date and platform required'\\'');\\
    return this.analyticsService.createManualMonetization(userId, dto);\\
  }\\
' backend/src/modules/analytics/analytics.controller.ts
echo "Controller updated"
`);

  // Step 2: Update service.ts - add methods after constructor
  console.log('=== Step 2: Update service ===');
  const ok2 = await run(`#!/bin/bash
cd /opt/matrixflow
# Add getFollowersTrend + createManualMonetization after constructor line
sed -i '/constructor(private prisma: PrismaService) {}/a\\
\\
  async getFollowersTrend(userId: string, days: number = 7) {\\
    const startDate = new Date();\\
    startDate.setDate(startDate.getDate() - days);\\
    startDate.setHours(0, 0, 0, 0);\\
    const accounts = await this.prisma.account.findMany({ where: { userId }, select: { id: true } });\\
    const accountIds = accounts.map((a) => a.id);\\
    const stats = await this.prisma.dailyStats.findMany({ where: { accountId: { in: accountIds }, date: { gte: startDate } }, select: { date: true, followers: true }, orderBy: { date: '\\''asc'\\'' } });\\
    const byDate = {};\\
    for (const s of stats) { const key = s.date.toISOString().slice(0, 10); byDate[key] = (byDate[key] || 0) + s.followers; }\\
    const result = [];\\
    for (let i = days - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const key = d.toISOString().slice(0, 10); result.push({ value: byDate[key] || 0 }); }\\
    return result;\\
  }\\
\\
  async createManualMonetization(userId: string, dto: any) {\\
    const account = await this.prisma.account.findFirst({ where: { userId, platform: dto.platform }, select: { id: true } });\\
    if (!account) throw new Error('\\''no account for platform'\\'');\\
    const date = new Date(dto.date); date.setHours(0, 0, 0, 0);\\
    const data: any = {};\\
    if (dto.revenue !== undefined) data.revenue = dto.revenue;\\
    if (dto.gmv !== undefined) data.gmv = dto.gmv;\\
    if (dto.orders !== undefined) data.orders = dto.orders;\\
    if (dto.buyerCount !== undefined) data.buyerCount = dto.buyerCount;\\
    if (dto.commission !== undefined) data.commission = dto.commission;\\
    return this.prisma.dailyStats.upsert({ where: { accountId_date: { accountId: account.id, date } }, create: { accountId: account.id, date, platform: dto.platform, ...data }, update: data });\\
  }\\
' backend/src/modules/analytics/analytics.service.ts
echo "Service updated"
`);

  // Step 3: Build + restart
  console.log('=== Step 3: Build + restart ===');
  const ok3 = await run(`#!/bin/bash
cd /opt/matrixflow/backend && npm run build 2>&1 | tail -5
echo "BUILD_DONE"
pm2 restart matrixflow
sleep 2
curl -s -o /dev/null -w "Health:%{http_code}" http://localhost:3001/api/v1/health
echo ""
curl -s -o /dev/null -w "Monetization:%{http_code}" -X POST -H "Content-Type:application/json" -d '{"date":"2026-05-25","platform":"douyin","revenue":100}' http://localhost:3001/api/v1/analytics/monetization/manual
echo ""
`);

  console.log('=== Done ===');
})();
