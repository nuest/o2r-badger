## Scalable Badges
This project provides an API for retrieving a scalable badge as svg or png.

#### Installation
In order to use this API, make sure that you have installed [Docker](https://www.docker.com/) and [Node.js] (https://nodejs.org/en/).

Then clone our repository:    
`git clone git@zivgitlab.uni-muenster.de:geocontainer-badges/scalability.git`

##### with Docker
Navigate to the downloaded folder and build a docker image:  
`docker build -t scalability .`  
Then run the image:  
`docker run -p 30:3000 scalability`  
Finally test the API with the localhost.  

##### with Node
You can also run the API without Docker.  
Navigat to the downloaded folder and type:  
`npm install && npm start`  
Afterward you can test the API in the browser or run the testfile:  
`npm install mocha && npm test`