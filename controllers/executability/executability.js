const debug = require('debug')('badger');
const config = require('../../config/config');
var request = require('request');
var scaling = require('../scaling/scaling');
var path = require('path');

exports.getExecutabilityBadge = (req, res) => {
    //read the params from the URL
    var id = req.params.id;
    var jobID;
    var extended = req.params.extended;

    var width = req.query.width;
    var format = req.query.format;

    // If the request was done with an doi: Find the corresponding o2r id
    // Doi has to start with "doi:" and has to be Url enconded
    // todo delete this when the o2r api supports a doi based search for compendia
    if(id.substring(0, 4) === "doi:") {
        id = id.substring(4);
        switch(encodeURIComponent(id)) {
            case '10.1006%2Fjeem.1994.1031':
                id = 'yxsYu';
                break;
            case '10.1115%2F1.2128636':
                id = 'HcEeP';
                break;
            case '10.1029%2Fjd095id10p16343':
                id = 'Xa9Ir';
                break;
            case '10.1126%2Fscience.1092666':
                id = 'vAsoV';
                break;
            case '10.1016%2Fs0038-092x(00)00089-x':
                id = 'yxsYu';
                break;
            case '10.1016%2F0095-0696(78)90006-2':
                id = 'GTb0t';
                break;
            default:
                debug('doi not found');
                // no information badge is send in this case (no job for the id can be found)
        }
    }

    /**
     * Get the jobIDs id for a compendium specified in the :id parameter.
     * The id of that job is then saved in jobID variable
     *
     */
    request(config.ext.o2r + '/api/v1/job?compendium_id=' + id, function(error, response, body) {

        // no job for the given id available
        if(error) {
            debug(error);
            res.redirect("https://img.shields.io/badge/executable-n%2Fa-9f9f9f.svg");
            return;
        }
        // status responses
        if(response.status === 404) {
            if(compendiumJSON.error) {
                if(extended === "extended"){
                    req.filePath = path.join(__dirname, 'badges/Executable_noInfo.svg');
                    scaling.resizeAndSend(req, res);
                } else if (extended === undefined){
                    res.redirect('https://img.shields.io/badge/executable-n%2Fa-9f9f9f.svg');
                } else {
                    res.status(404).send('not allowed');
                }
            }
            return;
        }
        else if(response.status === 500 || error) {
            res.status(500).send('Unable to find data on server: %s', error);
            return;
        }

        //body contains all jobIDs for this compendium
        var compendiumJSON = JSON.parse(body);

        // no job found
        if(compendiumJSON.error) {
            if(extended === "extended"){
                req.filePath = path.join(__dirname, 'badges/Executable_noInfo.svg');
                scaling.resizeAndSend(req, res);
            } else if (extended === undefined){
                res.redirect('https://img.shields.io/badge/executable-n%2Fa-9f9f9f.svg');
            } else {
                res.status(404).send('not allowed');
            }
        }

        // information retrieved
        else {
            jobID = compendiumJSON.results[0];
            /**
             *
             *  send a request to the o2r api to get the status of the job selected from the compendium
             *
             */
            request(config.ext.o2r + '/api/v1/job/' + jobID, function(error, response, body) {
                debug(jobID);

                // no job with the given jobID found
                if(error) {
                    debug(error);
                    return;
                }

                var bodyJSON = JSON.parse(body);

                // send the correct badge due to
                // the status of the compendium
                if(req.params.extended === "extended") {
                    //if the status is "success" the green badge is sent to the client
                    if (bodyJSON.status === "success") {
                        req.filePath = path.join(__dirname, 'badges/Executable_Green.svg');
                    }
                    // for a "fail" the red badge is sent
                    else if (bodyJSON.status === "failure") {
                        req.filePath = path.join(__dirname, 'badges/Executable_Red.svg');
                    }
                    // and for the running status the yellow badge is sent to the client
                    else if (bodyJSON.status === "running") {
                        req.filePath = path.join(__dirname, 'badges/Executable_Running.svg');
                    }
                    else {
                        req.filePath = path.join(__dirname, 'badges/Executable_noInfo.svg');
                    }

                    // Send the request
                    scaling.resizeAndSend(req, res);

                } else if(req.params.extended === undefined){
                    //if the status is "success" the green badge is sent to the client
                    if (bodyJSON.status === "success") {
                        // send the reponse from our server
                        res.redirect('https://img.shields.io/badge/executable-yes-44cc11.svg');
                    }
                    // for a "fail" the red badge is sent
                    else if (bodyJSON.status === "failure") {
                        res.redirect('https://img.shields.io/badge/executable-no-ff0000.svg');
                    }
                    // and for the running status the yellow badge is sent to the client
                    else if (bodyJSON.status === "running") {
                        res.redirect('https://img.shields.io/badge/executable-running-yellow.svg');
                    }
                    else {
                        res.redirect('https://img.shields.io/badge/executable-n%2Fa-9f9f9f.svg');
                    }
                } else {
                    res.status(404).send('not allowed');
                }
            });
        }
    });
}