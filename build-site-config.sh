#!/bin/bash
wdir=$(pwd)

# Clean DS_Store site-config dirs
find . -name '.DS_Store' -type f -delete

# Package Default site-config
# Author
cd site-config/author
zip -qr $wdir/target/AutoSite/site-config/author.zip *
cd $wdir

#Artist
cd site-config/artist
zip -qr $wdir/target/AutoSite/site-config/artist.zip *
cd $wdir
