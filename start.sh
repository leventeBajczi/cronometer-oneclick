#!/bin/sh
scriptdir=$(dirname $(realpath "$0"))
cd $scriptdir
npm install
node server.js
