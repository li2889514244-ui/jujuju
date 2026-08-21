var p = new (require("@prisma/client").PrismaClient)();
p.user.findMany({select:{id:true,email:true,name:true,accounts:{select:{id:true}}}).then(function(users){
  users.forEach(function(u){
    if(u.accounts.length>0) console.log(u.email, u.accounts.length, "accounts");
  });
  return p.();
}).catch(function(e){console.log(e.message);});
