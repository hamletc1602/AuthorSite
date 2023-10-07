#!/bin/bash
wdir=$(pwd)

# Initial build machine setup:
# npm i handlebars -g

echo clean old target and temp files
rm -rf target/AutoSite/lambdas/*

# Clean DS_Store files
find . -name '.DS_Store' -type f -delete

echo package admin worker lambda
cd admin
rm -rf node_modules
rm -f admin-worker.zip
npm run install-for-aws >/dev/null
zip -qr $wdir/target/AutoSite/lambdas/admin-worker.zip * -x "node_modules/*"
cd $wdir

echo package provisioner plugin lambda
cd provisioner
rm -rf node_modules
rm -f provisioner.zip
npm run install-for-aws >/dev/null
zip -qr $wdir/target/AutoSite/lambdas/provisioner.zip * -x "node_modules/*"
cd $wdir

echo Package edge lambdas
cd edge
rm -rf node_modules
rm -f edge.zip
npm run install-for-aws >/dev/null
npm run pack
mv edge.zip $wdir/target/AutoSite/lambdas/
cd $wdir

echo package site generator lambda
cd generators/authorsite
rm -rf node_modules
rm -f authorsite.zip
npm run install-for-aws >/dev/null
zip -qr $wdir/target/AutoSite/lambdas/authorsite.zip * -x "node_modules/*"
cd $wdir

echo Build and Package admin UI files
rm -f target/AutoSite/provision/adminui.zip
cd adminUi
npm run build
cd build
zip -qr $wdir/target/AutoSite/provision/adminui.zip *
cd $wdir
