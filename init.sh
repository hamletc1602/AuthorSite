#!/bin/bash
# Create soft links to awsUtilsjs file in admin-worker project
#  awsUtils.js exists in edge project specifically becuse npm-pack-zip won't follow the symlink, and we only pack the edge project in this way
#  since edge lambda does not support layers.
cd admin
ln -s ../edge/awsUtils.js awsUtils.js
cd ../generators/authorsite/app
ln -s ../../../edge/awsUtils.js awsUtils.js
