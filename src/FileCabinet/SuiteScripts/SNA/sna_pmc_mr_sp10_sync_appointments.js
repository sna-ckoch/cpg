/**
 * Copyright (c) 2020, ScaleNorth Advisors LLC and/or its affiliates. All rights reserved.
 *
 * @author ckoch
 * @NApiVersion 2.x
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 * 
 * Script brief description: 
 Query ServicePro API for appointments updated since last call and upsert Appointment records
 *
 * Revision History:
 *
 * Date              Issue/Case         Author          Issue Fix Summary
 * =============================================================================================
 * 2020/12/01                           ckoch           Refacterd as batch map/reduce update
 * 2020/11/25                           ckoch           Initial version
 *
 */
define(['N/runtime', './sna_pmc_mod_sp10_globals.js'], function (runtime, globals) {

    function getInputData(context) {
        var appointments = [];

        var lastClock = runtime.getCurrentScript().getParameter({ name: 'custscript_sna_pmc_sp10_lastupdate_over' }) || null;
        log.debug({ title: 'LASTCLOCK_PARAM', details: lastClock });

        if (lastClock == null) {
            lastClock = globals.getCache().get({
                key: '__clock'
            });
            log.debug({ title: 'LASTCLOCK_CACHE', details: lastClock });
        }

        if (lastClock == null) {
            var d = new Date();
            d.setHours(d.getHours() - 24); // default to 24hr lookback if no last run time
            lastClock = d.toISOString();
        }
        log.debug({ title: 'LASTCLOCK_FINAL', details: lastClock });

        var maxPages = 100;
        var pages = 0;

        try {
            // all appointments updated >= lastClock
            var url = '/Appointment?&$select=*&$expand=AppointmentStatus,AssignedTech,Order&$filter=LastUpdatedDateTime ge ' + lastClock;

            do {
                log.debug({ title: 'GET_APPOINTMENTS_REQ', details: url });
                var response = globals.callapi(url, true, 'get');
                log.debug({ title: 'GET_APPOINTMENTS_RES', details: JSON.stringify(response) });

                // fix and store the clock from this request to be used next time
                var newClock = response.d['__clock'] || null;
                log.debug({ title: 'NEWCLOCK_RAW', details: newClock });

                if (newClock != null) {
                    var parts = newClock.split(/\D+/);
                    if (parts.length == 6) {
                        // yyyy-mm-dd-hh-mm-ss UTC
                        var d = new Date(Date.UTC(parts[0], --parts[1], parts[2], parts[3], parts[4], parts[5]));
                        newClock = d.toISOString();

                        log.debug({ title: 'NEWCLOCK_FINAL', details: newClock });

                        globals.getCache().put({
                            key: '__clock',
                            value: newClock
                        });
                    }
                }

                // pages of 20, gives us url to next page if any
                url = response.d['__next'] || null;
                log.debug({ title: 'NEXT_RAW', details: url });

                if (url != null) {
                    url = url.replace('/api/', '/'); // callapi already has this bit
                }
                log.debug({ title: 'NEXT_FINAL', details: url });

                appointments = appointments.concat(response.d.results);
                log.debug({ title: 'APPOINTMENTS_LEN', details: appointments.length });

                pages++;
            } while (url != null && pages < maxPages);
        } catch (e) {
            log.error({ title: 'GET_ERROR', details: JSON.stringify(e) });
        }

        return appointments;
    }

    function map(context) {
        //log.debug({ title: 'MAP_CONTEXT', details: JSON.stringify(context) });

        var appointment = JSON.parse(context.value);
        log.debug({ title: 'MAP_APPOINTMENT', details: JSON.stringify(appointment) });

        var recid = globals.upsertAppointment(appointment);
        log.debug({ title: 'MAP_RECID', details: recid });
    }

    function summarize(context) {
        log.debug({ title: 'SUMMARIZE', details: JSON.stringify(context) });
    }

    return {
        getInputData: getInputData,
        map: map,
        summarize: summarize
    }

});