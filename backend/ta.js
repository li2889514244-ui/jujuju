var p=new(require("@prisma/client").PrismaClient)();
p.account.findFirst({select:{id:true,userId:true,nickname:true,platform:true}}).then(function(a){
 console.log("Account:",a.id.substring(0,15),a.nickname,a.platform);
 console.log("Owner:",a.userId);
 return p.$disconnect();
}).catch(function(e){console.log("ERR:",e.message)});
