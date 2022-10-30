#!/bin/bash
# Create soft links to awsUtilsjs file in admin-worker project
cd edge
ln -s ../admin/awsUtils.js awsUtils.js
cd ../generators/authorsite/app
ln -s ../../../admin/awsUtils.js awsUtils.js
