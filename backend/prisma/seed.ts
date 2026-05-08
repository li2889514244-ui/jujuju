/**
 * 数据库种子脚本
 * #14 修复: 重写以对齐 schema.prisma（User/Account/Post/PostStats/DailyStats/AuditLog/Organization/Team）
 */

import { PrismaClient, Platform, Role, PostStatus, Plan } from "@prisma/client";
import { randomBytes, scryptSync } from "crypto";

const prisma = new PrismaClient();

// ============================================================
// 加密工具
// ============================================================
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

// ============================================================
// Seed Data
// ============================================================

async function seedOrganization() {
  console.log("🌱 Seeding organization...");
  const org = await prisma.organization.upsert({
    where: { id: "org-default" },
    update: {},
    create: {
      id: "org-default",
      name: "MatrixFlow 默认组织",
      plan: Plan.PRO,
    },
  });
  console.log(`  ✅ Organization seeded: ${org.name}`);
  return org;
}

async function seedUsers(orgId: string) {
  console.log("🌱 Seeding users...");
  const users = [
    {
      email: "admin@matrixflow.app",
      password: hashPassword("Admin@2024!"),
      name: "管理员",
      role: Role.OWNER,
      phone: "13800000001",
      organizationId: orgId,
    },
    {
      email: "zhangsan@matrixflow.app",
      password: hashPassword("User@2024!"),
      name: "张三",
      role: Role.MANAGER,
      phone: "13800000002",
      organizationId: orgId,
    },
    {
      email: "lisi@matrixflow.app",
      password: hashPassword("User@2024!"),
      name: "李四",
      role: Role.MEMBER,
      phone: "13800000003",
      organizationId: orgId,
    },
  ];

  const createdUsers = [];
  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: u,
    });
    createdUsers.push(user);
  }
  console.log(`  ✅ ${users.length} users seeded`);
  return createdUsers;
}

async function seedTeams(orgId: string) {
  console.log("🌱 Seeding teams...");
  const team = await prisma.team.upsert({
    where: { id: "team-default" },
    update: {},
    create: {
      id: "team-default",
      name: "MatrixFlow 默认团队",
      organizationId: orgId,
    },
  });
  console.log(`  ✅ Team seeded: ${team.name}`);
  return team;
}

async function seedAccounts(users: { id: string }[], teamId: string) {
  console.log("🌱 Seeding demo accounts...");
  const demoAccounts = [
    {
      userId: users[0].id,
      teamId,
      platform: Platform.DOUYIN,
      platformUserId: "admin_douyin_001",
      nickname: "管理员抖音号",
    },
    {
      userId: users[0].id,
      teamId,
      platform: Platform.KUAISHOU,
      platformUserId: "admin_kuaishou_001",
      nickname: "管理员快手号",
    },
    {
      userId: users[1].id,
      teamId,
      platform: Platform.DOUYIN,
      platformUserId: "zhangsan_douyin_001",
      nickname: "张三抖音号",
    },
    {
      userId: users[1].id,
      teamId,
      platform: Platform.XIAOHONGSHU,
      platformUserId: "zhangsan_xhs_001",
      nickname: "张三小红书",
    },
    {
      userId: users[2].id,
      teamId,
      platform: Platform.WECHAT_VIDEO,
      platformUserId: "lisi_weixin_001",
      nickname: "李四视频号",
    },
  ];

  const createdAccounts = [];
  for (const acct of demoAccounts) {
    const account = await prisma.account.upsert({
      where: {
        platform_platformUserId: {
          platform: acct.platform,
          platformUserId: acct.platformUserId,
        },
      },
      update: {},
      create: {
        userId: acct.userId,
        teamId: acct.teamId,
        platform: acct.platform,
        platformUserId: acct.platformUserId,
        nickname: acct.nickname,
      },
    });
    createdAccounts.push(account);
  }
  console.log(`  ✅ ${demoAccounts.length} demo accounts seeded`);
  return createdAccounts;
}

async function seedPosts(accounts: { id: string }[]) {
  console.log("🌱 Seeding demo posts...");
  const posts = [
    {
      accountId: accounts[0].id,
      title: "如何用AI提升短视频创作效率",
      content: "本视频介绍了使用AI工具辅助短视频创作的5个实用技巧",
      tags: ["AI", "短视频", "效率"],
      status: PostStatus.PUBLISHED,
    },
    {
      accountId: accounts[1].id,
      title: "矩阵运营入门指南",
      content: "从0到1搭建你的多平台矩阵运营体系",
      tags: ["矩阵运营", "教程", "入门"],
      status: PostStatus.SCHEDULED,
      publishAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
    {
      accountId: accounts[2].id,
      title: "一周涨粉10万的秘密",
      content: "分享个人账号快速增长的实战经验",
      tags: ["涨粉", "运营", "实战"],
      status: PostStatus.DRAFT,
    },
  ];

  const createdPosts = [];
  for (const p of posts) {
    const post = await prisma.post.create({ data: p });
    createdPosts.push(post);
  }
  console.log(`  ✅ ${posts.length} demo posts seeded`);
  return createdPosts;
}

async function seedPostStats(posts: { id: string }[]) {
  console.log("🌱 Seeding post stats...");
  for (const post of posts) {
    await prisma.postStats.create({
      data: {
        postId: post.id,
        views: Math.floor(Math.random() * 10000),
        likes: Math.floor(Math.random() * 1000),
        comments: Math.floor(Math.random() * 200),
        shares: Math.floor(Math.random() * 100),
        saves: Math.floor(Math.random() * 50),
      },
    });
  }
  console.log(`  ✅ ${posts.length} post stats seeded`);
}

async function seedDailyStats(accounts: { id: string; platform: Platform }[]) {
  console.log("🌱 Seeding daily stats...");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const account of accounts) {
    // 最近 7 天的数据
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);

      await prisma.dailyStats.upsert({
        where: {
          accountId_date: {
            accountId: account.id,
            date,
          },
        },
        update: {},
        create: {
          accountId: account.id,
          date,
          platform: account.platform,
          followers: 1000 + Math.floor(Math.random() * 5000),
          views: Math.floor(Math.random() * 50000),
          likes: Math.floor(Math.random() * 5000),
          comments: Math.floor(Math.random() * 1000),
          shares: Math.floor(Math.random() * 500),
        },
      });
    }
  }
  console.log(`  ✅ Daily stats seeded for ${accounts.length} accounts × 7 days`);
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log("🚀 Starting MatrixFlow ERP database seed...\n");

  const org = await seedOrganization();
  const users = await seedUsers(org.id);
  const team = await seedTeams(org.id);
  const accounts = await seedAccounts(users, team.id);
  const posts = await seedPosts(accounts);
  await seedPostStats(posts);
  await seedDailyStats(accounts);

  console.log("\n🎉 Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
