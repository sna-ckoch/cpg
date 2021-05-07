/**
 * Copyright (c) 2020, ScaleNorth Advisors LLC and/or its affiliates. All rights reserved.
 *
 * @author ckoch
 * @NApiVersion 2.x
 * @NModuleScope Public
 * 
 * Script brief description: 
   Globals for SP10 integration - api keys, calling function, custom record defs
 *
 * Revision History:
 *
 * Date              Issue/Case         Author          Issue Fix Summary
 * =============================================================================================
 * 2021/03/31                           ckoch           New appointment fields
 * 2020/12/05                           ckoch           Added uploadFileNote, file->order note
 * 2020/12/02                           ckoch           Added upsert and misc cleanup
 * 2020/11/25                           ckoch           Initial version
 *
 */
define(['N/runtime', 'N/https', 'N/search', 'N/record', 'N/cache'],
    function (runtime, https, search, record, cache) {
        var keys = {};
        keys[runtime.EnvType.SANDBOX] = {
            baseurl_sp10: 'https://servicepro10.com/service/api/',
            baseurl_aws: 'https://qo3m9wq42l.execute-api.us-west-1.amazonaws.com/prod/',
            apikey: '371bf1d0-a9e6-47a0-b101-398ec90648f6',
            sk: 'vSRvUhj4Db7u9u4tLa/trcc6C9OyA/NTW7NQtICfODdZo3kLrPrTWCfxUANCjqNo+UY7SMAu4bJgIjDJwfW/TOKRsT7tSmbHuwEd18DeM6sUaq5mf0TgiHYMOTsiuQztp7Z6NbwWvPH3qn86VaCpyF5OD4bQ6EvLj5Zz8Y07Yw/Mvyz1SHWZqjXHcwpvnzwncbnE0t4MSVUk2EBVlkRqarpx6wM+1o3QXUUoqD5lPP3gV8oyIh51kzKL99tjrvin'
        };
        keys[runtime.EnvType.PRODUCTION] = {
            baseurl_sp10: 'https://servicepro10.com/service/api/',
            baseurl_aws: 'https://qo3m9wq42l.execute-api.us-west-1.amazonaws.com/prod/',
            apikey: '',
            sk: ''
        };

        var records = {
            appointment: {
                id: 'customrecord_sna_pmc_appointment',
                fields: {
                    Id: 'custrecord_sna_pmc_appt_appointmentid',
                    AppointmentName: 'name',
                    Description: 'custrecord_sna_pmc_appt_description',
                    ScheduledDateTime: 'custrecord_sna_pmc_appt_scheduledate',
                    Notes: 'custrecord_sna_pmc_appt_notes',
                    ClosureNotes: 'custrecord_sna_pmc_appt_closurenotes',
                    nsSalesOrder: 'custrecord_sna_pmc_appt_salesorder',
                    nsLastSync: 'custrecord_sna_pmc_appt_lastsync',
                    nsApptStatus: 'custrecord_sna_pmc_appt_status',
                    nsAssignedTech: 'custrecord_sna_pmc_appt_assignedtech',
                    ScheduledDuration: 'custrecord_sna_pmc_appt_scheduleduration'
                }
            },
            appointmentStatus: {
                id: 'customrecord_sna_pmc_appointment_status',
                fields: {
                    Id: 'custrecord_sna_pmc_apptstatus_id'
                }
            },
            serviceTech: {
                id: 'customrecord_sna_pmc_service_tech',
                fields: {
                    Id: 'custrecord_sna_pmc_service_tech_id'
                }
            }
        };

        function getCache() {
            return cache.getCache({
                name: 'sna_pmc_sp10',
                scope: cache.Scope.PUBLIC
            });
        }

        function callapi(controller, parse, method, payload) {
            if (keys.hasOwnProperty(runtime.envType)) {
                var settings = keys[runtime.envType];

                var header = {};
                header['Content-Type'] = 'application/json';
                header['Accept'] = 'application/json';
                header['APIKey'] = settings.apikey;
                header['SK'] = settings.sk;

                var res = null;

                if (method == 'get') {
                    res = https.get({
                        url: settings.baseurl_sp10 + controller,
                        headers: header
                    });
                } else if (method == 'post') {
                    res = https.post({
                        url: settings.baseurl_sp10 + controller,
                        headers: header,
                        body: JSON.stringify(payload)
                    });
                } else if (method == 'delete') {
                    res = https.delete({
                        url: settings.baseurl_sp10 + controller,
                        headers: header
                    });
                } else if (method == 'patch') {
                    res = https.post({
                        url: settings.baseurl_aws + controller,
                        headers: header,
                        body: (payload != null ? JSON.stringify(payload) : null)
                    });
                }

                if (res != null && parse == true) {
                    return JSON.parse(res.body);
                } else {
                    return res;
                }
            } else {
                return null;
            }
        }

        function fixJsonDate(str) {
            var reg = /\d{4}\-\d{2}\-\d{2}T\d{2}\:\d{2}\:\d{2}Z/; // 2020-11-30T08:00:00Z

            if (reg.test(str)) {
                return new Date(str.replace('Z', '.000Z'));
            }

            return str;
        }

        // create a new appointment record or update existing
        function upsertAppointment(appointment, salesOrderId) {
            var rec = null;

            var recid = findExistingAppointment(appointment['Id']);
            if (recid != null) {
                try {
                    rec = record.load({ type: records.appointment.id, id: recid });
                } catch (e) {
                    log.debug({
                        title: 'APPOINTMENT_LOAD',
                        details: {
                            message: 'Failed to load existing Appointment record. A new one will be created',
                            appointment: appointment,
                            e: e
                        }
                    });
                }
            }
            if (rec == null) {
                rec = record.create({ type: records.appointment.id });
            }

            rec.setValue({
                fieldId: records.appointment.fields.nsSalesOrder,
                value: (salesOrderId ? salesOrderId : getSalesOrderIdAPI(appointment))
            }).setValue({
                fieldId: records.appointment.fields.nsLastSync,
                value: new Date()
            }).setValue({
                fieldId: records.appointment.fields.nsApptStatus,
                value: getOrCreateListValue(appointment['AppointmentStatus']['Id'],
                    appointment['AppointmentStatus']['Value'], records.appointmentStatus.id, records.appointmentStatus.fields.Id)
            }).setValue({
                fieldId: records.appointment.fields.nsAssignedTech,
                value: getOrCreateListValue(appointment['AssignedTech']['Id'],
                    appointment['AssignedTech']['ServiceTechName'], records.serviceTech.id, records.serviceTech.fields.Id)
            });

            for (var k in appointment) {
                var val = appointment[k] || null;

                if (val != null && records.appointment.fields.hasOwnProperty(k)) {
                    rec.setValue({
                        fieldId: records.appointment.fields[k],
                        value: fixJsonDate(val),
                        ignoreFieldChange: true
                    });
                }
            }

            var output = null;

            try {
                output = rec.save();
            } catch (e) {
                log.error({
                    title: 'APPOINTMENT_CREATE',
                    details: {
                      	e: e,
                        appointment: appointment
                    }
                });
            }

            return output;
        }

        function getServiceTechId(serviceTechName, parseVal) {
            var output = null;

            if (serviceTechName != null) {
                try {
                    if (parseVal) {
                        output = callapi('/ServiceTech?$filter=ServiceTechName eq \'' + serviceTechName + '\'', true, 'get').d.results[0]['Id'];
                    } else {
                        output = callapi('/ServiceTech?$filter=ServiceTechName eq \'' + serviceTechName + '\'', true, 'get').d.results[0];
                    }
                } catch (e) {

                }
            }

            return output;
        }

        function getLookupValue(lookupId, parseVal) {
            var output = null;

            if (lookupId != null) {
                try {
                    if (parseVal) {
                        output = callapi('/UserDefinedListValue?$filter=Id eq ' + lookupId, true, 'get').d.results[0]['Value'];
                    } else {
                        output = callapi('/UserDefinedListValue?$filter=Id eq ' + lookupId, true, 'get').d.results[0];
                    }
                } catch (e) {

                }
            }

            return output;
        }

        // search for existing list/record value based on ID, otherwise create a new one
        function getOrCreateListValue(lookupId, lookupName, recordType, recordIdField) {
            var output = null;

            if (lookupId != null) {
                try {
                    search.create({
                        type: recordType,
                        filters: [
                            [recordIdField, 'is', lookupId],
                            'and',
                            ['isinactive', 'is', 'F']
                        ],
                        columns: ['internalid']
                    }).run().each(function (result) {
                        output = result.id;
                        return false; // only want first one
                    });
                } catch (e) {
                    log.debug({
                        title: 'LIST_LOOKUP',
                        details: {
                            lookupId: lookupId,
                            lookupName: lookupName,
                            recordType: recordType,
                            recordIdField: recordIdField,
                            e: e
                        }
                    });
                }

                if (output == null) {
                    if (lookupName == null) {
                        lookupName = getLookupValue(lookupId, true);
                    }

                    try {
                        output = record.create({
                            type: recordType
                        }).setValue({
                            fieldId: 'name',
                            value: lookupName
                        }).setValue({
                            fieldId: recordIdField,
                            value: lookupId
                        }).save();
                    } catch (e) {
                        log.error({
                            title: 'LIST_CREATE',
                            details: {
                                lookupId: lookupId,
                                lookupName: lookupName,
                                recordType: recordType,
                                recordIdField: recordIdField,
                                e: e
                            }
                        });
                    }
                }
            }

            return output;
        }

        // searches for existing Appointment record based on Appointment ID
        function findExistingAppointment(appointmentid) {
            var output = null;

            try {
                var results = search.create({
                    type: records.appointment.id,
                    filters: [
                        [records.appointment.fields.Id, 'is', appointmentid],
                        'and',
                        ['isinactive', 'is', 'F']
                    ],
                    columns: ['internalid']
                }).runPaged();

                if (results.count == 1) {
                    output = results.fetch({
                        index: 0
                    }).data[0].id;
                }
            } catch (e) {
                log.debug({
                    title: 'APPOINTMENT_LOOKUP',
                    details: {
                        appointmentid: appointmentid,
                        e: e
                    }
                });
            }

            return output;
        }

        // searches for sales order using orderId against Service Pro Link field
        function getSalesOrderId(appointment) {
            var output = null;

            var orderId = appointment['OrderId'] || null;

            if (orderId != null) {
                try {
                    var results = search.create({
                        type: search.Type.SALES_ORDER,
                        filters: [
                            ['custbodyserviceprolink', 'contains', 'orderId=' + orderId],
                            'and',
                            ['mainline', 'is', 'T']
                        ],
                        columns: ['internalid']
                    }).runPaged();

                    if (results.count == 1) {
                        output = results.fetch({
                            index: 0
                        }).data[0].id;
                    }
                } catch (e) {
                    log.error({
                        title: 'ORDER_LOOKUP',
                        details: {
                            orderId: orderId,
                            appointment: appointment,
                            e: e
                        }
                    });
                }
            }

            return output;
        }

        function uploadFileNote(orderId, fileName, description, contentType, fileContents) {
            var output = null;

            if (keys.hasOwnProperty(runtime.envType)) {
                var settings = keys[runtime.envType];

                var payload = {
                    'APIKey': settings.apikey,
                    'SK': settings.sk,
                    'orderId': orderId,
                    'fileName': fileName,
                    'Description': description,
                    'Content-Type': contentType,
                    'fileJson': fileContents
                };
                log.debug({ title: 'UPLOAD_PAYLOAD', details: payload });
                try {
                    // temp workaround to handle encoding issues with non-base64 https.post
                    // aws lambda function accepts base64 encoded file and redirects decoded to sp10 api
                    var res = https.post({
                        url: 'https://6duy10b23e.execute-api.us-west-1.amazonaws.com/default/sp10note',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    log.debug({ title: 'UPLOAD_RESPONSE', details: res });
                    output = JSON.parse(res.body).d.results[0];

                    /* original version to be used once content-transfer-encoding is supported
                    var boundary = new Date().getTime().toString(16);
 
                    var headers = {
                        'Accept': 'application/json',
                        'APIKey': settings.apikey,
                        'SK': settings.sk,
                        'Content-Type': 'multipart/form-data; boundary=' + boundary
                    }
        
                    var parts = [];
                    parts.push('--' + boundary);
                    parts.push('Content-Disposition: form-data; name="Description"');
                    parts.push('');
                    parts.push(description);
                    parts.push('--' + boundary);
                    parts.push('Content-Disposition: form-data; name="files"; filename="' + fileName + '"');
                    parts.push('Content-Type: ' + contentType);
                    parts.push('Content-Transfer-Encoding: base64');
                    parts.push('');
                    parts.push(fileContents);
                    parts.push('--' + boundary + '--');
                    parts.push('');
                    
                    try {
                        output = JSON.parse(https.post({
                            url: settings.baseurl_sp10 + '/OrderNote/Upload/' + orderId,
                            headers: headers,
                            body: parts.join('\r\n')
                        }).body);
                    } catch (e) {
                        log.error({
                            title:'UPLOAD_FILE_NOTE',
                            details:JSON.stringify({
                                orderId: orderId,
                                fileName: fileName,
                                contentType: contentType,
                                e: JSON.stringify(e)
                            })
                        });
                    }*/
                } catch (e) {
                    log.error({
                        title: 'UPLOAD_FILE_NOTE',
                        details: {
                            orderId: orderId,
                            fileName: fileName,
                            contentType: contentType,
                            e: e
                        }
                    });
                }
            }

            return output;
        }

        function getSpOrderId(salesOrderId) {
            var output = null;

            if (salesOrderId) {
                try {
                    output = search.lookupFields({
                        type: search.Type.SALES_ORDER,
                        id: salesOrderId,
                        columns: [
                            'custbodyserviceprolink'
                        ]
                    })['custbodyserviceprolink'].split('orderId=')[1];
                } catch (e) {
                    log.error({
                        title: 'GET_SP_ORDERID',
                        details: {
                            salesOrderId: salesOrderId,
                            e: e
                        }
                    });
                }
            }

            return output;
        }

        function getSpOrderIdAPI(internalId) {
            var output = null;

            try {
                output = callapi('/Order?$filter=ExternalId eq ' + internalId + '&$select=Id', true, 'get').d.results[0]['Id'];
            } catch (e) {

            }

            return output;
        }

        // searches for sales order using orderId and api lookup
        function getSalesOrderIdAPI(appointment) {
            var output = null;

            var orderId = appointment['OrderId'] || null;

            if (orderId != null) {
                try {
                    output = callapi('/Order?$filter=Id eq ' + orderId + '&$select=ExternalId', true, 'get').d.results[0]['ExternalId'];

                  	// appointment might be associated with a sales order that's been deleted in netsuite -- clear the value if so
                  	if (output != null) {
                        var results = search.create({type:'transaction', filters:[['internalid','anyof',output]], columns:['internalid']}).runPaged();
                        if (results.count == 0) {
                            output = null;
                        }
                    }
                } catch (e) {
                    log.error({
                        title: 'ORDER_LOOKUP_API',
                        details: {
                            orderId: orderId,
                          	e: e,
                            appointment: appointment
                        }
                    });
                }
            }

            return output;
        }

        return {
            keys: keys,
            records: records,
            getCache: getCache,
            callapi: callapi,
            upsertAppointment: upsertAppointment,
            uploadFileNote: uploadFileNote,
            getSpOrderId: getSpOrderId,
            getSpOrderIdAPI: getSpOrderIdAPI
        };

    });