// Patch getOverview to include DailyStats aggregation
const fs = require('fs');
const path = '/opt/matrixflow/backend/dist/modules/analytics/analytics.service.js';
let code = fs.readFileSync(path, 'utf8');

// Replace the statsAgg line to also include dailyStats aggregation
const oldLine = "const statsAgg = await this.prisma.postStats.aggregate({ where: { post: { accountId: { in: accountIds } } }, _sum: { views: true, likes: true, comments: true, shares: true, saves: true } });";

const newLine = `const [statsAgg, dailyAgg] = await Promise.all([
            this.prisma.postStats.aggregate({ where: { post: { accountId: { in: accountIds } } }, _sum: { views: true, likes: true, comments: true, shares: true, saves: true } }),
            this.prisma.dailyStats.aggregate({ where: { accountId: { in: accountIds } }, _sum: { views: true, likes: true, comments: true, shares: true } }),
        ]);`;

code = code.replace(oldLine, newLine);

// Replace the engagement calculation to merge both
const oldEngagement = "engagement: { totalViews: statsAgg._sum.views || 0, totalLikes: statsAgg._sum.likes || 0, totalComments: statsAgg._sum.comments || 0, totalShares: statsAgg._sum.shares || 0, totalSaves: statsAgg._sum.saves || 0 }";
const newEngagement = "engagement: { totalViews: (statsAgg._sum.views || 0) + (dailyAgg._sum.views || 0), totalLikes: (statsAgg._sum.likes || 0) + (dailyAgg._sum.likes || 0), totalComments: (statsAgg._sum.comments || 0) + (dailyAgg._sum.comments || 0), totalShares: (statsAgg._sum.shares || 0) + (dailyAgg._sum.shares || 0), totalSaves: statsAgg._sum.saves || 0 }";
code = code.replace(oldEngagement, newEngagement);

fs.writeFileSync(path, code);
console.log('Patched getOverview to include DailyStats');
