@echo off
echo Adding all files...
git add .
echo Committing changes...
git commit -m "Add ASCII logo to all apps, improve calendar design, fix logout, add PWA support"
echo Pushing to origin main...
git push origin main
echo Done!
pause


