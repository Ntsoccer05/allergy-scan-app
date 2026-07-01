import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const total = await prisma.product.count()
  const high = await prisma.product.count({ where: { confidence: 'high' } })
  const valid = await prisma.product.count({ where: { expiresAt: { gt: new Date() } } })
  console.log(`products 総数: ${total}`)
  console.log(`confidence=high: ${high}`)
  console.log(`有効期限内: ${valid}`)
}
main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
