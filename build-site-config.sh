#!/bin/bash
wdir=$(pwd)

## Merge site-config files and package into a zip in the target dir.
# Args:
# $1 : site-config name
# $2 : parent config name
mergeTemplate () {
    local root=/tmp/authorsite/template/$1
    echo $1
    mkdir -p $root
    cp -R site-config/$1/ $root
    cp -R site-config/schema/$2/* $root/config
    mkdir -p $root/config/templates/default
    cp -R site-config/templates/$2/ $root/config/templates/default
    cd $root
    zip -qr $wdir/target/AutoSite/site-config/$1.zip *
    cd $wdir
}

# Clean
rm -rf /tmp/authorsite/template/*
rm -rf $wdir/target/AutoSite/site-config/*
# Clean DS_Store site-config dirs
find . -name '.DS_Store' -type f -delete

echo Copy Site metadata
cp site-config/metadata.json $wdir/target/AutoSite/site-config/

echo Package Default site-config

mergeTemplate Publisher Publisher
mergeTemplate Demo1 Author
mergeTemplate Demo2 Author
mergeTemplate Demo5 Author
mergeTemplate Demo8 Author

## mergeTemplate Artist Artist  ## Artist template not ready yet
##mergeTemplate Author Author  ## Default author template deprecated. Needs some work, and the 'Demo' series are better.
