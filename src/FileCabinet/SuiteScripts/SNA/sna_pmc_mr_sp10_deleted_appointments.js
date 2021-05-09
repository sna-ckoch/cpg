/**
 * Copyright (c) 2020, ScaleNorth Advisors LLC and/or its affiliates. All rights reserved.
 *
 * @author ckoch
 * @NApiVersion 2.x
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 * 
 * Script brief description: 
 * Deletes appointment records and events for appointments deleted in service pro
 *
 * Revision History:
 *
 * Date              Issue/Case         Author          Issue Fix Summary
 * =============================================================================================
 * 2020/03/09                           ckoch           Initial version
 *
 */
define(['N/runtime', 'N/record', 'N/search', './sna_pmc_mod_sp10_globals.js'],
    function (runtime, record, search, globals) {

        function getInputData(context) {
            var appointments = [];

            var cacheKey = '__clock_deleteappt';

            var lastClock = runtime.getCurrentScript().getParameter({ name: 'custscript_sna_pmc_deldateoverride' });
            if (globals.isEmpty(lastClock)) {
                lastClock = globals.getCache().get({
                    key: cacheKey
                });
            }

            if (globals.isEmpty(lastClock)) {
                var d = new Date();
                d.setHours(d.getHours() - 24); // default to 24hr lookback if no last run time
                lastClock = d.toISOString();
            }
            log.debug({ title: 'LASTCLOCK_FINAL', details: lastClock });

            var maxPages = 100;
            var pages = 0;

            try {
                var url = '/Appointment/Deleted?$filter=DeletedDateTime ge ' + lastClock;

                do {
                    log.debug({ title: 'DEL_APPOINTMENTS_REQ', details: url });
                    var response = globals.callapi(url, true, 'get');
                    log.debug({ title: 'DEL_APPOINTMENTS_RES', details: JSON.stringify(response) });

                    // fix and store the clock from this request to be used next time
                    var newClock = response.d['__clock'];

                    // only set the clock from the first page of results so our next request starts there
                    // if we store on every page, our next request will ask for updates since we received the LAST page
                    // meaning if an update happened while we were downloading results, it won't be captured on the next update
                    if (!globals.isEmpty(newClock) && pages == 0) {
                        var parts = newClock.split(/\D+/);
                        if (parts.length == 6) {
                            // yyyy-mm-dd-hh-mm-ss UTC
                            var d = new Date(Date.UTC(parts[0], --parts[1], parts[2], parts[3], parts[4], parts[5]));
                            newClock = d.toISOString();

                            log.debug({ title: 'NEWCLOCK_FINAL', details: newClock });

                            globals.getCache().put({
                                key: cacheKey,
                                value: newClock
                            });
                        }
                    }

                    // pages of 20, gives us url to next page if any
                    url = response.d['__next'];

                    if (!globals.isEmpty(url)) {
                        url = url.replace('/api/', '/'); // callapi already has this bit
                        log.debug({ title: 'NEXT_FINAL', details: url });
                    }

                    appointments = appointments.concat(response.d.results);

                    pages++;
                } while (!globals.isEmpty(url) && pages < maxPages);
            } catch (e) {
                log.error({ title: 'GET_ERROR', details: e });
            }

            log.debug({ title: 'DEL_APPOINTMENTS_LEN', details: appointments.length });

            return appointments;
        }

        function map(context) {
            var result = JSON.parse(context.value);

            var apptId = result['Id'];
            log.debug({ title: 'apptId', details: apptId });

            var apptRec = findAppointment(apptId);
            log.debug({ title: 'apptRec', details: apptRec });

            if (!globals.isEmpty(apptRec.id)) {
                log.debug({ title: 'Delete appointment', details: apptRec.id });

                try {
                    record.delete({
                        type: globals.records.appointment.id,
                        id: apptRec.id
                    });
                } catch (e) {
                    log.error({
                        title: 'DELETE_APPT',
                        details: {
                            eventId: apptRec.id,
                            e: e
                        }
                    });
                }
            }
        }

        function findAppointment(apptId) {
            var output = {
                id: null
            };

            if (!globals.isEmpty(apptId)) {
                search.create({
                    type: globals.records.appointment.id,
                    filters: [
                        [globals.records.appointment.fields.Id, 'is', apptId]
                    ],
                    columns: ['internalid']
                }).run().each(function (result) {
                    log.debug({ title: 'result', details: result });

                    output.id = globals.nullIfEmpty(result.id);

                    return false;
                });
            }

            return output;
        }

        function summarize(context) {
            log.debug({ title: 'SUMMARIZE', details: context });
        }

        return {
            getInputData: getInputData,
            map: map,
            summarize: summarize
        }

    });