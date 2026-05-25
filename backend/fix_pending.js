var fs = require('fs');

// 1. Remove getPendingPublish from content controller (both method and decorator)
var ctrl = fs.readFileSync('/opt/matrixflow/backend/dist/modules/content/content.controller.js', 'utf8');

// Remove the method definition
ctrl = ctrl.replace(/\n    async getPendingPublish\(userId\) \{\n        return this\.contentService\.getPendingPublish\(userId\);\n    \}\n/g, '\n');
// Also try alternate pattern
ctrl = ctrl.replace(/    async getPendingPublish\(userId\) \{\s*return this\.contentService\.getPendingPublish\(userId\);\s*\}/g, '');

// Remove the decorator block
var decoStart = ctrl.indexOf("__decorate([\n    (0, common_1.Get)('pending-publish')");
if (decoStart > 0) {
    var decoEnd = ctrl.indexOf('], ContentController.prototype, "getPendingPublish", null);', decoStart);
    if (decoEnd > 0) {
        decoEnd = decoEnd + '], ContentController.prototype, "getPendingPublish", null);'.length + 1;
        ctrl = ctrl.substring(0, decoStart) + ctrl.substring(decoEnd);
        console.log('Removed decorator block');
    }
}

// Clean up double newlines
ctrl = ctrl.replace(/\n\n\n+/g, '\n\n');
fs.writeFileSync('/opt/matrixflow/backend/dist/modules/content/content.controller.js', ctrl);
console.log('Controller cleaned');

// 2. Add standalone route in main.js with manual JWT verification
var main = fs.readFileSync('/opt/matrixflow/backend/dist/main.js', 'utf8');

var pendingRoute = '\n' +
'  // Desktop companion: poll for pending publish tasks\n' +
'  app.get(\"/api/v1/content/pending-publish\", (req, res, next) => {\n' +
'    try {\n' +
'      var jwt = require(\"jsonwebtoken\");\n' +
'      var authHeader = req.headers.authorization;\n' +
'      if (!authHeader || !authHeader.startsWith(\"Bearer \")) {\n' +
'        return res.status(401).json({ code: 401, message: \"Unauthorized\" });\n' +
'      }\n' +
'      var token = authHeader.split(\" \")[1];\n' +
'      var secret = process.env.JWT_SECRET || \"97c8b81752478a5567e8383274541183689a3baca2bc11947ba7a7ed9dc30117ef44002f6e0ce856ddf6da652110e3049210dad8f9f9f9a099831225b01a0fa9\";\n' +
'      var decoded = jwt.verify(token, secret);\n' +
'      var userId = decoded.sub || decoded.id;\n' +
'      if (!userId) return res.status(401).json({ code: 401, message: \"Invalid token\" });\n' +
'      req.userId = userId;\n' +
'      next();\n' +
'    } catch(e) {\n' +
'      return res.status(401).json({ code: 401, message: \"Invalid token\" });\n' +
'    }\n' +
'  }, async (req, res) => {\n' +
'    try {\n' +
'      var _a = require(\"@prisma/client\");\n' +
'      var prisma = new _a.PrismaClient();\n' +
'      var posts = await prisma.post.findMany({\n' +
'        where: { status: \"PUBLISHING\", account: { userId: req.userId } },\n' +
'        include: { account: { select: { id: true, platform: true, nickname: true, platformUserId: true } } },\n' +
'        orderBy: { createdAt: \"asc\" },\n' +
'        take: 10\n' +
'      });\n' +
'      await prisma.$disconnect();\n' +
'      res.json({ code: 0, message: \"success\", data: { posts: posts, total: posts.length } });\n' +
'    } catch(e) {\n' +
'      res.status(500).json({ code: 500, message: e.message });\n' +
'    }\n' +
'  });\n';

// Insert BEFORE the upload route
var uploadMarker = "app.post('/api/v1/content/upload'";
main = main.replace(uploadMarker, pendingRoute + '\n  ' + uploadMarker);
fs.writeFileSync('/opt/matrixflow/backend/dist/main.js', main);
console.log('Added pending-publish route');
console.log('Done');
