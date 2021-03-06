const debug = require('debug')('badger');
const request = require('request');
const path = require('path');

const config = require('../../config/config');
const base = require('../base/base');

let badgeNASmall = config.peerreview.badgeNASmall;

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

    // check if there is a service for "peerreview" badges
    if (base.hasSupportedService(config.peerreview) === false) {
        debug('No service for badge %s found', passon.id);
        res.status(404).send('{"error":"no service for this type found"}');
        return;
    }

    return sendResponse(passon)
        .then((passon) => {
            debug('Completed generating badge');
        })
        .catch(err => {
            if (err.badgeNA === true) { // Send "N/A" badge
                debug("No badge information found: %s", err.msg);
                res.na = true;
                res.tracking.service = passon.service;
                res.redirect(badgeNASmall);
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

    debug('Handling badge generation for id %s', req.params.id);

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

    // check if there is a service for "peerreview" badges
    if (base.hasSupportedService(config.peerreview) === false) {
        debug('No service for badge %s found', passon.id);
        res.status(404).send('{"error":"no service for this type found"}');
        return;
    }

    return getISSN(passon)
        .then(getReviewStatus)
        .then(sendResponse)
        .then((passon) => {
            debug('Completed generating peer-review badge for %s', passon.id);
            //done(passon.id, null);
        })
        .catch(err => {
            if (err.badgeNA === true) { // Send "N/A" badge
                debug("No badge information found: %s", err.msg);
                res.na = true;
                res.tracking.service = passon.service;
                res.redirect(badgeNASmall);
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

function getISSN(passon) {
    return new Promise((fulfill, reject) => {
        let requestURL = config.ext.doajArticles + 'doi:' + encodeURIComponent(passon.id);
        debug('Fetching ISSN ID from DOAJ with URL %s', requestURL);
        passon.service = 'doaj';

        //request DOAJ API to get ISSN
        //e.g. https://doaj.org/api/v1/search/articles/doi%3A10.3389%2Ffpsyg.2013.00479
        request({
            url: requestURL,
            timeout: config.timeout.doaj,
            proxy: config.net.proxy
        }, function(error, response, body) {

            if (error || typeof body.error !== 'undefined') {
                error.msg = 'error accessing doaj';
                error.status = 404;
                reject(error);
                return;
            }

            if(response.status >= 400 || response.statusCode >= 400) {
                let error = new Error();
                if (response.status >= 500 || response.statusCode >= 500) {
                    error.msg = 'error accessing doaj'
                } else {
                    error.msg = 'no doaj data found';
                }
                error.status = 404;
                error.badgeNA = true;
                reject(error);
                return;
            }

            let data;
            try {
                data = JSON.parse(body);
            } catch (err) {
                err.msg = 'error parsing doaj response';
                err.badgeNA = true;
                reject(err);
                return;
            }

            if (typeof data.results === 'undefined') {
                let error = new Error();
                error.msg = 'error accessing doaj';
                error.status = 404;
                error.badgeNA = true;
                reject(error);
                return;
            }

            if (data.results.length === 0) {
                let error = new Error();
                error.msg = 'no results found';
                error.status = 404;
                error.badgeNA = true;
                reject(error);
                return;
            }

            try {
                passon.issn = data.results[0].bibjson.journal.issns[0];
            } catch (err) {
                err.msg = 'did not find issn for DOI';
                err.badgeNA = true;
                reject(err);
                return;
            }
            if (!passon.issn || typeof passon.issn === 'undefined') {
                debug('no issn found for DOI %s', passon.id);
                let error = new Error();
                error.msg = 'no issn found';
                error.status = 404;
                error.badgeNA = true;
                reject(error);
                return;
            }
            fulfill(passon);
        });
    });
}

function getReviewStatus(passon) {
    return new Promise((fulfill, reject) => {

        let requestURL = config.ext.doajJournals + encodeURIComponent('issn:' + passon.issn);
        debug('Fetching review status from %s with URL', config.ext.doajJournals, requestURL);

        //request DOIJ API to find out if journal with ISSN is peer reviewed
        //e.g. https://doaj.org/api/v1/search/journals/issn%3A1664-1078
        request({
            url: requestURL,
            timeout: config.timeout.doaj,
            proxy: config.net.proxy
        }, function(error, response, body) {
            if (error) {
                error.msg = 'error accessing doaj';
                error.status = 404;
                reject(error);
                return;
            }

            if(response.status >= 400 || response.statusCode >= 400) {
                let error = new Error();
                if (response.status >= 500 || response.statusCode >= 500) {
                    error.msg = 'error accessing doaj'
                } else {
                    error.msg = 'no doaj data found';
                }
                error.status = 404;
                error.badgeNA = true;
                reject(error);
                return;
            }

            passon.body = JSON.parse(body);
            fulfill(passon);
        });
    });
}

function sendResponse(passon) {
    return new Promise((fulfill, reject) => {
        let data = passon.body;

        if (typeof data.results === 'undefined' || data.results.length === 0) {
            let error = new Error();
            error.msg = 'error accessing doaj';
            error.status = 404;
            error.badgeNA = true;
            reject(error);
            return;
        }

        let process;
        if (passon.service === undefined) {
            passon.service = 'unknown';
        }
        let badgeString;

        try {
            process = data.results[0].bibjson.editorial_review.process;
            debug('Review process for DOI %s is "%s"', passon.id, process);
        } catch (err) {
            err.msg = 'error accessing doaj';
            err.badgeNA = true;
            reject(err);
            return;
        }

        if (typeof process === 'undefined') {
            let error = new Error();
            error.msg = 'no review status found';
            error.status = 404;
            error.badgeNA = true;
            reject(error);
            return;
        } else {
            if (process.toLowerCase().startsWith('blind')) {
                passon.reviewStatus = 'blind';
            } else if (process.toLowerCase().startsWith('double blind')) {
                passon.reviewStatus = 'double blind';
            } else {
                passon.reviewStatus = 'yes';
            }
            debug('Sending badge for review status %s', passon.reviewStatus);
            badgeString = generateBadge(passon.reviewStatus);
            passon.res.tracking.service = passon.service;
            passon.res.redirect(badgeString);
            fulfill(passon);
        }
    });
}

function generateBadge(text) {
    let shieldsIO = config.badge.baseURL + 'peer%20review-';
    let color = '-green.svg';
    return shieldsIO + encodeURIComponent(text) + color + config.badge.options;
}