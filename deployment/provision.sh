#!/usr/bin/env bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

export DEBIAN_FRONTEND=noninteractive

# install Node.js
curl -sL https://deb.nodesource.com/setup | sudo bash -
sudo apt-get install -y nodejs

# rebuild project dependencies
npm rebuild

sudo cp "$DIR/upstart.conf" /etc/init/proxxy-node.conf
sudo chown root:root /etc/init/proxxy-node.conf
sudo chmod 600 /etc/init/proxxy-node.conf

echo "Manual steps:"
echo "sudo vim /etc/init/proxxy-node.conf"
echo "sudo start proxxy-node"
