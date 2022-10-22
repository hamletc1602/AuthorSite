#!/bin/bash
wdir=$(pwd)

# Initial build machine setup:
# npm i handlebars -g

echo clean old target and temp files
rm -rf target/AutoSite/lambdas/*

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
zip -qr $wdir/target/AutoSite/lambdas/edge.zip *
cd $wdir

echo package site generator lambda
cd generators/authorsite
rm -rf node_modules
rm -f authorsite.zip
npm run install-for-aws >/dev/null
zip -qr $wdir/target/AutoSite/lambdas/authorsite.zip * -x "node_modules/*"
cd $wdir

echo Compile UI templates into admin UI source
handlebars static/admin/templates/desktop/admin.handlebars -f static/adminui/desktop/admin/admin.handlebars.js
#handlebars static/admin/templates/mobile/admin.handlebars -f static/adminui/mobile/admin/admin.handlebars.js

echo Package admin UI files
rm -f target/AutoSite/provision/adminui.zip
cd static/adminui
zip -qr $wdir/target/AutoSite/provision/adminui.zip *
cd $wdir

echo Copy CFN provisioning template
cp AuthorSite.template target/AutoSite
