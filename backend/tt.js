var p=new(require("@prisma/client").PrismaClient)();
p.account.findFirst({select:{id:true,nickname:true,platform:true,followers:true}}).then(function(a){
 var aid=a.id; var m={followers:56789,views:999999,likes:88888,comments:7777,shares:666};
 console.log("BEFORE:",a.nickname,a.platform,"fans:",a.followers);
 var d=new Date();d.setHours(0,0,0,0);
 return p.dailyStats.upsert({where:{accountId_date:{accountId:aid,date:d}},
  create:{accountId:aid,platform:a.platform,date:d,followers:m.followers,views:m.views,likes:m.likes,comments:m.comments,shares:m.shares},
  update:{followers:m.followers,views:m.views,likes:m.likes,comments:m.comments,shares:m.shares}}).then(function(){
   return p.account.update({where:{id:aid},data:{followers:m.followers}});
  }).then(function(u){return p.dailyStats.count().then(function(c){console.log("AFTER: fans=",u.followers,"DailyStats=",c)})});
}).catch(function(e){console.log("ERR:",e.message)}).then(function(){return p.$disconnect()});