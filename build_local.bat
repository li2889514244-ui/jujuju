@echo off
cd /d "%~dp0"
echo Building MatrixFlow backend...
cd backend
call npm install --ignore-scripts
call npx prisma generate
call npx nest build
if exist dist\main.js (
    echo BUILD SUCCESS - dist/main.js ready
    echo Now uploading to ECS...
    scp -o StrictHostKeyChecking=no dist\main.js root@8.134.218.39:/opt/matrixflow/backend/dist/
) else (
    echo BUILD FAILED
)
pause
