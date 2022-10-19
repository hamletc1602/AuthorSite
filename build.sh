#!/bin/bash
wdir=$(pwd)

# Initial build machine setup:
# npm i handlebars -g

echo clean old target and temp files
rm -rf target/AutoSite/provision/*
rm -rf target/AutoSite/builders/*
rm -rf generators/authorsite/tmp/*
rm -rf **/node_modules/*

echo package admin worker lambda
cd admin
npm run install-for-aws >/dev/null
npm run pack >/dev/null
mv admin-worker.zip $wdir/target/AutoSite/provision
npm run pack-layer >/dev/null
mv layer.zip $wdir/target/AutoSite/provision/admin-worker.layer.zip
cd $wdir

echo package provisioner plugin lambda
cd provisioner
npm run install-for-aws >/dev/null
npm run pack >/dev/null
mv provisioner.zip $wdir/target/AutoSite/provision
npm run pack-layer >/dev/null
mv layer.zip $wdir/target/AutoSite/provision/provisioner.layer.zip
cd $wdir

echo Package edge lambdas
cd edge
zip -qr $wdir/target/AutoSite/provision/lambda.zip *
cd $wdir

echo package site generator lambda
cd generators/authorsite
npm run install-for-aws >/dev/null
npm run pack >/dev/null
mv authorsite.zip $wdir/target/AutoSite/builders
npm run pack-layer >/dev/null
mv layer.zip $wdir/target/AutoSite/builders/authorsite.layer.zip
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
