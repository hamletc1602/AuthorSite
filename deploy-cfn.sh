#!/bin/bash

cp AuthorSite.template target/AutoSite/

echo Sync target dir with public bucket
aws s3 sync target/AutoSite s3://braevitae-pub/AutoSite/
