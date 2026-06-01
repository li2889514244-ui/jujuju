/**
 * 测试数据 Fixtures
 * 提供标准化的测试数据，用于各测试用例
 */

import { Platform, Role, PostStatus, AccountStatus } from '@prisma/client';

// ==================== 用户 Fixtures ====================

export const mockUsers = {
  /** 普通用户 */
  regular: {
    id: 'user-001',
    email: 'test@example.com',
    password: '$2a$10$hashedpassword', // bcrypt hashed
    name: '测试用户',
    phone: '13800138000',
    role: Role.MEMBER,
    status: 'ACTIVE',
    organizationId: 'org-001',
    avatar: null,
    lastLoginAt: new Date('2024-01-15T10:00:00Z'),
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
  },

  /** 管理员用户 */
  admin: {
    id: 'user-002',
    email: 'admin@example.com',
    password: '$2a$10$hashedpassword',
    name: '管理员',
    phone: '13800138001',
    role: Role.ADMIN,
    status: 'ACTIVE',
    organizationId: 'org-001',
    avatar: null,
    lastLoginAt: new Date('2024-01-15T10:00:00Z'),
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
  },

  /** 组织所有者 */
  owner: {
    id: 'user-003',
    email: 'owner@example.com',
    password: '$2a$10$hashedpassword',
    name: '组织所有者',
    phone: '13800138002',
    role: Role.OWNER,
    status: 'ACTIVE',
    organizationId: 'org-001',
    avatar: null,
    lastLoginAt: new Date('2024-01-15T10:00:00Z'),
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
  },

  /** 被禁用的用户 */
  suspended: {
    id: 'user-004',
    email: 'suspended@example.com',
    password: '$2a$10$hashedpassword',
    name: '被禁用用户',
    phone: '13800138003',
    role: Role.MEMBER,
    status: 'SUSPENDED',
    organizationId: null,
    avatar: null,
    lastLoginAt: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
  },

  /** 无组织的用户 */
  noOrg: {
    id: 'user-005',
    email: 'noorg@example.com',
    password: '$2a$10$hashedpassword',
    name: '无组织用户',
    phone: '13800138004',
    role: Role.MEMBER,
    status: 'ACTIVE',
    organizationId: null,
    avatar: null,
    lastLoginAt: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  },
};

// ==================== 组织 Fixtures ====================

export const mockOrganizations = {
  free: {
    id: 'org-001',
    name: '测试组织',
    plan: 'FREE' as const,
    status: 'ACTIVE' as const,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  },
  pro: {
    id: 'org-002',
    name: '专业组织',
    plan: 'PRO' as const,
    status: 'ACTIVE' as const,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  },
};

// ==================== 团队 Fixtures ====================

export const mockTeams = {
  teamA: {
    id: 'team-001',
    name: '运营一组',
    organizationId: 'org-001',
    organization: mockOrganizations.free,
    accounts: [],
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  },
  teamB: {
    id: 'team-002',
    name: '运营二组',
    organizationId: 'org-001',
    organization: mockOrganizations.free,
    accounts: [],
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  },
};

// ==================== 账号 Fixtures ====================

export const mockAccounts = {
  douyin: {
    id: 'acc-001',
    platform: Platform.DOUYIN,
    platformUserId: 'dy_user_001',
    nickname: '抖音测试号',
    avatar: 'https://example.com/avatar.jpg',
    bio: '这是一个测试账号',
    followers: 10000,
    following: 500,
    status: AccountStatus.ACTIVE,
    cookies: 'encrypted_cookie_data_here',
    proxyConfig: null,
    metadata: null,
    lastActiveAt: new Date('2024-01-15T10:00:00Z'),
    userId: 'user-001',
    teamId: 'team-001',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
  },
  xiaohongshu: {
    id: 'acc-002',
    platform: Platform.XIAOHONGSHU,
    platformUserId: 'xhs_user_001',
    nickname: '小红书测试号',
    avatar: 'https://example.com/avatar2.jpg',
    bio: '小红书测试简介',
    followers: 5000,
    following: 200,
    status: AccountStatus.ACTIVE,
    cookies: null,
    proxyConfig: null,
    metadata: null,
    lastActiveAt: null,
    userId: 'user-001',
    teamId: 'team-001',
    createdAt: new Date('2024-01-02T00:00:00Z'),
    updatedAt: new Date('2024-01-02T00:00:00Z'),
  },
  banned: {
    id: 'acc-003',
    platform: Platform.DOUYIN,
    platformUserId: 'dy_user_002',
    nickname: '被封禁账号',
    avatar: null,
    bio: null,
    followers: 0,
    following: 0,
    status: AccountStatus.DISABLED,
    cookies: null,
    proxyConfig: null,
    metadata: null,
    lastActiveAt: null,
    userId: 'user-001',
    teamId: null,
    createdAt: new Date('2024-01-03T00:00:00Z'),
    updatedAt: new Date('2024-01-03T00:00:00Z'),
  },
};

// ==================== 内容 Fixtures ====================

export const mockPosts = {
  draft: {
    id: 'post-001',
    title: '测试草稿',
    content: '这是一篇测试草稿内容',
    mediaUrls: ['https://example.com/video1.mp4'],
    tags: ['测试', '草稿'],
    publishAt: null,
    status: PostStatus.DRAFT,
    platformUrl: null,
    errorMsg: null,
    metadata: null,
    accountId: 'acc-001',
    account: {
      id: 'acc-001',
      platform: Platform.DOUYIN,
      nickname: '抖音测试号',
      userId: 'user-001',
    },
    stats: null,
    createdAt: new Date('2024-01-10T00:00:00Z'),
    updatedAt: new Date('2024-01-10T00:00:00Z'),
  },
  scheduled: {
    id: 'post-002',
    title: '定时发布内容',
    content: '这是一篇定时发布的内容',
    mediaUrls: null,
    tags: ['定时'],
    publishAt: new Date('2024-12-31T12:00:00Z'),
    status: PostStatus.SCHEDULED,
    platformUrl: null,
    errorMsg: null,
    metadata: null,
    accountId: 'acc-001',
    account: {
      id: 'acc-001',
      platform: Platform.DOUYIN,
      nickname: '抖音测试号',
      userId: 'user-001',
    },
    stats: null,
    createdAt: new Date('2024-01-11T00:00:00Z'),
    updatedAt: new Date('2024-01-11T00:00:00Z'),
  },
  published: {
    id: 'post-003',
    title: '已发布内容',
    content: '这是一篇已发布的内容',
    mediaUrls: ['https://example.com/video2.mp4'],
    tags: ['已发布'],
    publishAt: new Date('2024-01-12T12:00:00Z'),
    status: PostStatus.PUBLISHED,
    platformUrl: 'https://douyin.com/video/mock-id',
    errorMsg: null,
    metadata: null,
    accountId: 'acc-001',
    account: {
      id: 'acc-001',
      platform: Platform.DOUYIN,
      nickname: '抖音测试号',
      userId: 'user-001',
    },
    stats: {
      id: 'stats-001',
      views: 1000,
      likes: 100,
      comments: 50,
      shares: 20,
      saves: 10,
      collectedAt: new Date('2024-01-13T00:00:00Z'),
      postId: 'post-003',
    },
    createdAt: new Date('2024-01-12T00:00:00Z'),
    updatedAt: new Date('2024-01-12T12:00:00Z'),
  },
  failed: {
    id: 'post-004',
    title: '发布失败内容',
    content: '这是一篇发布失败的内容',
    mediaUrls: null,
    tags: [],
    publishAt: new Date('2024-01-13T12:00:00Z'),
    status: PostStatus.FAILED,
    platformUrl: null,
    errorMsg: 'Cookie已过期，请重新登录',
    metadata: null,
    accountId: 'acc-001',
    account: {
      id: 'acc-001',
      platform: Platform.DOUYIN,
      nickname: '抖音测试号',
      userId: 'user-001',
    },
    stats: null,
    createdAt: new Date('2024-01-13T00:00:00Z'),
    updatedAt: new Date('2024-01-13T12:00:00Z'),
  },
  publishing: {
    id: 'post-005',
    title: '发布中内容',
    content: '正在发布中',
    mediaUrls: null,
    tags: [],
    publishAt: new Date('2024-01-14T12:00:00Z'),
    status: PostStatus.PUBLISHING,
    platformUrl: null,
    errorMsg: null,
    metadata: null,
    accountId: 'acc-001',
    account: {
      id: 'acc-001',
      platform: Platform.DOUYIN,
      nickname: '抖音测试号',
      userId: 'user-001',
    },
    stats: null,
    createdAt: new Date('2024-01-14T00:00:00Z'),
    updatedAt: new Date('2024-01-14T12:00:00Z'),
  },
};

// ==================== 统计 Fixtures ====================

export const mockStats = {
  dailyStats: [
    {
      id: 'ds-001',
      date: new Date('2024-01-10'),
      platform: Platform.DOUYIN,
      followers: 9800,
      views: 5000,
      likes: 300,
      comments: 100,
      shares: 50,
      accountId: 'acc-001',
      account: { id: 'acc-001', platform: Platform.DOUYIN, nickname: '抖音测试号' },
      createdAt: new Date('2024-01-10'),
    },
    {
      id: 'ds-002',
      date: new Date('2024-01-11'),
      platform: Platform.DOUYIN,
      followers: 9900,
      views: 6000,
      likes: 350,
      comments: 120,
      shares: 60,
      accountId: 'acc-001',
      account: { id: 'acc-001', platform: Platform.DOUYIN, nickname: '抖音测试号' },
      createdAt: new Date('2024-01-11'),
    },
  ],
  postStats: [
    {
      id: 'ps-001',
      views: 1000,
      likes: 100,
      comments: 50,
      shares: 20,
      saves: 10,
      collectedAt: new Date('2024-01-13'),
      postId: 'post-003',
      post: {
        id: 'post-003',
        title: '已发布内容',
        status: PostStatus.PUBLISHED,
        platformUrl: 'https://douyin.com/video/mock-id',
        account: { id: 'acc-001', platform: Platform.DOUYIN, nickname: '抖音测试号' },
      },
    },
  ],
};

// ==================== JWT Payload Fixtures ====================

export const mockJwtPayload = {
  regular: {
    sub: 'user-001',
    email: 'test@example.com',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900, // 15分钟
  },
  admin: {
    sub: 'user-002',
    email: 'admin@example.com',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900,
  },
};
