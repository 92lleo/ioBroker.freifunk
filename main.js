"use strict";

/*
 * Created with @iobroker/create-adapter v1.17.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");

// Load your modules here, e.g.:
// const fs = require("fs");
const request = require('request');

/**
 * The adapter instance
 * @type {ioBroker.Adapter}
 */
let adapter;


/**
 * Starts the adapter instance
 * @param {Partial<ioBroker.AdapterOptions>} [options]
 */
function startAdapter(options) {
    // Create the adapter and define its methods
    return adapter = utils.adapter(Object.assign({}, options, {
        name: "freifunk",

        // The ready callback is called when databases are connected and adapter received configuration.
        // start here!
        ready: main, // Main method defined below for readability

        // is called when adapter shuts down - callback has to be called under any circumstances!
        unload: (callback) => {
            try {
                adapter.log.info("cleaned everything up...");
                callback();
            } catch (e) {
                callback();
            }
        },

        // is called if a subscribed object changes
        objectChange: (id, obj) => {
            if (obj) {
                // The object was changed
                adapter.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
            } else {
                // The object was deleted
                adapter.log.info(`object ${id} deleted`);
            }
        },

        // is called if a subscribed state changes
        stateChange: (id, state) => {
            if (state) {
                // The state was changed
                adapter.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
            } else {
                // The state was deleted
                adapter.log.info(`state ${id} deleted`);
            }
        },

        // Some message was sent to adapter instance over message box. Used by email, pushover, text2speech, ...
        // requires "common.message" property to be set to true in io-package.json
        // message: (obj) => {
        // 	if (typeof obj === "object" && obj.message) {
        // 		if (obj.command === "send") {
        // 			// e.g. send email or pushover or whatever
        // 			adapter.log.info("send command");

        // 			// Send response in callback if required
        // 			if (obj.callback) adapter.sendTo(obj.from, obj.command, "Message received", obj.callback);
        // 		}
        // 	}
        // },
    }));
}

function getCommunities() {
    adapter.log.info("Getting community directory");
    const ffCommunityDirectory = 'https://api.freifunk.net/data/ffSummarizedDir.json';

    request(
        {
            url: ffCommunityDirectory,
            json: true
        },
        function (error, response, content) {
            adapter.log.debug('remote request done');

            if (!error && response.statusCode == 200) {
                if (content) {
                    let communityUrlMap = {};

                    for (var node in content) {
                        let item = content[node]
                        let name = item.name;
                        let nodeMaps = item.nodeMaps;
                        if (!nodeMaps) {
                            adapter.log.debug(name + ' has no nodeMaps');
                        } else {
                            nodeMaps.forEach(function (subitem) {
                                if (subitem.technicalType
                                      && subitem.technicalType === 'nodelist'
                                      && subitem.url) {
                                    communityUrlMap[name]=subitem.url;
                                    adapter.log.debug(name + ", " + subitem.url);
                                }
                            })
                        }
                    }
                    let json = JSON.stringify(communityUrlMap);

                    adapter.getForeignObject('system.adapter.freifunk.'+adapter.instance, function (err, obj) {
                        if (err) {
                            adapter.log.error(err);
                        } else {
                            adapter.log.info(JSON.stringify(obj));
                            obj.native.communityDirectory = json;
                            obj.native.communityDirectoryReload = false;
                            adapter.setForeignObject(obj._id, obj, function (err) {
                                if (err) adapter.log.error(err);
                            });
                        }
                    });

                } else {
                    adapter.log.error("Community directory json is emtpy");
                }
            } else {
                adapter.log.error("Community directory request was not successful: "+response.statusCode);
            }
        }
    );
}

function main() {
    if(adapter.config.communityDirectoryReload){
        getCommunities();
        return;
    }

    // The adapters config (in the instance object everything under the attribute "native") is accessible via
    // adapter.config:
    adapter.log.info("nodelist url:" + adapter.config.communityUrl);
    adapter.log.info("ids: " + adapter.config.id);
    adapter.log.info("community: " + adapter.config.community);

    /*
        For every state in the system there has to be also an object of type state
        Here a simple template for a boolean variable named "testVariable"
        Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
    */
    adapter.setObject("testVariable", {
        type: "state",
        common: {
            name: "testVariable",
            type: "boolean",
            role: "indicator",
            read: true,
            write: true,
        },
        native: {},
    });

    if(!adapter.config.communityUrl) {
        adapter.log.error("communityUrl is not set, please check settings")
    }

    else {
            adapter.log.debug('remote request');

            request(
                {
                    url: adapter.config.communityUrl, // "https://gw02.ext.ffmuc.net/nodelist.json"
                    json: true
                },
                function (error, response, content) {
                    adapter.log.debug('remote request done');

                    if (!error && response.statusCode == 200) {

                        if (content) {
                            var nodes = content.nodes

                            var callback = function(val){
                                //
                            }

                            var contacts = adapter.config.contact.toUpperCase().split(";");
                            var names = adapter.config.name.toUpperCase().split(";");
                            var ids = adapter.config.id.toUpperCase().split(";");

                            var found = false;

                            nodes.forEach(function(entry) {

                                // check for ID matches
                                found = ids.includes(entry.id.toUpperCase());

                                // if not already found, check for name matches
                                if(!found){
                                    for (const name of names) {
                                        if((name != "") && (entry.name.toUpperCase().includes(name))) {
                                            found = true;
                                            break;
                                        }
                                    }
                                }

                                // check for contact matches
                                //if(!found){
                                //    for (contact in contacts) {
                                //        if(entry.name.toUpperCase().includes(name)) {
                                //            found = true;
                                //            break;
                                //        }
                                //   }
                                //}                                

                                if (found){

                                    adapter.createState('', entry.id, 'name', {
                                        name: entry.id,
                                        def: entry.name,
                                        type: 'string',
                                        read: 'true',
                                        write: 'false',
                                        role: 'value',
                                        desc: 'node name'
                                    }, callback);

                                    adapter.createState('', entry.id, 'id', {
                                        name: entry.id,
                                        def: entry.id,
                                        type: 'string',
                                        read: 'true',
                                        write: 'false',
                                        role: 'value',
                                        desc: 'node id'
                                    }, callback);

                                    adapter.createState('', entry.id, 'online', {
                                        name: entry.id,
                                        def: entry.status.online,
                                        type: 'boolean',
                                        read: 'true',
                                        write: 'false',
                                        role: 'value',
                                        desc: 'online state'
                                    }, callback);

                                    adapter.createState('', entry.id, 'clients', {
                                        name: entry.id,
                                        def: entry.status.clients,
                                        type: 'number',
                                        read: 'true',
                                        write: 'false',
                                        role: 'value',
                                        desc: 'num of clients connected'
                                    }, callback);

                                     adapter.createState('', entry.id, 'lastcontact', {
                                        name: entry.id,
                                        def: entry.status.lastcontact,
                                        type: 'string',
                                        read: 'true',
                                        write: 'false',
                                        role: 'value',
                                        desc: 'last seen value'
                                    }, callback);
                                }
                            });
                        } else {
                            adapter.log.warn('Response has no valid content. Check your community setting and try again.');
                        }
                    } else {
                        adapter.log.warn(error);
                    }
                }
            );
    }



    // in this template all states changes inside the adapters namespace are subscribed
    //adapter.subscribeStates("*");

    /*
        setState examples
        you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
    */
    // the variable testVariable is set to true as command (ack=false)
    adapter.setState("testVariable", true);

    // same thing, but the value is flagged "ack"
    // ack should be always set to true if the value is received from or acknowledged from the target system
    adapter.setState("testVariable", { val: true, ack: true });

    // same thing, but the state is deleted after 30s (getState will return null afterwards)
    adapter.setState("testVariable", { val: true, ack: true, expire: 30 });

    setTimeout(function() {
        adapter.stop();
    }, 30000);
}


// @ts-ignore parent is a valid property on module
if (module.parent) {
    // Export startAdapter in compact mode
    module.exports = startAdapter;
} else {
    // otherwise start the instance directly
    startAdapter();
}
