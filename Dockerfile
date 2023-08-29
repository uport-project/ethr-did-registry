FROM debian:10.13-slim

RUN export DEBIAN_FRONTEND=noninteractive && \
    apt update && \
    apt install -y -q --no-install-recommends \
    npm build-essential git curl gnupg2 \
    ca-certificates apt-transport-https \
    sudo ripgrep \
    python3 && \
    apt clean && \
    rm -rf /var/lib/apt/lists/*

RUN useradd --create-home -s /bin/bash did
RUN usermod -a -G sudo did
RUN echo '%sudo ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

RUN mkdir -p /usr/local/nvm
ENV NVM_DIR=/usr/local/nvm

ENV NODE_VERSION=v14.21.3

ADD https://raw.githubusercontent.com/creationix/nvm/master/install.sh /usr/local/etc/nvm/install.sh
RUN bash /usr/local/etc/nvm/install.sh && \
    bash -c ". $NVM_DIR/nvm.sh && nvm install $NODE_VERSION && nvm alias default $NODE_VERSION && nvm use default"

ENV NVM_NODE_PATH ${NVM_DIR}/versions/node/${NODE_VERSION}
ENV NODE_PATH ${NVM_NODE_PATH}/lib/node_modules
ENV PATH      ${NVM_NODE_PATH}/bin:$PATH

RUN npm install npm@7.24.2 -g
RUN npm install yarn -g

WORKDIR /workspaces/ethr-did-registry

RUN chown -R did:did /workspaces
COPY --chown=did:did . .

RUN yarn install --frozen-lockfile
RUN yarn lint
RUN yarn build
RUN yarn test

USER did
