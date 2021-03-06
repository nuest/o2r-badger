/**
* Include services used for the application 
*/
const debug = require('debug')('badger');
const request = require('request');
const fs = require ('fs');
const path = require('path');

const config = require('../../config/config');
const base = require('../base/base');
const steps = require('../base/commonSteps');

let badgeNASmall = config.spatial.badgeNASmall;
let badgeNABig = config.spatial.badgeNABig;

exports.getBadgeFromData = (req, res) => {

    let passon = {
        body: req.body,
        extended: req.params.extended,
        req: req,
        res: res
    };

    // save tracking info
    passon.res.tracking = {
        type: req.params.type,
        doi: passon.id,
        extended: (passon.extended === 'extended'),
        size: req.query.width,
        format: (req.query.format === undefined) ? 'svg' : req.query.format
    };

    // check if there is a service for "spatial" badges
    if (base.hasSupportedService(config.spatial) === false) {
        debug('No service for badge %s found', passon.id);
        res.status(404).send('{"error":"no service for this type found"}');
        return;
    }

    let getBadge;

    if (passon.extended === 'extended') {
        getBadge = sendBigBadge(passon)
    } else {
        getBadge = getCenterFromData(passon)
            .then(getGeoName)
            .then(sendSmallBadge)
    }

    return getBadge
        .then((passon) => {
            debug('Completed generating badge');
        })
        .catch(err => {
            if (err.badgeNA === true) { // Send 'N/A' badge
                debug("No badge information found: %s", err.msg);
                if (passon.extended === 'extended') {
                    passon.res.na = true;
                    passon.res.service = passon.service;
                    passon.req.filePath = path.join(__dirname, badgeNABig);
                    base.resizeAndSend(passon.req, passon.res);
                } else if (passon.extended === undefined) {
                    res.na = true;
                    res.tracking.service = passon.service;
                    res.redirect(badgeNASmall);
                } else {
                    res.status(404).send('not allowed');
                }
            } else { // Send error response
                debug('Error generating badge: "%s" Original request: "%s"', err, passon.req.url);
                let status = 500;
                if (err.status) {
                    status = err.status;
                }
                let msg = 'Internal error';
                if (err.msg) {
                    msg = err.msg;
                }
                res.status(status).send(JSON.stringify({ error: msg }));
            }
        });
};

exports.getBadgeFromReference = (req, res) => {

    let id = req.params.id;
    let extended;

    debug('Handling spatial badge generation for id %s', req.params.id);

    if (typeof req.params.extended !== 'undefined') {
        extended = req.params.extended;
    }

    let passon = {
        id: id,
        extended: extended,
        req: req,
        res: res
    };

    // save tracking info
    passon.res.tracking = {
        type: req.params.type,
        doi: passon.id,
        extended: (passon.extended === 'extended'),
        size: req.query.width,
        format: (req.query.format === undefined) ? 'svg' : req.query.format
    };

    // check if there is a service for "spatial" badges
    if (base.hasSupportedService(config.spatial) === false) {
        debug('No service for badge %s found', passon.id);
        res.status(404).send('{"error":"no service for this type found"}');
        return;
    }

    let getBadge;
    if (passon.extended === 'extended') {
        getBadge = steps.getCompendiumID(passon)
            .then(steps.getCompendium)
            .then(sendBigBadge)
    } else {
        getBadge = steps.getCompendiumID(passon)
            .then(steps.getCompendium)
            .then(getCenterFromData)
            .then(getGeoName)
            .then(sendSmallBadge)
    }

    return getBadge
        .then((passon) => {
            debug('Completed generating badge');
        })
        .catch(err => {
            if (err.badgeNA === true) { // Send 'N/A' badge
                debug("No badge information found: %s", err.msg);
                if (passon.extended === 'extended') {
                    passon.res.na = true;
                    passon.res.service = passon.service;
                    passon.req.filePath = path.join(__dirname, badgeNABig);
                    base.resizeAndSend(passon.req, passon.res);
                } else if (passon.extended === undefined) {
                    res.na = true;
                    res.tracking.service = passon.service;
                    res.redirect(badgeNASmall);
                } else {
                    res.status(404).send('not allowed');
                }
            } else { // Send error response
                debug('Error generating badge: "%s" Original request: "%s"', err, passon.req.url);
                let status = 500;
                if (err.status) {
                    status = err.status;
                }
                let msg = 'Internal error';
                if (err.msg) {
                    msg = err.msg;
                }
                res.status(status).send(JSON.stringify({ error: msg }));
            }
        });
};

function getCenterFromData(passon) {
    return new Promise((fulfill, reject) => {
        // from o2r json to bbox
        debug('Reading spatial information from o2r data');

        if (typeof passon.body === 'undefined') {
            let error = new Error();
            error.msg = 'no geo name provided';
            error.status = 404;
            error.badgeNA = true;
            reject(error);
            return;
        }

        let bbox;

        try {
            bbox = passon.body.metadata.o2r.spatial.union.geojson.bbox;
            debug('Bounding box is %s, %s, %s, %s', bbox[0], bbox[1], bbox[2], bbox[3]);
        } catch (err) {
            debug('Metadata: %O:', passon.body);
            err.badgeNA = true;
            err.msg = 'o2r compendium does not contain spatial information (bbox)';
            reject(err);
            return;
        }

        //calculate the center of the polygon
        let result = calculateMeanCenter(bbox);
        passon.latitude = result[0];
        passon.longitude = result[1];
        fulfill(passon)
    });
}

function getGeoName(passon) {
    return new Promise((fulfill, reject) => {
        let requestURL = config.ext.geonames + '?lat=' + passon.latitude + '&lng=' + passon.longitude +'&username=badges';
        debug('Fetching geoname for compendium %s from %s', passon.compendiumID, requestURL);

        //and get the reversed geocoding for it
        request({
            url: requestURL,
            timeout: config.timeout.geonames,
            proxy: config.net.proxy}, function (error,response,body){
            if (error) {
                error.msg = 'Could not access geonames.org';
                reject(error);
                return;
            }

            if(response.statusCode === 200) {
                let geoname = JSON.parse(body);
                let geoname_ocean;
                // send the badge with the geocoded information to client
                if (geoname.status) {
                    request({url: 'http://api.geonames.org/oceanJSON?lat=' + passon.latitude + '&lng=' + passon.longitude + '&username=badges&username=badges',
                        proxy: config.net.proxy}, function (error,response,body){
                        if(response.statusCode === 200) {
                            geoname_ocean = JSON.parse(body);
                            try {
                                passon.geoName = geoname_ocean.ocean.name;
                            } catch (err) {
                                err.badgeNA = true;
                                err.msg = 'no ocean name found';
                                reject(err);
                                return;
                            }
                            fulfill(passon);
                        } else {
                            let error = new Error();
                            error.msg = 'could not get geoname ocean';
                            error.status = 404;
                            error.badgeNA = true;
                            reject(error);
                            return;
                        }
                    });
                } else if(geoname.codes) {
                    if (geoname.adminName1) {
                        passon.geoName = geoname.adminName1+"%2C%20"+geoname.countryName;
                        fulfill(passon);
                    } else {
                        passon.geoName = geoname.countryName;
                        fulfill(passon);
                    }
                }
            } else {
                let error = new Error();
                error.msg = 'could not get geoname';
                error.status = 404;
                error.badgeNA = true;
                reject(error);
                return;
            }
        });
    });
}

function sendSmallBadge(passon) {
    return new Promise((fulfill, reject) => {
        debug('Sending badge for geo name %s', passon.geoName);

        if (typeof passon.geoName === 'undefined') {
            let error = new Error();
            error.msg = 'no geo name provided';
            error.status = 404;
            error.badgeNA = true;
            reject(error);
            return;
        }
        
        if (passon.service === undefined) {
            passon.service = 'unknown';
        }
        let badgeString;
        
        // Encode badge string
        let locationString = passon.geoName.replace('-', '%20');
        badgeString = 'location-' + locationString + '-blue.svg';
        passon.res.tracking.service = passon.service;
        let redirectURL = config.badge.baseURL + badgeString + config.badge.options;
        passon.res.redirect(redirectURL);
        fulfill(passon);
    });
}

function sendBigBadge(passon) {
    return new Promise((fulfill, reject) => {
        debug('Sending map');

        let options = {
            dotfiles: 'deny',
            headers: {
                'x-timestamp': Date.now(),
                'x-sent': true,
            }
        };
        passon.res.tracking.service = passon.service;

        function sendNA(text)  {
            passon.req.type = 'location';
            let error = new Error();
            error.msg = text;
            error.status = 404;
            error.badgeNA = true;
            reject(error);
        }

        let bbox;

        try {
            bbox = passon.body.metadata.o2r.spatial.spatial.union.geojson.bbox;
        } catch (err) {
            sendNA('could not read bbox of compendium');
            return;
        }

        //Generate map
        let html = fs.readFileSync('./controllers/location/index_template.html', 'utf-8');
        html.replace('bbox', "Hello");
        //insert the locations into the html file / leaflet
        let file = html.replace('var bbox;', 'var bbox = ' + JSON.stringify(bbox) + ';');
        let indexHTMLPath = './controllers/location/index.html';
        fs.writeFile(indexHTMLPath, file, (err) => {
            if (err) {
                debug('Error writing index.html file to %s', indexHTMLPath);
                reject(err);
                return;
            } else {
                passon.req.filePath = path.join(__dirname, 'index.html');
                passon.req.type = 'location';
                passon.req.options = options;
                debug('Sending map %s', passon.req.filePath);
                base.resizeAndSend(passon.req, passon.res);
                fulfill(passon);
            }
        });
    });
}

/**
 * @desc calculate the mean center of a polygon
 * @param json geojson file containing the bbox of an area
 */
function calculateMeanCenter(bbox) {
	let x1 = parseFloat(bbox[1]);
	let y1 = parseFloat(bbox[0]);
	let x2 = parseFloat(bbox[3]);
	let y2 = parseFloat(bbox[2]);
	let centerX= x1 + ((x2 - x1) / 2);
	let centerY= y1 + ((y2 - y1) / 2);
	return [centerX,centerY];
}