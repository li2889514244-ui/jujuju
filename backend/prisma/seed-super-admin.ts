/**
 * 超级管理员提升脚本
 *
 * 用法（在 backend 目录下执行）：
 *   npx ts-node prisma/seed-super-admin.ts <email>
 *
 * 示例：
 *   npx ts-node prisma/seed-super-admin.ts admin@example.com
 *
 * 会将指定邮箱的用户角色提升为 SUPER_ADMIN
 * 如果用户不存在则报错退出
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const email = process.argv[2]
  if (!email) {
    console.error('❌ 请提供要提升的邮箱地址：npx ts-node prisma/seed-super-admin.ts <email>')
    process.exit(1)
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    console.error(`❌ 未找到邮箱为 ${email} 的用户`)
    process.exit(1)
  }

  console.log(`当前角色: ${user.role}`)

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { role: 'SUPER_ADMIN' as any },
    select: { id: true, email: true, name: true, role: true },
  })

  console.log(`✅ 已将 ${updated.email} (${updated.name}) 提升为 SUPER_ADMIN`)
}

main()
  .catch((e) => {
    console.error('执行失败:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
