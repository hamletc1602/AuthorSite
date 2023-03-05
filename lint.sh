#!/bin/bash
wdir=$(pwd)

echo Lint admin worker lambda
cd admin
npm run lint
cd $wdir

echo lint provisioner plugin lambda
cd provisioner
npm run lint
cd $wdir

echo lint edge lambdas
cd edge
npm run lint
cd $wdir

echo lint site generator lambda
cd generators/authorsite
npm run lint
cd $wdir

echo lint admin UI files
cd adminUi
npm run lint
cd $wdir
