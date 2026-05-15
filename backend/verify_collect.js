var pc = new (require("@prisma/client").PrismaClient)();
async function check() {
  var stats = await pc.dailyStats.count();
  var accts = await pc.account.findMany({select:{id:true,nickname:true,followers:true},take:5,orderBy:{followers:"desc"}});
  console.log("DailyStats rows:", stats);
  accts.forEach(function(a) { console.log(a.id.substring(0,12), a.nickname, "followers:", a.followers); });
  await pc.$disconnect();
}
check().catch(function(e) { console.log(e.message); });
