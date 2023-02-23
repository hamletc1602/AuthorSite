#!/bin/bash
wdir=$(pwd)

# Clean DS_Store site-config dirs
find . -name '.DS_Store' -type f -delete

echo Copy Site metadata
cp site-config/metadata.json $wdir/target/AutoSite/site-config/

echo Package Default site-config
echo Author
cd site-config/author
zip -qr $wdir/target/AutoSite/site-config/author.zip *
cd $wdir

echo Artist
cd site-config/artist
zip -qr $wdir/target/AutoSite/site-config/artist.zip *
cd $wdir
