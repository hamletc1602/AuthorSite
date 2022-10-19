#!/bin/bash
wdir=$(pwd)

echo clean old temp files
rm -rf target/**/*.layer.zip
rm -rf target/tmp

mkdir -p target/tmp

echo Build AuthorSite generator node_modules layer
mkdir -p target/tmp/authorsite/app
mkdir -p target/tmp/authorsite/layer
unzip -q target/AutoSite/builders/authorsite.zip -d target/tmp/authorsite/app
cd target/tmp/authorsite
mv app/node_modules layer/nodejs
cd layer
zip -qr $wdir/target/AutoSite/builders/authorsite.node_modules.layer.zip nodejs/*
cd ../app
rm -f $wdir/target/AutoSite/builders/authorsite.zip
zip -qr $wdir/target/AutoSite/builders/authorsite.zip *
cd $wdir

echo Build Admin Worker node_modules layer
mkdir -p target/tmp/admin/app
mkdir -p target/tmp/admin/layer
unzip -q target/AutoSite/provision/autosite-admin.zip -d target/tmp/admin/app
cd target/tmp/admin
mv app/node_modules layer/nodejs
cd layer
zip -qr $wdir/target/AutoSite/provision/admin_node_modules.layer.zip nodejs/*
cd ../app
rm -f $wdir/target/AutoSite/provision/autosite-admin.zip
zip -qr $wdir/target/AutoSite/provision/autosite-admin.zip *
cd $wdir

rm -rf target/tmp
