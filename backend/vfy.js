var p=new(require("@prisma/client").PrismaClient)();
p.account.findMany({select:{nickname:true,platform:true,followers:true},take:3,orderBy:{followers:"desc"}}).then(function(r){
 r.forEach(function(a){console.log(a.platform,a.nickname,a.followers)});
 return p.dailyStats.count();
}).then(function(c){console.log("DailyStats:",c);return p.$disconnect()})
.catch(function(e){console.log("ERR:",e.message)});