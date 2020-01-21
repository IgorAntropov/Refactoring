var CustomerInvoicesView = DocumentTableView.extend({
    el: '#invoices-content',
    events: {},
    template: _.template($('#invoices-content-tpl').html()),
    initialize: function (invoices, notes, customerId) {
        this.customerId = customerId;
        this.filter = {
            InvoiceNumber: '',
            OrderCreateTimestamp: '',
            CreateTimestamp: '',
            ModifyTimestamp: '',
            CompletedTimestamp: '',
            FormattedStatus: 'Alle',
            paymentState: 'Alle',
            sourceDeliveryNotes: '',
            DeliveryNotesStatusFormatted: 'Alle'
        };
        this.optionsPaymentState = ['Alle'];
        this.initializeCommonValues();

        this.$parent_el = this.$el.closest('#invoice-list-modal');
        this.$spinner = this.getSpinner();

        this.$buttonPayment = this.$parent_el.find('#payment-button');
        this.$buttonDownloadPdf = this.$parent_el.find('#download-pdf');
        this.$buttonFinalize = this.$parent_el.find('#finalize-all-selected-invoice-button');
        this.$buttonDeleteSelected = this.$parent_el.find('#delete-selected-invoice-button');

        this.$buttonPageUp = this.$parent_el.find('.page-up-inv');
        this.$buttonPageDown = this.$parent_el.find('.page-down-inv');

        this.$buttonContraList = this.$parent_el.find('#open-delivery-notes');

        this.currentPeriod = this.getPeriod();
        this.moneyTurnover = this.getTurnoverSetting();

        this.invoices = invoices;//if this.customerId > 0 => new Backbone.Collection(invoices.toJSON());
        this.notes = notes;

        this.listenTo(this.invoices, 'change', this.changeTable);
        this.listenTo(this.invoices, 'remove', this.removeCollection);
        this.listenTo(this.invoices, 'update', this.updateTable);
        this.listenTo(this.invoices, 'reset', this.resetCollection);
        this.listenTo(this.notes, 'change',  this.applyChangesDeliveryNote);
    },
    setSelectOptionPaymentState: function (_document) {
        if (_document.paymentState !== '' && this.optionsPaymentState.indexOf(_document.paymentState) === -1)
            this.optionsPaymentState.push(_document.paymentState);
    },
    closeView: function () {
        this.hideParentElements();
        this.stopListening();

        App.instance.selectionModel.set('CustomerInvoicesView_CustomerId', 0);
    },
    getInvolvedContraDocumentFields: function () {
        return ['FormattedStatus', 'DeliveryNoteNumber', 'DeliveryNoteNumberIsDefault'];
    },
    getInvoiceField: function (dn_field) {
        let result = dn_field;
        switch (dn_field) {
            case 'DeliveryNoteNumber':
                result = 'Number';
                break;
            case 'DeliveryNoteNumberIsDefault':
                result = 'isDefaultNumber';
                break;
        }
        return result;
    },
    applyChangesDeliveryNote: function (Note) {
        let changes = Note.changed;
        let note_id = Note.get('Id');
        if(this.hasInvolvedField(changes)) {
            let wasChangedStatusNote = changes.hasOwnProperty('FormattedStatus');
            let thisInvoice = this.invoices.findInvoiceNote(note_id);
            if (thisInvoice !== undefined) {
                let sourceDeliveryNotes = thisInvoice.get('sourceDeliveryNotes');
                let sourceDeliveryNotes_clone = [];
                for (let i = 0; i < sourceDeliveryNotes.length; i++) {
                    let clone = {};
                    Object.assign(clone, sourceDeliveryNotes[i]);
                    sourceDeliveryNotes_clone[i] = clone;
                }
                let index_note = _.findIndex(sourceDeliveryNotes_clone, note => {
                    return (note['Id'] === note_id);
                });
                if (index_note !== -1) {
                    let note_fields = this.getInvolvedContraDocumentFields();
                    for (let i = 0; i < note_fields.length; i++) {
                        let source_field = this.getInvoiceField(note_fields[i]);
                        sourceDeliveryNotes_clone[index_note][source_field] = Note.get(note_fields[i]);
                    }
                    let field_deliveryNotesStatusFormatted = (wasChangedStatusNote) ?
                        this.getDeliveryNotesStatusFormattedField(sourceDeliveryNotes_clone) :
                        thisInvoice.get('DeliveryNotesStatusFormatted');

                    App.instance.invoices.get(thisInvoice.get('Id'))
                        .set({
                            'sourceDeliveryNotes': sourceDeliveryNotes_clone,
                            'DeliveryNotesStatusFormatted': field_deliveryNotesStatusFormatted
                        });
                }
            }
        }
    },
    getDeliveryNotesStatusFormattedField: function (sourceDeliveryNotes) {
        let result = 'Finalisiert';
        for (let i = 0; i < sourceDeliveryNotes.length; i++) {
            if(sourceDeliveryNotes[i].FormattedStatus === 'Bearbeitung' || sourceDeliveryNotes[i].FormattedStatus === 'Storno')
                result = sourceDeliveryNotes[i].FormattedStatus;
            break;
        }
        return result;
    },
    setChanges: function (newData) {
        let id = newData['Id'];

        let index = this.findIndexCollection(this.filteredData, id);
        if(index !== -1)
            this.filteredData[index] = newData;

        index = this.findIndexCollection(this.filteredDataSorted, id);
        if(index !== -1)
            this.filteredDataSorted[index] = newData;
    },
    applyChanges: function (Changes) {
        let document_id = Changes.id;
        let index_row = this.findIndexCollection(this.visibleData, document_id);
        let available_fields = this.getFieldsAvailable(),
            wasChangedCancelStatus = this.getWasChangedCancelStatus(Changes);

        if (index_row !== -1) {
            let wasChangedRevenue = false;
            _.each(Changes.changed, (value, field) => {
                if (available_fields.indexOf(field) !== -1) {
                    let new_data = this.getNewData(Changes);
                    this.renderTd(value, field, new_data, index_row);
                }
                wasChangedRevenue = !wasChangedRevenue ? this.getWasChangedRevenue(field, value) : true;
            });
            if (this.wasChangeMainNumber(Changes))
                this.renderNumberColumn(index_row, 'InvoiceNumber');

            if (wasChangedRevenue === true || wasChangedCancelStatus === true) {
                if(wasChangedRevenue === true)
                    this.reRenderTurnoverField(this.visibleData[index_row], index_row);

                customDelay(() => {
                    this.renderTopTableAfterFiltered();
                }, 500);
            }
        }
    },
    removeDocumentRows: function (removed) {
        let $rows;
        let needReloadTable = false;
        _.each(removed, (_document) => {
            let document_id = _document.get('Id');
            let row_index = this.getRowIndex(document_id);
            if (row_index !== -1) {
                let $row = this.getRow(row_index);
                if ($rows === undefined)
                    $rows = $row;
                else $rows = $rows.add($row);
            }
        });

        if ($rows !== undefined)
            this.deleteTableRows($rows);

        this.lastVisibleIndex -= removed.length;
        _.each(removed, (_document) => {
            let document_id = _document.get('Id');
            this.filteredDataSorted.splice(this.findIndexCollection(this.filteredDataSorted, document_id), 1);
            this.visibleData.splice(this.findIndexCollection(this.visibleData, document_id), 1);
        });

        return needReloadTable;
    },
    setHandlerMouseover: function () {
        return;
    },
    renderClusters: function (prev_last_index) {
        return;
    },
    getPeriod: function () {
        return App.instance.thisUser.getSetting('periodInvoiceList');
    },
    getTurnoverSetting: function () {
        return App.instance.thisUser.getSetting('taxInvoiceList');
    },
    setSettingPeriods: function (period) {
        App.instance.thisUser.setSetting('periodInvoiceList', period);
        App.api.user.changeSetting.put('radio', 'periodInvoiceList', period);
    },
    setSettingSort: function (sortName, direction) {
        App.instance.thisUser.setSetting('sortsInvoiceList_name', sortName);
        App.api.user.changeSetting.put('radio', 'sortsInvoiceList_name', sortName);

        App.instance.thisUser.setSetting('sortsInvoiceList_direct', direction);
        App.api.user.changeSetting.put('radio', 'sortsInvoiceList_direct', direction);
    },
    setRevenues: function () {
        this.invoices.forEach(Invoice => {
            Invoice.set('revenue', this.getRevenue(Invoice), {silent: true})
        });
    },
    getTable: function () {
        return this.$el.find('#invoices-table');
    },
    hideParentElements: function () {
        this.$parent_el.find('#invoices-header').add('#invoices-content').addClass('hidden');
        this.$spinner.removeClass('hidden');
    },
    showParentElements: function () {
        this.$parent_el.find('#invoices-header').add('#invoices-content').removeClass('hidden');
    },
    getFieldsInputAvailable: function () {
        return [
            'InvoiceNumber',
            'OrderCreateTimestamp',
            'CreateTimestamp',
            'ModifyTimestamp',
            'CompletedTimestamp',
            'sourceDeliveryNotes'
        ]
    },
    renderToolbarSetting: function () {
        let $toolBar = this.getToolbar();

        if (App.instance.thisUser.getSetting('deleteInvoiceWithDn') == 'true')
            $toolBar.find('#deleteInvoiceWithDn').prop("checked", true);
        else
            $toolBar.find('#deleteInvoiceWithDn').prop("checked", false);

        if (App.instance.thisUser.getSetting('showArrowsSummary') == 'false') {
            this.$el.find('.arrowLineForTables i').css({'display': 'none'});
            this.$el.find('.arrowLineForTables span').css({'margin-left': '0'});
        }

        this.$buttonPeriod = this.getButtonPeriod();

        this.$buttonPeriod.html('<span>' + this.formatPeriodDE() + '</span> <span class="caret"></span>');
        $toolBar.find('input[type = radio][name = period-document]').filter('[value = ' + this.currentPeriod + ']').prop('checked', true);

        $toolBar.find('input[type = radio][name = turnover]').filter('[value = ' + this.moneyTurnover + ']').prop('checked', true);

        this.$buttonTax = this.getButtonTax();
        this.setTextButtonTax();

        if (App.instance.thisUser.getSetting('InvoiceListShowColumn_OrderCreateTimestamp') == 'true')
            $toolBar.find('input.add-column-menu#InvoiceListShowColumn_OrderCreateTimestamp').prop('checked', true);
        if (App.instance.thisUser.getSetting('InvoiceListShowColumn_ModifyTimestamp') == 'true')
            $toolBar.find('input.add-column-menu#InvoiceListShowColumn_ModifyTimestamp').prop('checked', true);
        if (App.instance.thisUser.getSetting('InvoiceListShowColumn_CreateTimestamp') == 'true')
            $toolBar.find('input.add-column-menu#InvoiceListShowColumn_CreateTimestamp').prop('checked', true);
        if (App.instance.thisUser.getSetting('InvoiceListShowColumn_FormattedStatus') == 'true')
            $toolBar.find('input.add-column-menu#InvoiceListShowColumn_FormattedStatus').prop('checked', true);
        if (App.instance.thisUser.getSetting('InvoiceListShowColumn_paymentState') == 'true')
            $toolBar.find('input.add-column-menu#InvoiceListShowColumn_paymentState').prop('checked', true);
        if (App.instance.thisUser.getSetting('InvoiceListShowColumn_CompletedTimestamp') == 'true')
            $toolBar.find('input.add-column-menu#InvoiceListShowColumn_CompletedTimestamp').prop('checked', true);
        if (App.instance.thisUser.getSetting('InvoiceListShowColumn_sourceDeliveryNotes') == 'true')
            $toolBar.find('input.add-column-menu#InvoiceListShowColumn_sourceDeliveryNotes').prop('checked', true);
        if (App.instance.thisUser.getSetting('InvoiceListShowColumn_DeliveryNotesStatusFormatted') == 'true')
            $toolBar.find('input.add-column-menu#InvoiceListShowColumn_DeliveryNotesStatusFormatted').prop('checked', true);
        if (App.instance.thisUser.getSetting('InvoiceListShowColumn_revenue') == 'true')
            $toolBar.find('input.add-column-menu#InvoiceListShowColumn_revenue').prop('checked', true);

        this.$buttonRevenueParams = this.$el.find('#revenue-params-button');
        this.setTextButtonRevenueParams();
        let option_revenue_params = this.getOptionRevenueParams();
        $toolBar.find('input[type = radio][name = invoices-revenue-params]').filter('[value = ' + option_revenue_params + ']').prop('checked', true);
    },
    disableMainButton: function () {
        this.$buttonFinalize.add(this.$buttonDeleteSelected).add(this.$buttonPayment).prop('disabled', true);
    },
    setSelectOptionContraDocumentStatus: function (_document) {
        if (_document.sourceDeliveryNotes !== null)
            _.each(_document.sourceDeliveryNotes, deliveryNote => {
                if (this.optionsStatusContraDocument.indexOf(deliveryNote.FormattedStatus) === -1)
                    this.optionsStatusContraDocument.push(deliveryNote.FormattedStatus);
            });
    },
    getFilteredData: function (documents) {
        if (documents === undefined) {
            if (this.notes.size == 0) {
                documents = [];
            } else {
                documents = this.notes.toJSON();
            }
        }

        let self = this;
        let getTextHtmlField = function (field, _document) {
            let formatter = self.getOptionColumn(field).formatter;
            let html = formatter(_document[field], _document);

            return $(html).text();
        };
        let getTextHtmlFieldSourceDNs = function (_document) {
            let formatter = self.getOptionColumn('sourceDeliveryNotes').formatter;
            let html = formatter(_document['sourceDeliveryNotes'], _document);

            let result = [];
            _.each($(html).find('a'), a => {
                result.push($(a).text());
            });
            return result;
        };
        let filterFoo = function (_document) {
            this.isEqStrings = (a, b) => {
                return a.toLocaleLowerCase().indexOf(b.toLocaleLowerCase()) === 0;
            };
            let filterPeriod = () => {
                let period;

                switch (self.currentPeriod) {
                    case 'today':
                        period = moment().startOf('day');
                        break;
                    case 'yesterday':
                        period = moment().startOf('day').subtract(1, 'day');
                        break;
                    case 'week':
                        period = moment().day("Monday");
                        break;
                    case 'sevendays':
                        period = moment().startOf('day').subtract(7, 'day');
                        break;
                    case 'month':
                        period = moment().startOf('month');
                        break;
                    case 'year':
                        period = moment().startOf('year');
                        break;
                }
                if (period === undefined)
                    return true;

                let nameDateSorted = self.getDateNameSorted();
                return moment(_document[nameDateSorted]) > period
            };
            let filterDocumentNumber = () => {
                let filter = self.filter.InvoiceNumber;
                if (filter === '')
                    return true;
                else if (_document['InvoiceNumber'] === null)
                    return false;
                let text = getTextHtmlField('InvoiceNumber', _document);
                return this.isEqStrings(text, filter);
            };
            let dateCreated = () => {
                let filter = self.filter.CreateTimestamp;
                if (filter === '')
                    return true;

                let date = moment(_document['CreateTimestamp']).format('DD.MM.YYYY');

                return self.checkBetweenDates(date, filter);
            };
            let dateOrderCreated = () => {
                let filter = self.filter.OrderCreateTimestamp;
                if (filter === '')
                    return true;

                let date = moment(_document['OrderCreateTimestamp']).format('DD.MM.YYYY');

                return self.checkBetweenDates(date, filter);
            };
            let dateModify = () => {
                let filter = self.filter.ModifyTimestamp;
                if (filter === '')
                    return true;

                let date = moment(_document['ModifyTimestamp']).format('DD.MM.YYYY');

                return self.checkBetweenDates(date, filter);
            };
            let dateFinalized = () => {
                let filter = self.filter.CompletedTimestamp;
                if (filter === '')
                    return true;

                let date = moment(_document['CompletedTimestamp']).format('DD.MM.YYYY');
                return filter === date;
            };
            let documentStatus = () => {
                let filter = self.filter.FormattedStatus;
                if (filter === 'Alle')
                    return true;

                return filter === _document['FormattedStatus'];
            };
            let paymentState = () => {
                let filter = self.filter.paymentState;
                if (filter === 'Alle')
                    return true;

                return filter === _document['paymentState'];
            };
            let deliveryNoteNumber = () => {
                let filter = self.filter.sourceDeliveryNotes;
                if (filter === '')
                    return true;
                else if (_document['sourceDeliveryNotes'] === null)
                    return false;

                let text_arr = getTextHtmlFieldSourceDNs(_document);

                let index = _.findIndex(text_arr,
                    text => {
                        return this.isEqStrings(text, filter);
                    });
                return index !== -1;
            };
            let deliveryNoteStatus = () => {
                let filter = self.filter.DeliveryNotesStatusFormatted;
                if (filter === 'Alle')
                    return true;

                let index = -1;
                if (_document.sourceDeliveryNotes !== null) {
                    index = _.findIndex(_document.sourceDeliveryNotes,
                        deliveryNote => {
                            return this.isEqStrings(deliveryNote.FormattedStatus, filter);
                        });
                }
                return index !== -1;
            };

            return filterPeriod() &&
                filterDocumentNumber() &&
                dateOrderCreated() &&
                dateCreated() &&
                dateModify() &&
                dateFinalized() &&
                documentStatus() &&
                paymentState() &&
                deliveryNoteNumber() &&
                deliveryNoteStatus();
        };
        let result = _.filter(documents, (_document) => {
            return filterFoo(_document);
        });

        return result;
    },
    checkBetweenDates: function (date, filter) {
        let dateFrom = filter.substr(0, filter.indexOf('-'));
        dateFrom = dateFrom.substring(0, dateFrom.length - 1);
        let dateTo = filter.substr(filter.indexOf('-'), filter.length);
        dateTo = dateTo.substr(2);

        var d1 = dateFrom.split(".");
        var d2 = dateTo.split(".");
        var c = date.split(".");

        var from = new Date(d1[2], parseInt(d1[1])-1, d1[0]);
        var to   = new Date(d2[2], parseInt(d2[1])-1, d2[0]);
        var check = new Date(c[2], parseInt(c[1])-1, c[0]);

        return check >= from && check <= to;
    },
    setData: function (noChangeLastVisibleIndex) {
        this.setSorted();
        this.visibleData = this.setVisibleData(undefined, noChangeLastVisibleIndex);
    },
    getSortName: function () {
        return App.instance.thisUser.getSetting('sortsInvoiceList_name');
    },
    getSortDirection: function () {
        return App.instance.thisUser.getSetting('sortsInvoiceList_direct');
    },
    setLastVisibleIndex: function () {
        this.lastVisibleIndex =
            this.filteredDataSorted.length > this.countOnPage ?
                this.countOnPage * (this.pageNumber + 1) - 1 : this.filteredDataSorted.length - 1;
    },
    renderTable: function () {
        let self = this;
        let $table = this.getTable();
        $table.bootstrapTable({
            data: this.visibleData,
            filterControl: true,
            toolbarAlign: 'none',
            sortable: false,
            checkboxHeader: false,
            columns: [
                {
                    formatter: indexFormatter,
                    class: 'position-column text-left wo-padding'
                },
                {
                    class: 'bst-checkbox',
                    formatter: documentListCheckbox
                },
                {
                    field: 'InvoiceNumber',
                    formatter: InvoiceListLinkDocumentNumberFormatter,
                    title: 'Rechnungs Nr',
                    class: 'sortable item-row'
                },
                {
                    field: 'OrderCreateTimestamp',
                    formatter: dateFormatter,
                    class: 'table-th-datepicker-block sortable order-create-time',
                    title: 'Eingegangene <br/> Bestellung',
                    width: '115px'
                },
                {
                    field: 'CreateTimestamp',
                    formatter: dateFormatter,
                    class: 'table-th-datepicker-block sortable',
                    title: 'Erstellen <br/> Rechnung',
                    width: '115px'
                },
                {
                    field: 'ModifyTimestamp',
                    formatter: dateFormatter,
                    class: 'table-th-datepicker-block sortable',
                    title: 'Letzte <br/> Bearbeitung <br/> Rechnung',
                    width: '115px'
                },
                {
                    field: 'CompletedTimestamp',
                    formatter: dateFormatter,
                    class: 'table-th-datepicker-block sortable',
                    title: 'Finalisiert',
                    width: '115px'
                },
                {
                    field: 'FormattedStatus',
                    formatter: documentStatusFormatter,
                    title: 'Status',
                    width: '120px'
                },
                {
                    field: 'paymentState',
                    formatter: formatterPaymentState,
                    title: 'Zahlung',
                    width: '120px'
                },
                {
                    field: 'sourceDeliveryNotes',
                    formatter: sourceDeliveryNotesFormatter,
                    title: 'Erstellt aus Lieferschein Nr',
                    class: 'sortable item-row'
                },
                {
                    field: 'DeliveryNotesStatusFormatted',
                    formatter: documentStatusFormatter,
                    title: 'Status Lieferschein',
                    width: '120px'
                },
                {
                    field: 'revenue',
                    formatter: InvoicesGetRevenueFormatter,
                    title: 'Umsatz / % Marge / <br/> absolut',
                    class: 'sortable item-row'
                }
            ],
            locale: 'de-DE',
            formatNoMatches: function () {
                return "Keine passenden Ergebnisse gefunden.";
            },
            onPreBody: function () {
                self.hiddenTable();

                self.removeExcessElements();
            },
            onPostBody: function () {
                self.changeCountsDocument();
                self.changeCheckedDocument(0);

                setTimeout(() => {
                    self.renderLastClickedLink();

                    self.tableRenderHelper();

                    self.renderHideColumn();

                    self.setHandlers();
                    self.showTable();
                    self.changeNavigateButton();
                }, 0);
            }
        });
        var zahlungCheck = document.getElementById('InvoiceListShowColumn_paymentState');
        zahlungCheck.addEventListener('change', (e) => {
            var col1 = document.getElementById('InvoiceListShowColumn_sourceDeliveryNotes');
            var col2 = document.getElementById('InvoiceListShowColumn_DeliveryNotesStatusFormatted');
            if (e.target.checked) {
                if (col1.checked === true) {
                    $(col1).trigger('click');
                }
                if (col2.checked === true) {
                    $(col2).trigger('click');
                }
            } else {
                if (col1.checked === false) {
                    $(col1).trigger('click');
                }
                if (col2.checked === false) {
                    $(col2).trigger('click');
                }
            }
        });
    },
    renderRevenueHeader: function () {
        let text = this.getOptionRevenueParams() === 'marge' ? 'Umsatz / % Marge / <br> absolut' : 'Umsatz / A (7%) /<br>B (19%) / MwSt. Summ';
        this.getTable().find('th[data-field="revenue"] div.th-inner').html(text);
    },
    tableRenderHelper: function () {
        this.renderRevenueHeader();
        this.drawSorts();
        this.renderFilter();
    },
    wasDeleteDN: function () {
        return App.instance.thisUser.getSetting('deleteInvoiceWithDn') === 'true';
    },
    isChangingDataBackendDelete: function () {
        return this.wasRenameDeletedDocuments();
    },
    fetchDNs: function (ids) {
        _.each(ids, id => {
            let Dn = this.notes.get(id);
            if (Dn !== undefined)
                Dn.fetch();
        });
    },
    removeDocumentsCollection: function (removed_ids) {
        if (!this.isEqualCollections()) {
            App.instance.invoices.remove(removed_ids);
            this.invoices.remove(removed_ids);
        } else this.invoices.remove(removed_ids);
    },
    deleteDocuments: function () {
        let self = this;
        let text = 'Ausgewählte Rechnungen löschen?';
        Matrex.confirm(text, function () {
            let invoices = self.getAllSelectedDocuments();
            let ids = _.pluck(invoices, 'Id');

            let dnIds = [];
            _.each(invoices, (invoice) => {
                if (invoice.sourceDeliveryNotes !== null)
                    _.each(invoice.sourceDeliveryNotes, dn => {
                        if(dnIds.indexOf(dn.Id) === -1)
                            dnIds.push(dn.Id);
                    });
            });

            if (!self.isChangingDataBackendDelete()) {
                App.api.document.invoice.delete_not_rename(ids).then(
                    () => {
                        self.fetchDNs(dnIds);
                    }
                );
                self.removeDocumentsCollection(ids);
            } else {
                self.disabledForm();
                App.api.document.invoice.deleteFetch(ids).then(
                    (all_documents) => {
                        self.setCollectionsAfterFetch(all_documents);

                        if(self.wasDeleteDN())
                            self.notes.remove(dnIds);
                        else self.setDeletedInvoicesDns(dnIds);
                        self.enabledForm();
                    },
                    () => {
                        self.enabledForm();
                    }
                );
            }
        }, function () {
        });
    },
    setDeletedInvoicesDns: function (dn_ids) {
        _.each(dn_ids, id => {
            let Model = this.notes.get(id);
            if(Model !== undefined)
                Model.set({
                    InvoiceId: null,
                    InvoiceNumber: null,
                    InvoiceStatusFormatted: null,
                    InvoiceTitle: null,
                    InvoiceVersion: ""
                });
        });
    },
    downloadPdf: function () {
        var selected_INVs = this.getAllSelectedDocuments();
        var arrIds = [];

        _.each(selected_INVs, (selected_INV) => {
            arrIds.push(selected_INV.Id);
        });

        var url = getApiUrl() + '/download/pdfs/' + App.instance.thisUser.getSellerSuper() + '/invoice/' + arrIds.join('-')  + '?format=zip';
        var pdf = window.open(url, '_system');

        Matrex.notify('Dateien erfolgreich zum download gesendet.', 'success');
    },
    finalizeDocuments: function () {
        let documents = this.getAllSelectedDocuments();
        let ids = [];
        _.each(documents, function (document) {
            if (document.CompletedTimestamp === "0000-00-00 00:00:00")
                ids.push(document.Id);
        });

        if (ids.length == 0) {
            Matrex.notify('Nichts zu finalisieren', 'warning');
            return false;
        }
        this.disabledForm();
        App.api.document.invoice.finalize(ids).then(
            (documents) => {
                this.enabledForm();
                this.setDocumentsCollection(documents);

                _.each(documents, invoice => {
                    let InvoiceModel = App.instance.invoices.get(invoice['Id']);
                    if(InvoiceModel !== undefined)
                        App.instance.deliveryNotes.changeDocumentCollection(InvoiceModel.getDnIds());
                });

                this.renderParentButtonsStatus();
                Matrex.notify('Die Rechnung wurde abgeschlossen.', 'success');
            },
            (model, response, options) => {
                this.enabledForm();
                displayErrorBackbone(model, response, options);
            }
        );
    },
    setHandlers: function () {
        this.setHandlersCommonToolbar();
        this.setHandlersCommonTable();
        this.setHandlersCommonParent();
        this.setHandlersCommonButtons();
        this.setHandlersCommonRows();

        this.getToolbar().find('#deleteInvoiceWithDn').off('change').on('change', (e) => {
            this.changeCheckboxSetting(e);
        });

        this.getToolbar().find('input[name="invoices-revenue-params"]').off('change').on('change', (e) => {
            this.changeRevenueParams(e);
        });
        this.$buttonPayment.off('click').on('click', () => {
            this.paymentOpen();
        });

        this.$buttonDownloadPdf.off('click').on('click', () => {
            this.downloadPdf();
        });
    },
    paymentOpen: function () {
        let _document = this.getAllSelectedDocuments();
        if (_document.length === 1) {
            this.disableNavigationHandler();
            let PaymentModal = new PaymentInvoiceView(_document[0]);
            PaymentModal.off('hidden.bs.modal').on('hidden.bs.modal', ()=>{this.setHandlersCommonParent()});
        }
    },
    disableNavigationHandler: function () {
        $('body').off('keyup');
        $('body').off('keydown');
    },
    getOptionRevenueParams: function () {
        return App.instance.thisUser.getSetting('invoicesRevenueParams');
    },
    setTextButtonRevenueParams: function () {
        let option = this.getOptionRevenueParams();
        let text = (option === 'marge') ? ' Marge' : 'MwSt.';

        this.$buttonRevenueParams.find('span:first-child').text(text);
    },
    changeRevenueParams: function (e) {
        let value = $(e.target).val();

        App.instance.thisUser.setSetting('invoicesRevenueParams', value);
        App.api.user.changeSetting.put('radio', 'invoicesRevenueParams', value);

        this.setTextButtonRevenueParams();

        this.reloadTable();
    },
    openContraTable: function () {
        if (this.customerId === 0)
            App.instance.customerFilterBarView.allDeliveryNotes();
        else {
            let deliveryNotes = new DeliveryNotes();
            deliveryNotes.reset(this.notes.where({CustomerId: this.customerId}));

            let Customer = App.instance.customers.find(Customer => {
                return Customer.get('Id') === this.customerId;
            });
            let tempView = new CustomerListItemView(
                Customer.toJSON(),
                undefined,
                deliveryNotes
            );
            setTimeout(() => {
                tempView.showDeliveryNotes();}, 0);
        }
    },
    setDefaultTitleButtons: function () {
        let title_deleteSelectedButton = "Löschen",
            title_FinalizeButton = "Rechnung finalisieren",
            title_paymentButton = "Bezahlung",
            title_downloadPdfs = "Pdf herunterladen";

        this.$buttonDownloadPdf.attr('title', title_downloadPdfs);
        this.$buttonPayment.attr('title', title_paymentButton);
        this.$buttonFinalize.attr('title', title_FinalizeButton);
        this.$buttonDeleteSelected.attr('title', title_deleteSelectedButton);
    },
    getCountAllData: function () {
        return this.filteredDataSorted.length;
    },
    renderParentButtonsStatus: function () {
        clearTimeout(this.timerRenderParentButtonsStatus);
        this.timerRenderParentButtonsStatus = setTimeout(
            () => {
                let selected_Invoices = this.getAllSelectedDocuments();
                this.changeCheckedDocument(selected_Invoices.length);

                let _arguments = this.initializeAngumentChangedButton(selected_Invoices.length);

                _.each(selected_Invoices, (invoice) => {
                    _arguments = this.getArgumentChangedButton(invoice, _arguments);
                });
                this.changeDisableButton(_arguments);
                this.changeTitleFooterButtons(_arguments);
            }, 200
        );
    },
    changeDisableButton: function (_arguments) {
        if (_arguments !== undefined && _arguments.countDocument > 0) {
            this.$buttonDeleteSelected.prop('disabled', false);
            this.$buttonFinalize.prop('disabled', (_arguments.allFinalizedCanceled === true || _arguments.emptyProducts));
            this.$buttonPayment.prop('disabled', !(_arguments.countDocument === 1 && _arguments.hasFinalized === true));
            this.$buttonDownloadPdf.prop('disabled', !this.isAllSelectedDocumentFinalized(_arguments))
        } else {
            this.$buttonDeleteSelected.prop('disabled', true);
            this.$buttonFinalize.prop('disabled', true);
            this.$buttonPayment.prop('disabled', true);
            this.$buttonDownloadPdf.prop('disabled', true);
        }
    },
    changeTitleFooterButtons: function (_arguments) {
        let empty_document_title = "Keine produkte",
            allFinalized_title = "All Finalized",
            notFinalized = "Nicht Finalized",
            moreThatOne = "Mehr als Eine",
            canceled_title = "Storno",
            notAllFinalised = "Nicht alles finalized";

        this.setDefaultTitleButtons();

        if(!this.isAllSelectedDocumentFinalized(_arguments)) {
            let title_downloadPdfs = this.$buttonDownloadPdf.attr('title');
            this.$buttonDownloadPdf.attr('title', title_downloadPdfs + " " + notAllFinalised);
        }

        if (_arguments.allFinalizedCanceled && _arguments.hasFinalized) {
            let title_Finalized = this.$buttonFinalize.attr('title');
            this.$buttonFinalize.attr('title', title_Finalized + " " + allFinalized_title);
        }

        if(_arguments.countDocument === 1) {
            if( ! _arguments.hasFinalized) {
                let title_Payment = this.$buttonPayment.attr('title');
                this.$buttonPayment.attr('title', title_Payment + " " + notFinalized);
            }
            if(_arguments.hasCanceled) {
                let title_Finalize = this.$buttonFinalize.attr('title');
                this.$buttonFinalize.attr('title', title_Finalize + " " + canceled_title);
            }
        } else if(_arguments.countDocument > 1) {
            let title_Payment = this.$buttonPayment.attr('title');
            this.$buttonPayment.attr('title', title_Payment + " " + moreThatOne);
        }

        if (_arguments.emptyProducts) {
            let title_allFinalized = this.$buttonFinalize.attr('title');
            this.$buttonFinalize.attr('title', title_allFinalized + " " + empty_document_title);
        }
    },
    getArgumentChangedButton: function (selected_Invoices, _arguments) {
        let result = _arguments;
        result.allFinalizedCanceled = this.getAllFinalizedCanceled(_arguments, selected_Invoices.Status);
        result.hasCanceled = result.hasCanceled ? result.hasCanceled : selected_Invoices.Status === 'Canceled';
        result.hasFinalized = result.hasFinalized ? result.hasFinalized : selected_Invoices.Status === 'Completed';

        if (selected_Invoices.Products.length === 0)
            result.emptyProducts = true;

        return result;
    },
    initializeAngumentChangedButton: function (countDocument) {
        return {
            countDocument: countDocument,
            emptyProducts: false,
            hasFinalized: false,
            hasCanceled: false,
            allFinalizedCanceled: null
        };
    },
    checkAll: function () {
        let checkboxs = this.getCheckbox();
        let emptyProducts = false,
            allFinalized = null;

        let _arguments = this.initializeAngumentChangedButton(checkboxs.length);
        if (checkboxs.length > 0) {
            this.changeCheckedDocument(checkboxs.length);

            _.each(checkboxs, (checkbox) => {
                let $checkbox = $(checkbox);
                $checkbox.prop('checked', true);

                let _document = this.getVisibleDocument(this.getDataIndexCheckbox(checkbox));
            });
        }
        this.changeDisableButton(_arguments);
        this.changeTitleFooterButtons(_arguments);
    },
    uncheckAll: function () {
        let checkboxs = this.getCheckedCheckbox();
        _.each(checkboxs, (checkbox) => {
            $(checkbox).prop('checked', false);
        });
        this.changeCheckedDocument(0);
        this.changeDisableButton();
        this.setDefaultTitleButtons();
    },
    render: function () {
        this.$el.html(this.template());
        this.hideParentElements();
        setTimeout(() => {
            this.renderToolbarSetting();
            this.disableMainButton();
            this.renderMainButton();
            this.setDefaultTitleButtons();
            this.showParentElements();
            this.setAllData();
            this.renderTopTableAfterFiltered();
            this.renderTable();
        }, 0);

        return this;
    },
    getDateNameSorted: function (sortName) {
        let availableColumns = ['OrderCreateTimestamp', 'CreateTimestamp', 'ModifyTimestamp', 'CompletedTimestamp'];
        if (sortName === undefined)
            sortName = this.getSortName();

        let result = availableColumns.indexOf(sortName) !== -1 ? sortName : 'CreateTimestamp';

        return result;
    },
    getFieldsRevenueFormatter: function () {
        return [
            'revenue',
            'SumTotalProfitPercent',
            'SumTotalProfitAbsolute',
            'containsDailyPriceCount'
        ];
    },
    getWasChangedRevenue: function (field, value) {
        let result = false;
        if (this.getFieldsRevenueFormatter().indexOf(field) !== -1)
            result = true;
        return result;
    },
    setDocumentsCollection: function (documents, silent) {
        silent = silent === undefined ? false : silent;
        _.each(documents, _document => {
            let Model = new Invoice(_document, {parse: true});
            let id = _document.Id;

            let ModelExisting = this.invoices.get(id);
            if (ModelExisting !== undefined)
                ModelExisting.set(Model.toJSON(), {silent: silent});

            if (!this.isEqualCollections()) {
                let ModelExisting = App.instance.invoices.get(id);
                if(ModelExisting !== undefined)
                    ModelExisting.set(Model.toJSON());
            }

        });
    },
    setCollectionsAfterFetch: function (documents) {
        let Models = _.map(documents, document => {
            return new Invoice(document, {parse: true});
        });

        if (!this.isEqualCollections()) {
            App.instance.invoices.set(Models);

            let ModelsFiltred = _.filter(Models, _document => {
                return _document.get('CustomerId') === this.customerId;
            });
            this.invoices.set(ModelsFiltred);
        } else this.invoices.set(Models);
    },
});

var CustomerDeliveryNotesView = DocumentTableView.extend({
    isDeliveryNoteView: true,
    el: '#delivery-notes-content',
    template: _.template($('#delivery-notes-content-tpl').html()),
    initialize: function (notes, invoices, customerId) {
        this.customerId = customerId;
        this.clusteredData = [];
        this.filteredDataSortedClustered = [];
        this.filter = {
            DeliveryNoteNumber: '',
            OrderCreateTimestamp: '',
            ModifyTimestamp: '',
            CompletedTimestamp: '',
            InvoiceNumber: '',
            FormattedStatus: 'Alle',
            InvoiceStatusFormatted: 'Alle'
        };
        this.initializeCommonValues();

        this.$parent_el = this.$el.closest('#delivery-note-list-modal');
        this.$spinner = this.getSpinner();

        this.$buttonMakeBills = this.$parent_el.find('#make-bills-button');
        this.$buttonDownloadPdf = this.$parent_el.find('#download-pdf');
        this.$buttonFinalize = this.$parent_el.find('#finalize-all-delivery-note-button');
        this.$buttonDeleteSelected = this.$parent_el.find('#delete-selected-delivery-note-button');
        this.$buttonCopyDN = this.$parent_el.find('#copy-delivery-note-button');
        this.$buttonCutDN = this.$parent_el.find('#cut-delivery-note-button');

        this.$buttonPageUp = this.$parent_el.find('.page-up-dn');
        this.$buttonPageDown = this.$parent_el.find('.page-down-dn');

        this.$buttonContraList = this.$parent_el.find('#open-invoices');

        this.currentPeriod = this.getPeriod();
        this.moneyTurnover = this.getTurnoverSetting();

        this.notes = notes;//if this.customerId > 0 => new Backbone.Collection(notes.toJSON());
        this.invoices = invoices;

        this.listenTo(this.notes, 'change', this.changeTable);
        this.listenTo(this.notes, 'remove', this.removeCollection);
        this.listenTo(this.notes, 'update', this.updateTable);
        this.listenTo(this.notes, 'reset', this.resetCollection);
        this.listenTo(this.invoices, 'remove', this.removedInvoice);
        this.listenTo(this.invoices, 'change', this.applyChangesInvoice);
    },
    setSelectOptionPaymentState: function (_document) {

    },
    getInvolvedContraDocumentFields: function () {
        return ['SumTotalPrice', 'InvoiceNumber', 'InvoiceNumberIsDefault'];
    },
    getNoteField: function (invoice_field) {
        let result = invoice_field;
        switch (invoice_field) {
            case 'SumTotalPrice':
                result = 'revenue';
                break;
        }
        return result;
    },
    applyChangesInvoice: function (Invoice) {
        let changes = Invoice.changed;
        let invoice_id = Invoice.get('Id');

        if(this.hasInvolvedField(changes)) {
            let Notes = this.notes.findNoteInvoice(invoice_id);
            let invoice_fields = this.getInvolvedContraDocumentFields();
            _.each(Notes, Note => {
                for (let i = 0; i < invoice_fields.length; i++) {
                    let dn_field = this.getNoteField(invoice_fields[i]);
                    if(dn_field === 'revenue') {
                        let index_row = this.findIndexCollection(this.visibleData, Note.get('Id'));
                        if(index_row !== -1)
                            this.reRenderTurnoverField(this.visibleData[index_row], index_row);
                    } else {
                        if(changes.hasOwnProperty(invoice_fields[i]))
                            Note.set(dn_field, changes[invoice_fields[i]]);
                    }
                }
            });
        }
    },
    removedInvoice: function (model_removed) {
        let dn_ids = model_removed.getDnIds();
        if(dn_ids.length > 0) {
            let row_index = this.getRowIndex(dn_ids[0]);
            if (row_index !== -1) {
                let cluster = this.getCluster(row_index);

                _.each(dn_ids, id => {
                    let DNote = this.notes.get(id);
                    if(DNote !== undefined)
                        DNote.setRemovedInvoice(cluster !== undefined);
                });
                if (cluster !== undefined) {
                    this.updateView()
                }
            }
        }
    },
    setChanges: function (newData) {
        let id = newData['Id'];
        let index = this.findIndexCollection(this.filteredData, id);
        if(index !== -1)
            this.filteredData[index] = newData;

        index = this.findIndexCollection(this.filteredDataSorted, id);
        if(index !== -1)
            this.filteredDataSorted[index] = newData;

        index = this.findIndexCollection(this.filteredDataSortedClustered, id);
        if(index !== -1)
            this.filteredDataSortedClustered[index] = newData;
    },
    applyChanges: function (Changes) {
        let document_id = Changes.id;
        let index_row = this.findIndexCollection(this.visibleData, document_id);
        let available_fields = this.getFieldsAvailable();

        if (index_row !== -1) {
            let wasChangedRevenue = false,
                wasChangedInvoiceNumberField = false,
                wasChangedInvoiceNumberIsDefault = false,
                wasAddedRevenue = false,
                wasChangedCancelStatus = this.getWasChangedCancelStatus(Changes);

            _.each(Changes.changed, (value, field) => {
                let new_data = this.getNewData(Changes);
                if (available_fields.indexOf(field) !== -1) {
                    this.renderTd(value, field, new_data, index_row);
                }
                if(field === 'InvoiceStatusFormatted' || (field === 'InvoiceVersion' && Changes.get('InvoiceNumber') !== null))
                    wasChangedInvoiceNumberField = true;
                if(field === 'InvoiceNumberIsDefault') {
                    this.setChanges(new_data);
                    this.visibleData[index_row] = new_data;
                    wasChangedInvoiceNumberIsDefault = true;
                }
                wasChangedRevenue = !wasChangedRevenue ? this.getWasChangedRevenue(field, value) : true;
                wasAddedRevenue = !wasAddedRevenue ? this.getWasAddedRevenue(Changes, field) : true;
            });
            if (this.wasChangeMainNumber(Changes))
                this.renderNumberColumn(index_row, 'DeliveryNoteNumber');

            if (wasChangedRevenue === true || wasAddedRevenue === true || wasChangedCancelStatus === true) {
                if(wasChangedRevenue === true || wasAddedRevenue === true)
                    this.reRenderTurnoverField(this.visibleData[index_row], index_row);

                customDelay(() => {
                    this.renderTopTableAfterFiltered();
                }, 500);
            }
            if((wasChangedInvoiceNumberField && !Changes.changed.hasOwnProperty('InvoiceNumber')) ||(
                wasChangedInvoiceNumberIsDefault && Changes.get('InvoiceNumber') !== undefined)) {

                this.renderNumberColumn(index_row, 'InvoiceNumber');
            }
        }
    },
    getWasAddedRevenue: function (Changes, field_changed) {
        let result = false;

        if(field_changed === 'InvoiceNumber' && Changes.previousAttributes()['InvoiceNumber'] === null)
            result = true;

        return result;
    },
    removeDocumentRows: function (removed) {
        let $rows;
        let cluster;
        let wasCluster = false;
        let hasMainRowCluster = false;
        let needReloadTable = false;
        _.each(removed, (_document) => {
            let document_id = _document.get('Id');
            let row_index = this.getRowIndex(document_id);
            if (row_index !== -1) {
                let $row = this.getRow(row_index);
                if ($rows === undefined)
                    $rows = $row;
                else $rows = $rows.add($row);

                cluster = this.getCluster(row_index);

                if (cluster !== undefined) {
                    wasCluster = true;
                    hasMainRowCluster = hasMainRowCluster === true ? true : (cluster.index === row_index);
                    this.renderOneCluster(cluster, true);
                }
            }
        });

        if (hasMainRowCluster === true || (wasCluster === true && this.wasDeleteBill())) {
            needReloadTable = true;
        } else {
            if ($rows !== undefined)
                this.deleteTableRows($rows);
            this.lastVisibleIndex -= removed.length;
            _.each(removed, (_document) => {
                let document_id = _document.get('Id');
                this.filteredDataSorted.splice(this.findIndexCollection(this.filteredDataSorted, document_id), 1);
                this.filteredDataSortedClustered.splice(this.findIndexCollection(this.filteredDataSortedClustered, document_id), 1);
                this.visibleData.splice(this.findIndexCollection(this.visibleData, document_id), 1);
            });

            if (wasCluster === true) {
                this.filteredDataSortedClustered = this.setCluster();
                this.setAttributesTdClusters();
            }
        }
        return needReloadTable;
    },
    getFieldsRevenueFormatter: function () {
        return [
            'revenue',
            'SumTotalProfitPercent',
            'SumTotalProfitAbsolute',
            'containsDailyPriceCount'
        ];
    },
    setHandlers: function () {
        this.setHandlersCommonToolbar();
        this.setHandlersCommonTable();
        this.setHandlersCommonParent();
        this.setHandlersCommonButtons();
        this.setHandlersCommonRows();

        this.getToolbar().find('#deliveryNoteCluster').off('change').on('change', (e) => {
            this.changeCluster(e);
        });
        this.getToolbar().find('#needFinalizeDeliveryNote').off('change').on('change', (e) => {
            this.changeCheckboxSetting(e);
        });
        this.getToolbar().find('#deleteDnWithInvoice').off('change').on('change', (e) => {
            this.changeCheckboxSetting(e);
        });

        this.$buttonMakeBills.off('click').on('click', () => {
            this.makeBills();
        });

        this.$buttonDownloadPdf.off('click').on('click', () => {
            this.downloadPdf();
        });
    },
    makeBills: function () {
        let documents = this.getAllSelectedDocuments();
        let ids = [];
        _.each(documents, function (document) {
            if (document.InvoiceId === null) {
                ids.push(document.Id);
            }
        });
        if (ids.length == 0) {
            Matrex.notify('Für diese Artikel kann keine Rechnung erstellt werden', 'warning');
            return false;
        }
        this.disabledForm();
        App.api.document.delivery_note.make_bills(ids).then(
            (resp) => {
                this.enabledForm();
                let documents = resp['delivery_notes'];
                let invoice = resp['invoice'];

                let ModelInvoice = new Invoice(invoice, {parse: true});
                this.invoices.add(ModelInvoice);

                if (this.getClusterSetting() === true && documents.length > 1) {
                    this.setDocumentsCollection(documents, true);
                    this.notes.trigger('reset');
                } else {
                    this.setDocumentsCollection(documents);
                    this.renderParentButtonsStatus();
                }

                Matrex.notify('Rechnung wurde erstellt.', 'success');
            },
            (model, response, options) => {
                this.enabledForm();
                displayErrorBackbone(model, response, options);
            }
        );
    },
    downloadPdf: function () {
        var selected_DNs = this.getAllSelectedDocuments();
        var arrIds = [];

        _.each(selected_DNs, (selected_DN) => {
            arrIds.push(selected_DN.Id);
        });

        var url = getApiUrl() + '/download/pdfs/' + App.instance.thisUser.getSellerSuper() + '/delivery_note/' + arrIds.join('-')  + '?format=zip';
        var pdf = window.open(url, '_system');

        Matrex.notify('Dateien erfolgreich zum download gesendet.', 'success');
    },
    finalizeDocuments: function () {
        let documents = this.getAllSelectedDocuments();
        let ids = [];
        _.each(documents, function (document) {
            if (document.CompletedTimestamp === "0000-00-00 00:00:00")
                ids.push(document.Id);
        });

        if (ids.length == 0) {
            Matrex.notify('Nichts zu finalisieren', 'warning');
            return false;
        }
        this.disabledForm();
        App.api.document.delivery_note.finalize(ids).then(
            (documents) => {
                this.enabledForm();
                this.setDocumentsCollection(documents);
                this.renderParentButtonsStatus();
                Matrex.notify('Lieferschein wurde abgeschlossen.', 'success');
            },
            (model, response, options) => {
                this.enabledForm();
                displayErrorBackbone(model, response, options);
            }
        );
    },
    openContraTable: function () {
        if(this.customerId === 0)
            App.instance.customerFilterBarView.allInvoices();
        else {
            let invoices = new Invoices();
            invoices.reset(this.invoices.where({CustomerId: this.customerId}));

            let Customer = App.instance.customers.find(Customer => {
                return Customer.get('Id') === this.customerId;
            });
            let tempView = new CustomerListItemView(
                Customer.toJSON(),
                undefined,
                undefined,
                invoices
            );
            setTimeout(() => {
                tempView.showInvoices();
            }, 0);
        }
    },
    getInvolvedRenderInvoiceField: function () {
        return [
            'revenue',
            'InvoiceNumber',
            'FormattedStatus'
        ];
    },
    hasInvolvedRenderInvoiceField: function (changes) {
        let fields_involved = this.getInvolvedRenderInvoiceField();
        let field = _.find(changes, (value, field) => {
            return fields_involved.indexOf(field) !== -1;
        });

        return field !== undefined;
    },
    renderAfterChangeInvoice: function (invoice) {
        if (invoice.get('sourceDeliveryNotes') !== null)
            _.each(invoice.get('sourceDeliveryNotes'), Dn => {
                let DNote = App.instance.deliveryNotes.get(Dn.Id);
                if (DNote !== undefined) {
                    DNote.fetch({
                        success: () => {
                            if (!this.isEqualCollections()) {
                                let thisNote = this.notes.get(Dn.Id);
                                if (thisNote !== undefined)
                                    thisNote.set(DNote.toJSON());
                            }
                        }
                    });
                }
            });
    },
    deleteDocuments: function () {
        let self = this;
        let text = 'Ausgewählte Lieferscheinen löschen?';
        Matrex.confirm(text, function () {
            let Dns = self.getAllSelectedDocuments();
            let ids = _.pluck(Dns, 'Id');

            let invoiceIds = [];
            _.each(Dns, (Dn) => {
                if (Dn.InvoiceId !== null && invoiceIds.indexOf(Dn.InvoiceId) === -1)
                    invoiceIds.push(Dn.InvoiceId);
            });

            if (!self.isChangingDataBackendDelete()) {
                App.api.document.delivery_note.delete_not_changes(ids).then(
                    () => {
                        self.fetchInvoices(invoiceIds);
                    }
                );
                self.removeDocumentsCollection(ids);
            } else {
                self.disabledForm();
                App.api.document.delivery_note.deleteFetch(ids).then(
                    (all_documents) => {
                        self.setCollectionsAfterFetch(all_documents);
                        if(self.wasDeleteBill()) {
                            if(self.wasRenameDeletedDocuments())
                                App.instance.invoices.fetch();
                            else App.instance.invoices.remove(invoiceIds);
                        } else self.fetchInvoices(invoiceIds);

                        self.enabledForm();
                    },
                    () => {
                        self.enabledForm();
                    }
                );
            }
        }, function () {
        });
    },
    setDocumentsCollection: function (documents, silent) {
        silent = silent === undefined ? false : silent;
        _.each(documents, _document => {
            let Model = new DeliveryNote(_document, {parse: true});
            let id = _document.Id;
            if (!this.isEqualCollections()) {
                App.instance.deliveryNotes.get(id).set(Model.toJSON());

                let ModelExisting = this.notes.get(id);
                if (ModelExisting !== undefined)
                    ModelExisting.set(Model.toJSON(), {silent: silent});
            } else {
                this.notes.get(id).set(Model.toJSON(), {silent: silent});
                if (silent === true) {
                    let order_id = Model.getOrderId();
                    App.instance.orders.get(order_id).fetch();
                }
            }
        });
    },
    setCollectionsAfterFetch: function (documents) {
        let Models = _.map(documents, document => {
            return new DeliveryNote(document, {parse: true});
        });

        if (!this.isEqualCollections()) {
            App.instance.deliveryNotes.set(Models);

            let ModelsFiltered = _.filter(Models, _document => {
                return _document.get('CustomerId') === this.customerId;
            });
            this.notes.set(ModelsFiltered);
        } else this.notes.set(Models);
    },
    fetchInvoices: function (ids) {
        _.each(ids, id => {
            let Invoice = this.invoices.get(id);
            if (Invoice !== undefined)
                Invoice.fetch();
        });
    },
    renderParentButtonsStatus: function () {
        clearTimeout(this.timerRenderParentButtonsStatus);
        this.timerRenderParentButtonsStatus = setTimeout(
            () => {
                let selected_DNs = this.getAllSelectedDocuments();
                this.changeCheckedDocument(selected_DNs.length);
                let arguments_changed = this.initializeAngumentChangedButton(selected_DNs.length);
                _.each(selected_DNs, (selected_DN) => {
                    let firstCustomer = selected_DNs[0].CustomerId;
                    arguments_changed = this.getArgumentChangedButton(selected_DN, arguments_changed, firstCustomer);
                });
                this.changeDisableButton(arguments_changed);
                this.changeTitleFooterButtons(arguments_changed);
            }, 200
        );
    },
    checkAll: function () {
        let checkboxs = this.getCheckbox();
        let arguments_changed = this.initializeAngumentChangedButton(checkboxs.length);
        if (checkboxs.length > 0) {
            this.changeCheckedDocument(checkboxs.length);
            let firstCustomer = this.visibleData[0].CustomerId;
            _.each(checkboxs, (checkbox) => {
                let $checkbox = $(checkbox);
                $checkbox.prop('checked', true);

                let _document = this.getVisibleDocument(this.getDataIndexCheckbox(checkbox));
                arguments_changed = this.getArgumentChangedButton(_document, arguments_changed, firstCustomer);
            });
        }
        this.changeDisableButton(arguments_changed);
        this.changeTitleFooterButtons(arguments_changed);
    },
    uncheckAll: function () {
        let checkboxs = this.getCheckedCheckbox();
        _.each(checkboxs, (checkbox) => {
            $(checkbox).prop('checked', false);
        });
        this.changeCheckedDocument(0);
        this.changeDisableButton();
        this.setDefaultTitleButtons();
    },
    setAllHasBillCanceled: function (_arguments, selected_DN) {
        let prev_value = _arguments.allHasBillCanceled;
        let result = prev_value;
        if (prev_value === null) {
            if (selected_DN.InvoiceId === null && selected_DN.Status !== 'Canceled')
                result = false;
            else result = true;
        } else if (prev_value === true && selected_DN.InvoiceId === null && selected_DN.Status !== 'Canceled')
            result = false;

        return result;
    },
    setAllHasBill: function (_arguments, invoice_id) {
        let prev_value = _arguments.allHasBill;
        let result = prev_value;
        if (prev_value === null) {
            if (invoice_id === null)
                result = false;
            else result = true;
        } else if (prev_value === true && invoice_id === null)
            result = false;

        return result;
    },
    getCountAllData: function () {
        return this.filteredDataSortedClustered.length;
    },
    getClusterSetting: function () {
        if (this.isMobile())
            return false;

        return App.instance.thisUser.getSetting('deliveryNoteCluster') === 'true';
    },
    closeView: function () {
        this.hideParentElements();
        this.stopListening();

        App.instance.selectionModel.set('CustomerDeliveryNotesView_CustomerId', 0);
    },
    getTable: function () {
        return this.$el.find('#delivery-notes-table');
    },
    setDefaultTitleButtons: function () {
        let default_title_copyDNButton = "Lieferschein kopieren",
            default_title_makeBillsButton = "Rechnung erstellen",
            default_title_cutDNButton = "Neuer Kunde für diesen Lieferschein",
            default_title_deleteSelectedButton = "Löschen",
            default_title_FinalizeButton = "Lieferschein finalisieren",
            title_downloadPdfs = "Pdf herunterladen";

        this.$buttonDownloadPdf.attr('title', title_downloadPdfs);
        this.$buttonMakeBills.attr('title', default_title_makeBillsButton);
        this.$buttonFinalize.attr('title', default_title_FinalizeButton);
        this.$buttonDeleteSelected.attr('title', default_title_deleteSelectedButton);
        this.$buttonCopyDN.attr('title', default_title_copyDNButton);
        this.$buttonCutDN.attr('title', default_title_cutDNButton);
    },
    setRevenues: function () {
        this.notes.forEach(Note => {
            Note.set('revenue', this.getRevenue(Note), {silent: true})
        });
    },
    getSortName: function () {
        return App.instance.thisUser.getSetting('sortsDNList_name');
    },
    getSortDirection: function () {
        return App.instance.thisUser.getSetting('sortsDNList_direct');
    },
    renderToolbarSetting: function () {
        let $toolBar = this.getToolbar();

        if (App.instance.thisUser.getSetting('needFinalizeDeliveryNote') == 'true')
            $toolBar.find('#needFinalizeDeliveryNote').prop("checked", true);
        else
            $toolBar.find('#needFinalizeDeliveryNote').prop("checked", false);

        if (this.getClusterSetting())
            $toolBar.find('#deliveryNoteCluster').prop("checked", true);
        else
            $toolBar.find('#deliveryNoteCluster').prop("checked", false);

        if (App.instance.thisUser.getSetting('deleteDnWithInvoice') == 'true')
            $toolBar.find('#deleteDnWithInvoice').prop("checked", true);
        else
            $toolBar.find('#deleteDnWithInvoice').prop("checked", false);


        if (App.instance.thisUser.getSetting('showArrowsSummary') == 'false') {
            this.$el.find('.arrowLineForTables i').css({'display': 'none'});
            this.$el.find('.arrowLineForTables span').css({'margin-left': '0'});
        }

        this.$buttonPeriod = this.getButtonPeriod();
        this.$buttonPeriod.html('<span>' + this.formatPeriodDE() + '</span> <span class="caret"></span>');
        $toolBar.find('input[type = radio][name = period-document]').filter('[value = ' + this.currentPeriod + ']').prop('checked', true);

        $toolBar.find('input[type = radio][name = turnover]').filter('[value = ' + this.moneyTurnover + ']').prop('checked', true);

        this.$buttonTax = this.getButtonTax();
        this.setTextButtonTax();

        if (App.instance.thisUser.getSetting('DNListShowColumn_OrderCreateTimestamp') == 'true')
            $toolBar.find('input.add-column-menu#DNListShowColumn_OrderCreateTimestamp').prop('checked', true);
        if (App.instance.thisUser.getSetting('DNListShowColumn_ModifyTimestamp') == 'true')
            $toolBar.find('input.add-column-menu#DNListShowColumn_ModifyTimestamp').prop('checked', true);
        if (App.instance.thisUser.getSetting('DNListShowColumn_CompletedTimestamp') == 'true')
            $toolBar.find('input.add-column-menu#DNListShowColumn_CompletedTimestamp').prop('checked', true);
        if (App.instance.thisUser.getSetting('DNListShowColumn_FormattedStatus') == 'true')
            $toolBar.find('input.add-column-menu#DNListShowColumn_FormattedStatus').prop('checked', true);
        if (App.instance.thisUser.getSetting('DNListShowColumn_InvoiceNumber') == 'true')
            $toolBar.find('input.add-column-menu#DNListShowColumn_InvoiceNumber').prop('checked', true);
        if (App.instance.thisUser.getSetting('DNListShowColumn_InvoiceStatusFormatted') == 'true')
            $toolBar.find('input.add-column-menu#DNListShowColumn_InvoiceStatusFormatted').prop('checked', true);
        if (App.instance.thisUser.getSetting('DNListShowColumn_revenue') == 'true')
            $toolBar.find('input.add-column-menu#DNListShowColumn_revenue').prop('checked', true);
    },
    getTurnoverSetting: function () {
        return App.instance.thisUser.getSetting('taxDNList');
    },
    changeCluster: function (e) {
        this.changeCheckboxSetting(e);

        this.setRenderingData();
        this.reloadTable();
    },
    setCluster: function (documents) {
        if (documents === undefined)
            documents = _.clone(this.filteredDataSorted);
        this.clusteredData = [];

        if (this.getClusterSetting()) {
            /**
             * @type {Map <String invoiceNumber, String[] documentNumber>}
             */
            let clusterMap = new Map();
            _.each(documents, (document) => {
                let invoiceNumber = document.InvoiceNumber;
                if (invoiceNumber !== undefined && invoiceNumber !== null) {
                    let documentNumbers = [];
                    if (clusterMap.has(invoiceNumber)) {
                        documentNumbers = clusterMap.get(invoiceNumber);
                        clusterMap.set(invoiceNumber, documentNumbers);
                    }
                    documentNumbers.push(document.Id);
                    clusterMap.set(invoiceNumber, documentNumbers);
                }
            });
            for (let entry of clusterMap) {
                let documentIds = entry[1];
                let invoiceId = entry[0];
                if (documentIds.length > 1) {

                    let serial_number = 0;
                    let documentsCluster = [];

                    let index_first_document;
                    documentIds.forEach((document_id) => {
                        serial_number++;

                        if (serial_number === 1) {
                            index_first_document = _.findIndex(documents, (document) => {
                                return document.Id === document_id
                            });
                            return;
                        }

                        let index_deleted = _.findIndex(documents, (document) => {
                            return document.Id === document_id
                        });
                        documentsCluster.push(documents[index_deleted]);

                        documents.splice(index_deleted, 1);
                    });
                    let index_past = index_first_document;
                    documentsCluster.forEach((documentCluster) => {
                        documents.splice(index_past + 1, 0, documentCluster);
                        index_past++;
                    });
                    this.clusteredData.push({
                        index: index_first_document,
                        field: 'InvoiceNumber',
                        rowspan: documentsCluster.length + 1
                    });
                }
            }
        }
        return documents;
    },
    disableMainButton: function () {
        this.$buttonMakeBills.add(this.$buttonFinalize).add(this.$buttonDeleteSelected).add(this.$buttonCopyDN)
            .add(this.$buttonCutDN).prop('disabled', true);
    },
    setLastVisibleIndex: function () {
        this.lastVisibleIndex =
            this.filteredDataSortedClustered.length > this.countOnPage ?
                this.countOnPage * (this.pageNumber + 1) - 1 : this.filteredDataSortedClustered.length - 1;

        let cluster = this.getCluster(this.lastVisibleIndex);
        if (cluster !== undefined)
            this.lastVisibleIndex = cluster.index + cluster.rowspan - 1;
    },
    setData: function (noChangeLastVisibleIndex) {
        this.setSorted();
        this.setRenderingData(noChangeLastVisibleIndex);
    },
    setRenderingData: function (noChangeLastVisibleIndex) {
        this.filteredDataSortedClustered = this.setCluster();

        this.visibleData = this.setVisibleData(undefined, noChangeLastVisibleIndex);
    },
    renderTable: function () {
        let self = this;
        let $table = this.getTable();
        $table.bootstrapTable({
            data: this.visibleData,

            filterControl: true,
            classes: 'table table-hover medium-font',
            sortable: false,
            checkboxHeader: false,
            columns: [
                {
                    formatter: indexFormatter,
                    class: 'position-column text-left wo-padding'
                },
                {
                    class: 'bst-checkbox',
                    formatter: documentListCheckbox
                },
                {
                    field: 'DeliveryNoteNumber',
                    formatter: DNListDocumentNumberFormatter,
                    title: 'Lieferschein Nr',
                    class: 'sortable item-row'
                },
                {
                    field: 'OrderCreateTimestamp',
                    formatter: dateFormatter,
                    class: 'table-th-datepicker-block sortable',
                    title: 'Eingegangene <br/> Bestellung',
                    width: '115px'
                },
                {
                    field: 'ModifyTimestamp',
                    formatter: dateFormatter,
                    class: 'table-th-datepicker-block sortable',
                    title: 'Letzte <br/> Bearbeitung <br/> Lieferschein',
                    width: '115px'
                },
                {
                    field: 'CompletedTimestamp',
                    formatter: dateFormatter,
                    class: 'table-th-datepicker-block sortable',
                    title: 'Finalisiert',
                    width: '115px'
                },
                {
                    field: 'FormattedStatus',
                    formatter: documentStatusFormatter,
                    title: 'Status',
                    width: '120px'
                },
                {
                    field: 'InvoiceNumber',
                    formatter: DNlinkFormatterInvoice,
                    title: 'Rechnung erstellt <br/> aus Lieferschein Nr',
                    class: 'sortable item-row'
                },
                {
                    field: 'InvoiceStatusFormatted',
                    formatter: DNListInvoiceStatusFormatter,
                    title: 'Status Rechnung',
                    width: '120px'
                },
                {
                    field: 'revenue',
                    formatter: DNgetRevenueFormatter,
                    title: 'Umsatz / % Marge / <br/> absolut / Rechnung Umsatz',
                    class: 'sortable item-row',
                }
            ],
            locale: 'de-DE',
            formatNoMatches: function () {
                return "Keine passenden Ergebnisse gefunden.";
            },
            onPreBody: function () {
                self.hiddenTable();
                self.removeExcessElements();
            },
            onPostBody: function () {
                self.changeCountsDocument();
                self.changeCheckedDocument(0);

                setTimeout(() => {
                    self.renderLastClickedLink();

                    self.tableRenderHelper();

                    self.renderClusters();
                    self.renderHideColumn();

                    self.setHandlers();
                    self.showTable();
                    self.changeNavigateButton();
                }, 0);
            }
        });
    },
    changeDisableButton: function (_arguments) {
        if (_arguments !== undefined && _arguments.countDocument > 0) {
            this.$buttonCopyDN.prop('disabled', _arguments.emptyProducts);

            this.$buttonDeleteSelected.prop('disabled', false);
            this.$buttonFinalize.prop('disabled', ( _arguments.allFinalizedCanceled || _arguments.emptyProducts));

            let IsDisabledMakeBills = false;
            switch (true) {
                case  _arguments.differentCustomers:
                    IsDisabledMakeBills = true;
                    break;
                case  _arguments.allHasBillCanceled:
                    IsDisabledMakeBills = true;
                    break;
                case  _arguments.emptyProducts:
                    IsDisabledMakeBills = true;
                    break;
                case _arguments.hasCanceled:
                    IsDisabledMakeBills = true;
                    break;
            }
            this.$buttonMakeBills.prop('disabled', IsDisabledMakeBills);

            if ( _arguments.emptyProducts ||  _arguments.hasBill ||  _arguments.hasFinalized || _arguments.hasCanceled) {
                this.$buttonCutDN.prop('disabled', true);
            } else {
                this.$buttonCutDN.prop('disabled', false);
            }
            this.$buttonDownloadPdf.prop('disabled', !this.isAllSelectedDocumentFinalized(_arguments))
        } else {
            this.$buttonCopyDN.prop('disabled', true);
            this.$buttonCutDN.prop('disabled', true);
            this.$buttonDeleteSelected.prop('disabled', true);
            this.$buttonFinalize.prop('disabled', true);
            this.$buttonMakeBills.prop('disabled', true);
            this.$buttonDownloadPdf.prop('disabled', true);
        }
    },
    getArgumentChangedButton: function (selected_DN, _arguments, firstCustomer) {
        let result = _arguments;
        result.allFinalizedCanceled = this.getAllFinalizedCanceled(_arguments, selected_DN.Status);
        result.allHasBillCanceled = this.setAllHasBillCanceled(_arguments, selected_DN);
        result.allHasBill = this.setAllHasBill(_arguments, selected_DN.InvoiceId);
        result.hasBill = result.hasBill ? result.hasBill : selected_DN.InvoiceId !== null;
        result.hasCanceled = result.hasCanceled ? result.hasCanceled : selected_DN.Status === 'Canceled';
        result.hasFinalized = result.hasFinalized ? result.hasFinalized : selected_DN.Status === 'Completed';
        result.hasInProcess = result.hasInProcess ? result.hasInProcess : selected_DN.Status === 'InProcess';
        if (selected_DN.CustomerId !== firstCustomer)
            result.differentCustomers = true;
        if (selected_DN.Products.length === 0)
            result.emptyProducts = true;

        return result;
    },
    initializeAngumentChangedButton: function (countDocument) {
        return {
            countDocument: countDocument,
            emptyProducts: false,
            hasFinalized: false,
            hasInProcess: false,
            hasCanceled: false,
            hasBill: false,
            differentCustomers: false,
            allHasBill: null,
            allHasBillCanceled: null,
            allFinalizedCanceled: null
        };
    },
    changeTitleFooterButtons: function (_arguments) {
        let different_customer_title = "Unterschiedliche kunden",
            empty_order_title = "Keine produkte",
            existed_bill_title = "Rechnung existiert",
            allFinalized_title = "Alle Finalized",
            hasFinalized_title = "Finalized",
            allCanceled_title = "Alle Storno",
            hasCanceled_title = "Storno",
            notAllFinalised = "Nicht alles finalized";

        this.setDefaultTitleButtons();

        if(!this.isAllSelectedDocumentFinalized(_arguments)) {
            let title_downloadPdfs = this.$buttonDownloadPdf.attr('title');
            this.$buttonDownloadPdf.attr('title', title_downloadPdfs + " " + notAllFinalised);
        }

        if (_arguments.allFinalizedCanceled) {
            let title_allFinalized = this.$buttonFinalize.attr('title');
            this.$buttonFinalize.attr('title', title_allFinalized + " " + allFinalized_title);
        }

        if(_arguments.hasCanceled) {
            let title_makeBillsButton = this.$buttonMakeBills.attr('title');
            this.$buttonMakeBills.attr('title', title_makeBillsButton + " " + hasCanceled_title);

            let title_cutDNButton = this.$buttonCutDN.attr('title');
            this.$buttonCutDN.attr('title', title_cutDNButton + " " + hasCanceled_title);
        }
        if (_arguments.allHasBill) {
            let title_makeBillsButton = this.$buttonMakeBills.attr('title');
            this.$buttonMakeBills.attr('title', title_makeBillsButton + " " + existed_bill_title);
        }
        if(_arguments.hasBill) {
            let title_cutDNButton = this.$buttonCutDN.attr('title');
            this.$buttonCutDN.attr('title', title_cutDNButton + " " + existed_bill_title);
        }
        if (_arguments.hasFinalized) {
            let title_cutDNButton = this.$buttonCutDN.attr('title');
            this.$buttonCutDN.attr('title', title_cutDNButton + " " + hasFinalized_title);
        }

        if (_arguments.differentCustomers) {
            let title_makeBillsButton = this.$buttonMakeBills.attr('title');
            this.$buttonMakeBills.attr('title', title_makeBillsButton + " " + different_customer_title);
        }

        if (_arguments.emptyProducts) {
            let title_copyDNButton = this.$buttonCopyDN.attr('title');
            this.$buttonCopyDN.attr('title', title_copyDNButton + " " + empty_order_title);

            let title_makeBillsButton = this.$buttonMakeBills.attr('title');
            this.$buttonMakeBills.attr('title', title_makeBillsButton + " " + empty_order_title);

            let title_cutDNb = this.$buttonCutDN.attr('title');
            this.$buttonCutDN.attr('title', title_cutDNb + " " + empty_order_title);

            let title_allFinalized = this.$buttonFinalize.attr('title');
            this.$buttonFinalize.attr('title', title_allFinalized + " " + empty_order_title);
        }
    },
    hideClusterSetting: function () {
        if (window.innerWidth <= 760)
            this.$el.find('input#deliveryNoteCluster').closest('div.btn-group').addClass('hidden');
    },
    hideParentElements: function () {
        this.$parent_el.find('#delivery-notes-header').add('#delivery-notes-content').addClass('hidden');
        this.$spinner.removeClass('hidden');
    },
    showParentElements: function () {
        this.$parent_el.find('#delivery-notes-header').add('#delivery-notes-content').removeClass('hidden');
    },
    render: function () {
        this.$el.html(this.template());
        this.hideParentElements();
        setTimeout(() => {
            this.renderToolbarSetting();
            this.hideClusterSetting();
            this.disableMainButton();
            this.renderMainButton();
            this.setDefaultTitleButtons();
            this.showParentElements();
            this.setAllData();
            this.renderTopTableAfterFiltered();
            this.renderTable();
        }, 0);

        let UserListDropMenuCopy = new CopyUserListDropMenuDocumentList();
        UserListDropMenuCopy.render();
        this.$parent_el.find('#copy-delivery-note-button').off().on('click', (e) => {
            UserListDropMenuCopy.toggleDropDown();
        });
        let UserListDropMenuCut = new CutUserListDropMenuDocumentList();
        UserListDropMenuCut.render();
        this.$parent_el.find('#cut-delivery-note-button').off().on('click', (e) => {
            UserListDropMenuCut.toggleDropDown();
        });

        let $userListCopy = UserListDropMenuCopy.$el;
        let $userListCut = UserListDropMenuCut.$el;
        this.$parent_el.on('click', (e) => {
            if (!$userListCopy.is(e.target) && $userListCopy.has(e.target).length === 0 && !this.$buttonCopyDN.is(e.target) && this.$buttonCopyDN.has(e.target).length === 0) {
                $userListCopy.removeClass('open');
            }
            if (!$userListCut.is(e.target) && $userListCut.has(e.target).length === 0 && !this.$buttonCutDN.is(e.target) && this.$buttonCutDN.has(e.target).length === 0) {
                $userListCut.removeClass('open');
            }
        });

        UserListDropMenuCopy.event.onSelected = (newDocument) => {
            this.addNewDocumentsCollection(newDocument);
        };
        UserListDropMenuCut.event.onSelected = (removed_ids, newDocument) => {
            let documents = this.getAllSelectedDocuments();
            let invoiceIds = [];
            _.each(documents, (_document) => {
                if (_document.InvoiceId !== null && invoiceIds.indexOf(_document.InvoiceId) === -1)
                    invoiceIds.push(_document.InvoiceId);
            });
            if (!this.isChangingDataBackendDelete()) {
                this.removeDocumentsCollection(removed_ids);
                this.addNewDocumentsCollection(newDocument);
                this.fetchInvoices(invoiceIds);
            } else {
                this.disabledForm();
                App.api.document.delivery_note.getAll().then(
                    (documents) => {
                        this.setCollectionsAfterFetch(documents);
                        this.fetchInvoices(invoiceIds);
                        this.enabledForm();
                    },
                    () => {
                        this.enabledForm();
                    }
                );
            }
        };
        UserListDropMenuCopy.event.onSelect = (user_id) => {
            $userListCopy.removeClass('open');
            let document_ids = _.pluck(this.getAllSelectedDocuments(), 'Id');
            if (document_ids.length > 0)
                UserListDropMenuCopy.copyDocument(document_ids, user_id);
        };
        UserListDropMenuCut.event.onSelect = (user_id) => {
            $userListCut.removeClass('open');
            let document_ids = _.pluck(this.getAllSelectedDocuments(), 'Id');
            if (document_ids.length > 0)
                UserListDropMenuCut.cutDocument(document_ids, user_id);
        };
        return this;
    },
    removeDocumentsCollection: function (removed_ids) {
        if (!this.isEqualCollections()) {
            App.instance.deliveryNotes.remove(removed_ids);
            this.notes.remove(removed_ids);
        } else this.notes.remove(removed_ids);
    },
    addNewDocumentsCollection: function (documents) {
        let Models = [];
        _.each(documents, _document => {
            Models.push(new DeliveryNote(_document, {parse: true}));
        });
        if (!this.isEqualCollections()) {
            App.instance.deliveryNotes.add(Models);
            this.notes.add(_.filter(Models, model => {
                return model.get('CustomerId') === this.customerId;
            }));
        } else this.notes.add(Models);
    },
    isChangingDataBackendDelete: function () {
        return this.wasRenameDeletedDocuments() || this.wasDeleteBill();
    },
    wasDeleteBill: function () {
        return App.instance.thisUser.getSetting('deleteDnWithInvoice') === 'true';
    },
    getPeriod: function () {
        return App.instance.thisUser.getSetting('periodDNList');
    },
    getDateNameSorted: function (sortName) {
        let availableColumns = ['OrderCreateTimestamp', 'ModifyTimestamp', 'CompletedTimestamp'];
        if (sortName === undefined)
            sortName = this.getSortName();

        let result = availableColumns.indexOf(sortName) !== -1 ? sortName : 'OrderCreateTimestamp';

        return result;
    },
    setSelectOptionContraDocumentStatus: function (_document) {
        if (_document.InvoiceStatusFormatted !== null && this.optionsStatusContraDocument.indexOf(_document.InvoiceStatusFormatted) === -1)
            this.optionsStatusContraDocument.push(_document.InvoiceStatusFormatted);
    },
    getFieldsInputAvailable: function () {
        return [
            'DeliveryNoteNumber',
            'OrderCreateTimestamp',
            'ModifyTimestamp',
            'CompletedTimestamp',
            'InvoiceNumber'
        ]
    },
    getFilteredData: function (documents) {
        if (documents === undefined) {
            if (this.notes.size == 0) {
                documents = [];
            } else {
                documents = this.notes.toJSON();
            }
        }

        let self = this;
        let getTextHtmlField = function (field, _document) {
            let formatter = self.getOptionColumn(field).formatter;
            let html = formatter(_document[field], _document);

            return $(html).text();
        };
        let filterFoo = function (_document) {
            this.isEqStrings = (a, b) => {
                return a.toLocaleLowerCase().indexOf(b.toLocaleLowerCase()) === 0;
            };
            let filterPeriod = () => {
                let period;

                switch (self.currentPeriod) {
                    case 'today':
                        period = moment().startOf('day');
                        break;
                    case 'yesterday':
                        period = moment().startOf('day').subtract(1, 'day');
                        break;
                    case 'week':
                        period = moment().day("Monday");
                        break;
                    case 'sevendays':
                        period = moment().startOf('day').subtract(7, 'day');
                        break;
                    case 'month':
                        period = moment().startOf('month');
                        break;
                    case 'year':
                        period = moment().startOf('year');
                        break;
                }
                if (period === undefined)
                    return true;

                let nameDateSorted = self.getDateNameSorted();
                return moment(_document[nameDateSorted]) > period
            };
            let filterDocumentNumber = () => {
                let filter = self.filter.DeliveryNoteNumber;
                if (filter === '')
                    return true;
                else if (_document['DeliveryNoteNumber'] === null)
                    return false;
                let text = getTextHtmlField('DeliveryNoteNumber', _document);
                return this.isEqStrings(text, filter);
            };
            let dateOrderCreated = () => {
                let filter = self.filter.OrderCreateTimestamp;
                if (filter === '')
                    return true;

                let date = moment(_document['OrderCreateTimestamp']).format('DD.MM.YYYY');

                return self.checkBetweenDates(date, filter);
            };
            let dateModify = () => {
                let filter = self.filter.ModifyTimestamp;
                if (filter === '')
                    return true;

                let date = moment(_document['ModifyTimestamp']).format('DD.MM.YYYY');

                return self.checkBetweenDates(date, filter);
            };
            let dateFinalized = () => {
                let filter = self.filter.CompletedTimestamp;
                if (filter === '')
                    return true;

                let date = moment(_document['CompletedTimestamp']).format('DD.MM.YYYY');

                return self.checkBetweenDates(date, filter);
            };
            let documentStatus = () => {
                let filter = self.filter.FormattedStatus;
                if (filter === 'Alle')
                    return true;

                return filter === _document['FormattedStatus'];
            };
            let documentInvoiceNumber = () => {
                let filter = self.filter.InvoiceNumber;
                if (filter === '')
                    return true;
                else if (_document['InvoiceNumber'] === null)
                    return false;

                let text = getTextHtmlField('InvoiceNumber', _document);
                return this.isEqStrings(text, filter);
            };
            let invoiceStatus = () => {
                let filter = self.filter.InvoiceStatusFormatted;
                if (filter === 'Alle')
                    return true;

                return filter === _document['InvoiceStatusFormatted'];
            };

            return filterPeriod() &&
                filterDocumentNumber() &&
                dateOrderCreated() &&
                dateModify() &&
                dateFinalized() &&
                documentStatus() &&
                documentInvoiceNumber() &&
                invoiceStatus();
        };
        let result = _.filter(documents, (_document) => {
            return filterFoo(_document);
        });

        return result;
    },
    checkBetweenDates: function (date, filter) {
        let dateFrom = filter.substr(0, filter.indexOf('-'));
        dateFrom = dateFrom.substring(0, dateFrom.length - 1);
        let dateTo = filter.substr(filter.indexOf('-'), filter.length);
        dateTo = dateTo.substr(2);

        var d1 = dateFrom.split(".");
        var d2 = dateTo.split(".");
        var c = date.split(".");

        var from = new Date(d1[2], parseInt(d1[1])-1, d1[0]);
        var to   = new Date(d2[2], parseInt(d2[1])-1, d2[0]);
        var check = new Date(c[2], parseInt(c[1])-1, c[0]);

        return check >= from && check <= to;
    },
    getCluster: function (index) {
        return _.find(this.clusteredData, (data) => {
            return data.index <= index && index <= data.index + data.rowspan - 1;
        });
    },
    renderOneCluster: function (cluster, isOnlyShow) {
        let rows = [];
        let rowspan = 0;
        let first_number;
        let index = -1;

        let ths = this.getTable().find('thead th');
        let count_columns = ths.length;
        let column = this.getTable().find('thead th[data-field = ' + cluster.field + ']');
        let number_column = ths.index(column);
        for (let i = 0; i < cluster.rowspan; i++) {
            let number = number_column + cluster.index * count_columns + count_columns * i;

            let $td = this.getTable().find('tbody tr td:eq(' + number + ')');
            if (isOnlyShow === true) {
                $td.show().removeAttr('rowspan').removeAttr('colspan');
            } else {
                if (i === 0) {
                    $td.attr({rowspan: cluster.rowspan, colspan: 1, display: 'table-cell'});
                } else $td.hide();
            }
        }
    },

    renderClusters: function (prev_last_index) {
        this.setAttributesTdClusters(prev_last_index);

        this.setHandlerMouseover();
    },
    setAttributesTdClusters: function (prev_last_index) {
        _.each(this.clusteredData, (cluster) => {
            if (prev_last_index === undefined || (prev_last_index < cluster.index && cluster.index < this.lastVisibleIndex))
                this.renderOneCluster(cluster);
        });
    },
    setHandlerMouseover: function () {
        let $table = this.getTable();
        let $rows = $table.find('tbody tr');
        let self = this;
        _.each($rows, (row) => {
            $(row).mouseenter(function () {
                let index = $(this).data('index');
                let cluster = self.getCluster(index);
                if (cluster !== undefined) {
                    let highlight_rows = self.getHighlightRows($rows, cluster);
                    _.each(highlight_rows, (row) => {
                        $(row).addClass('hover-row')
                    })
                }
            });
            $(row).mouseleave(function () {
                let index = $(this).data('index');
                let cluster = _.find(self.clusteredData, (data) => {
                    return data.index <= index && index <= data.index + data.rowspan - 1;
                });
                if (cluster !== undefined) {
                    let highlight_rows = self.getHighlightRows($rows, cluster);
                    _.each(highlight_rows, (row) => {
                        $(row).removeClass('hover-row')
                    })
                }
            });
        });
    },
    getHighlightRows: function ($rows, cluster) {
        return _.filter($rows, (row) => {
            return cluster.index <= $(row).data('index') && $(row).data('index') <= cluster.index + cluster.rowspan - 1;
        });
    },
    setSettingPeriods: function (period) {
        App.instance.thisUser.setSetting('periodDNList', period);
        App.api.user.changeSetting.put('radio', 'periodDNList', period);
    },
    setSettingSort: function (sortName, direction) {
        App.instance.thisUser.setSetting('sortsDNList_name', sortName);
        App.api.user.changeSetting.put('radio', 'sortsDNList_name', sortName);

        App.instance.thisUser.setSetting('sortsDNList_direct', direction);
        App.api.user.changeSetting.put('radio', 'sortsDNList_direct', direction);
    },
    getWasChangedRevenue: function (field, value) {
        let result = false;
        let fieldsRevenueFormatter = this.getFieldsRevenueFormatter();
        if ((field === 'InvoiceNumber' && value === null) || fieldsRevenueFormatter.indexOf(field) !== -1)
            result = true;
        return result;
    },
});

var DocumentTableView = Backbone.View.extend({
    countOnPage: 50,
    events: {},
    showSpinner: function () {
        this.$spinner.removeClass('hidden');
    },
    hideSpinner: function () {
        this.$spinner.addClass('hidden');
    },
    getSpinner: function () {
        return this.$parent_el.find('#table-spinner');
    },
    getToolbar: function () {
        return this.$el.find('#toolbar-table');
    },
    formatPeriodDE: function () {
        let result;
        switch (this.currentPeriod) {
            case 'today':
                result = 'Heute';
                break;
            case 'yesterday':
                result = 'Gestern';
                break;
            case 'week':
                result = 'Diese Woche';
                break;
            case 'sevendays':
                result = 'Letzte Woche';
                break;
            case 'month':
                result = 'Dieser Monat';
                break;
            case 'year':
                result = 'Dieses Jahr';
                break;
            default:
                result = 'Alle Lieferscheine';
        }
        return result;
    },
    getButtonPeriod: function () {
        return this.getToolbar().find('button#date-group-dropdown');
    },
    getButtonTax: function () {
        return this.getToolbar().find('button#tax-button');
    },
    setTextButtonTax: function () {
        this.$buttonTax.find('span:first-child')
            .text(this.moneyTurnover.replace(/./, (str) => {
                return str.toUpperCase()
            }));
    },
    renderTopTable: function (filteredData) {
        let dataTopTable = this.recalculateTopTable(filteredData);

        let renderNetto = (period) => {
            let $element = this.$el.find('#' + period + 'Sum');
            $element.html('\u20AC ' + formatProfitForPrint(dataTopTable[period + 'Sum']));
            $element.removeClass();
            $element.addClass(dataTopTable[period + 'TextColor'])
        };
        renderNetto('today');
        renderNetto('thisWeek');
        renderNetto('thisMonth');
        renderNetto('thisYear');

        let renderMarge = (period) => {
            let $element = this.$el.find('#' + period + 'Mar');
            if (dataTopTable[period + 'MarAbs'] != 0) {
                $element.html(
                    '% ' + formatProfitForPrint((dataTopTable[period + 'MarAbs'] / dataTopTable[period + 'Sum']) * 100) +
                    ' / \u20AC ' + formatProfitForPrint(dataTopTable[period + 'MarAbs'])
                );
            } else {
                $element.html('% -  / \u20AC -');
            }
            $element.removeClass().addClass(dataTopTable[period + 'TextColor']);
        };
        renderMarge('today');
        renderMarge('thisWeek');
        renderMarge('thisMonth');
        renderMarge('thisYear');

        let renderTax = (period) => {
            let $element = this.$el.find('#' + period + 'Tax');
            $element.html(
                '\u20AC ' + formatOtherMoneyForPrint(dataTopTable[period + 'TaxA']) + ' / ' +
                '\u20AC ' + formatOtherMoneyForPrint(dataTopTable[period + 'TaxB']) + ' / ' +
                '\u20AC ' + formatOtherMoneyForPrint(dataTopTable[period + 'Tax'])
            );
            $element.removeClass().addClass(dataTopTable[period + 'TextColor']);
        };
        renderTax('today');
        renderTax('thisWeek');
        renderTax('thisMonth');
        renderTax('thisYear');

        let renderBrutto = (period) => {
            let $element = this.$el.find('#' + period + 'Gr');
            $element.html('\u20AC ' + formatProfitForPrint(dataTopTable[period + 'Sum'] + dataTopTable[period + 'Tax']));

            $element.removeClass().addClass(dataTopTable[period + 'TextColor']);
        };
        renderBrutto('today');
        renderBrutto('thisWeek');
        renderBrutto('thisMonth');
        renderBrutto('thisYear');
    },
    isCanceled: function (_document) {
        return _document['Status'] === 'Canceled';
    },
    recalculateTopTable: function (_documents) {
        if (_documents === undefined) {
            if (this.isThisDeliveryNoteView())
                _documents = this.notes.toJSON();
            else
                _documents = this.invoices.toJSON();
        }
        let todaySum = 0.0; //heute
        let todayMarAbs = 0.0;
        let todayTax = 0.0;
        let todayTaxA = 0.0;
        let todayTaxB = 0.0;
        let thisWeekSum = 0.0; //diese Woche
        let thisWeekMarAbs = 0.0;
        let thisWeekTax = 0.0;
        let thisWeekTaxA = 0.0;
        let thisWeekTaxB = 0.0;
        let thisMonthSum = 0.0; //diesen Monat
        let thisMonthMarAbs = 0.0;
        let thisMonthTax = 0.0;
        let thisMonthTaxA = 0.0;
        let thisMonthTaxB = 0.0;
        let thisYearSum = 0.0; //dieses Jahr
        let thisYearMarAbs = 0.0;
        let thisYearTax = 0.0;
        let thisYearTaxA = 0.0;
        let thisYearTaxB = 0.0;
        let todayTextColor, thisWeekTextColor, thisMonthTextColor, thisYearTextColor;
        todayTextColor = thisWeekTextColor = thisMonthTextColor = thisYearTextColor = '';

        let sortedDateName = this.getDateNameSorted();

        let today = moment().startOf('day');
        let thisWeek = moment().startOf('isoWeek');
        let thisMonth = moment().startOf('month');
        let thisYear = moment().startOf('year');

        let getTax = (_document) => {return $.isNumeric(_document.SumTotalTax) ? _document.SumTotalTax : 0.0};
        let getTaxA = (_document) => {return $.isNumeric(_document.ArticleTaxA) ? _document.ArticleTaxA : 0.0};
        let getTaxB = (_document) => {return $.isNumeric(_document.ArticleTaxB) ? _document.ArticleTaxB : 0.0};
        _.each(_documents, (_document) => {
            this.setSelectOptionStatus(_document);
            this.setSelectOptionContraDocumentStatus(_document);
            this.setSelectOptionPaymentState(_document);

            let momentDataSort = moment(_document[sortedDateName]);

            if (this.isCanceled(_document) !== true) {
                if (momentDataSort > today) {
                    todaySum = todaySum + _document.SumTotalPrice;
                    todayMarAbs += _document.SumTotalProfitAbsolute;
                    todayTextColor = this.setTextColorHeader(_document.containsDailyPriceCount, todayTextColor);
                    todayTax += getTax(_document);
                    todayTaxA += getTaxA(_document);
                    todayTaxB += getTaxB(_document);
                }

                if (momentDataSort > thisWeek) {
                    thisWeekSum += _document.SumTotalPrice;
                    thisWeekMarAbs += _document.SumTotalProfitAbsolute;
                    thisWeekTextColor = this.setTextColorHeader(_document.containsDailyPriceCount, thisWeekTextColor);
                    thisWeekTax += getTax(_document);
                    thisWeekTaxA += getTaxA(_document);
                    thisWeekTaxB += getTaxB(_document);
                }

                if (momentDataSort > thisMonth) {
                    thisMonthSum += _document.SumTotalPrice;
                    thisMonthMarAbs += _document.SumTotalProfitAbsolute;
                    thisMonthTextColor = this.setTextColorHeader(_document.containsDailyPriceCount, thisMonthTextColor);
                    thisMonthTax += getTax(_document);
                    thisMonthTaxA += getTaxA(_document);
                    thisMonthTaxB += getTaxB(_document);
                }

                if (momentDataSort > thisYear) {
                    thisYearSum += _document.SumTotalPrice;
                    thisYearMarAbs += _document.SumTotalProfitAbsolute;
                    thisYearTextColor = this.setTextColorHeader(_document.containsDailyPriceCount, thisYearTextColor);
                    thisYearTax += getTax(_document);
                    thisYearTaxA += getTaxA(_document);
                    thisYearTaxB += getTaxB(_document);
                }
            }
        });

        this.optionsStatus.sort();
        this.optionsStatusContraDocument.sort();
        if(this.optionsPaymentState !== undefined)
            this.optionsPaymentState.sort();

        let result = {
            todaySum: todaySum,
            todayMarAbs: todayMarAbs,
            todayTax: todayTax,
            todayTaxA: todayTaxA,
            todayTaxB: todayTaxB,

            thisWeekSum: thisWeekSum,
            thisWeekMarAbs: thisWeekMarAbs,
            thisWeekTax: thisWeekTax,
            thisWeekTaxA: thisWeekTaxA,
            thisWeekTaxB: thisWeekTaxB,

            thisMonthSum: thisMonthSum,
            thisMonthMarAbs: thisMonthMarAbs,
            thisMonthTax: thisMonthTax,
            thisMonthTaxA: thisMonthTaxA,
            thisMonthTaxB: thisMonthTaxB,

            thisYearSum: thisYearSum,
            thisYearMarAbs: thisYearMarAbs,
            thisYearTax: thisYearTax,
            thisYearTaxA: thisYearTaxA,
            thisYearTaxB: thisYearTaxB,

            todayTextColor: todayTextColor,
            thisWeekTextColor: thisWeekTextColor,
            thisMonthTextColor: thisMonthTextColor,
            thisYearTextColor: thisYearTextColor
        };

        return result;
    },
    setTextColorHeader: function (containsDailyPrice, previous_value) {
        return setTextColorHeaderDocument(containsDailyPrice, previous_value);
    },
    setSelectOptionStatus: function (_document) {
        if (_document.FormattedStatus !== null && this.optionsStatus.indexOf(_document.FormattedStatus) === -1)
            this.optionsStatus.push(_document.FormattedStatus);
    },
    setAllData: function (noChangeLastVisibleIndex) {
        this.filteredData = this.getFilteredData();
        this.setData(noChangeLastVisibleIndex);
    },
    getOptionColumn: function (column) {
        let $table = this.getTable();
        let optionsTable = $table.bootstrapTable('getOptions');
        let columnsOptions = optionsTable.columns[0];

        return _.findWhere(columnsOptions, {field: column});
    },
    isThisDeliveryNoteView: function () {
        return Object.getPrototypeOf(this).hasOwnProperty('isDeliveryNoteView');
    },
    setVisibleData: function (isNewData, noChangeLastVisibleIndex) {
        let data;
        if (this.isThisDeliveryNoteView())
            data = this.filteredDataSortedClustered;
        else data = this.filteredDataSorted;

        if (isNewData === undefined || isNewData)
            this.pageNumber = 0;

        if (noChangeLastVisibleIndex === undefined || noChangeLastVisibleIndex !== true)
            this.setLastVisibleIndex(noChangeLastVisibleIndex);
        return data.slice(0, this.lastVisibleIndex + 1);
    },
    hiddenTable: function () {
        this.isHiddenTable = true;
        let table = this.getTable();
        table.closest('div.fixed-table-container').addClass('hidden');
        this.showSpinner();
    },
    removeExcessElements: function () {
        let $bt_el = this.$el.find('div.clearfix');
        let length = $bt_el.length;
        if (length > 1)
            $bt_el.remove(':lt(' + (length - 1) + ')');

        $bt_el = this.$el.find('div.bootstrap-table');
        length = $bt_el.length;
        if (length > 1)
            $bt_el.remove(':lt(' + (length - 1) + ')');
    },
    getCountVisible: function () {
        return this.visibleData.length;
    },
    changeCountsDocument: function () {
        this.getToolbar().find('.total-number-row').text(this.getCountVisible() + ' / ' + this.getCountAllData());
    },
    tableRenderHelper: function () {
        this.drawSorts();
        this.renderFilter();
    },
    renderFilter: function () {
        let $ths = this.getTable().find('th');
        let available_input_fields = this.getFieldsInputAvailable();
        let select_status_field = 'FormattedStatus';
        let select_contra_status_field = this.isThisDeliveryNoteView() ? 'InvoiceStatusFormatted' : 'DeliveryNotesStatusFormatted';
        _.each($ths, (th) => {
            let $th = $(th);
            let field = $th.data('field');
            if (available_input_fields.indexOf(field) !== -1) {
                if ($th.hasClass('table-th-datepicker-block')) {
                    let filter_el =
                        '<div class="filter-control">' +
                        '<input type="text" class="form-control" data-field="' + field + '"' +
                        ' value="' + this.filter[field] + '"' +
                        ' style="width: 100%; font-size: 10px!important" placeholder="Alle">' +
                        '</div>';

                    $th.find('div.fht-cell').html(filter_el);


                    let filterDatepickerOptions = {
                        locale: {
                            format: 'DD.MM.YYYY',
                            monthNames: [
                                "Januari",
                                "Februari",
                                "Maart",
                                "April",
                                "Mei",
                                "Juni",
                                "Juli",
                                "Augustus",
                                "September",
                                "Oktober",
                                "November",
                                "December"
                            ],
                            cancelLabel: 'Löschen'
                        },
                        autoclose: true,
                        language: 'de',
                        opens: 'center',
                        drops: 'up',
                        autoApply: true,
                        autoUpdateInput: false
                    };
                    let el = $th.find('div.fht-cell input')[0];
                    el.classList.add('daterange-text');
                    $(el).daterangepicker(filterDatepickerOptions)
                        .on('cancel.daterangepicker', function(e, picker) {
                            $(el).val('');
                            $(e.currentTarget).trigger($.Event('keyup', {keyCode: 13}));
                        })
                        .on('apply.daterangepicker', (e, picker) => {
                            picker.element.val(picker.startDate.format(picker.locale.format) + ' - ' + picker.endDate.format(picker.locale.format));
                            $(e.currentTarget).val(e.currentTarget.value);
                            $(e.currentTarget).trigger($.Event('keyup', {keyCode: 13}));
                        })
                        .on('hide.daterangepicker', () => {
                            this.setHandlers()
                        });
                } else {
                    let filter_el_no_date =
                        '<div class="filter-control">' +
                        '<input type="text" class="form-control" data-field="' + field + '"' +
                        ' value="' + this.filter[field] + '"' +
                        ' style="width: 100%;" placeholder="Alle">' +
                        '</div>';

                    $th.find('div.fht-cell').html(filter_el_no_date);
                }
            } else if (field === select_status_field || field === select_contra_status_field || field === 'paymentState') {
                this.renderSelectFilter(field, $th);
            } else if ($th.hasClass('bst-checkbox')) {
                let checkbox = '<input name="selectAll" type="checkbox">';
                $th.find('div.th-inner').html(
                    checkbox
                );
            }
        });
    },
    renderSelectFilter: function (field, $th) {
        if($th === undefined)
            $th = this.getTable().find('th[data-field="' + field + '"]');

        if($th !== undefined) {
            let filter_el =
                '<div class="filter-control">' +
                '<select class="form-control" data-field="' + field + '" style="width: 100%;" dir="ltr"></select>' +
                '</div>';
            let $filter_el = $(filter_el);
            let $select = $filter_el.find('select');

            let available_options = this.getExistingOption(field);
            _.each(available_options, (option, index) => {
                $select[0].options[index] = new Option(option, option, option === this.filter[field], option === this.filter[field]);
            });

            $th.find('div.fht-cell').html(
                $filter_el
            );
            this.setHandlersCommonTable();
        }
    },
    sortTable: function (e) {
        if ($(e.target).prop('tagName') === 'INPUT')
            return;

        this.hideTable();
        let $target = $(e.currentTarget);
        let sortName = $target.data('field');

        let direction = $target.find('div.th-inner').hasClass('desc-sort') ? 'asc' : 'desc';

        this.disableMainButton();
        this.setDefaultTitleButtons();

        let setting_dateNameSorted = this.getDateNameSorted();
        let future_dateNameSorted = this.getDateNameSorted(sortName);

        this.setSettingSort(sortName, direction);

        this.setAllData();
        if (setting_dateNameSorted !== future_dateNameSorted)
            this.renderTopTableAfterFiltered();
        this.reloadTable();
    },
    getClassesThInnerAvailable: function () {
        return 'both-sort asc-sort desc-sort';
    },
    setClassThInner: function (th) {
        let $th_inner = $(th).find('.th-inner');
        $th_inner.removeClass(this.getClassesThInnerAvailable());

        let columSort = this.getSortName();
        let sortDirect = this.getSortDirection();

        let field = $(th).data('field');

        let class_name = 'both-sort';

        if (field === columSort) {
            switch (sortDirect) {
                case 'asc':
                    class_name = 'asc-sort';
                    break;
                case 'desc':
                    class_name = 'desc-sort';
                    break;
            }
        }
        $th_inner.addClass(class_name);
    },
    drawSorts: function () {
        let ths = this.getTable().find('th.sortable');
        ths.each((i, th) => {
            this.setClassThInner(th);
        });
    },
    renderHideColumn: function () {
        let settings = App.instance.thisUser.getSetting();
        let prefix = this.isThisDeliveryNoteView() ? 'DN' : 'Invoice'
        _.each(settings, (value, setting) => {
            if (setting.indexOf(prefix + 'ListShowColumn_') === 0) {
                let column = setting.slice((prefix + 'ListShowColumn_').length);
                let isVisible = value === 'true';
                this.toggleColumnVisible(column, isVisible);
            }
        });
    },
    toggleColumnVisible: function (column, isVisible) {
        let ths = this.getTable().find('th');

        let index = _.findIndex(ths, (th) => {
            return $(th).data('field') === column;
        });
        let trs = this.getTable().find('tbody tr');

        if (isVisible) {
            $(ths[index]).removeClass('hidden');
            _.each(trs, (tr) => {
                $(tr).find('td:eq(' + index + ')').removeClass('hidden');
            });
        } else {
            $(ths[index]).addClass('hidden');
            _.each(trs, (tr) => {
                $(tr).find('td:eq(' + index + ')').addClass('hidden');
            });
        }
    },
    offMainCheckbox: function () {
        this.getTable().find('th.bst-checkbox input[type="checkbox"]').prop('checked', false);
    },
    setHandlersCommonParent: function () {
        $('body').off('keyup').on('keyup', (e) => {
            this.keyupOnList(e);
        });
        $('body').off('keydown').on('keydown', (e) => {
            this.keydownOnList(e);
        });
        this.$parent_el.find('.overflow-wrapper').off('scroll').on('scroll', (e) => {
            this.scrollChange(e);
        });
    },
    keyupOnList: function (e) {
        if (e.keyCode === 38) this.$buttonPageUp.trigger('click');
        if (e.keyCode === 40) this.$buttonPageDown.trigger('click');
    },
    keydownOnList: function (e) {
        if ('originalEvent' in e && 'repeat' in e.originalEvent && e.originalEvent.repeat)
            return;

        if (e.keyCode === 38 || e.keyCode === 40) {
            let direction = e.keyCode === 38 ? 'up' : 'down';
            this.handlerNavigator(e, direction);
        }
    },
    handlerNavigator: function (event, direction) {
        function captureClick(e) {
            e.stopPropagation();
            let event_opposite = event.type === 'keydown' ? 'keyup' : 'click';
            window.removeEventListener(event_opposite, captureClick, true);
        }

        let pressTimer;
        let $target = $(event.currentTarget);
        pressTimer = setTimeout(() => {
            let event_opposite = event.type === 'keydown' ? 'keyup' : 'click';
            window.addEventListener(
                event_opposite,
                captureClick,
                true
            );
            if (direction === 'up')
                this.scrollTop();
            else this.scrollBottom();
        }, 1000);
        let event_opposite = event.type === 'keydown' ? 'keyup' : 'mouseup';
        $target.one(event_opposite, (event) => {
            clearTimeout(pressTimer);
        });
    },
    scrollTop: function () {
        this.$parent_el.find('div.container').get(0).scrollIntoView(true);
    },
    scrollBottom: function () {
        this.$parent_el.find('div.container').get(0).scrollIntoView(false);
    },
    scrollChange: function (e) {
        if (this.isHiddenTable === true) {
            this.isHiddenTable = false;
            return;
        }
        if (this.scrollTimer)
            clearTimeout(this.scrollTimer);
        this.scrollTimer = setTimeout(() => {
            this.changeNavigateButton();
        }, 100);

        if (this.isEndScroll(e) && this.haveHiddenData())
            this.addRows(e);
    },
    isEndScroll: function (e) {
        let $el = $(e.currentTarget);
        let height_visible = $el.height();
        let height_whole = $el.get(0).scrollHeight;
        let available_scroll = height_whole - (height_visible + $el.scrollTop());

        return available_scroll < 20;
    },
    haveHiddenData: function () {
        return this.getCountVisible() < this.getCountAllData();
    },
    changeNavigateButton: function () {
        let height_container = this.$parent_el.find('div.container').height();
        let height_displayed = this.$parent_el.find('div.overflow-wrapper').height();
        let scroll_height = height_container - height_displayed;

        let top_scroll_wrapper = this.$parent_el.find('div.overflow-wrapper').scrollTop();

        let count_summary = this.getCountAllData();
        let count_visible = this.getCountVisible();

        if (count_summary === count_visible && (scroll_height - 3) <= top_scroll_wrapper)
            this.$buttonPageDown.prop('disabled', true);
        else this.$buttonPageDown.prop('disabled', false);

        if (top_scroll_wrapper - 3 <= 0)
            this.$buttonPageUp.prop('disabled', true);
        else this.$buttonPageUp.prop('disabled', false);
    },
    getVisibleDocument: function (index) {
        return this.visibleData[index];
    },
    changeCheckedDocument: function (count) {
        this.getToolbar().find('.checked-number-row').text(count);
    },
    getCheckedCheckbox: function () {
        return this.getTable().find('tbody td.bst-checkbox input:checked');
    },
    getCheckbox: function () {
        return this.getTable().find('tbody td.bst-checkbox input');
    },
    /**
     * @returns {Array}
     */
    getAllSelectedDocuments: function () {
        let checkeds = this.getCheckedCheckbox();
        let result = [];
        _.each(checkeds, (checkbox) => {
            result.push(this.getVisibleDocument(this.getDataIndexCheckbox(checkbox)));
        });
        return result;
    },
    getDataIndexCheckbox: function (checkbox) {
        return $(checkbox).closest('tr').data('index');
    },
    setHandlersRow: function ($row) {
        $row.find('.show-delivery-note').off('click').on('click', (e) => {
            this.showDocument(e);
        });
        $row.find('.show-invoice').off('click').on('click', (e) => {
            this.showDocument(e);
        });
        $row.find('td.bst-checkbox input').off('change').on('change', (e) => {
            this.renderParentButtonsStatus();
        });
    },
    setHandlersCommonRows: function () {
        this.getTable().find('.show-delivery-note').off('click').on('click', (e) => {
            this.showDocument(e);
        });
        this.getTable().find('.show-invoice').off('click').on('click', (e) => {
            this.showDocument(e);
        });
        this.getTable().find('tbody td.bst-checkbox input').off('change').on('change', (e) => {
            let $target = $(e.currentTarget);
            if (!$target.is(':checked'))
                this.offMainCheckbox();

            this.renderParentButtonsStatus();
        });
        this.getTable().find('tbody > tr[data-index] > td').off('click dblclick');
    },
    changeHideColumn: function (e) {
        this.changeCheckboxSetting(e);

        let column = $(e.target).data('field');
        let isVisible = $(e.target).prop('checked');
        this.toggleColumnVisible(column, isVisible);
    },
    changeCheckboxSetting: function (e) {
        let nameSetting = e.target.getAttribute('id');
        let value = $(e.target).prop('checked') + '';

        App.api.user.changeSetting.put('checkbox', nameSetting, value);
        App.instance.thisUser.setSetting(nameSetting, value);
    },
    showDocument: function (e) {
        let $target = $(e.currentTarget);
        let document_id = Number($target.data('id'));
        let isClickDeliveryNote = $target.hasClass('show-delivery-note');

        if (this.isMobile()) {
            if (this.isFirstClick(document_id, isClickDeliveryNote)) {
                e.preventDefault();
                e.stopPropagation();

                $('.popover').hide();
                setTimeout(() => {
                    $target.popover('show');
                }, 200);
                this.setLastClicked(document_id, isClickDeliveryNote);
                let delayNotifySetting = Number(App.instance.thisUser.getSetting('delayNotifySetting')) * 1000;
                this.popupTimerId = setTimeout(function () {
                    $('.popover').hide();
                }, delayNotifySetting + 200);
                return;
            }
        } else
            this.setLastClicked(document_id, isClickDeliveryNote);

        this.renderLastClickedLink();
        this.setSelectionModel(document_id, isClickDeliveryNote);
    },
    isFirstClick: function (document_id, isClickDeliveryNote) {
        if(this.isThisDeliveryNoteView()) {
            return document_id !== (   isClickDeliveryNote ? this.lastClicked : this.lastClickedContraDocument);
        } else return document_id !== ( ! isClickDeliveryNote ? this.lastClicked : this.lastClickedContraDocument);
    },
    setSelectionModel: function (document_id, isClickDeliveryNote) {
        document_id = document_id.toString();
        let selection_model = isClickDeliveryNote ? 'SelectedDeliveryNoteId' : 'SelectedInvoiceId';
        App.instance.selectionModel.set(selection_model, document_id);
    },
    setLastClicked: function (document_id, isClickDeliveryNote) {
        if (this.isThisDeliveryNoteView()) {
            this.lastClicked = isClickDeliveryNote ? document_id : 0;
            this.lastClickedContraDocument = isClickDeliveryNote ? 0 : document_id;
        } else {
            this.lastClicked = !isClickDeliveryNote ? document_id : 0;
            this.lastClickedContraDocument = !isClickDeliveryNote ? 0 : document_id;
        }
    },
    renderLastClickedLink: function () {
        this.getTable().find('tbody .show-delivery-note.last-clicked,.show-invoice.last-clicked').each(function () {
            $(this).removeClass('last-clicked');
        });
        let _document = this.isThisDeliveryNoteView() ? 'delivery-note' : 'invoice';
        let contra_document = this.isThisDeliveryNoteView() ? 'invoice' : 'delivery-note';
        if (this.lastClicked !== 0)
            this.getTable().find('tbody .show-' + _document + '[data-id = ' + this.lastClicked + ']').addClass('last-clicked');
        if (this.lastClickedContraDocument !== 0)
            this.getTable().find('tbody .show-' + contra_document + '[data-id = ' + this.lastClickedContraDocument + ']').addClass('last-clicked')
    },
    isMobile: function () {
        return window.innerWidth <= 768;
    },
    setHandlersCommonTable: function () {
        this.getTable().find('thead th.sortable').off('click').on('click', (e) => {
            this.sortTable(e);
        });
        this.getTable().find('thead th input').off('keyup').on('keyup', (e) => {
            this.keyupFilter(e);
        });
        this.getTable().find('thead th select').off('change').on('change', (e) => {
            this.changeFilter(e);
        });
        this.getTable().find('thead th.bst-checkbox input[name = selectAll]').off('change').on('change', (e) => {
            this.changeSelectAll(e);
        });
    },
    setHandlersCommonToolbar: function () {
        this.getToolbar().find('input[name="turnover"]').off('change').on('change', (e) => {
            this.turnoverChanged(e);
        });
        this.getToolbar().find('input[name="period-document"]').off('change').on('change', (e) => {
            this.changePeriod(e);
        });
        this.getToolbar().find('div[title="Spalten"] ul.dropdown-menu').on('click', (e) => {
            e.stopPropagation();
        });
        this.getToolbar().find('.add-column-menu').off('change').on('change', (e) => {
            this.changeHideColumn(e);
        });
    },
    setHandlersCommonButtons: function () {
        this.$buttonPageUp.off('mousedown').on('mousedown', (e) => {
            this.mousedownPageUp(e);
        });
        this.$buttonPageUp.off('touchstart').on('touchstart', (e) => {
            this.touchstartPageUp(e);
        });
        this.$buttonPageUp.off('click').on('click', () => {
            this.clickPageUp();
        });
        this.$buttonPageDown.off('mousedown').on('mousedown', (e) => {
            this.mousedownPageDown(e);
        });
        this.$buttonPageDown.off('touchstart').on('touchstart', (e) => {
            this.touchstartPageDown(e);
        });
        this.$buttonPageDown.off('click').on('click', () => {
            this.clickPageDown();
        });
        this.$buttonDeleteSelected.off('click').on('click', () => {
            this.deleteDocuments();
        });
        this.$buttonFinalize.off('click').on('click', () => {
            this.finalizeDocuments();
        });
        this.$buttonContraList.off('click').on('click', () => {
            this.$parent_el.modal('hide');
            this.openContraTable();
        });
    },
    disabledForm: function () {
        this.disableMainButton();
        this.setDefaultTitleButtons();

        this.getTable().find('thead th.sortable').addClass('disabled');
        this.getTable().find('thead th input, thead th select').prop('disabled', true);
        this.getToolbar().find('input[type="checkbox"], button').prop('disabled', true);
    },
    enabledForm: function () {
        this.getTable().find('thead th input, thead th select').prop('disabled', false);
        this.getToolbar().find('input[type="checkbox"], button').prop('disabled', false);
        this.getTable().find('thead th.sortable').removeClass('disabled');
    },
    touchstartPageUp: function (e) {
        this.handlerNavigator(e, 'up');
    },
    mousedownPageUp: function (e) {
        if (!isTouchDevice())
            this.handlerNavigator(e, 'up');
    },
    touchstartPageDown: function (e) {
        this.handlerNavigator(e, 'down');
    },
    mousedownPageDown: function (e) {
        if (!isTouchDevice())
            this.handlerNavigator(e, 'down');
    },
    clickPageDown: function () {
        let hiegth_header = this.$parent_el.find('nav.popup-header').height();
        let position_scroll = -this.$parent_el.find('div.container').position().top + hiegth_header;

        let height_displayed = this.$parent_el.find('div.overflow-wrapper').height();

        this.$parent_el.find('div.overflow-wrapper').scrollTop(position_scroll + height_displayed);
        this.changeNavigateButton();
    },
    clickPageUp: function () {
        let hiegth_header = this.$parent_el.find('nav.popup-header').height();
        let position_scroll = -this.$parent_el.find('div.container').position().top + hiegth_header;

        let height_displayed = this.$parent_el.find('div.overflow-wrapper').height();

        this.$parent_el.find('div.overflow-wrapper').scrollTop(position_scroll - height_displayed);
        this.changeNavigateButton();
    },

    showTable: function () {
        this.displayTable();

        this.$parent_el.find('#buttonCloseModal .btn-danger').prop('disabled', false);

        this.$buttonContraList.prop('disabled', false);
        this.$buttonContraList.css({'opacity': '1'});

        this.hideSpinner();

        this.getToolbar().find('input[type="checkbox"], button').prop('disabled', false);
        this.isHiddenTable = false;
    },
    displayTable: function () {
        this.getTable().closest('div.fixed-table-container').removeClass('hidden');
    },
    hideTable: function () {
        let $table = this.getTable();
        this.setDefaultTitleButtons();
        this.disableMainButton();

        this.hiddenTable();

        this.$parent_el.find('#buttonCloseModal .btn-danger').prop('disabled', true);
        this.$buttonContraList.prop('disabled', true);
        this.$buttonContraList.css({'opacity': '0.7'});

        this.getToolbar().find('input[type="checkbox"], button').prop('disabled', true);
    },
    initializeCommonValues: function () {
        this.timerRenderParentButtonsStatus = 0;
        this.isHiddenTable = false;
        this.lastClicked = 0;
        this.lastClickedContraDocument = 0;
        this.optionsStatus = ['Alle'];
        this.optionsStatusContraDocument = ['Alle'];
        this.visibleData = [];
        this.filteredData = [];
        this.filteredDataSorted = [];
        this.lastVisibleIndex = 0;
        this.pageNumber = 0;
    },
    changeSelectAll: function (e) {
        if ($(e.currentTarget).is(':checked'))
            this.checkAll();
        else this.uncheckAll();
    },
    getAllFinalizedCanceled: function (arguments, document_status) {
        let prev_value = arguments.allFinalizedCanceled;
        let result = prev_value;
        if (prev_value === null) {
            if (document_status !== 'Completed' && document_status !== 'Canceled')
                result = false;
            else result = true;
        } else if (prev_value === true && document_status !== 'Completed' && document_status !== 'Canceled')
            result = false;
        return result;
    },
    setAllFinalized: function (allFinalized, document_status) {
        let result = allFinalized;
        if (allFinalized === null) {
            if (document_status !== 'Completed')
                result = false;
            else result = true;
        } else if (allFinalized === true && document_status !== 'Completed')
            result = false;

        return result;
    },
    setAllCanceled: function (allCanceled, document_status) {
        let result = allCanceled;
        if (allCanceled === null) {
            if (document_status !== 'Canceled')
                result = false;
            else result = true;
        } else if (allCanceled === true && document_status !== 'Canceled')
            result = false;

        return result;
    },
    changePeriod: function (e) {
        let $target = $(e.target);
        let value = $target.val();

        this.$buttonPeriod.find('span:first-child').text($target.next('span').text());

        this.setSettingPeriods(value);
        this.currentPeriod = this.getPeriod();

        this.setAllData();
        this.renderTopTableAfterFiltered();
        this.reloadTable();
    },
    renderTopTableAfterFiltered: function () {
        this.renderTopTable(this.filteredData);
    },
    reloadTable: function () {
        this.hideTable();
        setTimeout(() => {
            let $table = this.getTable();
            $table.remove();
            let id = this.isThisDeliveryNoteView() ? 'delivery-notes' : 'invoices';
            this.$el.append('<table id="' + id + '-table"></table>');

            this.renderTable();
        }, 0);
    },
    turnoverChanged: function (e) {
        let value = $(e.target).val();
        this.moneyTurnover = value;

        this.setTextButtonTax();

        let name_setting = this.isThisDeliveryNoteView() ? 'taxDNList' : 'taxInvoiceList';
        App.instance.thisUser.setSetting(name_setting, this.moneyTurnover);
        App.api.user.changeSetting.put('radio', name_setting, this.moneyTurnover);

        this.setRevenues();
        this.setAllData();

        this.reloadTable();
        this.$buttonTax.dropdown('toggle');
    },
    getRevenue: function (Document) {
        let result = Document.get('SumTotalPrice');
        if (result !== null && this.moneyTurnover === 'brutto')
            result += Document.get('SumTotalTax');

        return result;
    },
    keyupFilter: function (e) {
        if (e.keyCode === 13)
            this.changeFilter(e);
    },
    changeFilter: function (e) {
        let $item = $(e.currentTarget);

        let field = $item.data('field');
        let value = $item.val().trim();

        if (this.filter[field] !== value) {
            this.filter[field] = value;

            this.hideTable();

            setTimeout(() => {
                this.setAllData();
                this.renderTopTableAfterFiltered();
                this.reloadTable();
            }, 0);
        }
    },
    setSorted: function () {
        let documents = _.clone(this.filteredData);

        let property = this.getSortName();
        let predicat_direction = (this.getSortDirection() === 'asc') ? 1 : -1;

        let main_field = this.isThisDeliveryNoteView() ? 'DeliveryNoteNumber' : 'InvoiceNumber';

        let compareByTitle = (a, b) => {

            //TODO may be null (was fixed by migration)
            if(!this.isThisDeliveryNoteView())
                switch (true) {
                    case a['InvoiceNumber'] === null && b['InvoiceNumber'] === null:
                        return 0;
                    case a['InvoiceNumber'] === null:
                        return -1;
                    case b['InvoiceNumber'] === null:
                        return 1;
                }

            return a[main_field].toLowerCase().localeCompare(b[main_field].toLowerCase()) > 0 ? predicat_direction :
                (
                    a[main_field].toLowerCase().localeCompare(b[main_field].toLowerCase()) < 0 ?
                        -predicat_direction : 0

                );
        };
        let isNull = (property) => {
            return property === null || property === '0000-00-00 00:00:00';
        };
        documents.sort((a, b) => {
            if (isNull(a[property]) && isNull(b[property]))
                return 0;
            if (isNull(a[property]))
                return 1;
            if (isNull(b[property]))
                return -1;

            switch (true) {
                case typeof a[property] === "string" && typeof b[property] === "string":
                    return a[property].toLowerCase().localeCompare(b[property].toLowerCase()) > 0 ? predicat_direction :
                        (
                            a[property].toLowerCase().localeCompare(b[property].toLowerCase()) < 0 ?
                                -predicat_direction :
                                (
                                    property !== main_field ?
                                        compareByTitle(a, b) : 0
                                )
                        );
                    break;
                case !this.isThisDeliveryNoteView() && property === 'sourceDeliveryNotes':
                    return a[property][0]['Number'] > b[property][0]['Number'] ? predicat_direction :
                        (
                            a[property][0]['Number'] < b[property][0]['Number'] ?
                                -predicat_direction : 0
                        );
                    break;
                default:
                    return a[property] > b[property] ? predicat_direction :
                        (
                            a[property] < b[property] ?
                                -predicat_direction : 0
                        );
            }
        });
        this.filteredDataSorted = documents;
    },
    wasRenameDeletedDocuments: function () {
        return App.instance.thisUser.getSetting('renameDeletedDocuments') === 'true';
    },
    isEqualCollections: function () {
        return this.customerId === 0;
    },
    getWasChangedCancelStatus: function (Changes) {
        let result = false;

        if(Changes.changed.hasOwnProperty('Status'))
            if(Changes.changed.Status === 'Canceled' || Changes.previousAttributes()['Status'] === 'Canceled')
                result = true;

        return result;
    },
    updateView: function () {
        this.disableMainButton();
        this.setDefaultTitleButtons();

        this.setAllData();
        this.renderTopTableAfterFiltered();

        this.reloadTable();
    },
    changeTable: function (changes) {
        if (changes !== undefined && changes instanceof Backbone.Model)
            this.applyChanges(changes);
        this.renderParentButtonsStatus();
    },
    renderNumberColumn: function (index_row, field){
        let index_column = '',
            html = '',
            documentNumber = '';

        let $row = this.getRow(index_row);
        index_column = this.getTable().find('th[data-field="' + field + '"]').index();
        documentNumber = this.getTd(index_row, index_column)[0].innerText.split(' ')[0];
        html = this.getOptionColumn(field).formatter(documentNumber, this.visibleData[index_row], '');

        let $td = this.getTd(index_row, index_column);
        html = this.returnLastClicked(html, $td);

        $td.html(html);
        this.setHandlersRow($row);
    },
    resetCollection: function () {
        this.updateView();
    },
    removeCollection: function (models, collection, options) {
    },
    updateTable: function (collection, options) {
        let needReloadTable = false;
        let added = options.changes.added;
        let removed = options.changes.removed;

        if (removed.length > 0) {
            needReloadTable = this.removeDocumentRows(removed);
        }

        if (!needReloadTable && added.length > 0) {
            this.offMainCheckbox();
            needReloadTable = this.addDocumentRows(added);
        }
        if (!needReloadTable) {
            setTimeout(() => {
                this.setAllData(true);
                this.renderHideColumn();
                this.setAllIndexTable();
                this.changeCountsDocument();
                this.setHandlersCommonRows();
                this.setHandlerMouseover();
                customDelay(() => this.renderTopTableAfterFiltered(), 200);
            }, 0);
        } else {
            this.updateView();
        }
        this.renderParentButtonsStatus();
    },
    setAllIndexTable: function () {
        let $rows = this.getTable().find('tbody tr');
        _.each($rows, (row, index) => {
            if ($(row).find('td').length > 1) {
                $(row).data('index', index);
                $(row).find('td:first-child').text(index + 1);
            }
        });
    },

    /**
     *
     * @param collection
     * @param document_id
     * @returns {number|-1}
     */
    findIndexCollection: function (collection, document_id) {
        return _.findIndex(collection, (data) => {
            return data['Id'] === document_id
        });
    },
    reRenderTurnoverField: function (_document, index_row) {
        let option = this.getOptionColumn('revenue');
        let html = '';
        if (option !== undefined && option.hasOwnProperty('formatter')) {
            html = option.formatter(null, _document);
        }

        let index_column = this.getTable().find('th[data-field="revenue"]').index();
        this.getTd(index_row, index_column).html(html);
    },
    getFieldsAvailable: function () {
        let $table = this.getTable();
        let optionsTable = $table.bootstrapTable('getOptions');
        let Columns = optionsTable.columns[0];
        let result = [];
        _.each(Columns, Column => {
            if (typeof Column.field === 'string')
                result.push(Column.field);
        });
        return result;
    },
    getNewData: function (Changes) {
        let result = Changes.toJSON();
        return result;
    },
    getRow: function (index_row) {
        return this.getTable().find('tbody tr:eq(' + index_row + ')');
    },
    getTd: function (index_row, index_column) {
        return this.getRow(index_row).find('td:eq(' + index_column + ')');
    },
    deleteTableRows: function ($rows) {
        $rows.remove();
        if (this.isTableHaveNoRow() === true) {
            let optionsTable = this.getTable().bootstrapTable('getOptions');
            if (!optionsTable.hasOwnProperty('columns') || optionsTable.columns.length === 0)
                return;

            let noMatchesMsg = "No matches";
            if ('formatNoMatches' in optionsTable) {
                noMatchesMsg = optionsTable.formatNoMatches();
            }
            let columnsOption = optionsTable.columns[0];
            this.getTable().find('tbody')
                .append('<tr class="no-records-found"><td colspan="' + columnsOption.length + '">' + noMatchesMsg + '</td></tr>');
        }
    },
    isTableHaveNoRow: function () {
        return this.getTable().find('tbody tr').length === 0;
    },
    addRows: function (e) {
        $(e.currentTarget).off('scroll');

        this.offMainCheckbox();
        let last_index = this.getCountVisible() - 1;
        this.pageNumber++;
        this.visibleData = this.setVisibleData(false);

        let newData = this.visibleData.slice(last_index + 1);

        let $table = this.getTable();
        let optionsTable = $table.bootstrapTable('getOptions');

        if (!optionsTable.hasOwnProperty('columns') || optionsTable.columns.length === 0)
            return;

        let columnsOption = optionsTable.columns[0];
        let index = last_index;

        let $elements = $('<tmp></tmp>');
        _.each(newData, () => {
            index++;
            let $tr = this.getNewRow(index, optionsTable, columnsOption);
            $elements.append($tr);
        });

        setTimeout(() => {
            $table.find('tbody').append($elements.html());

            this.renderClusters(last_index);
            this.renderHideColumn();
            $(e.currentTarget).on('scroll', (e) => {
                this.scrollChange(e);
            });
            this.changeCountsDocument();
            this.setHandlersCommonRows();
            this.changeNavigateButton();
        }, 0);
    },
    getNewRow: function (index, optionsTable, columnsOption) {
        let result = $('<tr data-index="' + index + '"></tr>');
        let _document = this.visibleData[index];
        _.each(columnsOption, (option) => {
            let $td = $('<td></td>');
            if (option.hasOwnProperty('class'))
                $td.addClass(option.class);
            if (option.hasOwnProperty('formatter'))
                $td.html(option.formatter(_document[option.field], _document, index));

            result.append($td);
        });
        return result;
    },
    addDocumentRows: function (added) {
        let needReloadTable = false;
        if (this.getSortName() === (this.isThisDeliveryNoteView() ? 'OrderCreateTimestamp' : 'CreateTimestamp')) {
            if (this.getSortDirection() === 'desc' || !this.haveHiddenData()) {
                let $table = this.getTable();
                let optionsTable = $table.bootstrapTable('getOptions');
                if (!optionsTable.hasOwnProperty('columns') || optionsTable.columns.length === 0)
                    return;

                let columnsOption = optionsTable.columns[0];
                let $elements = $('<tmp></tmp>');
                if (this.getSortDirection() === 'desc') {
                    _.each(added, (Document) => {
                        this.visibleData.unshift(this.getNewData(Document));
                        this.lastVisibleIndex++;
                    });
                    for (let i = 0; i < added.length; i++) {
                        let $tr = this.getNewRow(i, optionsTable, columnsOption);
                        $elements.append($tr);
                    }
                    $table.find('tbody').prepend($elements.html());
                } else if (!this.haveHiddenData()) {
                    _.each(added, (Document) => {
                        this.visibleData.push(this.getNewData(Document));
                        this.lastVisibleIndex++;
                    });
                    for (let i = this.lastVisibleIndex - (added.length - 1); i <= this.lastVisibleIndex; i++) {
                        let $tr = this.getNewRow(i, optionsTable, columnsOption);
                        $elements.append($tr);
                    }
                    $table.find('tbody tr.no-records-found').remove();
                    $table.find('tbody').append($elements.html());
                }
            }
        } else needReloadTable = true;

        return needReloadTable;
    },
    getRowIndex: function (document_id) {
        return _.findIndex(this.visibleData, (document_visible) => {
            return document_visible['Id'] === document_id;
        });
    },
    hasInvolvedField: function (changes) {
        let result = false;
        for(let field in changes)
            if(this.getInvolvedContraDocumentFields().indexOf(field) !== -1) {
                result = true;
                break;
            }
        return result;
    },
    getExistingOption: function (field) {
        let result = false;
        switch (field) {
            case 'paymentState':
                result = this.optionsPaymentState;
                break;
            case 'FormattedStatus':
                result = this.optionsStatus;
                break;
            default:
                result = this.optionsStatusContraDocument;
        }
        return result;
    },
    getFieldsSelect: function () {
        let $fields_select = this.getTable().find('th:has(select)');
        return _.map($fields_select, ($field) => {
            return $($field).data('field');
        });
    },
    refreshSelectOption: function (value, field) {
        let fields = this.getFieldsSelect();
        if (!isEmptyString(value) && fields.indexOf(field) !== -1) {
            let available_option = this.getExistingOption(field);
            if (available_option && available_option.indexOf(value) === -1) {
                available_option.push(value);
                available_option.sort();

                this.renderSelectFilter(field);
            }
        }
    },
    isAllSelectedDocumentFinalized: function (_arguments) {
        return _arguments.allFinalizedCanceled && !_arguments.hasCanceled;
    },
    renderMainButton: function () {
        let isShowDeleteButton = App.instance.thisUser.getSetting('showButtonDeleteDocument')
        if(isShowDeleteButton === 'false')
            this.$buttonDeleteSelected.addClass('hidden');
        else this.$buttonDeleteSelected.removeClass('hidden');
    },
    renderTd: function (value, field, new_data, index_row) {
        this.setChanges(new_data);
        this.visibleData[index_row] = new_data;
        let html = value;
        let option = this.getOptionColumn(field);
        if (option !== undefined && option.hasOwnProperty('formatter'))
            html = option.formatter(value, this.visibleData[index_row], index_row);
        let index_column = this.getTable().find('th[data-field="' + field + '"]').index();
        let $row = this.getRow(index_row);
        let $td = this.getTd(index_row, index_column);
        $td.html(html);

        this.setHandlersRow($row);
        this.refreshSelectOption(value, field);
    },
    returnLastClicked: function (html, $td) {
        let $a_clicked = $td.find('a.last-clicked');
        let result = html;
        if($a_clicked.length === 1) {
            let data_id = $a_clicked.data('id');
            let $html_clicked = $(html);
            $html_clicked.find('a[data-id="' + data_id + '"]').addClass('last-clicked');
            result = $(html).html($html_clicked);
        }
        return result;
    },
    wasChangeMainNumber: function (Changes) {
        return Changes.changed.hasOwnProperty('FormattedStatus')  || Changes.changed.hasOwnProperty('Products');
    },
});