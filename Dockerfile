# (C) Copyright 2016 The o2r project. https://o2r.info
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
FROM alpine:3.4
MAINTAINER o2r-project, https://o2r.info

RUN apk add --no-cache \
    curl \
    nodejs \
    git \
    ca-certificates \
  && update-ca-certificates \
  && git clone --depth 1 -b master https://github.com/o2r-project/o2r-badger /badger \
  # Fix phantomjs bin for svg2png (see https://github.com/dustinblackman/phantomized)
  && curl -Ls "https://github.com/dustinblackman/phantomized/releases/download/2.1.1/dockerized-phantomjs.tar.gz" | tar xz -C / \
  && apk del \
    curl \
    git \
    ca-certificates \
  && rm -rf /var/cache /usr/share/man /tmp/* /root/.npm /var/tmp

WORKDIR /badger
RUN npm install --production
EXPOSE 8089

# Metadata params provided with docker build command
ARG VERSION=dev
ARG VCS_URL
ARG VCS_REF
ARG BUILD_DATE

# Metadata http://label-schema.org/rc1/
LABEL org.label-schema.vendor="o2r project" \
      org.label-schema.url="http://o2r.info" \
      org.label-schema.name="o2r badger" \
      org.label-schema.description="Badge creation for science" \    
      org.label-schema.version=$VERSION \
      org.label-schema.vcs-url=$VCS_URL \
      org.label-schema.vcs-ref=$VCS_REF \
      org.label-schema.build-date=$BUILD_DATE \
      org.label-schema.docker.schema-version="rc1"

CMD ["npm", "start" ]