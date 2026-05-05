import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes, scryptSync } from "crypto";

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

async function seedPlatforms() {
  console.log("🌱 Seeding platforms...");
  const platforms = [
    { name: "douyin", displayName: "抖音", iconUrl: "/icons/douyin.svg", apiEndpoint: "https://open.douyin.com", sortOrder: 1 },
    { name: "kuaishou", displayName: "快手", iconUrl: "/icons/kuaishou.svg", apiEndpoint: "https://open.kuaishou.com", sortOrder: 2 },
    { name: "xiaohongshu", displayName: "小红书", iconUrl: "/icons/xiaohongshu.svg", apiEndpoint: "https://pro.xiaohongshu.com", sortOrder: 3 },
    { name: "weixin_channels", displayName: "视频号", iconUrl: "/icons/weixin.svg", apiEndpoint: "https://channels.weixin.qq.com", sortOrder: 4 },
    { name: "bilibili", displayName: "B站", iconUrl: "/icons/bilibili.svg", apiEndpoint: "https://member.bilibili.com", sortOrder: 5 },
    { name: "weibo", displayName: "微博", iconUrl: "/icons/weibo.svg", apiEndpoint: "https://open.weibo.com", sortOrder: 6 },
  ];

  for (const p of platforms) {
    await prisma.platform.upsert({
      where: { name: p.name },
      update: { displayName: p.displayName, iconUrl: p.iconUrl, apiEndpoint: p.apiEndpoint, sortOrder: p.sortOrder },
      create: p,
    });
  }
  console.log(`  ✅ ${platforms.length} platforms seeded`);
}

async function seedUsers() {
  console.log("🌱 Seeding users...");
  const users = [
    {
      username: "admin",
      email: "admin@matrixflow.app",
      passwordHash: hashPassword("Admin@2024!"),
      role: "OWNER" as const,
      phone: "13800000001",
    },
    {
      username: "zhangsan",
      email: "zhangsan@matrixflow.app",
      passwordHash: hashPassword("User@2024!"),
      role: "MANAGER" as const,
      phone: "13800000002",
    },
    {
      username: "lisi",
      email: "lisi@matrixflow.app",
      passwordHash: hashPassword("User@2024!"),
      role: "MEMBER" as const,
      phone: "13800000003",
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

async function seedTeams(users: Awaited<ReturnType<typeof seedUsers>>) {
  console.log("🌱 Seeding teams...");
  const team = await prisma.team.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "MatrixFlow 默认团队",
      description: "系统默认团队，用于管理所有成员和账号",
      ownerId: users[0].id,
      maxMembers: 20,
      plan: "PRO",
    },
  });

  // 添加团队成员
  const memberRoles = ["ADMIN", "MANAGER", "MEMBER"] as const;
  for (let i = 0; i < users.length; i++) {
    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: team.id, userId: users[i].id } },
      update: {},
      create: {
        teamId: team.id,
        userId: users[i].id,
        role: memberRoles[i] || "MEMBER",
        permissions: i === 0
          ? { can_publish: true, can_manage_accounts: true, can_manage_team: true, can_view_analytics: true }
          : i === 1
            ? { can_publish: true, can_manage_accounts: true, can_manage_team: false, can_view_analytics: true }
            : { can_publish: true, can_manage_accounts: false, can_manage_team: false, can_view_analytics: true },
      },
    });
  }

  console.log(`  ✅ Team and ${users.length} members seeded`);
  return team;
}

async function seedAccounts(users: Awaited<ReturnType<typeof seedUsers>>, teamId: string) {
  console.log("🌱 Seeding demo accounts...");
  const platforms = await prisma.platform.findMany();

  // 模拟加密Cookie（实际使用中由应用层AES-256-GCM加密）
  const demoCookie = JSON.stringify({ session_id: "demo", token: "demo_token" });
  const iv = randomBytes(16).toString("hex").slice(0, 32);
  const tag = randomBytes(16).toString("hex").slice(0, 32);

  const demoAccounts = [
    { userId: users[0].id, platformName: "douyin", username: "admin_douyin_001", nickname: "管理员抖音号" },
    { userId: users[0].id, platformName: "kuaishou", username: "admin_kuaishou_001", nickname: "管理员快手号" },
    { userId: users[1].id, platformName: "douyin", username: "zhangsan_douyin_001", nickname: "张三抖音号" },
    { userId: users[1].id, platformName: "xiaohongshu", username: "zhangsan_xhs_001", nickname: "张三小红书" },
    { userId: users[2].id, platformName: "weixin_channels", username: "lisi_weixin_001", nickname: "李四视频号" },
  ];

  for (const acct of demoAccounts) {
    const platform = platforms.find((p) => p.name === acct.platformName);
    if (!platform) continue;

    await prisma.account.create({
      data: {
        userId: acct.userId,
        teamId,
        platformId: platform.id,
        username: acct.username,
        nickname: acct.nickname,
        cookieData: Buffer.from(demoCookie).toString("base64"), // 演示用，实际为AES加密密文
        cookieIv: iv,
        cookieTag: tag,
        status: "ACTIVE",
      },
    });
  }

  console.log(`  ✅ ${demoAccounts.length} demo accounts seeded`);
}

async function seedContent(users: Awaited<ReturnType<typeof seedUsers>>) {
  console.log("🌱 Seeding demo content...");
  const contents = [
    {
      userId: users[0].id,
      title: "如何用AI提升短视频创作效率",
      description: "本视频介绍了使用AI工具辅助短视频创作的5个实用技巧",
      contentType: "VIDEO" as const,
      tags: ["AI", "短视频", "效率"],
      status: "PUBLISHED" as const,
    },
    {
      userId: users[1].id,
      title: "矩阵运营入门指南",
      description: "从0到1搭建你的多平台矩阵运营体系",
      contentType: "VIDEO" as const,
      tags: ["矩阵运营", "教程", "入门"],
      status: "READY" as const,
    },
    {
      userId: users[2].id,
      title: "一周涨粉10万的秘密",
      description: "分享个人账号快速增长的实战经验",
      contentType: "SHORT_VIDEO" as const,
      tags: ["涨粉", "运营", "实战"],
      status: "DRAFT" as const,
    },
  ];

  for (const c of contents) {
    await prisma.content.create({ data: c });
  }
  console.log(`  ✅ ${contents.length} demo contents seeded`);
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log("🚀 Starting MATRIXFLOW ERP database seed...\n");

  await seedPlatforms();
  const users = await seedUsers();
  const team = await seedTeams(users);
  await seedAccounts(users, team.id);
  await seedContent(users);

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
