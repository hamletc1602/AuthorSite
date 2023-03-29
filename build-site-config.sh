#!/bin/bash
wdir=$(pwd)

# Clean DS_Store site-config dirs
find . -name '.DS_Store' -type f -delete

echo Copy Site metadata
cp site-config/metadata.json $wdir/target/AutoSite/site-config/

echo Package Default site-config

echo Publisher
root=/tmp/authorsite/template/publisher
mkdir -p $root
cp -R site-config/publisher/ $root
cp site-config/schema/editors.yaml $root/config
cp -R site-config/schema/schema $root/config/schema
cd $root
zip -qr $wdir/target/AutoSite/site-config/publisher.zip *
cd $wdir

echo Author
root=/tmp/authorsite/template/author
mkdir -p $root
cp -R site-config/author/ $root
cd $root
zip -qr $wdir/target/AutoSite/site-config/author.zip *
cd $wdir

echo Artist
root=/tmp/authorsite/template/artist
mkdir -p $root
cp -R site-config/artist/ $root
cd $root
zip -qr $wdir/target/AutoSite/site-config/author.zip *
cd $wdir
