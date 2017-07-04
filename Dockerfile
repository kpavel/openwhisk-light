#FROM resin/qemux86-64-node:slim
FROM node:6-slim
RUN apt-get update && apt-get install -y git ssh
#RUN npm install git+https://git@github.com/kpavel/openwhisk-light.git#issue74 && npm cache clean && rm -rf /tmp/*
#CMD ["sh", "-c", "cd /node_modules/openwhisk-light; export DB_STRATEGY='disable'; npm start"]

COPY package.json /tmp/package.json
RUN cd /tmp && npm install
RUN mkdir -p /opt/app && cp -a /tmp/node_modules /opt/app/

WORKDIR /opt/app
COPY . /opt/app

EXPOSE 3000
CMD ["sh", "-c", "cd /node_modules/openwhisk-light; npm start"]
