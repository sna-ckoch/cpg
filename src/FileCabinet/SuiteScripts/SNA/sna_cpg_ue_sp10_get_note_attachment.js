/**
 * Copyright (c) 2021, ScaleNorth Advisors LLC and/or its affiliates. All rights reserved.
 *
 * @author ckoch
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * Script brief description:
 * Downloads attachment if attachment id field is populated and attachment field is empty
 *
 * Revision History:
 *
 * Date              Issue/Case         Author          Issue Fix Summary
 * =============================================================================================
 * 2021/05/09                           ckoch           Initial version
 *
 */
define(['N/record', 'N/search', 'N/runtime', 'N/file', './sna_pmc_mod_sp10_globals.js'],
	function (record, search, runtime, file, globals) {

		function afterSubmit(context) {
			var events = {};
			events[context.UserEventType.CREATE] = getAttachment;
			events[context.UserEventType.EDIT] = getAttachment;

			if (typeof events[context.type] === 'function') {
				events[context.type](context);
			}
		}
//var orderNote = globals.callapi('/OrderNote/3376?$expand=NoteType,CreatedUser,Order/ExternalId&$select=*,Order/ExternalId', true, 'get').d.results;
		function getAttachment(context) {
			var folderId = runtime.getCurrentScript().getParameter({name: 'custscript_sp10_attachment_folderid'});
			if (globals.isEmpty(folderId)) {
				log.error({
					title: 'getAttachment.validate',
					details: {
						message: 'Download folder not set in script params, exiting'
					}
				});

				return;
			}

			var recId = context.newRecord.id;
			var recType = context.newRecord.type;

			var lookups = search.lookupFields({
				type: recType,
				id: recId,
				columns: [
					globals.records.orderNote.fields.nsAttachment,
					globals.records.orderNote.fields.AttachmentId
				]
			});

			var attachmentId = lookups[globals.records.orderNote.fields.AttachmentId];
			var attachmentFileId = lookups[globals.records.orderNote.fields.nsAttachment];
			if (util.isArray(attachmentFileId) && attachmentFileId.length == 1) {
				attachmentFileId = attachmentFileId[0].value;
			} else {
				attachmentFileId = null;
			}

			if (!globals.isEmpty(attachmentFileId)) {
				log.debug({
					title: 'getAttachment.validate',
					details: {
						message: 'Attachment already downloaded, exiting',
						attachmentId: attachmentId,
						attachmentFileId: attachmentFileId
					}
				});

				return;
			}

			if (globals.isEmpty(attachmentId)) {
				log.debug({
					title: 'getAttachment.validate',
					details: {
						message: 'No attachment id, exiting',
						attachmentId: attachmentId,
						attachmentFileId: attachmentFileId
					}
				});

				return;
			}

			// TODO: better error checking/handling
			var fileId = null;

			try {
				var response = globals.callapi('/Attachment/GetAttachment?id=' + attachmentId, false, 'get');

				var fileType = globals.mimeToFileType(response.headers['Content-Type']);
				var fileName = attachmentId + '_' + /filename="(.[^"]*)"/.exec(response.headers['Content-Disposition'])[1];

				if (!globals.isEmpty(fileType) && !globals.isEmpty(fileName)) {
					fileId = file.create({
						fileType: fileType,
						name: fileName,
						folder: Number(folderId),
						contents: response.body
					}).save();
				}
			} catch (e) {
				log.error({
					title: 'getAttachment.getSave',
					details: {
						recId: recId,
						fileType: fileType,
						fileName: fileName,
						e: e
					}
				});
			}

			if (!globals.isEmpty(fileId)) {
				try {
					var updateValues = {}
					updateValues[globals.records.orderNote.fields.nsAttachment] = fileId;

					record.submitFields({
						type: recType,
						id: recId,
						values: updateValues
					});
				} catch (e) {
					log.error({
						title: 'getAttachment.updateId',
						details: {
							recId: recId,
							updateValues: updateValues
						}
					});
				}
			}
		}

		return {
			afterSubmit: afterSubmit
		}

	});