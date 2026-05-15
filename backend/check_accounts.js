var p = new (require("@prisma/client").PrismaClient)();
p.account.findMany({select:{id:true,platform:true,nickname:true,cookies:true,followers:true},take:15})
  .then(function(r) {
    r.forEach(function(a) {
      console.log(a.id.substring(0,12), a.platform, a.cookies?'COOKIE':'no   ', a.nickname, a.followers);
    });
    return p.account.count();
  })
  .then(function(c) { console.log("total:", c); return p.account.count({where:{cookies:{not:null}}}); })
  .then(function(c) { console.log("with cookies:", c); return p.$disconnect(); })
  .catch(function(e) { console.log(e.message); });
