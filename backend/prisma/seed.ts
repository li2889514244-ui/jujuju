import { PrismaClient, PlatformEnum } from '@prisma/client';

const prisma = new PrismaClient();

function seedRandom(seed: string, offset: number): number {
  let hash = 0;
  const str = seed + offset.toString();
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  const r = Math.sin(hash * 9301 + 49297) * 233280;
  return r - Math.floor(r);
}

function normalRandom(seed: string, offset: number, mean: number, stddev: number): number {
  const u1 = seedRandom(seed, offset);
  const u2 = seedRandom(seed, offset + 10000);
  const z = Math.sqrt(-2 * Math.log(Math.max(u1, 0.0001))) * Math.cos(2 * Math.PI * u2);
  return Math.max(0, Math.round(mean + z * stddev));
}

async function main() {
  console.log('🌱 Seeding analytics data...');

  const users = await prisma.user.findMany({
    include: {
      accounts: {
        include: {
          posts: {
            where: { status: { in: ['PUBLISHED', 'PUBLISHING'] } },
            include: { stats: true },
          },
        },
      },
    },
  });

  if (users.length === 0) {
    console.log('No users found — skipping seed.');
    return;
  }

  const now = new Date();
  const platforms = Object.values(PlatformEnum);

  for (const user of users) {
    if (user.accounts.length === 0) {
      console.log(`User ${user.email}: no accounts, skipping.`);
      continue;
    }

    // ---- DailyStats for each account, last 90 days ----
    for (const account of user.accounts) {
      const existingDaily = await prisma.dailyStats.count({
        where: { accountId: account.id },
      });
      if (existingDaily > 0) {
        console.log(`  Account ${account.nickname}: ${existingDaily} daily stats exist, skipping.`);
        continue;
      }

      const platformIdx = platforms.indexOf(account.platform);
      const baseFollowers = 500 + platformIdx * 300 + seedRandom(account.id, 0) * 2000;
      const dailyGrowthMean = 3 + platformIdx * 2;
      const baseViews = 200 + platformIdx * 150 + seedRandom(account.id, 1) * 800;

      const dailyStatsData: any[] = [];
      for (let d = 90; d >= 0; d--) {
        const date = new Date(now);
        date.setDate(date.getDate() - d);
        date.setHours(0, 0, 0, 0);

        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const dayFactor = isWeekend ? 1.3 : 1.0;

        const dayGrowth = normalRandom(account.id, d, dailyGrowthMean, dailyGrowthMean * 0.5);
        const followers = Math.round(baseFollowers + (90 - d) * dayGrowth);
        const views = Math.round(baseViews * dayFactor * (0.5 + seedRandom(account.id, d + 500) * 1.0));
        const likes = Math.round(views * (0.02 + seedRandom(account.id, d + 1000) * 0.04));
        const comments = Math.round(views * (0.002 + seedRandom(account.id, d + 1500) * 0.006));
        const shares = Math.round(views * (0.005 + seedRandom(account.id, d + 2000) * 0.015));

        dailyStatsData.push({
          accountId: account.id,
          date,
          platform: account.platform,
          followers,
          views,
          likes,
          comments,
          shares,
        });
      }

      await prisma.dailyStats.createMany({ data: dailyStatsData });
      console.log(`  ✅ ${account.nickname}: ${dailyStatsData.length} days of daily stats generated`);
    }

    // ---- PostStats for each published post ----
    let postCount = 0;
    for (const account of user.accounts) {
      for (const post of account.posts) {
        if (post.stats) {
          continue; // already has stats
        }

        const views = normalRandom(post.id, 0, 1500, 1200);
        const likes = normalRandom(post.id, 1, views * 0.035, views * 0.015);
        const comments = normalRandom(post.id, 2, views * 0.004, views * 0.002);
        const shares = normalRandom(post.id, 3, views * 0.008, views * 0.005);
        const saves = normalRandom(post.id, 4, views * 0.015, views * 0.01);

        await prisma.postStats.create({
          data: {
            postId: post.id,
            views: Math.max(0, views),
            likes: Math.max(0, likes),
            comments: Math.max(0, comments),
            shares: Math.max(0, shares),
            saves: Math.max(0, saves),
          },
        });
        postCount++;
      }
    }
    console.log(`  ✅ User ${user.email}: ${postCount} post stats generated`);
  }

  console.log('🎉 Seed complete.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
