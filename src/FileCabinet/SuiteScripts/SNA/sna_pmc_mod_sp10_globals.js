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
define(['N/runtime', 'N/https', 'N/search', 'N/record', 'N/cache', 'N/file'],
    function (runtime, https, search, record, cache, file) {
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
            },
            serviceProUser: {
                id: 'customrecord_sp10_user',
                fields: {
                    Id: 'custrecord_sp10_user_id'
                }
            },
            orderStatus: {
                id: 'customrecord_sp10_order_status',
                fields: {
                    Id: 'custrecord_sp10_order_status_id'
                }
            },
            orderNote: {
                id: 'customrecord_sp10_order_note',
                fields: {
                    Id: 'custrecord_sp10_note_id',
                    CreatedDateTime: 'custrecord_sp10_note_datecreated',
                    Contents: 'custrecord_sp10_note_contents',
                    LastUpdatedDateTime: 'custrecord_sp10_note_datelastupdated',
                    AttachmentId: 'custrecord_sp10_note_attachmentid',
                    nsSalesOrder: 'custrecord_sp10_note_salesorder',
                    nsNoteType: 'custrecord_sp10_note_type',
                    nsCreatedUser: 'custrecord_sp10_note_createduser',
                    nsAttachment: 'custrecord_sp10_note_attachment',
                    nsLastSync: 'custrecord_sp10_note_lastsync'
                }
            },
            orderNoteType: {
                id: 'customrecord_sp10_note_type',
                fields: {
                    Id: 'custrecord_sp10_note_type_id'
                }
            }
        };

        var bodyMapping = {
            UDF_Follow_Up_Required: 'custbody_sp10_trigger_followup_alert',
            UDF_3rd_Party_Vendor_report: 'custbody_sp10_3rd_party_vendor_rpt',
            UDF_Field_Service_Report_sent_to_client: 'custbody_sp10_rpt_sent_to_client',
            UDF_Show_Actual_Hours_on_Report: 'custbody_sp10_show_actual_hours',
            UDF_Follow_Up_Note: 'custbody_sp10_followup_note',
            OrderCancelDate: 'custbody_sp10_cancel_date',
            TechOrderStatus: 'custbody_sp10_tech_order_status', // only available as string value
            nsContractNumber: 'custbody_sp10_contract_number',
            nsAssignedTo: 'custbody_sp10_assigned_to',
            nsOrderStatus: 'custbody_sp10_order_status'
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
            if (str == 'True') {
                return true;
            } else if (str == 'False') {
                return false;
            }

            var reg = /\d{4}\-\d{2}\-\d{2}T\d{2}\:\d{2}\:\d{2}Z/; // 2020-11-30T08:00:00Z

            if (reg.test(str)) {
                return new Date(str.replace('Z', '.000Z'));
            }

            return str;
        }

        function upsertAppointment(appointment, salesOrderId) {
            var rec = null;

            var recid = findExistingRecord(records.appointment.id, records.appointment.fields.Id, appointment['Id']);
            if (recid != null) {
                try {
                    rec = record.load({ type: records.appointment.id, id: recid });
                } catch (e) {
                    log.debug({
                        title: 'upsertAppointment.load',
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
                    title: 'upsertAppointment.save',
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

        // find existing record based on id in field
        function findExistingRecord(recordType, idField, idValue) {
            var output = null;

            try {
                var results = search.create({
                    type: recordType,
                    filters: [
                        [idField, 'is', idValue],
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
                    title: 'findExistingRecord',
                    details: {
                        recordType: recordType,
                        idField: idField,
                        idValue: idValue,
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

        function updateBodyFields(order) {
            log.debug({title: 'updateBodyFields.order', details: order});
            if (util.isObject(order) == false) {
                log.debug({
                    title: 'updateBodyFields.validate',
                    details: {
                        message: 'Invalid order object, exiting',
                        order: order
                    }
                });
                return;
            }

            var nsInternalId = order['ExternalId'];
            log.debug({title: 'updateBodyFields.nsInternalId', details: nsInternalId});
            if (isEmpty(nsInternalId)) {
                log.debug({
                    title: 'updateBodyFields.validate',
                    details: {
                        message: 'Order ExternalId not found, exiting',
                        order: order
                    }
                });
                return;
            }

            if (!isValidExternalId(nsInternalId)) {
                log.debug({
                    title: 'updateBodyFields.validate',
                    details: {
                        message: 'Referenced ExternalId not found, exiting',
                        nsInternalId: nsInternalId,
                        order: order
                    }
                });
                return;
            }

            var mappedValues = {};

            for (var k in order) {
                var val = order[k];

                if (bodyMapping.hasOwnProperty(k)) {
                    mappedValues[bodyMapping[k]] = fixJsonDate(val);
                }
            }

            log.debug({title: 'updateBodyFields.mappedValues', details: mappedValues});
            if (Object.keys(mappedValues).length == 0) return;

            var visitId = order['ContractVisitId'];
            var contractNum = getContractNumber(visitId);

            mappedValues[bodyMapping.nsContractNumber] = contractNum

            var assignedToId = (order['AssignedTo'] || {})['Id'];
            var assignedToFirstName = (order['AssignedTo'] || {})['FirstName'];
            var assignedToLastName = (order['AssignedTo'] || {})['LastName'];
            var assignedToEmpNum = (order['AssignedTo'] || {})['EmployeeNumber'];

            if (!isEmpty(assignedToId)) {
                var assignedToName = assignedToEmpNum;

                if (!isEmpty(assignedToFirstName) && !isEmpty(assignedToLastName)) {
                    assignedToName = assignedToFirstName + ' ' + assignedToLastName;
                }

                mappedValues[bodyMapping.nsAssignedTo] = getOrCreateListValue(assignedToId, assignedToName, records.serviceProUser.id, records.serviceProUser.fields.Id);
            } else {
                mappedValues[bodyMapping.nsAssignedTo] = null;
            }

            var statusId = (order['OrderStatus'] || {})['Id'];
            var statusCode = (order['OrderStatus'] || {})['CodeNumber']; // mapping CodeNumber instead of Value to mimic ui

            if (!isEmpty(statusId) && !isEmpty(statusCode)) {
                mappedValues[bodyMapping.nsOrderStatus] = getOrCreateListValue(statusId, statusCode, records.orderStatus.id, records.orderStatus.fields.Id);
            } else {
                mappedValues[bodyMapping.nsOrderStatus] = null;
            }

            // compare current values to new ones first to prevent excessive updates
            var finalVals = diffValues(mappedValues, nsInternalId);

            log.debug({
                title: 'updateBodyFields',
                details: {
                    nsInternalId: nsInternalId,
                    mappedValues: mappedValues,
                    finalVals: finalVals
                }
            });

            if (Object.keys(finalVals).length > 0) {
                try {
                    record.submitFields({
                        type: record.Type.SALES_ORDER,
                        id: nsInternalId,
                        values: finalVals
                    });
                } catch (e) {
                    log.error({
                        title: 'submitFields',
                        details: {
                            nsInternalId: nsInternalId,
                            mappedValues: mappedValues,
                            finalVals: finalVals,
                            e: e
                        }
                    });
                }
            }
        }

        function getContractNumber(visitId) {
            var output = null;

            if (!isEmpty(visitId)) {
                try {
                    var result = callapi('/Contract/All?$filter=ContractSchedule/ContractVisit/Id eq ' + visitId + '&$select=ContractNumber,RenewalNumber', true, 'get');

                    var contractNum = result.d.results[0]['ContractNumber'];
                    var renewalNum = result.d.results[0]['RenewalNumber'];

                    if (!isEmpty(contractNum)) {
                        output = contractNum;

                        if (!isEmpty(renewalNum)) {
                            renewalNum = '1';
                        }

                        output += '-' + renewalNum;
                    }
                } catch (e) {
                    log.error({
                        title: 'getContractNumber',
                        details: {
                            visitId: visitId,
                            e: e
                        }
                    });
                }
            }

            return output;
        }

        // compares mappedValues to current values on txn/sales order (id: nsInternalId)
        // outputs only values that are different
        function diffValues(mappedValues, nsInternalId) {
            var output = {};

            if (util.isObject(mappedValues) && Object.keys(mappedValues).length > 0) {
                var lookups = search.lookupFields({
                    type: 'transaction',
                    id: nsInternalId,
                    columns: Object.keys(mappedValues)
                });

                for (var k in mappedValues) {
                    var newVal = mappedValues[k];
                    var curVal = lookups[k];

                    if (util.isArray(curVal)) {
                        if (curVal.length == 1) {
                            curVal = curVal[0].value;
                        } else {
                            curVal = null;
                        }
                    }

                    if (util.isBoolean(curVal)) {
                        newVal = (newVal ? true : false);
                    }

                    if (util.isDate(newVal)) {
                        curVal = new Date(curVal);
                    }

                    var isEqual = (curVal == newVal);
                    if (util.isDate(curVal) && util.isDate(newVal)) {
                        isEqual = (curVal.getTime() === newVal.getTime());
                    }

                    log.debug({
                        title: 'diffValues',
                        details: {
                            k: k,
                            curVal: curVal,
                            newVal: newVal,
                            isEqual: isEqual
                        }
                    });

                    if (!isEqual) {
                        output[k] = newVal;
                    }
                }
            }


            return output;
        }

        // searches for record with internal id matching external id from servicepro
        // servicepro will retain an externalid after the record has been deleted from netsuite
        function isValidExternalId(externalId) {
            var output = false;

            if (util.isString(externalId) || util.isNumber(externalId)) {
                var paged = search.create({
                    type: 'transaction',
                    filters: [
                        ['internalid', 'anyof', externalId]
                    ],
                    columns: ['internalid']
                }).runPaged();

                if (paged.count > 1) {
                    output = true;
                }
            }

            return output;
        }

        function isEmpty(stValue) {
            return ((stValue === '' || stValue == null || stValue == undefined) || (stValue.constructor === Array && stValue.length == 0) || (stValue.constructor === Object && (function (v) {
                for (var k in v)
                    return false;
                return true;
            })(stValue)));
        }

        function nullIfEmpty(what) {
            return (isEmpty(what) ? null : what);
        }

        function upsertOrderNote(orderNote) {
            log.debug({title: 'upsertOrderNote.orderNote', details: orderNote});
            if (util.isObject(orderNote) == false || isEmpty(orderNote['Id'])) {
                log.debug({
                    title: 'upsertOrderNote.validate',
                    details: {
                        message: 'Invalid orderNote object, exiting',
                        orderNote: orderNote
                    }
                });
                return;
            }

            var rec = null;

            var recid = findExistingRecord(records.orderNote.id, records.orderNote.fields.Id, orderNote['Id']);
            if (!isEmpty(recid)) {
                try {
                    rec = record.load({ type: records.orderNote.id, id: recid });
                } catch (e) {
                    log.debug({
                        title: 'upsertOrderNote.load',
                        details: {
                            message: 'Failed to load existing Order Note record. A new one will be created',
                            orderNote: orderNote,
                            e: e
                        }
                    });
                }
            }
            if (isEmpty(rec)) {
                rec = record.create({ type: records.orderNote.id });
            }

            rec.setValue({
                fieldId: records.orderNote.fields.nsLastSync,
                value: new Date()
            });

            //--- nsSalesOrder

            var salesOrderFieldValue = nullIfEmpty((orderNote['Order'] || {})['ExternalId']);

            if (!isEmpty(salesOrderFieldValue)) {
                if (!isValidExternalId(salesOrderFieldValue)) {
                    salesOrderFieldValue = null;
                }
            }

            rec.setValue({
                fieldId: records.orderNote.fields.nsSalesOrder,
                value: salesOrderFieldValue
            });

            //--- nsNoteType

            var noteTypeId = (orderNote['NoteType'] || {})['Id'];
            var noteTypeVal = (orderNote['NoteType'] || {})['Value'];
            var noteTypeFieldValue = null;

            if (!isEmpty(noteTypeId) && !isEmpty(noteTypeVal)) {
                noteTypeFieldValue = getOrCreateListValue(noteTypeId, noteTypeVal, records.orderNoteType.id, records.orderNoteType.fields.Id);
            }

            rec.setValue({
                fieldId: records.orderNote.fields.nsNoteType,
                value: noteTypeFieldValue
            });

            //--- nsCreatedUser

            var createdUserId = (orderNote['CreatedUser'] || {})['Id'];
            var createdUserFirstName = (orderNote['CreatedUser'] || {})['FirstName'];
            var createdUserLastName = (orderNote['CreatedUser'] || {})['LastName'];
            var createdUserEmpNum = (orderNote['CreatedUser'] || {})['EmployeeNumber'];
            var createdUserFieldValue = null;

            if (!isEmpty(createdUserId)) {
                var createdUserName = createdUserEmpNum;

                if (!isEmpty(createdUserFirstName) && !isEmpty(createdUserLastName)) {
                    createdUserName = createdUserFirstName + ' ' + createdUserLastName;
                }

                createdUserFieldValue = getOrCreateListValue(createdUserId, createdUserName, records.serviceProUser.id, records.serviceProUser.fields.Id);
            }

            rec.setValue({
                fieldId: records.orderNote.fields.nsCreatedUser,
                value: createdUserFieldValue
            });

            //--- basic field mapping

            for (var k in orderNote) {
                var val = orderNote[k];

                if (records.orderNote.fields.hasOwnProperty(k)) {
                    rec.setValue({
                        fieldId: records.orderNote.fields[k],
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
                    title: 'upsertAppointment.save',
                    details: {
                        e: e,
                        orderNote: orderNote
                    }
                });
            }

            return output;
        }

        function mimeToFileType(mime) {
            var lookup = {};

            lookup['application/x-autocad'] = file.Type.AUTOCAD;
            lookup['image/x-xbitmap'] = file.Type.BMPIMAGE;
            lookup['text/csv'] = file.Type.CSV;
            lookup['application/vnd.ms-excel'] = file.Type.EXCEL;
            lookup['application/x-shockwave-flash'] = file.Type.FLASH;
            lookup['image/gif'] = file.Type.GIFIMAGE;
            lookup['application/?x-?gzip-?compressed'] = file.Type.GZIP;
            lookup['text/html'] = file.Type.HTMLDOC;
            lookup['image/ico'] = file.Type.ICON;
            lookup['text/javascript'] = file.Type.JAVASCRIPT;
            lookup['image/jpeg'] = file.Type.JPGIMAGE;
            lookup['application/json'] = file.Type.JSON;
            lookup['message/rfc822'] = file.Type.MESSAGERFC;
            lookup['audio/mpeg'] = file.Type.MP3;
            lookup['video/mpeg'] = file.Type.MPEGMOVIE;
            lookup['application/vnd.ms-project'] = file.Type.MSPROJECT;
            lookup['application/pdf'] = file.Type.PDF;
            lookup['image/pjpeg'] = file.Type.PJPGIMAGE;
            lookup['text/plain'] = file.Type.PLAINTEXT;
            lookup['image/x-png'] = file.Type.PNGIMAGE;
            lookup['application/postscript'] = file.Type.POSTSCRIPT;
            lookup['application/?vnd.?ms-?powerpoint'] = file.Type.POWERPOINT;
            lookup['video/quicktime'] = file.Type.QUICKTIME;
            lookup['application/rtf'] = file.Type.RTF;
            lookup['application/sms'] = file.Type.SMS;
            lookup['text/css'] = file.Type.STYLESHEET;
            lookup['image/tiff'] = file.Type.TIFFIMAGE;
            lookup['application/vnd.visio'] = file.Type.VISIO;
            lookup['application/msword'] = file.Type.WORD;
            lookup['text/xml'] = file.Type.XMLDOC;
            lookup['application/zip'] = file.Type.ZIP;

            if (!isEmpty(mime) && lookup.hasOwnProperty(mime)) {
                return lookup[mime];
            } else {
                return null;
            }
        }

        return {
            keys: keys,
            records: records,
            getCache: getCache,
            isEmpty: isEmpty,
            nullIfEmpty: nullIfEmpty,
            mimeToFileType: mimeToFileType,
            callapi: callapi,
            upsertAppointment: upsertAppointment,
            uploadFileNote: uploadFileNote,
            getSpOrderId: getSpOrderId,
            getSpOrderIdAPI: getSpOrderIdAPI,
            updateBodyFields: updateBodyFields,
            upsertOrderNote: upsertOrderNote
        };

    });