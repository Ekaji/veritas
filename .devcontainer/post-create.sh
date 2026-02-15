#!/bin/bash
# Install NPM dependencies
cd agent && npm install
cd ../scripts && npm install
echo "Dev Container Ready!"
