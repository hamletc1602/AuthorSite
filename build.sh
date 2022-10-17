#!/bin/bash
wdir=$(pwd)

# Initial build machine setup:
# npm i handlebars -g

echo clean old target files
rm -rf target/AutoSite/provision/*
rm -rf target/AutoSite/builders/*

echo package admin worker lambda
cd admin
npm i >/dev/null
npm run pack >/dev/null
mv autosite-admin.zip $wdir/target/AutoSite/provision
cd $wdir

echo package provisioner plugin lambda
cd provisioner
npm i >/dev/null
npm run pack >/dev/null
mv autosite-provisioner.zip $wdir/target/AutoSite/provision
cd $wdir

echo Package edge lambdas
cd edge
zip -qr $wdir/target/AutoSite/provision/lambda.zip *
cd $wdir

echo package site generator lambda
cd generators/authorsite
npm i >/dev/null
npm run pack >/dev/null
mv authorsite.zip $wdir/target/AutoSite/builders
cd $wdir

echo Compile UI templates into admin UI source
handlebars static/admin/templates/desktop/admin.handlebars -f static/adminui/desktop/admin/admin.handlebars.js
#handlebars static/admin/templates/mobile/admin.handlebars -f static/adminui/mobile/admin/admin.handlebars.js

echo Package admin UI files
cd static/adminui
zip -qr $wdir/target/AutoSite/provision/adminui.zip *
cd $wdir

echo Copy CFN provisioning template
cp AuthorSite.template target/AutoSite
