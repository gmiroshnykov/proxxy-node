proxxy-node
===========


Deployment
----------

1. Get a fresh server with Ubuntu 14.04
2. Do the following:

        sudo apt-get update
        sudo apt-get install -y git
        sudo mkdir /opt/proxxy-node
        sudo chown $USER:$USER /opt/proxxy-node
        git clone https://github.com/laggyluke/proxxy-node.git /opt/proxxy-node
        /opt/proxxy-node/deployment/provision.sh

3. Follow the instructions on screen.
