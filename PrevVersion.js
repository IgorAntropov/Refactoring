var CustomerInvoicesView = Backbone.View.extend({
    el: '#invoices-content',
    processedData: [],
    paginationNewData: [],
    flag: 0,
    currentUmsatz: 'netto',
    events: {
        'click .show-delivery-note': 'selectDeliveryNote',
        'click .show-invoice': 'selectInvoice',
        // 'click .sortable': 'processAsInfinite',
        'change #invoicesColumnItemOrderCreateTimestamp': 'changeCheckboxSetting',
        'change #invoicesColumnItemCreateTimestamp': 'changeCheckboxSetting',
        'change #invoicesColumnItemModifyTimestamp': 'changeCheckboxSetting',
        'change #invoicesColumnItemCompletedTimestamp': 'changeCheckboxSetting',
        'click #date-group-dropdown-invoice': 'replacementData',
        'click .sortable': 'forSlowConnection',
        'click input[name="umsatz"]': 'umsatzChanged'
    },
    template: _.template($('#invoices-content-tpl').html()),
    initialize: function (invoices, notes, customerId) {
        this.customerId = customerId;
        var deletedNotes = notes.map(function (item) {
            if (item.attributes.DeleteTimestamp !== '0000-00-00 00:00:00') {
                var createDate = Date.parse(item.attributes.CreateTimestamp);
                var deleteDate = Date.parse(item.attributes.DeleteTimestamp);
                if (createDate < deleteDate) {
                    return item.attributes.Id;
                }
            }
        });
        var invoicesData = invoices.models.map(function (item) {
            item.attributes.deleted = false;
            if (item.attributes.DeleteTimestamp !== '0000-00-00 00:00:00') {
                var createDate = Date.parse(item.attributes.CreateTimestamp);
                var deleteDate = Date.parse(item.attributes.DeleteTimestamp);
                if (createDate < deleteDate) {
                    item.attributes.deleted = true;
                }
            }
            if (item.attributes.sourceDeliveryNotes != null) {
                item.attributes.sourceDeliveryNotes.forEach(function (valueDn) {
                    valueDn.deleted = false;
                    if (deletedNotes.includes(valueDn.Id)) {
                        valueDn.deleted = true;
                    }
                });
                item.attributes.sourceDeliveryNotes = $.grep(item.attributes.sourceDeliveryNotes, function(itemDn){
                    return itemDn.deleted !== true;
                });
            }
            return item;
        });
        invoicesData = $.grep(invoicesData, function(item){
            return item.attributes.deleted !== true;
        });

        invoices.models = invoicesData;
        this.invoices = invoices;
        this.deliveryNotes = notes;
        this.invoices.on("change", this.update, this);
        this.invoices.once("update", this.render, this);
        var civ = this;
        $('#invoice-scroll-listener').off().on('scroll', function () {
            var sumHeight = this.scrollTop + this.offsetHeight + 10; // 10 - overlaps the error of interpretation for browsers
            if (sumHeight >= this.scrollHeight) {
                var lastShowed = 0;
                civ.$el.find('tr').each(function () {
                    if (this.style.display != 'none')
                    {
                        if ($(this).attr('data-index') != undefined) {
                            lastShowed = $(this).attr('data-index');
                        }
                    }
                });
                civ.$el.find('tr').each(function () {
                    if (parseInt($(this).attr('data-index')) > parseInt(lastShowed) && parseInt($(this).attr('data-index')) < parseInt(lastShowed) + 10) {
                        $(this).show();
                    }
                });
            }
            $('.show-delivery-note').siblings().popover('hide');
            $('.show-invoice').siblings().popover('hide');
        });
    },
    update: function (collection) {
        // if ($('#invCompletedTimestamp').prop("checked") == 'true') {
        //     $('#invCompletedTimestamp').attr("checked","checked");
        // } else {
        //     $('#invCompletedTimestamp').removeAttr("checked");
        // }
        // if ($('#invModifyTimestamp').prop("checked") == 'true') {
        //     $('#invModifyTimestamp').attr("checked","checked");
        // } else {
        //     $('#invModifyTimestamp').removeAttr("checked");
        // }

        if (this.customerId == 0) {
            this.invoices.reset(collection.collection.models);
        } else {
            this.invoices.reset(collection.collection.where({CustomerId: this.customerId}));
        }
        this.render();
        var self = this;
        setTimeout(function () {
            self.addRowsOnScroll(100);
        }, 1000);
    },
    umsatzChanged: function(e) {
        $('#tax-button').click();
        selected_value = $('input[name="umsatz"]:checked').val();
        if (selected_value == 'netto') {
            $('#tax-button')[0].innerHTML = '<span>Netto</span> <span class="caret"></span>';
            this.currentUmsatz = 'netto';
            var elementsToShow = document.getElementsByClassName('revenueLine');
            var elementsToHide = document.getElementsByClassName('revenueLineBruttoUmsatz');
            _.each(elementsToShow, function (row) {
                row.classList.remove("hided-content");
            });
            _.each(elementsToHide, function (row) {
                row.classList.add("hided-content");
            });
        } else if (selected_value == 'brutto'){
            $('#tax-button')[0].innerHTML = '<span>Brutto</span> <span class="caret"></span>';
            this.currentUmsatz = 'brutto';
            var elementsToShow = document.getElementsByClassName('revenueLineBruttoUmsatz');
            var elementsToHide = document.getElementsByClassName('revenueLine');
            _.each(elementsToShow, function (row) {
                row.classList.remove("hided-content");
            });
            _.each(elementsToHide, function (row) {
                row.classList.add("hided-content");
            });
        }

        var self = this;
        var codeSetting = 'taxInv_' + e.target.getAttribute('id').substring(e.target.getAttribute('id').indexOf('-') + 1,e.target.getAttribute('id').indexOf('-', e.target.getAttribute('id').indexOf('-') + 1));
        var target = 'taxInv_';
        var value = 'true';
        var elements = ['taxInv_netto',
            'taxInv_brutto'];

        disabledElementForSlowConnection();

        App.api.user.changeSetting.put(target, codeSetting, value).then(function (resp) {
            var setting_value = resp.toString();
            var settings = _.clone(App.instance.thisUser.get('setting'));

            _.map(elements, function(element) {
                if (element in settings) {
                    return settings[element] = 'false';
                }
            });

            if (settings) {
                if (codeSetting in settings) {
                    settings[codeSetting] = setting_value;
                }
            } else {
                settings = [];
                settings[codeSetting] = setting_value;
            }
            App.instance.thisUser.set('setting', settings);

            includedElementForSlowConnection();
        });
    },
    selectInvoice: function (e) {
        var invoiceId = e.currentTarget.dataset.id;
        if (window.innerWidth <= 480) {
            if (this.flag == invoiceId) {
                App.instance.selectionModel.set('SelectedInvoiceId', invoiceId);
                $('.popover').hide();
                this.flag = 0;
            } else {
                e.preventDefault();
                e.stopPropagation();
                $('.popover').hide();
                $(e.target).popover('show');
                this.flag = invoiceId;
                setTimeout(function () {
                    $('.popover').hide();
                }, 3000);
            }
        } else {
            App.instance.selectionModel.set('SelectedInvoiceId', invoiceId);
        }
    },
    selectDeliveryNote: function (e) {
        var deliveryNoteId = e.currentTarget.dataset.id;
        if (window.innerWidth <= 480) {
            if (this.flag == deliveryNoteId) {
                App.instance.selectionModel.set('SelectedDeliveryNoteId', deliveryNoteId);
                $('.popover').hide();
                this.flag = 0;
            } else {
                e.preventDefault();
                e.stopPropagation();
                $('.popover').hide();
                $(e.target).popover('show');
                this.flag = deliveryNoteId;
                setTimeout(function () {
                    $('.popover').hide();
                }, 3000);
            }
        } else {
            App.instance.selectionModel.set('SelectedDeliveryNoteId', deliveryNoteId);
        }
    },
    getAllSelectedInvoices: function () {
        return this.$el.find('#invoices-table').bootstrapTable('getAllSelections');
    },
    render: function () {
        var self = this;
        var data = this.invoices.toJSON();
        var todaySum = 0.0; //heute
        var todayMarAbs = 0.0;
        var todayMwst = 0.0;
        var thisWeekSum = 0.0; //diese Woche
        var thisWeekMarAbs = 0.0;
        var thisWeekMwst = 0.0;
        var thisMonthSum = 0.0; //diesen Monat
        var thisMonthMarAbs = 0.0;
        var thisMonthMwst = 0.0;
        var thisYearSum = 0.0; //dieses Jahr
        var thisYearMarAbs = 0.0;
        var thisYearMwst = 0.0;
        var documentTextColor, todayTextColor, thisWeekTextColor, thisMonthTextColor, thisYearTextColor;
        documentTextColor = todayTextColor = thisWeekTextColor = thisMonthTextColor = thisYearTextColor = '';

        var $makePageUp = this.$el.closest('#invoice-list-modal').find('.page-up-dn');
        var $makePageDown = this.$el.closest('#invoice-list-modal').find('.page-down-dn');
        var $deleteSelectedButton = this.$el.closest('#invoice-list-modal').find('#delete-selected-invoice-button');

        var dataForTopTable = this.recalculateTopTable(data);
        todaySum = dataForTopTable.todaySum;
        todayMarAbs = dataForTopTable.todayMarAbs;
        todayMwst = dataForTopTable.todayMwst;
        thisWeekSum = dataForTopTable.thisWeekSum;
        thisWeekMarAbs = dataForTopTable.thisWeekMarAbs;
        thisWeekMwst = dataForTopTable.thisWeekMwst;
        thisMonthSum = dataForTopTable.thisMonthSum;
        thisMonthMarAbs = dataForTopTable.thisMonthMarAbs;
        thisMonthMwst = dataForTopTable.thisMonthMwst;
        thisYearSum = dataForTopTable.thisYearSum;
        thisYearMarAbs = dataForTopTable.thisYearMarAbs;
        thisYearMwst = dataForTopTable.thisYearMwst;
        documentTextColor = dataForTopTable.documentTextColor;
        todayTextColor = dataForTopTable.todayTextColor;
        thisWeekTextColor = dataForTopTable.thisWeekTextColor;
        thisMonthTextColor = dataForTopTable.thisMonthTextColor;
        thisYearTextColor = dataForTopTable.thisYearTextColor;

        dataForTopTable.dataTop.forEach(function (value) {
            var productTotalSum = value.SumTotalPrice;
            var revenueString = formatProfitForPrint(productTotalSum);
            var valueTax = 0.0;
            value.Products.forEach(function (item) {
                valueTax += item.TotalTax;
            });
            var productTotalSumWithTax = productTotalSum + valueTax;
            var revenueBruttoString = formatProfitForPrint(productTotalSumWithTax);
            if (revenueString === '-') {
                value.revenue = '-';
            } else {
                documentTextColor = changeTextColorListDocumentsForDoc(value.containsDailyPriceCount);

                var nettoHidedClass = self.currentUmsatz === 'netto' ? '' : ' hided-content';
                var bruttoHidedClass = self.currentUmsatz === 'brutto' ? '' : ' hided-content';
                value.revenue = '<div class="revenueLine' + nettoHidedClass + '"><span class="' + documentTextColor + '">\u20AC ' + revenueString + '</span> / ' +
                    '<span class="' + documentTextColor + '">' + ' %' + formatProfitForPrint(value.SumTotalProfitPercent) + '</span> / ' +
                    '<span class="' + documentTextColor + '">' + formatProfitForPrint(value.SumTotalProfitAbsolute) + '</span></div>' +
                    '<div class="revenueLineBruttoUmsatz' + bruttoHidedClass + '"><span class="' + documentTextColor + '">\u20AC ' + revenueBruttoString + '</span> / ' +
                    '<span class="' + documentTextColor + '">' + ' %' + formatProfitForPrint(value.SumTotalProfitPercent) + '</span> / ' +
                    '<span class="' + documentTextColor + '">' + formatProfitForPrint(value.SumTotalProfitAbsolute) + '</span></div>';
            }
            // if (value.sourceDeliveryNotes != null && value.sourceDeliveryNotes != undefined && value.sourceDeliveryNotes.length > 0) {
            //     value.sourceDeliveryNotes.forEach(function (note) {
            //         self.deliveryNotes.models.forEach(function (noteCompany) {
            //             if (noteCompany.attributes.DeliveryNoteNumber == note.DeliveryNoteNumber) {
            //                 // note.DeliveryNoteNumber = note.DeliveryNoteNumber + " (" + noteCompany.attributes.Company + ")";
            //             }
            //         });
            //     });
            // }
        });

        this.processedData = data;
        this.$el.html(this.template());

        var showArrowsSummary;
        if(typeof App.instance.thisUser.get('setting') !== 'undefined'){
            showArrowsSummary = App.instance.thisUser.get('setting').showArrowsSummary;
        }else{
            showArrowsSummary = 'true';
        }
        //TODO refactor this fast fix bug with select of bootstrap-table
        // if there are multiple tables and it hsva the sane field-names values of select's options increment both table's values

        var newData = data.map(function (item) {
            item.Status_invoices = item.FormattedStatus;
            item.showArrowsSummary = showArrowsSummary;
            item.deleted = false;
            if (item.DeleteTimestamp !== '0000-00-00 00:00:00') {
                var createDate = Date.parse(item.CreateTimestamp);
                var deleteDate = Date.parse(item.DeleteTimestamp);
                if (createDate < deleteDate) {
                    item.deleted = true;
                }
            }
            return item;
        });
        newData = $.grep(newData, function(item){
            return item.deleted !== true;
        });

        if (sortOrderForTableINV() == 'desc') {
            var reverseNewData = newData.slice().reverse();
            this.paginationNewData = reverseNewData.slice(length - 30);
        } else {
            this.paginationNewData = newData.slice(length - 30);
        }

        this.processedData = this.paginationNewData;
        $deleteSelectedButton.prop('disabled', true);

        this.$el.find('#invoices-table').bootstrapTable({
            data: this.paginationNewData,
            toolbarAlign: 'none',
            toolbar: '#toolbar-invoices-table', //Column order is important for custom toolbar
            showColumns: true,
            classes: 'table table-hover medium-font',
            filterControl: true,
            paginationLoop: true,
            sortName: sortNameForTableINV(),
            sortOrder: sortOrderForTableINV(),
            columns: [
                {
                    formatter: indexFormatter,
                    class: 'position-column text-left wo-padding'
                },
                {
                    field: 'state',
                    checkbox: true,
                    formatter: stateInvFormatter
                },
                {
                    field: 'InvoiceNumber',
                    sortable: true,
                    formatter: linkFormatter,
                    title: 'Rechnungs Nr',
                    filterControl: 'input',
                    class: 'item-row',
                    id: 'invInvoiceNumber'
                },
                {
                    field: 'OrderCreateTimestamp',
                    visible: visibleInvoicesColumnItemOrderCreateTimestamp(),
                    formatter: dateFormatter,
                    filterControl: 'datepicker',
                    filterDatepickerOptions: {
                        format: 'dd.mm.yyyy',
                        autoclose: true,
                        clearBtn: true,
                        todayHighlight: true
                    },
                    id: 'invOrderCreateTimestamp',
                    class: 'table-th-datepicker-block',
                    sortable: true,
                    order: 'desc',
                    title: 'Eingegangene <br/> Bestellung',
                    width: '115px'
                },
                {
                    field: 'CreateTimestamp',
                    visible: visibleInvoicesColumnItemCreateTimestamp(),
                    sortable: true,
                    order: 'desc',
                    formatter: dateFormatter,
                    filterControl: 'datepicker',
                    filterDatepickerOptions: {
                        format: 'dd.mm.yyyy',
                        autoclose: true,
                        clearBtn: true,
                        todayHighlight: true
                    },
                    class: 'table-th-datepicker-block',
                    id: 'invCreateTimestamp',
                    title: 'Erstellen <br/> Rechnung',
                    width: '115px'
                },
                {
                    field: 'ModifyTimestamp',
                    visible: visibleInvoicesColumnItemModifyTimestamp(),
                    order: 'desc',
                    sortable: true,
                    formatter: dateFormatter,
                    filterControl: 'datepicker',
                    filterDatepickerOptions: {
                        format: 'dd.mm.yyyy',
                        autoclose: true,
                        clearBtn: true,
                        todayHighlight: true
                    },
                    id: 'invModifyTimestamp',
                    class: 'table-th-datepicker-block',
                    title: 'Letzte <br/> Bearbeitung <br/> Rechnung',
                    width: '115px'
                },
                {
                    field: 'CompletedTimestamp',
                    visible: visibleInvoicesColumnItemCompletedTimestamp(),
                    order: 'desc',
                    sortable: true,
                    formatter: dateFormatterCompleted,
                    filterControl: 'datepicker',
                    filterDatepickerOptions: {
                        format: 'dd.mm.yyyy',
                        autoclose: true,
                        clearBtn: true,
                        todayHighlight: true
                    },
                    id: 'invCompletedTimestamp',
                    class: 'table-th-datepicker-block',
                    title: 'Finalisiert',
                    width: '115px'
                },
                {
                    field: 'Status_invoices',
                    id: 'notSorting',
                    sortable: false,
                    formatter: statusFormatter,
                    filterControl: 'select',
                    class: 'table-th-datepicker-block',
                    title: 'Status',
                    width: '120px'
                },
                {
                    field: 'sourceDeliveryNotes',
                    sortable: true,
                    order: 'desc',
                    formatter: sourceDeliveryNotesFormatter,
                    title: 'Erstellt aus Lieferschein Nr',
                    class: 'item-row',
                    id: 'invSourceDeliveryNotes',
                },
                // {
                //     field: 'DeliveryNotesNumberForStatus',
                //     id: 'notSorting',
                //     sortable: false,
                //     formatter: secondStatusFormatter,
                //     filterControl: 'select',
                //     class: 'table-th-datepicker-block',
                //     title: 'Status Rechnung',
                //     width: '120px'
                // },
                {
                    field: 'revenue',
                    sortable: true,
                    order: 'desc',
                    title: 'Umsatz / % Marge / <br/> abs Marge',
                    class: 'item-row',
                    id: 'invRevenue'
                }
            ],
            locale: 'de-DE',
            onPostBody: function(rows){
                var countDocuments;
                if ($('#invoices-table')[0].rows[1].classList[0] == 'no-records-found') {
                    countDocuments = 0;
                } else {
                    countDocuments = $('#invoices-table')[0].rows.length -1;
                }
                changeCountDocument(countDocuments, newData.length);
                var Invoices = self.getAllSelectedInvoices();
                changeCheckedDocument(Invoices.length);

                if (periodForTableINV() != '#all-group'){
                    self.processedData = self.invoices.toJSON();
                }

                if ($('#invoice-scroll-listener').get(0).scrollHeight == $('#invoice-scroll-listener').get(0).offsetHeight) {
                    $makePageDown.attr('disabled', 'disabled');
                    $makePageDown.addClass('arrowVisible');
                    $makePageUp.attr('disabled', 'disabled');
                    $makePageUp.addClass('arrowVisible');
                }
                if (countDocuments > 7) {
                    $makePageDown.removeAttr('disabled');
                    $makePageDown.removeClass('arrowVisible');
                }
            },
            onSort: function (name, order) {
                var codeSetting = 'sortsForIN_' + name;
                var target = 'sortsForIN_';
                var value = order;
                var elements = ['sortsForIN_CompletedTimestamp',
                    'sortsForIN_CreateTimestamp',
                    'sortsForIN_InvoiceNumber',
                    'sortsForIN_ModifyTimestamp',
                    'sortsForIN_OrderCreateTimestamp',
                    'sortsForIN_revenue',
                    'sortsForIN_sourceDeliveryNotes'];
                var showArrowsSummary;

                disabledElementForSlowConnection();

                App.api.user.changeSetting.put(target, codeSetting, value).then(function (resp) {
                    var setting_value = resp.toString();
                    var settings = _.clone(App.instance.thisUser.get('setting'));

                    _.map(elements, function(element) {
                        if (element in settings) {
                            return settings[element] = 'no';
                        }
                    });

                    if (settings) {
                        if (codeSetting in settings) {
                            settings[codeSetting] = setting_value;
                        }
                    } else {
                        settings = [];
                        settings[codeSetting] = setting_value;
                    }
                    App.instance.thisUser.set('setting', settings);

                    if (typeof App.instance.thisUser.get('setting') !== 'undefined') {
                        showArrowsSummary = App.instance.thisUser.get('setting').showArrowsSummary;
                        if (showArrowsSummary == 'false') {
                            $('.arrowLineForTables span').css({'margin-left': '0'});
                        }
                    }
                    includedElementForSlowConnection();
                    self.renderTax();
                });
            },
            onSearch: function () {
                var dataForTopTable = self.recalculateTopTable($('#invoices-table').bootstrapTable('getData'));

                var todaySum = dataForTopTable.todaySum;
                var todayMarAbs = dataForTopTable.todayMarAbs;
                var todayMwst = dataForTopTable.todayMwst;
                var thisWeekSum = dataForTopTable.thisWeekSum;
                var thisWeekMarAbs = dataForTopTable.thisWeekMarAbs;
                var thisWeekMwst = dataForTopTable.thisWeekMwst;
                var thisMonthSum = dataForTopTable.thisMonthSum;
                var thisMonthMarAbs = dataForTopTable.thisMonthMarAbs;
                var thisMonthMwst = dataForTopTable.thisMonthMwst;
                var thisYearSum = dataForTopTable.thisYearSum;
                var thisYearMarAbs = dataForTopTable.thisYearMarAbs;
                var thisYearMwst = dataForTopTable.thisYearMwst;
                var documentTextColor = dataForTopTable.documentTextColor;
                var todayTextColor = dataForTopTable.todayTextColor;
                var thisWeekTextColor = dataForTopTable.thisWeekTextColor;
                var thisMonthTextColor = dataForTopTable.thisMonthTextColor;
                var thisYearTextColor = dataForTopTable.thisYearTextColor;

                dataForTopTable.dataTop.forEach(function (value) {
                    var productTotalSum = value.SumTotalPrice;
                    var revenueString = formatProfitForPrint(productTotalSum);
                    var valueTax = 0.0;
                    value.Products.forEach(function (item) {
                        valueTax += item.TotalTax;
                    });
                    var productTotalSumWithTax = productTotalSum + valueTax;
                    var revenueBruttoString = formatProfitForPrint(productTotalSumWithTax);
                    if (revenueString === '-') {
                        value.revenue = '-';
                    } else {
                        documentTextColor = changeTextColorListDocumentsForDoc(value.containsDailyPriceCount);

                        var nettoHidedClass = self.currentUmsatz === 'netto' ? '' : ' hided-content';
                        var bruttoHidedClass = self.currentUmsatz === 'brutto' ? '' : ' hided-content';
                        value.revenue = '<div class="revenueLine' + nettoHidedClass + '"><span class="' + documentTextColor + '">\u20AC ' + revenueString + '</span> / ' +
                            '<span class="' + documentTextColor + '">' + ' %' + formatProfitForPrint(value.SumTotalProfitPercent) + '</span> / ' +
                            '<span class="' + documentTextColor + '">' + formatProfitForPrint(value.SumTotalProfitAbsolute) + '</span></div>' +
                            '<div class="revenueLineBruttoUmsatz' + bruttoHidedClass + '"><span class="' + documentTextColor + '">\u20AC ' + revenueBruttoString + '</span> / ' +
                            '<span class="' + documentTextColor + '">' + ' %' + formatProfitForPrint(value.SumTotalProfitPercent) + '</span> / ' +
                            '<span class="' + documentTextColor + '">' + formatProfitForPrint(value.SumTotalProfitAbsolute) + '</span></div>';
                    }
                    if (value.sourceDeliveryNotes != null && value.sourceDeliveryNotes != undefined && value.sourceDeliveryNotes.length > 0) {
                        value.sourceDeliveryNotes.forEach(function (note) {
                            self.deliveryNotes.models.forEach(function (noteCompany) {
                                if (noteCompany.attributes.DeliveryNoteNumber == note.DeliveryNoteNumber) {
                                    // note.DeliveryNoteNumber = note.DeliveryNoteNumber + " (" + noteCompany.attributes.Company + ")";
                                }
                            });
                        });
                    }
                });

                self.renderTopTable(todaySum, todayMarAbs, todayMwst, thisWeekSum, thisWeekMarAbs, thisWeekMwst, thisMonthSum, thisMonthMarAbs, thisMonthMwst,
                    thisYearSum, thisYearMarAbs, thisYearMwst, documentTextColor, todayTextColor, thisWeekTextColor, thisMonthTextColor, thisYearTextColor);

                if (self.currentUmsatz === 'brutto') {
                    var elementsToShow = document.getElementsByClassName('revenueLineBruttoUmsatz');
                    var elementsToHide = document.getElementsByClassName('revenueLine');
                    _.each(elementsToShow, function (row) {
                        row.classList.remove("hided-content");
                    });
                    _.each(elementsToHide, function (row) {
                        row.classList.add("hided-content");
                    });
                }
            },
            onCheckAll: function (rows) {
                if (rows.length > 0) {
                    $deleteSelectedButton.prop('disabled', false);

                    var Invoices = self.getAllSelectedInvoices();
                    changeCheckedDocument(Invoices.length);
                }
            },
            onUncheckAll: function () {
                $deleteSelectedButton.prop('disabled', true);

                var Invoices = self.getAllSelectedInvoices();
                changeCheckedDocument(Invoices.length);
            },
            onCheck: function (row) {
                $deleteSelectedButton.prop('disabled', false);

                var selected_Invoices = self.getAllSelectedInvoices();

                changeCheckedDocument(selected_Invoices.length);

                if (selected_Invoices.length > 0) {
                    $deleteSelectedButton.prop('disabled', false);
                }
            },
            onUncheck: function (row) {
                var selected_Invoices = self.getAllSelectedInvoices();
                changeCheckedDocument(selected_Invoices.length);
                $deleteSelectedButton.prop('disabled', false);

                if (selected_Invoices.length === 0) {
                    $deleteSelectedButton.prop('disabled', true);
                }
            }
        });
        $deleteSelectedButton.off('click').on('click', function () {
            var text = 'Ausgewählte Rechnungen löschen?';
            Matrex.confirm(text, function () {
                disabledElementForSlowConnection();
                var Invoices = self.getAllSelectedInvoices();
                var delDelivNotes = document.getElementById('delete-with-delivery-note').checked;
                var InvId = Invoices.map(function (item) {
                    return item.Id
                });
                var Dns = Invoices.map(function (item) {
                    return item.sourceDeliveryNotes
                });
                var DnId = [];
                _.each(Dns, function (dn) {
                    _.each(dn, function (dnid) {
                        DnId.push(dnid.Id);
                    });
                });
                App.instance.invoices.fetch({
                    type: 'DELETE',
                    reset: true,
                    data: {
                        InvoicesIds: InvId,
                        DeleteDeliveryNotes: delDelivNotes,
                        DeliveryNotesToDelete: DnId
                    },
                    success: function () {
                        var invoicesData = self.invoices.models.map(function (item) {
                            item.attributes.deleted = false;
                            if (item.attributes.DeleteTimestamp !== '0000-00-00 00:00:00') {
                                var createDate = Date.parse(item.attributes.CreateTimestamp);
                                var deleteDate = Date.parse(item.attributes.DeleteTimestamp);
                                if (createDate < deleteDate) {
                                    item.attributes.deleted = true;
                                }
                            }
                            return item;
                        });
                        invoicesData = $.grep(invoicesData, function(item){
                            return item.attributes.deleted !== true;
                        });
                        self.invoices.models = invoicesData;
                        self.processedData = self.invoices.toJSON();
                        self.render();
                        setTimeout(function () {
                            self.addRowsOnScroll(100);
                        }, 1000);
                        App.instance.deliveryNotes.fetch({
                            reset: true,
                            error: function (model, response, options) {
                                displayErrorBackbone(model, response, options);
                            },
                            success: function () {
                                App.instance.deliveryNotes.forEach(function (value) {
                                    if (value.attributes.InvoiceId != null) {
                                        if (InvId.includes(value.attributes.InvoiceId)) {
                                            value.attributes.InvoiceId = null;
                                            value.attributes.InvoiceNumber = null;
                                            value.attributes.InvoiceNumberForStatus = null;
                                            value.attributes.InvoiceStatus = null;
                                            value.attributes.InvoiceTitle = null;
                                        }
                                    }
                                });
                            }
                        });
                        includedElementForSlowConnection();
                        Matrex.notify('Rechnungen wurden entfernt.', 'success');
                        self.$el.find('#invoices-table').bootstrapTable('uncheckAll');
                    },
                    error: function (model, response, options) {
                        includedElementForSlowConnection();
                        Matrex.notify(response.responseJSON.message, 'error');
                    }
                })
            }, function () {
            });
        });

        var scHeight = $('#invoice-scroll-listener').get(0).scrollHeight;
        var clHeight = $('#invoice-scroll-listener').get(0).clientHeight;
        var scTop = $('#invoice-scroll-listener').scrollTop();
        $('html').keydown(function(e){
            scHeight = $('#invoice-scroll-listener').get(0).scrollHeight;
            clHeight = $('#invoice-scroll-listener').get(0).clientHeight;
            scTop = $('#invoice-scroll-listener').scrollTop();

            if (e.which == 40 || e.which == 98) {
                $makePageUp.removeAttr('disabled');
                $makePageUp.removeClass('arrowVisible');

                $('#invoice-scroll-listener').scrollTop(scTop + clHeight);

                if (scHeight <= clHeight + scTop) {
                    $makePageDown.attr('disabled', 'disabled');
                    $makePageDown.addClass('arrowVisible');
                }
            }
            if (e.which == 38 || e.which == 104) {
                $makePageDown.removeAttr('disabled');
                $makePageDown.removeClass('arrowVisible');

                $('#invoice-scroll-listener').scrollTop(scTop - clHeight);

                if ($('#invoice-scroll-listener').scrollTop() == 0) {
                    $makePageUp.attr('disabled', 'disabled');
                    $makePageUp.addClass('arrowVisible');
                }
            }
        });

        $('#open-delivery-notes').one('click', function () {
            var headerTemplate = _.template($('#company-address-tpl').html());
            $('#delivery-notes-header').empty();
            $('#delivery-notes-header').html(headerTemplate(
                _.extend({
                    companyName: 'Alle Kunden',
                    address: '',
                })
            ));
            formatCommaText($('#delivery-notes-header'))
            var item = new CustomerDeliveryNotesView(self.deliveryNotes, self.invoices, 0);
            item.render();
            setTimeout(function () {
                item.addRowsOnScroll(100);
            }, 1000);
        });

        $makePageDown.on('click', function (e) {
            scHeight = $('#invoice-scroll-listener').get(0).scrollHeight;
            clHeight = $('#invoice-scroll-listener').get(0).clientHeight;
            scTop = $('#invoice-scroll-listener').scrollTop();

            $makePageUp.removeAttr('disabled');
            $makePageUp.removeClass('arrowVisible');

            $('#invoice-scroll-listener').scrollTop(scTop + clHeight);

            if (scHeight <= clHeight + scTop) {
                $makePageDown.attr('disabled', 'disabled');
                $makePageDown.addClass('arrowVisible');
            }
        });
        $makePageUp.on('click', function (e) {
            scHeight = $('#invoice-scroll-listener').get(0).scrollHeight;
            clHeight = $('#invoice-scroll-listener').get(0).clientHeight;
            scTop = $('#invoice-scroll-listener').scrollTop();

            $makePageDown.removeAttr('disabled');
            $makePageDown.removeClass('arrowVisible');

            $('#invoice-scroll-listener').scrollTop(scTop - clHeight);

            if ($('#invoice-scroll-listener').scrollTop() == 0) {
                $makePageUp.attr('disabled', 'disabled');
                $makePageUp.addClass('arrowVisible');
            }
        });

        this.renderTopTable(todaySum, todayMarAbs, todayMwst, thisWeekSum, thisWeekMarAbs, thisWeekMwst, thisMonthSum, thisMonthMarAbs, thisMonthMwst,
            thisYearSum, thisYearMarAbs, thisYearMwst, documentTextColor, todayTextColor, thisWeekTextColor, thisMonthTextColor, thisYearTextColor);

        this.tableSwitchFilterHelper(self.$el);
        var civ = this;
        var periodButton = this.$el.find('#date-group-dropdown-invoice');

        if (periodForTableINV() == '#today-group'){
            $('#today-group').attr('checked', 'checked');
            var existingData = civ.processedData;
            var filteredData = [];
            var today = new Date();
            today.setHours(0, 0, 0, 0);
            existingData.forEach(function (value) {
                if (new Date(value.OrderCreateTimestamp) > today) {
                    filteredData.push(value);
                }
            });
            var $table = $('#invoices-table');
            $table.bootstrapTable('load', filteredData);
            periodButton[0].innerHTML = '<span>Heute</span> <span class="caret"></span>';
        } else if (periodForTableINV() == '#yesterday-group'){
            $('#yesterday-group').attr('checked', 'checked');
            var existingData = civ.processedData;
            var filteredData = [];
            var yesterdate = new Date();
            yesterdate.setDate(yesterdate.getDate() - 1);
            existingData.forEach(function (value) {
                if (new Date(value.OrderCreateTimestamp) > yesterdate) {
                    filteredData.push(value);
                }
            });
            var $table = $('#invoices-table');
            $table.bootstrapTable('load', filteredData);
            periodButton[0].innerHTML = '<span>Gestern</span> <span class="caret"></span>';
        } else if (periodForTableINV() == '#week-group'){
            $('#week-group').attr('checked', 'checked');
            var existingData = civ.processedData;
            var filteredData = [];
            var thisWeek = new Date();
            thisWeek.setHours(0, 0, 0, 0);
            var day = thisWeek.getDay();
            var diff = thisWeek.getDate() - day + (day == 0 ? -6 : 1);
            thisWeek = new Date(thisWeek.setDate(diff));
            existingData.forEach(function (value) {
                if (new Date(value.OrderCreateTimestamp) > thisWeek) {
                    filteredData.push(value);
                }
            });
            var $table = $('#invoices-table');
            $table.bootstrapTable('load', filteredData);
            periodButton[0].innerHTML = '<span>Diese Woche</span> <span class="caret"></span>';
        } else if (periodForTableINV() == '#sevendays-group'){
            $('#sevendays-group').attr('checked', 'checked');
            var existingData = civ.processedData;
            var filteredData = [];
            var sevendays = new Date();
            sevendays.setDate(sevendays.getDate() - 7);
            existingData.forEach(function (value) {
                if (new Date(value.OrderCreateTimestamp) > sevendays) {
                    filteredData.push(value);
                }
            });
            var $table = $('#invoices-table');
            $table.bootstrapTable('load', filteredData);
            periodButton[0].innerHTML = '<span>Letzte Woche</span> <span class="caret"></span>';
        } else if (periodForTableINV() == '#month-group'){
            $('#month-group').attr('checked', 'checked');
            var existingData = civ.processedData;
            var filteredData = [];
            var thisMonth = new Date();
            thisMonth = new Date(thisMonth.getFullYear(), thisMonth.getMonth(), 1);
            thisMonth.setHours(0, 0, 0, 0);
            existingData.forEach(function (value) {
                if (new Date(value.OrderCreateTimestamp) > thisMonth) {
                    filteredData.push(value);
                }
            });
            var $table = $('#invoices-table');
            $table.bootstrapTable('load', filteredData);
            periodButton[0].innerHTML = '<span>Dieser Monat</span> <span class="caret"></span>';
        } else if (periodForTableINV() == '#year-group'){
            $('#year-group').attr('checked', 'checked');
            var existingData = civ.processedData;
            var filteredData = [];
            var thisYear = new Date(new Date().getFullYear(), 0, 1);
            thisYear.setHours(0, 0, 0, 0);
            existingData.forEach(function (value) {
                if (new Date(value.OrderCreateTimestamp) > thisYear) {
                    filteredData.push(value);
                }
            });
            var $table = $('#invoices-table');
            $table.bootstrapTable('load', filteredData);
            periodButton[0].innerHTML = '<span>Dieses Jahr</span> <span class="caret"></span>';
        } else if (periodForTableINV() == '#all-group'){
            $('#all-group').attr('checked', 'checked');
            var $table = $('#invoices-table');
            $table.bootstrapTable('load', civ.processedData);
            periodButton[0].innerHTML = '<span>Alle Rechnunge</span> <span class="caret"></span>';
        } else {
            $('#all-group').attr('checked', 'checked');
            var $table = $('#invoices-table');
            $table.bootstrapTable('load', civ.processedData);
            periodButton[0].innerHTML = '<span>Alle Rechnunge</span> <span class="caret"></span>';
        }

        $('#today-group').off().on('click', function (e) {
            rollCallIN(e);
            var existingData = civ.processedData;
            var filteredData = [];
            var today = new Date();
            today.setHours(0, 0, 0, 0);
            existingData.forEach(function (value) {
                if (new Date(value.OrderCreateTimestamp) > today) {
                    filteredData.push(value);
                }
            });
            var $table = $('#invoices-table');
            $table.bootstrapTable('load', filteredData);
            civ.changePeriodSetting(e);
            periodButton[0].innerHTML = '<span>Heute</span> <span class="caret"></span>';
        });
        $('#yesterday-group').off().on('click', function (e) {
            rollCallIN(e);
            var existingData = civ.processedData;
            var filteredData = [];
            var yesterdate = new Date();
            yesterdate.setDate(yesterdate.getDate() - 1);
            existingData.forEach(function (value) {
                if (new Date(value.OrderCreateTimestamp) > yesterdate) {
                    filteredData.push(value);
                }
            });
            var $table = $('#invoices-table');
            $table.bootstrapTable('load', filteredData);
            civ.changePeriodSetting(e);
            periodButton[0].innerHTML = '<span>Gestern</span> <span class="caret"></span>';
        });
        $('#week-group').off().on('click', function (e) {
            rollCallIN(e);
            var existingData = civ.processedData;
            var filteredData = [];
            var thisWeek = new Date();
            thisWeek.setHours(0, 0, 0, 0);
            var day = thisWeek.getDay();
            var diff = thisWeek.getDate() - day + (day == 0 ? -6 : 1);
            thisWeek = new Date(thisWeek.setDate(diff));
            existingData.forEach(function (value) {
                if (new Date(value.OrderCreateTimestamp) > thisWeek) {
                    filteredData.push(value);
                }
            });
            var $table = $('#invoices-table');
            $table.bootstrapTable('load', filteredData);
            civ.changePeriodSetting(e);
            periodButton[0].innerHTML = '<span>Diese Woche</span> <span class="caret"></span>';
        });
        $('#sevendays-group').off().on('click', function (e) {
            rollCallIN(e);
            var existingData = civ.processedData;
            var filteredData = [];
            var sevendays = new Date();
            sevendays.setDate(sevendays.getDate() - 7);
            existingData.forEach(function (value) {
                if (new Date(value.OrderCreateTimestamp) > sevendays) {
                    filteredData.push(value);
                }
            });
            var $table = $('#invoices-table');
            $table.bootstrapTable('load', filteredData);
            civ.changePeriodSetting(e);
            periodButton[0].innerHTML = '<span>Letzte Woche</span> <span class="caret"></span>';
        });
        $('#month-group').off().on('click', function (e) {
            rollCallIN(e);
            var existingData = civ.processedData;
            var filteredData = [];
            var thisMonth = new Date();
            thisMonth = new Date(thisMonth.getFullYear(), thisMonth.getMonth(), 1);
            thisMonth.setHours(0, 0, 0, 0);
            existingData.forEach(function (value) {
                if (new Date(value.OrderCreateTimestamp) > thisMonth) {
                    filteredData.push(value);
                }
            });
            var $table = $('#invoices-table');
            $table.bootstrapTable('load', filteredData);
            civ.changePeriodSetting(e);
            periodButton[0].innerHTML = '<span>Dieser Monat</span> <span class="caret"></span>';
        });
        $('#year-group').off().on('click', function (e) {
            rollCallIN(e);
            var existingData = civ.processedData;
            var filteredData = [];
            var thisYear = new Date(new Date().getFullYear(), 0, 1);
            thisYear.setHours(0, 0, 0, 0);
            existingData.forEach(function (value) {
                if (new Date(value.OrderCreateTimestamp) > thisYear) {
                    filteredData.push(value);
                }
            });
            var $table = $('#invoices-table');
            $table.bootstrapTable('load', filteredData);
            civ.changePeriodSetting(e);
            periodButton[0].innerHTML = '<span>Dieses Jahr</span> <span class="caret"></span>';

        });
        $('#all-group').off().on('click', function (e) {
            rollCallIN(e);
            var $table = $('#invoices-table');
            $table.bootstrapTable('load', civ.processedData);
            civ.changePeriodSetting(e);
            periodButton[0].innerHTML = '<span>Alle Rechnungen</span> <span class="caret"></span>';

        });
        $('#invoices-table .sortable').off().on('click', function () {
            var $table = $('#invoices-table');
            civ.processedData = data;
            $table.bootstrapTable('load', civ.processedData);
        });

        civ.renderTax();
        if (typeof App.instance.thisUser.get('setting') !== 'undefined') {
            showArrowsSummary = App.instance.thisUser.get('setting').showArrowsSummary;
            if (showArrowsSummary == 'false') {
                $('.arrowLineForTables i').css({'display': 'none'});
                $('.arrowLineForTables span').css({'margin-left': '0'});
            }
        }
        return this;
    },
    renderTax: function() {
        if (taxForTableInv() == '#umsatz-netto-radio'){
            $('#umsatz-netto-radio-inv').attr('checked', 'checked');
            $('#tax-button')[0].innerHTML = '<span>Netto</span> <span class="caret"></span>';
            this.currentUmsatz = 'netto';
            var elementsToShow = document.getElementsByClassName('revenueLine');
            var elementsToHide = document.getElementsByClassName('revenueLineBruttoUmsatz');
            _.each(elementsToShow, function (row) {
                row.classList.remove("hided-content");
            });
            _.each(elementsToHide, function (row) {
                row.classList.add("hided-content");
            });
        } else if (taxForTableInv() == '#umsatz-brutto-radio') {
            $('#umsatz-brutto-radio-inv').attr('checked', 'checked');
            $('#tax-button')[0].innerHTML = '<span>Brutto</span> <span class="caret"></span>';
            this.currentUmsatz = 'brutto';
            var elementsToShow = document.getElementsByClassName('revenueLineBruttoUmsatz');
            var elementsToHide = document.getElementsByClassName('revenueLine');
            _.each(elementsToShow, function (row) {
                row.classList.remove("hided-content");
            });
            _.each(elementsToHide, function (row) {
                row.classList.add("hided-content");
            });
        }
    },
    renderTopTable: function (todaySum, todayMarAbs, todayMwst, thisWeekSum, thisWeekMarAbs, thisWeekMwst, thisMonthSum, thisMonthMarAbs, thisMonthMwst,
                              thisYearSum, thisYearMarAbs, thisYearMwst, documentTextColor, todayTextColor, thisWeekTextColor, thisMonthTextColor, thisYearTextColor) {
        var element = $('#iTodaySum');
        element[0].innerHTML = '\u20AC ' + formatOtherMoneyForPrint(todaySum);
        element.addClass(todayTextColor);

        element = $('#iThisWeekSum');
        element[0].innerHTML = '\u20AC ' + formatOtherMoneyForPrint(thisWeekSum);
        element.addClass(thisWeekTextColor);

        element = $('#iThisMonthSum');
        element[0].innerHTML = '\u20AC ' + formatOtherMoneyForPrint(thisMonthSum);
        element.addClass(thisMonthTextColor);

        element = $('#iThisYearSum');
        element[0].innerHTML = '\u20AC ' + formatOtherMoneyForPrint(thisYearSum);
        element.addClass(thisYearTextColor);

        element = $('#iTodayMar');
        if (todayMarAbs != 0) {
            element[0].innerHTML = '% ' + formatProfitForPrint((todayMarAbs/todaySum) * 100) +
                ' / \u20AC ' + formatProfitForPrint(todayMarAbs);
        } else {
            element[0].innerHTML = '% -  / \u20AC -';
        }
        element.addClass(todayTextColor);

        element = $('#iThisWeekMar');
        if (thisWeekMarAbs != 0) {
            element[0].innerHTML = '% ' + formatProfitForPrint((thisWeekMarAbs/thisWeekSum)*100) +
                ' / \u20AC ' + formatProfitForPrint(thisWeekMarAbs);
        } else {
            element[0].innerHTML = '% -  / \u20AC -';
        }
        element.addClass(thisWeekTextColor);

        element = $('#iThisMonthMar');
        if (thisMonthMarAbs != 0) {
            element[0].innerHTML = '% ' + formatProfitForPrint((thisMonthMarAbs/thisMonthSum)*100) +
                ' / \u20AC ' + formatProfitForPrint(thisMonthMarAbs);
        } else {
            element[0].innerHTML = '% -  / \u20AC -';
        }
        element.addClass(thisMonthTextColor);

        element = $('#iThisYearMar');
        if (thisYearMarAbs != 0) {
            element[0].innerHTML = '% ' + formatProfitForPrint((thisYearMarAbs/thisYearSum)*100) +
                ' / \u20AC ' + formatProfitForPrint(thisYearMarAbs);
        } else {
            element[0].innerHTML = '% -  / \u20AC -';
        }
        element.addClass(thisYearTextColor);

        element = $('#iTodayArt');
        element[0].innerHTML = '\u20AC ' + formatProfitForPrint(todayMwst);
        element.addClass(todayTextColor);

        element = $('#iThisWeekArt');
        element[0].innerHTML = '\u20AC ' + formatProfitForPrint(thisWeekMwst);
        element.addClass(thisWeekTextColor);

        element = $('#iThisMonthArt');
        element[0].innerHTML = '\u20AC ' + formatProfitForPrint(thisMonthMwst);
        element.addClass(thisMonthTextColor);

        element = $('#iThisYearArt');
        element[0].innerHTML = '\u20AC ' + formatProfitForPrint(thisYearMwst);
        element.addClass(thisYearTextColor);

        element = $('#iTodayGr');
        element[0].innerHTML = '\u20AC ' + formatProfitForPrint(todaySum + todayMwst);
        element.addClass(todayTextColor);

        element = $('#iThisWeekGr');
        element[0].innerHTML = '\u20AC ' + formatProfitForPrint(thisWeekSum + thisWeekMwst);
        element.addClass(thisWeekTextColor);

        element = $('#iThisMonthGr');
        element[0].innerHTML = '\u20AC ' + formatProfitForPrint(thisMonthSum + thisMonthMwst);
        element.addClass(thisMonthTextColor);

        element = $('#iThisYearGr');
        element[0].innerHTML = '\u20AC ' + formatProfitForPrint(thisYearSum + thisYearMwst);
        element.addClass(thisYearTextColor);
    },
    recalculateTopTable: function (data) {
        var todaySum = 0.0; //heute
        var todayMarAbs = 0.0;
        var todayMwst = 0.0;
        var thisWeekSum = 0.0; //diese Woche
        var thisWeekMarAbs = 0.0;
        var thisWeekMwst = 0.0;
        var thisMonthSum = 0.0; //diesen Monat
        var thisMonthMarAbs = 0.0;
        var thisMonthMwst = 0.0;
        var thisYearSum = 0.0; //dieses Jahr
        var thisYearMarAbs = 0.0;
        var thisYearMwst = 0.0;
        var documentTextColor, todayTextColor, thisWeekTextColor, thisMonthTextColor, thisYearTextColor;
        documentTextColor = todayTextColor = thisWeekTextColor = thisMonthTextColor = thisYearTextColor = '';

        data.forEach(function (value) {
            var productTotalSum = value.SumTotalPrice;
            var today = moment().format();
            today = moment().startOf('day');
            if (moment(value.OrderCreateTimestamp) > today) {
                todaySum = todaySum + value.SumTotalPrice;
                todayMarAbs += value.SumTotalProfitAbsolute;
                todayTextColor = changeTextColorListDocumentsForDoc(value.containsDailyPriceCount, todayTextColor);
                value.Products.forEach(function (item) {
                    todayMwst += item.TotalTax;
                });
            }
            var thisWeek = moment().format();
            thisWeek = moment().startOf('day');
            var day = moment().day();
            var diff = moment().date() - day + (day == 0 ? -6 : 1);
            thisWeek = moment().day('diff');
            if (moment(value.OrderCreateTimestamp) > thisWeek) {
                thisWeekSum += value.SumTotalPrice;
                thisWeekMarAbs += value.SumTotalProfitAbsolute;
                thisWeekTextColor = changeTextColorListDocumentsForDoc(value.containsDailyPriceCount, thisWeekTextColor);
                value.Products.forEach(function (item) {
                    thisWeekMwst += item.TotalTax;
                });
            }
            var thisMonth = moment().startOf('month');
            if (moment(value.OrderCreateTimestamp) > thisMonth) {
                thisMonthSum += value.SumTotalPrice;
                thisMonthMarAbs += value.SumTotalProfitAbsolute;
                thisMonthTextColor = changeTextColorListDocumentsForDoc(value.containsDailyPriceCount, thisMonthTextColor);
                value.Products.forEach(function (item) {
                    thisMonthMwst += item.TotalTax;
                });
            }
            var thisYear = moment().startOf('year');
            if (moment(value.OrderCreateTimestamp) > thisYear) {
                thisYearSum += value.SumTotalPrice;
                thisYearMarAbs += value.SumTotalProfitAbsolute;
                thisYearTextColor = changeTextColorListDocumentsForDoc(value.containsDailyPriceCount, thisYearTextColor);
                value.Products.forEach(function (item) {
                    thisYearMwst += item.TotalTax;
                });
            }
        });
        var result = {
            todaySum: todaySum,
            todayMarAbs: todayMarAbs,
            todayMwst: todayMwst,
            thisWeekSum: thisWeekSum,
            thisWeekMarAbs: thisWeekMarAbs,
            thisWeekMwst: thisWeekMwst,
            thisMonthSum: thisMonthSum,
            thisMonthMarAbs: thisMonthMarAbs,
            thisMonthMwst: thisMonthMwst,
            thisYearSum: thisYearSum,
            thisYearMarAbs: thisYearMarAbs,
            thisYearMwst: thisYearMwst,
            dataTop: data,
            documentTextColor: documentTextColor,
            todayTextColor: todayTextColor,
            thisWeekTextColor: thisWeekTextColor,
            thisMonthTextColor: thisMonthTextColor,
            thisYearTextColor: thisYearTextColor
        }
        return result;
    },
    tableSwitchFilterHelper: function ($el) {
        $el.find('.fht-cell input').attr('placeholder', 'Alle');
        $el.find('.fht-cell select option:first-child').text('Alle');
    },
    addRowsOnScroll: function () {
        var self = this;
        var data = this.invoices.toJSON();
        var countDocuments;
        var scHeight = $('#invoice-scroll-listener').get(0).scrollHeight;
        var clHeight = $('#invoice-scroll-listener').get(0).clientHeight;
        var status = $('.bootstrap-table-filter-control-Status_invoices');
        var parent = this;
        var thisTable = this.$el.find('#invoices-table');
        var pageUp = this.$el.closest('#invoice-list-modal').find('.page-up-dn');
        var pageDown = this.$el.closest('#invoice-list-modal').find('.page-down-dn');
        var end = data.length - 60;
        var start = data.length - 30;
        var newData = data.slice(end, start);
        var showArrowsSummary;
        if (typeof App.instance.thisUser.get('setting') !== 'undefined') {
            showArrowsSummary = App.instance.thisUser.get('setting').showArrowsSummary;
            if (showArrowsSummary == 'false') {
                $('.arrowLineForTables span').css({'margin-left': '0'});
            }
        } else {
            showArrowsSummary = 'true';
        }
        newData.forEach(function (value) {
            value.showArrowsSummary = showArrowsSummary;
        });
        $('#invoice-scroll-listener').scroll(function () {
            if ($('#invoices-table')[0].rows[1].classList[0] == 'no-records-found') {
                countDocuments = 0;
            } else {
                countDocuments = $('#invoices-table')[0].rows.length - 1;
            }
            pageUp.removeClass('arrowVisible');
            pageDown.removeClass('arrowVisible');
            pageUp.removeAttr('disabled');
            pageDown.removeAttr('disabled');
            if ((end <= 0) && (scHeight <= (clHeight + $('#invoice-scroll-listener').scrollTop() + 1))) {
                pageDown.attr('disabled', 'disabled');
                pageDown.addClass('arrowVisible');
            }
            if ($('#invoice-scroll-listener').scrollTop() == 0) {
                pageUp.attr('disabled', 'disabled');
                pageUp.addClass('arrowVisible');
            }
            if (scHeight <= (clHeight + $('#invoice-scroll-listener').scrollTop() + 40)) {
                var scTop = $('#invoice-scroll-listener').scrollTop();
                if (status.get(0).value == '') {
                    if (countDocuments < data.length) {
                        if (end >= 0) {
                            thisTable.bootstrapTable('append', newData);
                            start -= 30;
                            end -= 30;
                            scHeight = $('#invoice-scroll-listener').get(0).scrollHeight;
                            clHeight = $('#invoice-scroll-listener').get(0).clientHeight;
                            newData = data.slice(end, start);
                            if (typeof App.instance.thisUser.get('setting') !== 'undefined') {
                                showArrowsSummary = App.instance.thisUser.get('setting').showArrowsSummary;
                                if (showArrowsSummary == 'false') {
                                    $('.arrowLineForTables span').css({'margin-left': '0'});
                                }
                            } else {
                                showArrowsSummary = 'true';
                            }
                            newData.forEach(function (value) {
                                value.showArrowsSummary = showArrowsSummary;
                                var productTotalSum = value.SumTotalPrice;
                                var documentTextColor;
                                var valueTax = 0.0;
                                value.Products.forEach(function (item) {
                                    valueTax += item.TotalTax;
                                });
                                var productTotalSumWithTax = productTotalSum + valueTax;
                                var revenueBruttoString = formatProfitForPrint(productTotalSumWithTax);
                                var revenueString = formatProfitForPrint(productTotalSum);
                                if (revenueString === '-') {
                                    value.revenue = '-';
                                } else {
                                    var revenueInvoice = 0;
                                    if (App.instance.invoices) {
                                        var invoice_id = value.InvoiceId;
                                        if (invoice_id !== null) {
                                            var Invoices_collection = App.instance.invoices;
                                            var invoice = Invoices_collection.get(invoice_id);
                                            if (invoice != undefined) {
                                                revenueInvoice = typeof invoice.get('SumTotalPrice') !== 'undefined' ? invoice.get('SumTotalPrice') : null;
                                                revenueInvoice = ' \u20AC ' + formatProfitForPrint(revenueInvoice);
                                            }
                                        } else {
                                            revenueInvoice = '-';
                                        }
                                    }
                                    documentTextColor = changeTextColorListDocumentsForDoc(value.containsDailyPriceCount);
                                    var nettoHidedClass = self.currentUmsatz === 'netto' ? '' : ' hided-content';
                                    var bruttoHidedClass = self.currentUmsatz === 'brutto' ? '' : ' hided-content';
                                    value.revenue = '<div class="revenueLine' + nettoHidedClass + '"><span class="' + documentTextColor + '">\u20AC ' + revenueString + '</span> / ' +
                                        '<span class="' + documentTextColor + '">' + ' %' + formatProfitForPrint(value.SumTotalProfitPercent) + '</span> / ' +
                                        '<span class="' + documentTextColor + '">' + formatProfitForPrint(value.SumTotalProfitAbsolute) + '</span></div>' +
                                        '<div class="revenueLineBruttoUmsatz' + bruttoHidedClass + '"><span class="' + documentTextColor + '">\u20AC ' + revenueBruttoString + '</span> / ' +
                                        '<span class="' + documentTextColor + '">' + ' %' + formatProfitForPrint(value.SumTotalProfitPercent) + '</span> / ' +
                                        '<span class="' + documentTextColor + '">' + formatProfitForPrint(value.SumTotalProfitAbsolute) + '</span></div>';
                                }
                            });
                            if (self.currentUmsatz === 'brutto') {
                                var elementsToShow = document.getElementsByClassName('revenueLineBruttoUmsatz');
                                var elementsToHide = document.getElementsByClassName('revenueLine');
                                _.each(elementsToShow, function (row) {
                                    row.classList.remove("hided-content");
                                });
                                _.each(elementsToHide, function (row) {
                                    row.classList.add("hided-content");
                                });
                            }
                            parent.processedData = data;
                            parent.paginationNewData = newData;
                            return parent.paginationNewData;
                        } else {
                            end = 0;
                        }
                    }
                }
            }
        });
    },
    changeCheckboxSetting: function(e) {
        e.preventDefault();
        e.stopPropagation();

        var self = this;
        var codeSetting = e.target.getAttribute('id');
        var target = this.$el.find('#' + codeSetting);
        var value = target.prop('checked');

        disabledElementForSlowConnection();

        App.api.user.changeSetting.put(target[0].tagName.toLowerCase(), codeSetting, value).then(function (resp) {
            var setting_value = resp.toString();
            var settings = _.clone(App.instance.thisUser.get('setting'));

            if (settings) {
                if (codeSetting in settings) {
                    settings[codeSetting] = setting_value;
                }
            } else {
                settings = [];
                settings[codeSetting] = setting_value;
            }
            App.instance.thisUser.set('setting', settings);

            self.render();
            includedElementForSlowConnection();
        });
    },
    replacementData: function(){
        this.processedData = this.invoices.toJSON();
    },
    changePeriodSetting: function(e) {
        var codeSetting = 'periodForIN_' + e.target.getAttribute('id').split('-')[0] + 'Invoice';
        var target = 'periodForIN_';
        var value = 'true';
        var elements = ['periodForIN_allInvoice',
            'periodForIN_monthInvoice',
            'periodForIN_sevendaysInvoice',
            'periodForIN_todayInvoice',
            'periodForIN_weekInvoice',
            'periodForIN_yearInvoice',
            'periodForIN_yesterdayInvoice'];
        var showArrowsSummary;
        disabledElementForSlowConnection();

        App.api.user.changeSetting.put(target, codeSetting, value).then(function (resp) {
            var setting_value = resp.toString();
            var settings = _.clone(App.instance.thisUser.get('setting'));

            _.map(elements, function(element) {
                if (element in settings) {
                    return settings[element] = 'false';
                }
            });

            if (settings) {
                if (codeSetting in settings) {
                    settings[codeSetting] = setting_value;
                }
            } else {
                settings = [];
                settings[codeSetting] = setting_value;
            }
            App.instance.thisUser.set('setting', settings);

            includedElementForSlowConnection();
            if (typeof App.instance.thisUser.get('setting') !== 'undefined') {
                showArrowsSummary = App.instance.thisUser.get('setting').showArrowsSummary;
                if (showArrowsSummary == 'false') {
                    $('.arrowLineForTables i').css({'display': 'none'});
                    $('.arrowLineForTables span').css({'margin-left': '0'});
                }
            }
        });

        var dataForTopTable = this.recalculateTopTable($('#invoices-table').bootstrapTable('getData'));

        var todaySum = dataForTopTable.todaySum;
        var todayMarAbs = dataForTopTable.todayMarAbs;
        var todayMwst = dataForTopTable.todayMwst;
        var thisWeekSum = dataForTopTable.thisWeekSum;
        var thisWeekMarAbs = dataForTopTable.thisWeekMarAbs;
        var thisWeekMwst = dataForTopTable.thisWeekMwst;
        var thisMonthSum = dataForTopTable.thisMonthSum;
        var thisMonthMarAbs = dataForTopTable.thisMonthMarAbs;
        var thisMonthMwst = dataForTopTable.thisMonthMwst;
        var thisYearSum = dataForTopTable.thisYearSum;
        var thisYearMarAbs = dataForTopTable.thisYearMarAbs;
        var thisYearMwst = dataForTopTable.thisYearMwst;
        var documentTextColor = dataForTopTable.documentTextColor;
        var todayTextColor = dataForTopTable.todayTextColor;
        var thisWeekTextColor = dataForTopTable.thisWeekTextColor;
        var thisMonthTextColor = dataForTopTable.thisMonthTextColor;
        var thisYearTextColor = dataForTopTable.thisYearTextColor;

        // dataForTopTable.dataTop.forEach(function (value) {
        //     var productTotalSum = value.SumTotalPrice;
        //     var revenueString = formatProfitForPrint(productTotalSum);
        //     if (revenueString === '-') {
        //         value.revenue = '-';
        //     } else {
        //         documentTextColor = changeTextColorListDocumentsForDoc(value.containsDailyPriceCount);
        //
        //         value.revenue = '<span class="' + documentTextColor + '">\u20AC ' + revenueString + '</span> / ' +
        //             '<span class="' + documentTextColor + '">' + ' %' + formatProfitForPrint(value.SumTotalProfitPercent) + '</span> / ' +
        //             '<span class="' + documentTextColor + '">' + formatProfitForPrint(value.SumTotalProfitAbsolute) + '</span>';
        //     }
        //     if (value.sourceDeliveryNotes != null && value.sourceDeliveryNotes != undefined && value.sourceDeliveryNotes.length > 0) {
        //         value.sourceDeliveryNotes.forEach(function (note) {
        //             self.deliveryNotes.models.forEach(function (noteCompany) {
        //                 if (noteCompany.attributes.DeliveryNoteNumber == note.DeliveryNoteNumber) {
        //                     note.DeliveryNoteNumber = note.DeliveryNoteNumber + " (" + noteCompany.attributes.Company + ")";
        //                 }
        //             });
        //         });
        //     }
        // });

        this.renderTopTable(todaySum, todayMarAbs, todayMwst, thisWeekSum, thisWeekMarAbs, thisWeekMwst, thisMonthSum, thisMonthMarAbs, thisMonthMwst,
            thisYearSum, thisYearMarAbs, thisYearMwst, documentTextColor, todayTextColor, thisWeekTextColor, thisMonthTextColor, thisYearTextColor);
    },
    forSlowConnection: function (e) {
        disabledElementForSlowConnection();
    }
});
var CustomerDeliveryNotesView = Backbone.View.extend({
    el: '#delivery-notes-content',
    DeliveryNoteNumberColSort: 'no',
    OrderCreateTimestampColSort: 'no',
    ModifyTimestampColSort: 'no',
    CompletedTimestampColSort: 'no',
    FormattedStatusColSort: 'no',
    InvoiceNumberColSort: 'no',
    revenueColSort: 'no',
    currentUmsatz: 'netto',
    InvoiceNumberForStatusColSort: 'no',
    clustered: true,
    flag: 0,
    groupsWithItems: [],
    currentPeriod: 'all',
    processedData: [],
    paginationNewData: [],
    lastClicked: '',
    lastClickedInvoice: '',
    calculedNotes: [],
    events: {
        'click .show-delivery-note': 'selectDeliveryNote',
        'click .show-invoice': 'selectInvoice',
        'change #columnItemOrderCreateTimestamp': 'changeCheckboxSetting',
        'change #columnItemModifyTimestamp': 'changeCheckboxSetting',
        'change #columnItemCompletedTimestamp': 'changeCheckboxSetting',
        'change #deliveryNoteCluster': 'changeCheckboxSetting',
        'click #date-group-dropdown-delivery': 'replacementData',
        'click .sortable': 'forSlowConnection',
        'click input[name="umsatz"]': 'umsatzChanged'
        // 'change #toolbar-status-select': 'select'
    },
    template: _.template($('#delivery-notes-content-tpl').html()),
    initialize: function (notes, invoices, customerId) {
        var self = this;
        this.invoices = invoices;
        this.customerId = customerId;
        var deletedInvoices = invoices.models.map(function (item) {
            if (item.attributes.DeleteTimestamp !== '0000-00-00 00:00:00') {
                var createDate = Date.parse(item.attributes.CreateTimestamp);
                var deleteDate = Date.parse(item.attributes.DeleteTimestamp);
                if (createDate < deleteDate) {
                    return item.attributes.Id;
                }
            }
        });
        var notesData = notes.models.map(function (item) {
            item.attributes.deleted = false;
            if (item.attributes.DeleteTimestamp !== '0000-00-00 00:00:00') {
                var createDate = Date.parse(item.attributes.CreateTimestamp);
                var deleteDate = Date.parse(item.attributes.DeleteTimestamp);
                if (createDate < deleteDate) {
                    item.attributes.deleted = true;
                }
            }
            if (deletedInvoices.includes(item.attributes.Id)) {
                item.attributes.InvoiceId = null;
                item.attributes.InvoiceNumber = null;
                item.attributes.InvoiceNumberForStatus = null;
                item.attributes.InvoiceStatus = null;
                item.attributes.InvoiceTitle = null;
            }
            return item;
        });
        notesData = $.grep(notesData, function(item){
            return item.attributes.deleted !== true;
        });
        this.invoices = invoices;
        notes.models = notesData;
        var notesJs = notes.toJSON();
        notesJs.forEach(function (value) {
            var productTotalSum = value.SumTotalPrice;
            var revenueString = formatProfitForPrint(productTotalSum);
            var valueTax = 0.0;
            value.Products.forEach(function (item) {
                valueTax += item.TotalTax;
            });
            var productTotalSumWithTax = productTotalSum + valueTax;
            var revenueBruttoString = formatProfitForPrint(productTotalSumWithTax);
            if (revenueString === '-') {
                value.revenue = '-';
            } else {
                var revenueInvoice = 0;

                if (App.instance.invoices) {
                    var invoice_id = value.InvoiceId;
                    if (invoice_id !== null) {

                        var Invoices_collection = App.instance.invoices;
                        var invoice = Invoices_collection.get(invoice_id);

                        if(invoice != undefined) {
                            revenueInvoice = typeof invoice.get('SumTotalPrice') !== 'undefined' ? invoice.get('SumTotalPrice') : null;
                            revenueInvoice = ' \u20AC ' + formatProfitForPrint(revenueInvoice);
                        }
                    } else {
                        revenueInvoice = '-';
                    }
                }
                documentTextColor = changeTextColorListDocumentsForDoc(value.containsDailyPriceCount);

                var nettoHidedClass = self.currentUmsatz === 'netto' ? '' : ' hided-content';
                var bruttoHidedClass = self.currentUmsatz === 'brutto' ? '' : ' hided-content';
                value.revenue = '<div class="revenueLine' + nettoHidedClass + '"><span class="' + documentTextColor + '">\u20AC ' + revenueString + '</span> / ' +
                    '<span class="' + documentTextColor + '">' + ' %' + formatProfitForPrint(value.SumTotalProfitPercent) + '</span> / ' +
                    '<span class="' + documentTextColor + '">' + formatProfitForPrint(value.SumTotalProfitAbsolute) + '</span> / ' +
                    '<span class="' + documentTextColor + '">' + revenueInvoice + '</span></div>' +
                    '<div class="revenueLineBruttoUmsatz' + bruttoHidedClass + '"><span class="' + documentTextColor + '">\u20AC ' + revenueBruttoString + '</span> / ' +
                    '<span class="' + documentTextColor + '">' + ' %' + formatProfitForPrint(value.SumTotalProfitPercent) + '</span> / ' +
                    '<span class="' + documentTextColor + '">' + formatProfitForPrint(value.SumTotalProfitAbsolute) + '</span> / ' +
                    '<span class="' + documentTextColor + '">' + revenueInvoice + '</span></div>';
            }
        });
        this.calculedNotes = notesJs;
        this.notes = notes;
        App.instance.deliveryNotes.on("change", this.update, this);
        App.instance.deliveryNotes.once("update", this.render, this);
        // $(this).find('.show-delivery-note').removeClass('clicked');
    },
    selectDeliveryNote: function (e) {
        var deliveryNoteId = e.currentTarget.dataset.id;
        if (window.innerWidth <= 480) {
            if (this.flag == deliveryNoteId) {
                this.lastClicked = '';
                this.lastClickedInvoice = '';
                this.$el.find('.show-delivery-note,.show-invoice').each(function () {
                    this.classList.remove('last-clicked');
                });
                this.lastClicked = deliveryNoteId;
                App.instance.selectionModel.set('SelectedDeliveryNoteId', deliveryNoteId);
                $('.popover').hide();
                this.flag = 0;
            } else {
                e.preventDefault();
                e.stopPropagation();
                $('.popover').hide();
                $(e.target).popover('show');
                this.flag = deliveryNoteId;
                setTimeout(function () {
                    $('.popover').hide();
                }, 3000);
            }
        } else {
            this.lastClicked = '';
            this.lastClickedInvoice = '';
            this.$el.find('.show-delivery-note,.show-invoice').each(function () {
                this.classList.remove('last-clicked');
            });
            this.lastClicked = deliveryNoteId;
            App.instance.selectionModel.set('SelectedDeliveryNoteId', deliveryNoteId);
        }
    },
    selectInvoice: function (e) {
        var invoiceId = e.currentTarget.dataset.id;
        var self = this;
        if (window.innerWidth <= 480) {
            if (this.flag == invoiceId) {
                this.lastClicked = '';
                this.lastClickedInvoice = '';
                this.$el.find('.show-delivery-note,.show-invoice').each(function () {
                    this.classList.remove('last-clicked');
                });
                this.lastClickedInvoice = invoiceId;
                App.instance.selectionModel.set('SelectedInvoiceId', invoiceId);
                this.$el.find('.show-invoice').each(function () {
                    if (this.dataset.id == self.lastClickedInvoice) {
                        this.classList.add('last-clicked');
                    }
                });
                $('.popover').hide();
                this.flag = 0;
            } else {
                e.preventDefault();
                e.stopPropagation();
                $('.popover').hide();
                $(e.target).popover('show');
                this.flag = invoiceId;
                setTimeout(function () {
                    $('.popover').hide();
                }, 3000);
            }
        } else {
            this.lastClicked = '';
            this.lastClickedInvoice = '';
            this.$el.find('.show-delivery-note,.show-invoice').each(function () {
                this.classList.remove('last-clicked');
            });
            this.lastClickedInvoice = invoiceId;
            App.instance.selectionModel.set('SelectedInvoiceId', invoiceId);
            this.$el.find('.show-invoice').each(function () {
                if (this.dataset.id == self.lastClickedInvoice) {
                    this.classList.add('last-clicked');
                }
            });
        }
    },
    update: function (collection) {
        // if ($('#LetzteBearbeitungLieferschein').prop("checked") == 'true') {
        //     $('#LetzteBearbeitungLieferschein').attr("checked","checked");
        // } else {
        //     $('#LetzteBearbeitungLieferschein').removeAttr("checked");
        // }
        // if ($('#Finalisiert').prop("checked") == 'true') {
        //     $('#Finalisiert').attr("checked","checked");
        // } else {
        //     $('#Finalisiert').removeAttr("checked");
        // }

        if (this.customerId == 0) {
            this.notes.reset(collection.collection.models);
        } else {
            this.notes.reset(collection.collection.where({CustomerId: this.customerId}));
        }
        this.render();
        var self = this;
        setTimeout(function () {
            self.addRowsOnScroll(100);
        }, 1000);
    },
    umsatzChanged: function(e) {
        $('#tax-button-DN').click();
        selected_value = $('input[name="umsatz"]:checked').val();
        if (selected_value === 'netto') {
            $('#tax-button-DN')[0].innerHTML = '<span>Netto</span> <span class="caret"></span>';
            this.currentUmsatz = 'netto';
            var elementsToShow = document.getElementsByClassName('revenueLine');
            var elementsToHide = document.getElementsByClassName('revenueLineBruttoUmsatz');
            _.each(elementsToShow, function (row) {
                row.classList.remove("hided-content");
            });
            _.each(elementsToHide, function (row) {
                row.classList.add("hided-content");
            });
        } else if (selected_value === 'brutto') {
            $('#tax-button-DN')[0].innerHTML = '<span>Brutto</span> <span class="caret"></span>';
            this.currentUmsatz = 'brutto';
            var elementsToShow = document.getElementsByClassName('revenueLineBruttoUmsatz');
            var elementsToHide = document.getElementsByClassName('revenueLine');
            _.each(elementsToShow, function (row) {
                row.classList.remove("hided-content");
            });
            _.each(elementsToHide, function (row) {
                row.classList.add("hided-content");
            });
        }

        var self = this;
        var codeSetting = 'taxDn_' + e.target.getAttribute('id').substring(e.target.getAttribute('id').indexOf('-') + 1,e.target.getAttribute('id').indexOf('-', e.target.getAttribute('id').indexOf('-') + 1));
        var target = 'taxDn_';
        var value = 'true';
        var elements = ['taxDn_netto',
            'taxDn_brutto'];

        disabledElementForSlowConnection();

        App.api.user.changeSetting.put(target, codeSetting, value).then(function (resp) {
            var setting_value = resp.toString();
            var settings = _.clone(App.instance.thisUser.get('setting'));

            _.map(elements, function(element) {
                if (element in settings) {
                    return settings[element] = 'false';
                }
            });

            if (settings) {
                if (codeSetting in settings) {
                    settings[codeSetting] = setting_value;
                }
            } else {
                settings = [];
                settings[codeSetting] = setting_value;
            }
            App.instance.thisUser.set('setting', settings);

            includedElementForSlowConnection();
        });
    },
    findDnRowsForChangeStatus: function (table_data, checked_buyer_id) {
        var delivery_notes_change_state = [];

        table_data.forEach(function (data_row) {
            if (data_row.CustomerId !== checked_buyer_id && rowDnMayBeSelect(data_row)) {
                delivery_notes_change_state.push(Number(data_row.Id));
            }
        });
        var table_rows = this.$el.find('#delivery-notes-table tr');
        var document_id;
        var table_rows_change_state = [];

        _.each(table_rows, function (row) {
            document_id = null;
            if (!$(row).hasClass('selected')) {
                document_id = $(row).find('a[data-target="#delivery-note-modal"]').data('id');
            }
            if (document_id !== null && $.inArray(Number(document_id), delivery_notes_change_state) > -1) {
                table_rows_change_state.push(row);
            }
        });

        return table_rows_change_state;
    },
    getAllSelectedDeliveryNotes: function () {
        return this.$el.find('#delivery-notes-table').bootstrapTable('getAllSelections');
    },
    render: function () {
        var $makeBillsButton = this.$el.closest('#delivery-note-list-modal').find('#make-bills-button');
        var $makeFinalizeButton = this.$el.closest('#delivery-note-list-modal').find('#finalize-all-delivery-note-button');
        var $deleteSelectedButton = this.$el.closest('#delivery-note-list-modal').find('#delete-selected-delivery-note-button');
        var $makePageUp = this.$el.closest('#delivery-note-list-modal').find('.page-up-dn');
        var $makePageDown = this.$el.closest('#delivery-note-list-modal').find('.page-down-dn');
        var self = this;
        var data = this.notes.toJSON();
        var todaySum = 0.0; //heute
        var todayMarAbs = 0.0;
        var todayMwst = 0.0;
        var thisWeekSum = 0.0; //diese Woche
        var thisWeekMarAbs = 0.0;
        var thisWeekMwst = 0.0;
        var thisMonthSum = 0.0; //diesen Monat
        var thisMonthMarAbs = 0.0;
        var thisMonthMwst = 0.0;
        var thisYearSum = 0.0; //dieses Jahr
        var thisYearMarAbs = 0.0;
        var thisYearMwst = 0.0;
        var documentTextColor, todayTextColor, thisWeekTextColor, thisMonthTextColor, thisYearTextColor;
        documentTextColor = todayTextColor = thisWeekTextColor = thisMonthTextColor = thisYearTextColor = '';

        var dataForTopTable = this.recalculateTopTable(data);

        todaySum = dataForTopTable.todaySum;
        todayMarAbs = dataForTopTable.todayMarAbs;
        todayMwst = dataForTopTable.todayMwst;
        thisWeekSum = dataForTopTable.thisWeekSum;
        thisWeekMarAbs = dataForTopTable.thisWeekMarAbs;
        thisWeekMwst = dataForTopTable.thisWeekMwst;
        thisMonthSum = dataForTopTable.thisMonthSum;
        thisMonthMarAbs = dataForTopTable.thisMonthMarAbs;
        thisMonthMwst = dataForTopTable.thisMonthMwst;
        thisYearSum = dataForTopTable.thisYearSum;
        thisYearMarAbs = dataForTopTable.thisYearMarAbs;
        thisYearMwst = dataForTopTable.thisYearMwst;
        documentTextColor = dataForTopTable.documentTextColor;
        todayTextColor = dataForTopTable.todayTextColor;
        thisWeekTextColor = dataForTopTable.thisWeekTextColor;
        thisMonthTextColor = dataForTopTable.thisMonthTextColor;
        thisYearTextColor = dataForTopTable.thisYearTextColor;

        dataForTopTable.dataTop.forEach(function (value) {
            var productTotalSum = value.SumTotalPrice;
            var revenueString = formatProfitForPrint(productTotalSum);
            var valueTax = 0.0;
            value.Products.forEach(function (item) {
                valueTax += item.TotalTax;
            });
            var productTotalSumWithTax = productTotalSum + valueTax;
            var revenueBruttoString = formatProfitForPrint(productTotalSumWithTax);
            if (revenueString === '-') {
                value.revenue = '-';
            } else {
                var revenueInvoice = 0;

                if (App.instance.invoices) {
                    var invoice_id = value.InvoiceId;
                    if (invoice_id !== null) {

                        var Invoices_collection = App.instance.invoices;
                        var invoice = Invoices_collection.get(invoice_id);

                        if(invoice != undefined) {
                            revenueInvoice = typeof invoice.get('SumTotalPrice') !== 'undefined' ? invoice.get('SumTotalPrice') : null;
                            revenueInvoice = ' \u20AC ' + formatProfitForPrint(revenueInvoice);
                        }
                    } else {
                        revenueInvoice = '-';
                    }
                }
                documentTextColor = changeTextColorListDocumentsForDoc(value.containsDailyPriceCount);

                var nettoHidedClass = self.currentUmsatz === 'netto' ? '' : ' hided-content';
                var bruttoHidedClass = self.currentUmsatz === 'brutto' ? '' : ' hided-content';
                value.revenue = '<div class="revenueLine' + nettoHidedClass + '"><span class="' + documentTextColor + '">\u20AC ' + revenueString + '</span> / ' +
                    '<span class="' + documentTextColor + '">' + ' %' + formatProfitForPrint(value.SumTotalProfitPercent) + '</span> / ' +
                    '<span class="' + documentTextColor + '">' + formatProfitForPrint(value.SumTotalProfitAbsolute) + '</span> / ' +
                    '<span class="' + documentTextColor + '">' + revenueInvoice + '</span></div>' +
                    '<div class="revenueLineBruttoUmsatz' + bruttoHidedClass + '"><span class="' + documentTextColor + '">\u20AC ' + revenueBruttoString + '</span> / ' +
                    '<span class="' + documentTextColor + '">' + ' %' + formatProfitForPrint(value.SumTotalProfitPercent) + '</span> / ' +
                    '<span class="' + documentTextColor + '">' + formatProfitForPrint(value.SumTotalProfitAbsolute) + '</span> / ' +
                    '<span class="' + documentTextColor + '">' + revenueInvoice + '</span></div>';
            }
            // value.DeliveryNoteNumber = value.DeliveryNoteNumber + " (" + value.Company + ")";
        });
        var showArrowsSummary;
        if(typeof App.instance.thisUser.get('setting') !== 'undefined'){
            showArrowsSummary = App.instance.thisUser.get('setting').showArrowsSummary;
        }else{
            showArrowsSummary = 'true';
        }
        var newData = data.map(function (item) {
            item.showArrowsSummary = showArrowsSummary;
            item.deleted = false;
            if (item.DeleteTimestamp !== '0000-00-00 00:00:00') {
                var createDate = Date.parse(item.CreateTimestamp);
                var deleteDate = Date.parse(item.DeleteTimestamp);
                if (createDate < deleteDate) {
                    item.deleted = true;
                }
            }
            return item;
        });
        newData = $.grep(newData, function(item){
            return item.deleted !== true;
        });

        if (sortOrderForTableDN() == 'desc') {
            var reverseNewData = newData.slice().reverse();
            this.paginationNewData = reverseNewData.slice(length - 30);
        } else {
            this.paginationNewData = newData.slice(length - 30);
        }

        this.processedData = this.paginationNewData;
        this.currentData = this.paginationNewData;
        this.$el.html(this.template());
        $makeBillsButton.prop('disabled', true);
        $makeFinalizeButton.prop('disabled', true);
        $deleteSelectedButton.prop('disabled', true);

        var delivery_notes_table = this.$el.find('#delivery-notes-table');
        delivery_notes_table.bootstrapTable({
            data: this.paginationNewData,
            filterControl: true,
            toolbarAlign: 'none',
            toolbar: '#toolbar-delivery-note-table', //Column order is important for custom toolbar
            showColumns: true,
            classes: 'table table-hover medium-font',
            sortable: false,
            paginationLoop: true,
            checkboxHeader: true,
            columns: [
                {
                    formatter: indexFormatter,
                    class: 'position-column text-left wo-padding'
                },
                {
                    field: 'state',
                    checkbox: true,
                    formatter: stateDnFormatter
                },
                {
                    field: 'DeliveryNoteNumber',
                    formatter: linkFormatter,
                    title: 'Lieferschein Nr',
                    sortable: true,
                    order: 'desc',
                    filterControl: 'input',
                    class: 'item-row'
                },
                {
                    field: 'OrderCreateTimestamp',
                    visible: visibleColumnItemOrderCreateTimestamp(),
                    formatter: dateFormatter,
                    filterControl: 'datepicker',
                    filterDatepickerOptions: {
                        format: 'dd.mm.yyyy',
                        autoclose: true,
                        clearBtn: true,
                        todayHighlight: true
                    },
                    id: 'dnOrderCreateTimestamp',
                    class: 'table-th-datepicker-block',
                    sortable: true,
                    order: 'desc',
                    title: 'Eingegangene <br/> Bestellung',
                    width: '115px'
                },
                {
                    field: 'ModifyTimestamp',
                    visible: visibleColumnItemModifyTimestamp(),
                    formatter: dateFormatter,
                    filterControl: 'datepicker',
                    filterDatepickerOptions: {
                        format: 'dd.mm.yyyy',
                        autoclose: true,
                        clearBtn: true,
                        todayHighlight: true
                    },
                    id: 'LetzteBearbeitungLieferschein',
                    class: 'table-th-datepicker-block',
                    sortable: true,
                    order: 'desc',
                    title: 'Letzte <br/> Bearbeitung <br/> Lieferschein',
                    width: '115px'
                },
                {
                    field: 'CompletedTimestamp',
                    visible: visibleColumnItemCompletedTimestamp(),
                    formatter: dateFormatterCompleted,
                    filterControl: 'datepicker',
                    filterDatepickerOptions: {
                        format: 'dd.mm.yyyy',
                        autoclose: true,
                        clearBtn: true,
                        todayHighlight: true
                    },
                    id: 'Finalisiert',
                    class: 'table-th-datepicker-block',
                    sortable: true,
                    order: 'desc',
                    title: 'Finalisiert',
                    width: '115px'
                },
                {
                    field: 'FormattedStatus',
                    id: 'notSorting',
                    sortable: false,
                    formatter: statusFormatter,
                    filterControl: 'select',
                    class: 'table-th-datepicker-block',
                    title: 'Status',
                    width: '120px'
                },
                {
                    field: 'InvoiceNumber',
                    formatter: linkFormatterDeliveryInvoice,
                    title: 'Rechnung erstellt <br/> aus Lieferschein Nr',
                    sortable: true,
                    order: 'desc',
                    class: 'item-row'
                },
                {
                    field: 'InvoiceNumberForStatus',
                    id: 'notSorting',
                    sortable: false,
                    formatter: secondStatusFormatter,
                    filterControl: 'select',
                    class: 'table-th-datepicker-block',
                    title: 'Status Rechnung',
                    width: '120px'
                },
                {
                    field: 'revenue',
                    title: 'Umsatz / % Marge / <br/> abs Marge / Rechnung Umsatz',
                    sortable: true,
                    order: 'desc',
                    class: 'item-row'
                }
            ],
            locale: 'de-DE',
            onPostBody: function(){
                var countDocuments;
                if ($('#delivery-notes-table')[0].rows[1].classList[0] == 'no-records-found') {
                    countDocuments = 0;
                } else {
                    countDocuments = $('#delivery-notes-table')[0].rows.length -1;
                }
                changeCountDocument(countDocuments, newData.length);

                var selected_DNs = self.getAllSelectedDeliveryNotes();
                changeCheckedDocument(selected_DNs.length);

                if (periodForTableDN() != '#all-group-delivery'){
                    self.processedData = self.notes.toJSON();
                }

                if ($('#delivery-notes-scroll-listener').get(0).scrollHeight == $('#delivery-notes-scroll-listener').get(0).offsetHeight) {
                    $makePageDown.attr('disabled', 'disabled');
                    $makePageDown.addClass('arrowVisible');
                    $makePageUp.attr('disabled', 'disabled');
                    $makePageUp.addClass('arrowVisible');
                }
                if (countDocuments > 7) {
                    $makePageDown.removeAttr('disabled');
                    $makePageDown.removeClass('arrowVisible');
                }
            },
            onCheck: function (row) {
                $makeBillsButton.prop('disabled', false);
                $makeFinalizeButton.prop('disabled', false);
                $deleteSelectedButton.prop('disabled', false);

                var selected_DNs = self.getAllSelectedDeliveryNotes();

                changeCheckedDocument(selected_DNs.length);

                if (selected_DNs.length > 1) {
                    firstCustomer = selected_DNs[0].CustomerId;
                    _.each(selected_DNs, function (selected_DN) {
                        if (selected_DN.CustomerId !== firstCustomer) {
                            $makeBillsButton.prop('disabled', true);
                        }
                        if (selected_DN.Products.length === 0) {
                            $makeBillsButton.prop('disabled', true);
                        }
                    });
                }
                else
                {
                    if (selected_DNs.length === 1) {
                        if (selected_DNs[0].Products.length === 0) {
                            $makeBillsButton.prop('disabled', true);
                        }
                    }
                }

                if (selected_DNs.length > 0) {
                    $deleteSelectedButton.prop('disabled', false);
                }

                // temporary turned off
                //if (selected_DNs.length > 1) {
                //    return false;
                //}
                //var checked_buyer_id = row.CustomerId;
                //
                //var table_rows_change_state = self.findDnRowsForChangeStatus(self.paginationNewData, checked_buyer_id);
                //
                //_.each(table_rows_change_state, function (row_to_change) {
                //    $(row_to_change).find('input[type="checkbox"]').prop('disabled', true);
                //});
            },
            onCheckAll: function (rows) {
                if (rows.length > 0) {
                    $makeBillsButton.prop('disabled', false);
                    $makeFinalizeButton.prop('disabled', false);
                    $deleteSelectedButton.prop('disabled', false);

                    var selected_DNs = self.getAllSelectedDeliveryNotes();

                    changeCheckedDocument(selected_DNs.length);

                    if (selected_DNs.length > 1) {
                        firstCustomer = selected_DNs[0].CustomerId;
                        _.each(selected_DNs, function (selected_DN) {
                            if (selected_DN.CustomerId !== firstCustomer) {
                                $makeBillsButton.prop('disabled', true);
                            }
                            if (selected_DN.Products.length === 0) {
                                $makeBillsButton.prop('disabled', true);
                            }
                        });
                    }
                    else
                    {
                        if (selected_DNs.length === 1) {
                            if (selected_DNs[0].Products.length === 0) {
                                $makeBillsButton.prop('disabled', true);
                            }
                        }
                    }
                }
            },
            onUncheck: function (row) {
                var selected_DNs = self.getAllSelectedDeliveryNotes();
                changeCheckedDocument(selected_DNs.length);
                $deleteSelectedButton.prop('disabled', false);

                if (selected_DNs.length === 0) {
                    $makeBillsButton.prop('disabled', true);
                    $makeFinalizeButton.prop('disabled', true);
                    $deleteSelectedButton.prop('disabled', true);
                }

                if (selected_DNs.length > 1) {
                    firstCustomer = selected_DNs[0].CustomerId;
                    var differentCustomers = false;
                    var emptyProducts = false;
                    _.each(selected_DNs, function (selected_DN) {
                        if (selected_DN.CustomerId !== firstCustomer) {
                            differentCustomers = true;
                        }
                        if (selected_DN.Products.length === 0) {
                            emptyProducts = true;
                        }
                    });
                    if (differentCustomers === true || emptyProducts === true) {
                        $makeBillsButton.prop('disabled', true);
                    } else {
                        $makeBillsButton.prop('disabled', false);
                    }
                }
                else
                {
                    if (selected_DNs.length === 1) {
                        if (selected_DNs[0].Products.length === 0) {
                            $makeBillsButton.prop('disabled', true);
                        }
                        else
                        {
                            $makeBillsButton.prop('disabled', false);
                        }
                    }
                }
            },
            onUncheckAll: function () {
                var selected_DNs = self.getAllSelectedDeliveryNotes();
                changeCheckedDocument(selected_DNs.length);
                $makeBillsButton.prop('disabled', true);
                $makeFinalizeButton.prop('disabled', true);
                $deleteSelectedButton.prop('disabled', true);
            },
            onSearch: function () {
                var dataForTopTable = self.recalculateTopTable($('#delivery-notes-table').bootstrapTable('getData'));

                var todaySum = dataForTopTable.todaySum;
                var todayMarAbs = dataForTopTable.todayMarAbs;
                var todayMwst = dataForTopTable.todayMwst;
                var thisWeekSum = dataForTopTable.thisWeekSum;
                var thisWeekMarAbs = dataForTopTable.thisWeekMarAbs;
                var thisWeekMwst = dataForTopTable.thisWeekMwst;
                var thisMonthSum = dataForTopTable.thisMonthSum;
                var thisMonthMarAbs = dataForTopTable.thisMonthMarAbs;
                var thisMonthMwst = dataForTopTable.thisMonthMwst;
                var thisYearSum = dataForTopTable.thisYearSum;
                var thisYearMarAbs = dataForTopTable.thisYearMarAbs;
                var thisYearMwst = dataForTopTable.thisYearMwst;
                var documentTextColor = dataForTopTable.documentTextColor;
                var todayTextColor = dataForTopTable.todayTextColor;
                var thisWeekTextColor = dataForTopTable.thisWeekTextColor;
                var thisMonthTextColor = dataForTopTable.thisMonthTextColor;
                var thisYearTextColor = dataForTopTable.thisYearTextColor;

                dataForTopTable.dataTop.forEach(function (value) {
                    var productTotalSum = value.SumTotalPrice;
                    var revenueString = formatProfitForPrint(productTotalSum);
                    var valueTax = 0.0;
                    value.Products.forEach(function (item) {
                        valueTax += item.TotalTax;
                    });
                    var productTotalSumWithTax = productTotalSum + valueTax;
                    var revenueBruttoString = formatProfitForPrint(productTotalSumWithTax);
                    if (revenueString === '-') {
                        value.revenue = '-';
                    } else {
                        var revenueInvoice = 0;

                        if (App.instance.invoices) {
                            var invoice_id = value.InvoiceId;
                            if (invoice_id !== null) {

                                var Invoices_collection = App.instance.invoices;
                                var invoice = Invoices_collection.get(invoice_id);

                                if(invoice != undefined) {
                                    revenueInvoice = typeof invoice.get('SumTotalPrice') !== 'undefined' ? invoice.get('SumTotalPrice') : null;
                                    revenueInvoice = ' \u20AC ' + formatProfitForPrint(revenueInvoice);
                                }
                            } else {
                                revenueInvoice = '-';
                            }
                        }
                        documentTextColor = changeTextColorListDocumentsForDoc(value.containsDailyPriceCount);

                        var nettoHidedClass = self.currentUmsatz === 'netto' ? '' : ' hided-content';
                        var bruttoHidedClass = self.currentUmsatz === 'brutto' ? '' : ' hided-content';
                        value.revenue = '<div class="revenueLine' + nettoHidedClass + '"><span class="' + documentTextColor + '">\u20AC ' + revenueString + '</span> / ' +
                            '<span class="' + documentTextColor + '">' + ' %' + formatProfitForPrint(value.SumTotalProfitPercent) + '</span> / ' +
                            '<span class="' + documentTextColor + '">' + formatProfitForPrint(value.SumTotalProfitAbsolute) + '</span> / ' +
                            '<span class="' + documentTextColor + '">' + revenueInvoice + '</span></div>' +
                            '<div class="revenueLineBruttoUmsatz' + bruttoHidedClass + '"><span class="' + documentTextColor + '">\u20AC ' + revenueBruttoString + '</span> / ' +
                            '<span class="' + documentTextColor + '">' + ' %' + formatProfitForPrint(value.SumTotalProfitPercent) + '</span> / ' +
                            '<span class="' + documentTextColor + '">' + formatProfitForPrint(value.SumTotalProfitAbsolute) + '</span> / ' +
                            '<span class="' + documentTextColor + '">' + revenueInvoice + '</span></div>';
                    }
                    // value.DeliveryNoteNumber = value.DeliveryNoteNumber + " (" + value.Company + ")";
                });

                self.renderTopTable(todaySum, todayMarAbs, todayMwst, thisWeekSum, thisWeekMarAbs, thisWeekMwst, thisMonthSum, thisMonthMarAbs, thisMonthMwst,
                    thisYearSum, thisYearMarAbs, thisYearMwst, documentTextColor, todayTextColor, thisWeekTextColor, thisMonthTextColor, thisYearTextColor);

                if (self.currentUmsatz === 'brutto') {
                    var elementsToShow = document.getElementsByClassName('revenueLineBruttoUmsatz');
                    var elementsToHide = document.getElementsByClassName('revenueLine');
                    _.each(elementsToShow, function (row) {
                        row.classList.remove("hided-content");
                    });
                    _.each(elementsToHide, function (row) {
                        row.classList.add("hided-content");
                    });
                }
            },
            onAll: function () {
                if (self.DeliveryNoteNumberColSort === 'no' && self.OrderCreateTimestampColSort === 'no' &&
                    self.ModifyTimestampColSort === 'no' && self.CompletedTimestampColSort === 'no' &&
                    self.FormattedStatusColSort === 'no' && self.InvoiceNumberColSort === 'no' &&
                    self.revenueColSort === 'no' && self.InvoiceNumberForStatusColSort === 'no') {
                    var sortName = sortNameForTableDN();
                    var sortOrder = sortOrderForTableDN();

                    self.DeliveryNoteNumberColSort = sortName === 'DeliveryNoteNumber' ? sortOrder : 'no';
                    self.OrderCreateTimestampColSort = sortName === 'OrderCreateTimestamp' ? sortOrder : 'no';
                    self.ModifyTimestampColSort = sortName === 'ModifyTimestamp' ? sortOrder : 'no';
                    self.CompletedTimestampColSort = sortName === 'CompletedTimestamp' ? sortOrder : 'no';
                    self.FormattedStatusColSort = sortName === 'FormattedStatus' ? sortOrder : 'no';
                    self.InvoiceNumberColSort = sortName === 'InvoiceNumber' ? sortOrder : 'no';
                    self.revenueColSort = sortName === 'revenue' ? sortOrder : 'no';
                    self.InvoiceNumberForStatusColSort = sortName === 'InvoiceNumberForStatus' ? sortOrder : 'no';
                }
            }
        });

        this.renderTopTable(todaySum, todayMarAbs, todayMwst, thisWeekSum, thisWeekMarAbs, thisWeekMwst, thisMonthSum, thisMonthMarAbs, thisMonthMwst,
            thisYearSum, thisYearMarAbs, thisYearMwst, documentTextColor, todayTextColor, thisWeekTextColor, thisMonthTextColor, thisYearTextColor);

        this.tableSwitchFilterHelper(self.$el);
        //this.$el.find('#delivery-notes-table').bootstrapTable('filterBy', ''); // need for correct merging because of strange table rendering
        $makeBillsButton.off('click').on('click', function () {
            var text = 'Lieferschein finalisieren und Rechnung vorbereiten?';
            Matrex.confirm(text, function () {
                var Dn = self.getAllSelectedDeliveryNotes();
                var DnId = Dn.map(function (item) {
                    return item.Id
                });
                App.instance.invoices.fetch({
                    type: 'POST',
                    data: {deliveryNoteId: DnId.join()},
                    success: function () {
                        App.instance.invoices.fetch({
                            error: function (model, response, options) {
                                displayErrorBackbone(model, response, options);
                            }
                        });
                        App.instance.deliveryNotes.fetch({
                            error: function (model, response, options) {
                                displayErrorBackbone(model, response, options);
                            }
                        });
                        Matrex.notify('Rechnung wurde erstellt.', 'success');
                        self.$el.find('#delivery-notes-table').bootstrapTable('uncheckAll');
                    },
                    error: function (model, response, options) {
                        displayErrorBackbone(model, response, options);
                    }
                });
            }, function () {
            });
        });
        $makeFinalizeButton.off('click').on('click', function () {
            var Dn = self.getAllSelectedDeliveryNotes();
            var DnId = Dn.map(function (item) {
                return item.Id
            });
            App.instance.deliveryNotes.fetch({
                type: 'PATCH',
                data: {
                    Finalize: true,
                    DeliveryNoteIds: DnId
                },
                success: function () {
                    Matrex.notify('Lieferschein wurde abgeschlossen.', 'success');
                    self.$el.find('#delivery-notes-table').bootstrapTable('uncheckAll');
                },
                error: function (model, response, options) {
                    Matrex.notify(response.responseJSON.message, 'error');
                }
            })
        });
        $deleteSelectedButton.off('click').on('click', function () {
            var text = 'Ausgewählte Lieferscheinen löschen?';
            Matrex.confirm(text, function () {
                disabledElementForSlowConnection();
                var Dn = self.getAllSelectedDeliveryNotes();
                var delBills = document.getElementById('delete-with-bill').checked;
                var DnId = Dn.map(function (item) {
                    return item.Id
                });
                var InvId = Dn.map(function (item) {
                    return item.InvoiceId
                });
                InvId = InvId.filter(function (el) {
                    return el != null;
                });
                App.instance.deliveryNotes.fetch({
                    type: 'DELETE',
                    reset: true,
                    data: {
                        Delete: true,
                        DeliveryNoteIds: DnId,
                        DeleteBills: delBills,
                        InvoiceIds: InvId
                    },
                    success: function () {
                        var notesData = self.notes.models.map(function (item) {
                            item.attributes.deleted = false;
                            if (item.attributes.DeleteTimestamp !== '0000-00-00 00:00:00') {
                                var createDate = Date.parse(item.attributes.CreateTimestamp);
                                var deleteDate = Date.parse(item.attributes.DeleteTimestamp);
                                if (createDate < deleteDate) {
                                    item.attributes.deleted = true;
                                }
                            }
                            return item;
                        });
                        notesData = $.grep(notesData, function(item){
                            return item.attributes.deleted !== true;
                        });
                        if (delBills) {
                            notesData.forEach(function (value) {
                                if (InvId.includes(value.attributes.InvoiceId)) {
                                    value.attributes.InvoiceId = null;
                                    value.attributes.InvoiceNumber = null;
                                    value.attributes.InvoiceNumberForStatus = null;
                                    value.attributes.InvoiceStatus = null;
                                    value.attributes.InvoiceTitle = null;
                                }
                            });
                        }
                        self.notes.models = notesData;
                        self.calculedNotes = self.notes.toJSON();
                        self.render();
                        setTimeout(function () {
                            self.addRowsOnScroll(100);
                        }, 1000);
                        App.instance.invoices.fetch({
                            reset: true,
                            error: function (model, response, options) {
                                displayErrorBackbone(model, response, options);
                            },
                            success: function () {
                                App.instance.invoices.forEach(function (value) {
                                    if (value.attributes.sourceDeliveryNotes != null) {
                                        value.attributes.sourceDeliveryNotes.forEach(function (valueDn) {
                                            valueDn.deleted = false;
                                            if (DnId.includes(valueDn.Id)) {
                                                valueDn.deleted = true;
                                            }
                                        });
                                        value.attributes.sourceDeliveryNotes = $.grep(value.attributes.sourceDeliveryNotes, function(item){
                                            return item.deleted !== true;
                                        });
                                    }
                                });
                            }
                        });
                        includedElementForSlowConnection();
                        Matrex.notify('Lieferscheinen wurden entfernt.', 'success');
                        self.$el.find('#delivery-notes-table').bootstrapTable('uncheckAll');
                    },
                    error: function (model, response, options) {
                        includedElementForSlowConnection();
                        Matrex.notify(response.responseJSON.message, 'error');
                    }
                })
            }, function () {
            });
        });

        var scHeight = $('#delivery-notes-scroll-listener').get(0).scrollHeight;
        var clHeight = $('#delivery-notes-scroll-listener').get(0).clientHeight;
        var scTop = $('#delivery-notes-scroll-listener').scrollTop();
        $('html').keydown(function(e){
            scHeight = $('#delivery-notes-scroll-listener').get(0).scrollHeight;
            clHeight = $('#delivery-notes-scroll-listener').get(0).clientHeight;
            scTop = $('#delivery-notes-scroll-listener').scrollTop();

            if (e.which == 40 || e.which == 98) {
                $makePageUp.removeAttr('disabled');
                $makePageUp.removeClass('arrowVisible');

                $('#delivery-notes-scroll-listener').scrollTop(scTop + clHeight);

                if (scHeight <= clHeight + scTop) {
                    $makePageDown.attr('disabled', 'disabled');
                    $makePageDown.addClass('arrowVisible');
                }
            }
            if (e.which == 38 || e.which == 104) {
                $makePageDown.removeAttr('disabled');
                $makePageDown.removeClass('arrowVisible');

                $('#delivery-notes-scroll-listener').scrollTop(scTop - clHeight);

                if ($('#delivery-notes-scroll-listener').scrollTop() == 0) {
                    $makePageUp.attr('disabled', 'disabled');
                    $makePageUp.addClass('arrowVisible');
                }
            }
        });

        $('#open-invoices').one('click', function () {
            var headerTemplate = _.template($('#company-address-tpl').html());
            $('#invoices-header').empty();
            $('#invoices-header').html(headerTemplate(
                _.extend({
                    companyName: 'Alle Kunden',
                    address: '',
                })
            ));
            formatCommaText($('#invoices-header'));
            var item = new CustomerInvoicesView(self.invoices, self.notes, 0);
            item.render();
            setTimeout(function () {
                item.addRowsOnScroll(100);
            }, 1000);
        });

        var status = $('.bootstrap-table-filter-control-FormattedStatus');
        var statusRechnung = $('.bootstrap-table-filter-control-InvoiceNumberForStatus');
        status.on('click', function (e) {
            if ($(status).val() != '') {
                statusRechnung.val('');
                $(statusRechnung).trigger('change');
            }
        });
        statusRechnung.on('click', function (e) {
            if ($(statusRechnung).val() != '') {
                status.val('');
                $(status).trigger('change');
            }
        });

        $makePageDown.on('click', function (e) {
            scHeight = $('#delivery-notes-scroll-listener').get(0).scrollHeight;
            clHeight = $('#delivery-notes-scroll-listener').get(0).clientHeight;
            scTop = $('#delivery-notes-scroll-listener').scrollTop();

            $makePageUp.removeAttr('disabled');
            $makePageUp.removeClass('arrowVisible');

            $('#delivery-notes-scroll-listener').scrollTop(scTop + clHeight);

            if (scHeight <= clHeight + scTop) {
                $makePageDown.attr('disabled', 'disabled');
                $makePageDown.addClass('arrowVisible');
            }
        });
        $makePageUp.on('click', function (e) {
            scHeight = $('#delivery-notes-scroll-listener').get(0).scrollHeight;
            clHeight = $('#delivery-notes-scroll-listener').get(0).clientHeight;
            scTop = $('#delivery-notes-scroll-listener').scrollTop();

            $makePageDown.removeAttr('disabled');
            $makePageDown.removeClass('arrowVisible');

            $('#delivery-notes-scroll-listener').scrollTop(scTop - clHeight);

            if ($('#delivery-notes-scroll-listener').scrollTop() == 0) {
                $makePageUp.attr('disabled', 'disabled');
                $makePageUp.addClass('arrowVisible');
            }
        });

        //this.tableSwitchFilterHelper(self.$el);
        var cdn = this;
        $('.add-column-menu').on('change', function () {
            cdn.setSorts();
            if (cdn.clustered) {
                cdn.clustering();
                cdn.toCluster();
            }
            cdn.drawSorts();
        });

        if (periodForTableDN() == '#today-group-delivery'){
            $('#today-group-delivery').attr('checked', 'checked');
            cdn.currentPeriod = 'today';
            var periodButton = $('#date-group-dropdown-delivery');
            periodButton[0].innerHTML = '<span>Heute</span> <span class="caret"></span>';
            var filteredData = cdn.filterPeriod(false);
            var $table = $('#delivery-notes-table');
            $table.bootstrapTable('load', filteredData);
            cdn.setSorts();
            if (cdn.clustered) {
                cdn.clustering();
                cdn.toCluster();
            }
        } else if (periodForTableDN() == '#yesterday-group-delivery'){
            $('#yesterday-group-delivery').attr('checked', 'checked');
            cdn.currentPeriod = 'yesterday';
            var periodButton = $('#date-group-dropdown-delivery');
            periodButton[0].innerHTML = '<span>Gestern</span> <span class="caret"></span>';
            var filteredData = cdn.filterPeriod(false);
            var $table = $('#delivery-notes-table');
            $table.bootstrapTable('load', filteredData);
            cdn.setSorts();
            if (cdn.clustered) {
                cdn.clustering();
                cdn.toCluster();
            }
        } else if (periodForTableDN() == '#week-group-delivery'){
            $('#week-group-delivery').attr('checked', 'checked');
            cdn.currentPeriod = 'week';
            var periodButton = $('#date-group-dropdown-delivery');
            periodButton[0].innerHTML = '<span>Diese Woche</span> <span class="caret"></span>';
            var filteredData = cdn.filterPeriod(false);
            var $table = $('#delivery-notes-table');
            $table.bootstrapTable('load', filteredData);
            cdn.setSorts();
            if (cdn.clustered) {
                cdn.clustering();
                cdn.toCluster();
            }
        } else if (periodForTableDN() == '#sevendays-group-delivery'){
            $('#sevendays-group-delivery').attr('checked', 'checked');
            cdn.currentPeriod = 'sevendays';
            var periodButton = $('#date-group-dropdown-delivery');
            periodButton[0].innerHTML = '<span>Letzte Woche</span> <span class="caret"></span>';
            var filteredData = cdn.filterPeriod(false);
            var $table = $('#delivery-notes-table');
            $table.bootstrapTable('load', filteredData);
            cdn.setSorts();
            if (cdn.clustered) {
                cdn.clustering();
                cdn.toCluster();
            }
        } else if (periodForTableDN() == '#month-group-delivery'){
            $('#month-group-delivery').attr('checked', 'checked');
            cdn.currentPeriod = 'month';
            var periodButton = $('#date-group-dropdown-delivery');
            periodButton[0].innerHTML = '<span>Dieser Monat</span> <span class="caret"></span>';
            var filteredData = cdn.filterPeriod(false);
            var $table = $('#delivery-notes-table');
            $table.bootstrapTable('load', filteredData);
            cdn.setSorts();
            if (cdn.clustered) {
                cdn.clustering();
                cdn.toCluster();
            }
        } else if (periodForTableDN() == '#year-group-delivery'){
            $('#year-group-delivery').attr('checked', 'checked');
            cdn.currentPeriod = 'year';
            var periodButton = $('#date-group-dropdown-delivery');
            periodButton[0].innerHTML = '<span>Dieses Jahr</span> <span class="caret"></span>';
            var filteredData = cdn.filterPeriod(false);
            var $table = $('#delivery-notes-table');
            $table.bootstrapTable('load', filteredData);
            cdn.setSorts();
            if (cdn.clustered) {
                cdn.clustering();
                cdn.toCluster();
            }
        } else if (periodForTableDN() == '#all-group-delivery'){
            $('#all-group-delivery').attr('checked', 'checked');
            cdn.currentPeriod = 'all';
            var periodButton = $('#date-group-dropdown-delivery');
            periodButton[0].innerHTML = '<span>Alle Lieferscheine</span> <span class="caret"></span>';
            var filteredData = cdn.filterPeriod(false);
            var $table = $('#delivery-notes-table');
            $table.bootstrapTable('load', filteredData);
            cdn.setSorts();
            if (cdn.clustered) {
                cdn.clustering();
                cdn.toCluster();
            }
        } else {
            $('#all-group-delivery').attr('checked', 'checked');
            cdn.currentPeriod = 'all';
            var periodButton = $('#date-group-dropdown-delivery');
            periodButton[0].innerHTML = '<span>Alle Lieferscheine</span> <span class="caret"></span>';
            var filteredData = cdn.filterPeriod(false);
            var $table = $('#delivery-notes-table');
            $table.bootstrapTable('load', filteredData);
            cdn.setSorts();
            if (cdn.clustered) {
                cdn.clustering();
                cdn.toCluster();
            }
        }

        $('#today-group-delivery').off().on('click', function (e) {
            rollCallDN(e);
            cdn.currentPeriod = 'today';
            var periodButton = $('#date-group-dropdown-delivery');
            periodButton[0].innerHTML = '<span>Heute</span> <span class="caret"></span>';
            var filteredData = cdn.filterPeriod(false);
            var $table = $('#delivery-notes-table');
            $table.bootstrapTable('load', filteredData);
            cdn.setSorts();
            if (cdn.clustered) {
                cdn.clustering();
                cdn.toCluster();
            }
            cdn.changePeriodSetting(e);
            cdn.renderTax();
        });
        $('#yesterday-group-delivery').off().on('click', function (e) {
            rollCallDN(e);
            cdn.currentPeriod = 'yesterday';
            var periodButton = $('#date-group-dropdown-delivery');
            periodButton[0].innerHTML = '<span>Gestern</span> <span class="caret"></span>';
            var filteredData = cdn.filterPeriod(false);
            var $table = $('#delivery-notes-table');
            $table.bootstrapTable('load', filteredData);
            cdn.setSorts();
            if (cdn.clustered) {
                cdn.clustering();
                cdn.toCluster();
            }
            cdn.changePeriodSetting(e);
            cdn.renderTax();
        });
        $('#week-group-delivery').off().on('click', function (e) {
            rollCallDN(e);
            cdn.currentPeriod = 'week';
            var periodButton = $('#date-group-dropdown-delivery');
            periodButton[0].innerHTML = '<span>Diese Woche</span> <span class="caret"></span>';
            var filteredData = cdn.filterPeriod(false);
            var $table = $('#delivery-notes-table');
            $table.bootstrapTable('load', filteredData);
            cdn.setSorts();
            if (cdn.clustered) {
                cdn.clustering();
                cdn.toCluster();
            }
            cdn.changePeriodSetting(e);
            cdn.renderTax();
        });
        $('#sevendays-group-delivery').off().on('click', function (e) {
            rollCallDN(e);
            cdn.currentPeriod = 'sevendays';
            var periodButton = $('#date-group-dropdown-delivery');
            periodButton[0].innerHTML = '<span>Letzte Woche</span> <span class="caret"></span>';
            var filteredData = cdn.filterPeriod(false);
            var $table = $('#delivery-notes-table');
            $table.bootstrapTable('load', filteredData);
            cdn.setSorts();
            if (cdn.clustered) {
                cdn.clustering();
                cdn.toCluster();
            }
            cdn.changePeriodSetting(e);
            cdn.renderTax();
        });
        $('#month-group-delivery').off().on('click', function (e) {
            rollCallDN(e);
            cdn.currentPeriod = 'month';
            var periodButton = $('#date-group-dropdown-delivery');
            periodButton[0].innerHTML = '<span>Dieser Monat</span> <span class="caret"></span>';
            var filteredData = cdn.filterPeriod(false);
            var $table = $('#delivery-notes-table');
            $table.bootstrapTable('load', filteredData);
            cdn.setSorts();
            if (cdn.clustered) {
                cdn.clustering();
                cdn.toCluster();
            }
            cdn.changePeriodSetting(e);
            cdn.renderTax();
        });
        $('#year-group-delivery').off().on('click', function (e) {
            rollCallDN(e);
            cdn.currentPeriod = 'year';
            var periodButton = $('#date-group-dropdown-delivery');
            periodButton[0].innerHTML = '<span>Dieses Jahr</span> <span class="caret"></span>';
            var filteredData = cdn.filterPeriod(false);
            var $table = $('#delivery-notes-table');
            $table.bootstrapTable('load', filteredData);
            cdn.setSorts();
            if (cdn.clustered) {
                cdn.clustering();
                cdn.toCluster();
            }
            cdn.changePeriodSetting(e);
            cdn.renderTax();
        });
        $('#all-group-delivery').off().on('click', function (e) {
            rollCallDN(e);
            cdn.currentPeriod = 'all';
            var periodButton = $('#date-group-dropdown-delivery');
            periodButton[0].innerHTML = '<span>Alle Lieferscheine</span> <span class="caret"></span>';
            var filteredData = cdn.filterPeriod(false);
            var $table = $('#delivery-notes-table');
            $table.bootstrapTable('load', filteredData);
            cdn.setSorts();
            if (cdn.clustered) {
                cdn.clustering();
                cdn.toCluster();
            }
            cdn.changePeriodSetting(e);
            cdn.renderTax();
        });
        $('#deliveryNoteCluster').off().on('change', function (e) {
            cdn.clustered = e.target.checked;
            if (cdn.clustered) {
                cdn.toCluster();
            }
            else
            {
                cdn.deCluster();
            }
            cdn.drawSorts();
        });
        cdn.setSorts();
        cdn.clustering();
        var checkedCluster = $(this.$el).find('#deliveryNoteCluster');
        if (App.instance.thisUser.get('setting').deliveryNoteCluster == 'true'){
            checkedCluster.attr("checked","checked");
            cdn.toCluster();
        } else {
            checkedCluster.removeAttr("checked");
        }
        cdn.drawSorts();
        this.$el.find('.show-delivery-note').each(function () {
            if (this.dataset.id == self.lastClicked) {
                this.classList.add('last-clicked');
            }
        });
        this.$el.find('.show-invoice').each(function () {
            if (this.dataset.id == self.lastClickedInvoice) {
                this.classList.add('last-clicked');
            }
        });

        this.renderTax();
        if (typeof App.instance.thisUser.get('setting') !== 'undefined') {
            showArrowsSummary = App.instance.thisUser.get('setting').showArrowsSummary;
            if (showArrowsSummary == 'false') {
                $('.arrowLineForTables i').css({'display': 'none'});
                $('.arrowLineForTables span').css({'margin-left': '0'});
            }
        }

        return this;
    },
    renderTax: function() {
        if (taxForTableDN() == '#umsatz-netto-radio') {
            $('#umsatz-netto-radio-dn').attr('checked', 'checked');
            $('#tax-button-DN')[0].innerHTML = '<span>Netto</span> <span class="caret"></span>';
            this.currentUmsatz = 'netto';
            var elementsToShow = document.getElementsByClassName('revenueLine');
            var elementsToHide = document.getElementsByClassName('revenueLineBruttoUmsatz');
            _.each(elementsToShow, function (row) {
                row.classList.remove("hided-content");
            });
            _.each(elementsToHide, function (row) {
                row.classList.add("hided-content");
            });
        } else if (taxForTableDN() == '#umsatz-brutto-radio') {
            $('#umsatz-brutto-radio-dn').attr('checked', 'checked');
            $('#tax-button-DN')[0].innerHTML = '<span>Brutto</span> <span class="caret"></span>';
            this.currentUmsatz = 'brutto';
            var elementsToShow = document.getElementsByClassName('revenueLineBruttoUmsatz');
            var elementsToHide = document.getElementsByClassName('revenueLine');
            _.each(elementsToShow, function (row) {
                row.classList.remove("hided-content");
            });
            _.each(elementsToHide, function (row) {
                row.classList.add("hided-content");
            });
        }
    },
    renderTopTable: function (todaySum, todayMarAbs, todayMwst, thisWeekSum, thisWeekMarAbs, thisWeekMwst, thisMonthSum, thisMonthMarAbs, thisMonthMwst,
                              thisYearSum, thisYearMarAbs, thisYearMwst, documentTextColor, todayTextColor, thisWeekTextColor, thisMonthTextColor, thisYearTextColor) {
        var element = $('#dnTodaySum');
        element[0].innerHTML = '\u20AC ' + formatOtherMoneyForPrint(todaySum);
        element.addClass(todayTextColor);

        element = $('#dnThisWeekSum');
        element[0].innerHTML = '\u20AC ' + formatOtherMoneyForPrint(thisWeekSum);
        element.addClass(thisWeekTextColor);

        element = $('#dnThisMonthSum');
        element[0].innerHTML = '\u20AC ' + formatOtherMoneyForPrint(thisMonthSum);
        element.addClass(thisMonthTextColor);

        element = $('#dnThisYearSum');
        element[0].innerHTML = '\u20AC ' + formatOtherMoneyForPrint(thisYearSum);
        element.addClass(thisYearTextColor);

        element = $('#dnTodayMar');
        if (todayMarAbs != 0) {
            element[0].innerHTML = '% ' + formatProfitForPrint((todayMarAbs/todaySum) * 100) +
                ' / \u20AC ' + formatProfitForPrint(todayMarAbs);
        } else {
            element[0].innerHTML = '% -  / \u20AC -';
        }
        element.addClass(todayTextColor);

        element = $('#dnThisWeekMar');
        if (thisWeekMarAbs != 0) {
            element[0].innerHTML = '% ' + formatProfitForPrint((thisWeekMarAbs/thisWeekSum)*100) +
                ' / \u20AC ' + formatProfitForPrint(thisWeekMarAbs);
        } else {
            element[0].innerHTML = '% -  / \u20AC -';
        }
        element.addClass(thisWeekTextColor);

        element = $('#dnThisMonthMar');
        if (thisMonthMarAbs != 0) {
            element[0].innerHTML = '% ' + formatProfitForPrint((thisMonthMarAbs/thisMonthSum)*100) +
                ' / \u20AC ' + formatProfitForPrint(thisMonthMarAbs);
        } else {
            element[0].innerHTML = '% -  / \u20AC -';
        }
        element.addClass(thisMonthTextColor);

        element = $('#dnThisYearMar');
        if (thisYearMarAbs != 0) {
            element[0].innerHTML = '% ' + formatProfitForPrint((thisYearMarAbs/thisYearSum)*100) +
                ' / \u20AC ' + formatProfitForPrint(thisYearMarAbs);
        } else {
            element[0].innerHTML = '% -  / \u20AC -';
        }
        element.addClass(thisYearTextColor);

        element = $('#dnTodayArt');
        element[0].innerHTML = '\u20AC ' + formatProfitForPrint(todayMwst);
        element.addClass(todayTextColor);

        element = $('#dnThisWeekArt');
        element[0].innerHTML = '\u20AC ' + formatProfitForPrint(thisWeekMwst);
        element.addClass(thisWeekTextColor);

        element = $('#dnThisMonthArt');
        element[0].innerHTML = '\u20AC ' + formatProfitForPrint(thisMonthMwst);
        element.addClass(thisMonthTextColor);

        element = $('#dnThisYearArt');
        element[0].innerHTML = '\u20AC ' + formatProfitForPrint(thisYearMwst);
        element.addClass(thisYearTextColor);

        element = $('#dnTodayGr');
        element[0].innerHTML = '\u20AC ' + formatProfitForPrint(todaySum + todayMwst);
        element.addClass(todayTextColor);

        element = $('#dnThisWeekGr');
        element[0].innerHTML = '\u20AC ' + formatProfitForPrint(thisWeekSum + thisWeekMwst);
        element.addClass(thisWeekTextColor);

        element = $('#dnThisMonthGr');
        element[0].innerHTML = '\u20AC ' + formatProfitForPrint(thisMonthSum + thisMonthMwst);
        element.addClass(thisMonthTextColor);

        element = $('#dnThisYearGr');
        element[0].innerHTML = '\u20AC ' + formatProfitForPrint(thisYearSum + thisYearMwst);
        element.addClass(thisYearTextColor);
    },
    recalculateTopTable: function (data) {
        var todaySum = 0.0; //heute
        var todayMarAbs = 0.0;
        var todayMwst = 0.0;
        var thisWeekSum = 0.0; //diese Woche
        var thisWeekMarAbs = 0.0;
        var thisWeekMwst = 0.0;
        var thisMonthSum = 0.0; //diesen Monat
        var thisMonthMarAbs = 0.0;
        var thisMonthMwst = 0.0;
        var thisYearSum = 0.0; //dieses Jahr
        var thisYearMarAbs = 0.0;
        var thisYearMwst = 0.0;
        var documentTextColor, todayTextColor, thisWeekTextColor, thisMonthTextColor, thisYearTextColor;
        documentTextColor = todayTextColor = thisWeekTextColor = thisMonthTextColor = thisYearTextColor = '';

        data.forEach(function (value) {
            var productTotalSum = value.SumTotalPrice;
            var today = moment().format();
            today = moment().startOf('day');
            if (moment(value.OrderCreateTimestamp) > today) {
                todaySum = todaySum + value.SumTotalPrice;
                todayMarAbs += value.SumTotalProfitAbsolute;
                todayTextColor = changeTextColorListDocumentsForDoc(value.containsDailyPriceCount, todayTextColor);
                value.Products.forEach(function (item) {
                    todayMwst += item.TotalTax;
                });
            }
            var thisWeek = moment().format();
            thisWeek = moment().startOf('day');
            var day = moment().day();
            var diff = moment().date() - day + (day == 0 ? -6 : 1);
            thisWeek = moment().day('diff');
            if (moment(value.OrderCreateTimestamp) > thisWeek) {
                thisWeekSum += value.SumTotalPrice;
                thisWeekMarAbs += value.SumTotalProfitAbsolute;
                thisWeekTextColor = changeTextColorListDocumentsForDoc(value.containsDailyPriceCount, thisWeekTextColor);
                value.Products.forEach(function (item) {
                    thisWeekMwst += item.TotalTax;
                });
            }
            var thisMonth = moment().startOf('month');
            if (moment(value.OrderCreateTimestamp) > thisMonth) {
                thisMonthSum += value.SumTotalPrice;
                thisMonthMarAbs += value.SumTotalProfitAbsolute;
                thisMonthTextColor = changeTextColorListDocumentsForDoc(value.containsDailyPriceCount, thisMonthTextColor);
                value.Products.forEach(function (item) {
                    thisMonthMwst += item.TotalTax;
                });
            }
            var thisYear = moment().startOf('year');
            if (moment(value.OrderCreateTimestamp) > thisYear) {
                thisYearSum += value.SumTotalPrice;
                thisYearMarAbs += value.SumTotalProfitAbsolute;
                thisYearTextColor = changeTextColorListDocumentsForDoc(value.containsDailyPriceCount, thisYearTextColor);
                value.Products.forEach(function (item) {
                    thisYearMwst += item.TotalTax;
                });
            }
        });
        var result = {
            todaySum: todaySum,
            todayMarAbs: todayMarAbs,
            todayMwst: todayMwst,
            thisWeekSum: thisWeekSum,
            thisWeekMarAbs: thisWeekMarAbs,
            thisWeekMwst: thisWeekMwst,
            thisMonthSum: thisMonthSum,
            thisMonthMarAbs: thisMonthMarAbs,
            thisMonthMwst: thisMonthMwst,
            thisYearSum: thisYearSum,
            thisYearMarAbs: thisYearMarAbs,
            thisYearMwst: thisYearMwst,
            dataTop: data,
            documentTextColor: documentTextColor,
            todayTextColor: todayTextColor,
            thisWeekTextColor: thisWeekTextColor,
            thisMonthTextColor: thisMonthTextColor,
            thisYearTextColor: thisYearTextColor
        }
        return result;
    },
    addRowsOnScroll: function () {
        var self = this;
        var scHeight = $('#delivery-notes-scroll-listener').get(0).scrollHeight;
        var clHeight = $('#delivery-notes-scroll-listener').get(0).clientHeight;
        var parent = this;
        var thisTable = this.$el.find('#delivery-notes-table');
        var pageUp = this.$el.closest('#delivery-note-list-modal').find('.page-up-dn');
        var pageDown = this.$el.closest('#delivery-note-list-modal').find('.page-down-dn');
        var status = $('.bootstrap-table-filter-control-FormattedStatus');
        var secondStatus = $('.bootstrap-table-filter-control-InvoiceNumberForStatus');
        var data = this.notes.toJSON();
        var countDocuments;
        var end = data.length - 60;
        var start = data.length - 30;
        var newData = data.slice(end, start);
        var showArrowsSummary;
        if (typeof App.instance.thisUser.get('setting') !== 'undefined') {
            showArrowsSummary = App.instance.thisUser.get('setting').showArrowsSummary;
            if (showArrowsSummary == 'false') {
                $('.arrowLineForTables span').css({'margin-left' : '0'});
            }
        } else {
            showArrowsSummary = 'true';
        }
        newData.forEach(function (value) {
            value.showArrowsSummary = showArrowsSummary;
        });
        $('#delivery-notes-scroll-listener').scroll(function () {
            if ($('#delivery-notes-table')[0].rows[1].classList[0] == 'no-records-found') {
                countDocuments = 0;
            } else {
                countDocuments = $('#delivery-notes-table')[0].rows.length - 1;
            }
            pageUp.removeClass('arrowVisible');
            pageDown.removeClass('arrowVisible');
            pageUp.removeAttr('disabled');
            pageDown.removeAttr('disabled');
            if ((end <= 0) && (scHeight <= (clHeight + $('#invoice-scroll-listener').scrollTop() + 1))) {
                pageDown.attr('disabled', 'disabled');
                pageDown.addClass('arrowVisible');
            }
            if ($('#delivery-notes-scroll-listener').scrollTop() == 0) {
                pageUp.attr('disabled', 'disabled');
                pageUp.addClass('arrowVisible');
            }
            if (self.currentUmsatz === 'brutto') {
                var elementsToShow = document.getElementsByClassName('revenueLineBruttoUmsatz');
                var elementsToHide = document.getElementsByClassName('revenueLine');
                _.each(elementsToShow, function (row) {
                    row.classList.remove("hided-content");
                });
                _.each(elementsToHide, function (row) {
                    row.classList.add("hided-content");
                });
            }
            if (scHeight <= (clHeight + $('#delivery-notes-scroll-listener').scrollTop()  + 40)) {
                var scTop = $('#delivery-notes-scroll-listener').scrollTop();
                if (status.get(0).value == '' && secondStatus.get(0).value == '') {
                    if (countDocuments < data.length) {
                        if (end >= 0) {
                            thisTable.bootstrapTable('append', newData);
                            start -= 30;
                            end -= 30;
                            scHeight = $('#delivery-notes-scroll-listener').get(0).scrollHeight;
                            clHeight = $('#delivery-notes-scroll-listener').get(0).clientHeight;
                            newData = data.slice(end, start);
                            if (typeof App.instance.thisUser.get('setting') !== 'undefined') {
                                showArrowsSummary = App.instance.thisUser.get('setting').showArrowsSummary;
                                if (showArrowsSummary == 'false') {
                                    $('.arrowLineForTables span').css({'margin-left' : '0'});
                                }
                            } else {
                                showArrowsSummary = 'true';
                            }
                            newData.forEach(function (value) {
                                value.showArrowsSummary = showArrowsSummary;
                                var productTotalSum = value.SumTotalPrice;
                                var documentTextColor;
                                var revenueString = formatProfitForPrint(productTotalSum);
                                var valueTax = 0.0;
                                value.Products.forEach(function (item) {
                                    valueTax += item.TotalTax;
                                });
                                var productTotalSumWithTax = productTotalSum + valueTax;
                                var revenueBruttoString = formatProfitForPrint(productTotalSumWithTax);
                                if (revenueString === '-') {
                                    value.revenue = '-';
                                } else {
                                    var revenueInvoice = 0;
                                    if (App.instance.invoices) {
                                        var invoice_id = value.InvoiceId;
                                        if (invoice_id !== null) {
                                            var Invoices_collection = App.instance.invoices;
                                            var invoice = Invoices_collection.get(invoice_id);
                                            if (invoice != undefined) {
                                                revenueInvoice = typeof invoice.get('SumTotalPrice') !== 'undefined' ? invoice.get('SumTotalPrice') : null;
                                                revenueInvoice = ' \u20AC ' + formatProfitForPrint(revenueInvoice);
                                            }
                                        } else {
                                            revenueInvoice = '-';
                                        }
                                    }
                                    documentTextColor = changeTextColorListDocumentsForDoc(value.containsDailyPriceCount);
                                    var nettoHidedClass = self.currentUmsatz === 'netto' ? '' : ' hided-content';
                                    var bruttoHidedClass = self.currentUmsatz === 'brutto' ? '' : ' hided-content';
                                    value.revenue = '<div class="revenueLine' + nettoHidedClass + '"><span class="' + documentTextColor + '">\u20AC ' + revenueString + '</span> / ' +
                                        '<span class="' + documentTextColor + '">' + ' %' + formatProfitForPrint(value.SumTotalProfitPercent) + '</span> / ' +
                                        '<span class="' + documentTextColor + '">' + formatProfitForPrint(value.SumTotalProfitAbsolute) + '</span> / ' +
                                        '<span class="' + documentTextColor + '">' + revenueInvoice + '</span></div>' +
                                        '<div class="revenueLineBruttoUmsatz' + bruttoHidedClass + '"><span class="' + documentTextColor + '">\u20AC ' + revenueBruttoString + '</span> / ' +
                                        '<span class="' + documentTextColor + '">' + ' %' + formatProfitForPrint(value.SumTotalProfitPercent) + '</span> / ' +
                                        '<span class="' + documentTextColor + '">' + formatProfitForPrint(value.SumTotalProfitAbsolute) + '</span> / ' +
                                        '<span class="' + documentTextColor + '">' + revenueInvoice + '</span></div>';
                                }
                            });
                            parent.processedData = data;
                            parent.currentData = parent.currentData.concat(newData);
                            parent.paginationNewData = newData;
                            var clusterCheckbox = document.getElementById('deliveryNoteCluster');
                            self.clustered = clusterCheckbox.checked;
                            if (self.clustered) {
                                self.clustering();
                                self.toCluster();
                                self.drawSorts();
                            }
                            return parent.paginationNewData;
                        } else {
                            end = 0;
                        }
                    }
                }
            }
        });
    },
    tableSwitchFilterHelper: function ($el) {
        $el.find('.fht-cell input').attr('placeholder', 'Alle');
        $el.find('.fht-cell select option:first-child').text('Alle');
    },
    filterPeriod: function (isClustering) {
        var parent = this;
        if (isClustering)
        {
            var existingData = parent.currentData;
        }
        else
        {
            var existingData = parent.calculedNotes;
        }
        var filteredData = [];
        if (parent.currentPeriod == 'today') {
            var today = new Date();
            today.setHours(0, 0, 0, 0);
            existingData.forEach(function (value) {
                if (new Date(value.OrderCreateTimestamp) > today) {
                    filteredData.push(value);
                }
            });
        }
        if (parent.currentPeriod == 'yesterday') {
            var yesterdate = new Date();
            yesterdate.setDate(yesterdate.getDate() - 1);
            yesterdate.setHours(0, 0, 0);
            existingData.forEach(function (value) {
                if (new Date(value.OrderCreateTimestamp) > yesterdate) {
                    filteredData.push(value);
                }
            });
        }
        if (parent.currentPeriod == 'week') {
            var thisWeek = new Date();
            thisWeek.setHours(0, 0, 0, 0);
            var day = thisWeek.getDay();
            var diff = thisWeek.getDate() - day + (day == 0 ? -6 : 1);
            thisWeek = new Date(thisWeek.setDate(diff));
            existingData.forEach(function (value) {
                if (new Date(value.OrderCreateTimestamp) > thisWeek) {
                    filteredData.push(value);
                }
            });
        }
        if (parent.currentPeriod == 'sevendays') {
            var sevendays = new Date();
            sevendays.setDate(sevendays.getDate() - 7);
            sevendays.setHours(0, 0, 0, 0);
            existingData.forEach(function (value) {
                if (new Date(value.OrderCreateTimestamp) > sevendays) {
                    filteredData.push(value);
                }
            });
        }
        if (parent.currentPeriod == 'month') {
            var thisMonth = new Date();
            thisMonth = new Date(thisMonth.getFullYear(), thisMonth.getMonth(), 1);
            thisMonth.setHours(0,0,0,0);
            existingData.forEach(function (value) {
                if (new Date(value.OrderCreateTimestamp) > thisMonth) {
                    filteredData.push(value);
                }
            });
        }
        if (parent.currentPeriod == 'year') {
            var thisYear = new Date(new Date().getFullYear(), 0, 1);
            thisYear.setHours(0,0,0,0);
            existingData.forEach(function (value) {
                if (new Date(value.OrderCreateTimestamp) > thisYear) {
                    filteredData.push(value);
                }
            });
        }
        if (parent.currentPeriod == 'all') {
            filteredData = existingData;
        }
        return filteredData;
    },
    setSorts: function () {
        var parent = this;
        this.$el.find('.filter-control').off().on('click', function (event) {event.stopPropagation();});
        $('th').off().on('click', function (e) {
            if (e.target.className != "form-control bootstrap-table-filter-control-FormattedStatus" && e.target.className != "form-control bootstrap-table-filter-control-InvoiceNumberForStatus") {
                var data = parent.filterPeriod(false);
                var columnName = '';
                var columnOrdering = '';
                if (e.currentTarget.attributes['data-field'].nodeValue == 'DeliveryNoteNumber') {
                    columnName = e.currentTarget.attributes['data-field'].nodeValue;
                    if (parent.DeliveryNoteNumberColSort == 'no' || parent.DeliveryNoteNumberColSort == 'desc') {
                        parent.DeliveryNoteNumberColSort = 'asc';
                        columnOrdering = 'asc';
                        data.sort(function (a, b) {
                            return (a.DeliveryNoteNumber > b.DeliveryNoteNumber) ? 1 : ((b.DeliveryNoteNumber > a.DeliveryNoteNumber) ? -1 : 0);
                        });
                    } else {
                        parent.DeliveryNoteNumberColSort = 'desc';
                        columnOrdering = 'desc';
                        data.sort(function (a, b) {
                            return (a.DeliveryNoteNumber < b.DeliveryNoteNumber) ? 1 : ((b.DeliveryNoteNumber < a.DeliveryNoteNumber) ? -1 : 0);
                        });
                    }
                    parent.OrderCreateTimestampColSort = 'no';
                    parent.ModifyTimestampColSort = 'no';
                    parent.CompletedTimestampColSort = 'no';
                    parent.FormattedStatusColSort = 'no';
                    parent.InvoiceNumberColSort = 'no';
                    parent.InvoiceNumberForStatusColSort = 'no';
                    parent.revenueColSort = 'no';
                }
                if (e.currentTarget.attributes['data-field'].nodeValue == 'OrderCreateTimestamp') {
                    columnName = e.currentTarget.attributes['data-field'].nodeValue;
                    if (parent.OrderCreateTimestampColSort == 'no' || parent.OrderCreateTimestampColSort == 'desc') {
                        parent.OrderCreateTimestampColSort = 'asc';
                        columnOrdering = 'asc';
                        data.sort(function (a, b) {
                            return (a.OrderCreateTimestamp < b.OrderCreateTimestamp) ? 1 : ((b.OrderCreateTimestamp < a.OrderCreateTimestamp) ? -1 : 0);
                        });
                    } else {
                        parent.OrderCreateTimestampColSort = 'desc';
                        columnOrdering = 'desc';
                        data.sort(function (a, b) {
                            return (a.OrderCreateTimestamp > b.OrderCreateTimestamp) ? 1 : ((b.OrderCreateTimestamp > a.OrderCreateTimestamp) ? -1 : 0);
                        });
                    }
                    parent.DeliveryNoteNumberColSort = 'no';
                    parent.ModifyTimestampColSort = 'no';
                    parent.CompletedTimestampColSort = 'no';
                    parent.FormattedStatusColSort = 'no';
                    parent.InvoiceNumberColSort = 'no';
                    parent.InvoiceNumberForStatusColSort = 'no';
                    parent.revenueColSort = 'no';
                }
                if (e.currentTarget.attributes['data-field'].nodeValue == 'ModifyTimestamp') {
                    columnName = e.currentTarget.attributes['data-field'].nodeValue;
                    if (parent.ModifyTimestampColSort == 'no' || parent.ModifyTimestampColSort == 'desc') {
                        parent.ModifyTimestampColSort = 'asc';
                        columnOrdering = 'asc';
                        data.sort(function (a, b) {
                            return (a.ModifyTimestamp < b.ModifyTimestamp) ? 1 : ((b.ModifyTimestamp < a.ModifyTimestamp) ? -1 : 0);
                        });
                    } else {
                        parent.ModifyTimestampColSort = 'desc';
                        columnOrdering = 'desc';
                        data.sort(function (a, b) {
                            return (a.ModifyTimestamp > b.ModifyTimestamp) ? 1 : ((b.ModifyTimestamp > a.ModifyTimestamp) ? -1 : 0);
                        });
                    }
                    parent.DeliveryNoteNumberColSort = 'no';
                    parent.OrderCreateTimestampColSort = 'no';
                    parent.CompletedTimestampColSort = 'no';
                    parent.FormattedStatusColSort = 'no';
                    parent.InvoiceNumberColSort = 'no';
                    parent.InvoiceNumberForStatusColSort = 'no';
                    parent.revenueColSort = 'no';
                }
                if (e.currentTarget.attributes['data-field'].nodeValue == 'CompletedTimestamp') {
                    columnName = e.currentTarget.attributes['data-field'].nodeValue;
                    if (parent.CompletedTimestampColSort == 'no' || parent.CompletedTimestampColSort == 'desc') {
                        parent.CompletedTimestampColSort = 'asc';
                        columnOrdering = 'asc';
                        data.sort(function (a, b) {
                            return (a.CompletedTimestamp < b.CompletedTimestamp) ? 1 : ((b.CompletedTimestamp < a.CompletedTimestamp) ? -1 : 0);
                        });
                    } else {
                        parent.CompletedTimestampColSort = 'desc';
                        columnOrdering = 'desc';
                        data.sort(function (a, b) {
                            return (a.CompletedTimestamp > b.CompletedTimestamp) ? 1 : ((b.CompletedTimestamp > a.CompletedTimestamp) ? -1 : 0);
                        });
                    }
                    parent.DeliveryNoteNumberColSort = 'no';
                    parent.OrderCreateTimestampColSort = 'no';
                    parent.ModifyTimestampColSort = 'no';
                    parent.FormattedStatusColSort = 'no';
                    parent.InvoiceNumberColSort = 'no';
                    parent.InvoiceNumberForStatusColSort = 'no';
                    parent.revenueColSort = 'no';
                }
                if (e.currentTarget.attributes['data-field'].nodeValue == 'InvoiceNumber') {
                    columnName = e.currentTarget.attributes['data-field'].nodeValue;
                    if (parent.InvoiceNumberColSort == 'no' || parent.InvoiceNumberColSort == 'desc') {
                        parent.InvoiceNumberColSort = 'asc';
                        columnOrdering = 'asc';
                        data.sort(function (a, b) {
                            if (a.InvoiceNumber == null) {
                                return 1;
                            }
                            if (b.InvoiceNumber == null) {
                                return -1;
                            }
                            return (a.InvoiceNumber > b.InvoiceNumber) ? 1 : ((b.InvoiceNumber > a.InvoiceNumber) ? -1 : 0);
                        });
                    } else {
                        parent.InvoiceNumberColSort = 'desc';
                        columnOrdering = 'desc';
                        data.sort(function (a, b) {
                            if (a.InvoiceNumber == null) {
                                return -1;
                            }
                            if (b.InvoiceNumber == null) {
                                return 1;
                            }
                            return (a.InvoiceNumber < b.InvoiceNumber) ? 1 : ((b.InvoiceNumber < a.InvoiceNumber) ? -1 : 0);
                        });
                    }
                    parent.DeliveryNoteNumberColSort = 'no';
                    parent.OrderCreateTimestampColSort = 'no';
                    parent.ModifyTimestampColSort = 'no';
                    parent.CompletedTimestampColSort = 'no';
                    parent.FormattedStatusColSort = 'no';
                    parent.InvoiceNumberForStatusColSort = 'no';
                    parent.revenueColSort = 'no';
                }
                if (e.currentTarget.attributes['data-field'].nodeValue == 'revenue') {
                    columnName = e.currentTarget.attributes['data-field'].nodeValue;
                    if (parent.revenueColSort == 'no' || parent.revenueColSort == 'desc') {
                        parent.revenueColSort = 'asc';
                        columnOrdering = 'asc';
                        data.sort(function (a, b) {
                            return (a.revenue > b.revenue) ? 1 : ((b.revenue > a.revenue) ? -1 : 0);
                        });
                    } else {
                        parent.revenueColSort = 'desc';
                        columnOrdering = 'desc';
                        data.sort(function (a, b) {
                            return (a.revenue < b.revenue) ? 1 : ((b.revenue < a.revenue) ? -1 : 0);
                        });
                    }
                    parent.DeliveryNoteNumberColSort = 'no';
                    parent.OrderCreateTimestampColSort = 'no';
                    parent.ModifyTimestampColSort = 'no';
                    parent.CompletedTimestampColSort = 'no';
                    parent.FormattedStatusColSort = 'no';
                    parent.InvoiceNumberForStatusColSort = 'no';
                    parent.InvoiceNumberColSort = 'no';
                }
                if (columnName !== '' && columnOrdering !== '') {
                    var codeSetting = 'sortsForDN_' + columnName;
                    var target = 'sortsForDN_';
                    var value = columnOrdering;

                    disabledElementForSlowConnection();

                    App.api.user.changeSetting.put(target, codeSetting, value).then(function (resp) {
                        var setting_value = resp.toString();
                        var settings = _.clone(App.instance.thisUser.get('setting'));
                        settings.sortsForDN_CompletedTimestamp = 'no';
                        settings.sortsForDN_DeliveryNoteNumber = 'no';
                        settings.sortsForDN_FormattedStatus = 'no';
                        settings.sortsForDN_InvoiceNumber = 'no';
                        settings.sortsForDN_ModifyTimestamp = 'no';
                        settings.sortsForDN_OrderCreateTimestamp = 'no';
                        settings.sortsForDN_revenue = 'no';
                        if (settings) {
                            if (codeSetting in settings) {
                                settings[codeSetting] = setting_value;
                            }
                        } else {
                            settings = [];
                            settings[codeSetting] = setting_value;
                        }
                        App.instance.thisUser.set('setting', settings);

                        includedElementForSlowConnection();
                        parent.renderTax();
                    });

                    if (parent.clustered) {
                        var groups = [];
                        parent.groupsWithItems = [];
                        data.forEach(function (item) {
                            if (item.InvoiceNumber != undefined && groups.indexOf(item.InvoiceNumber) == -1) {
                                groups.push(item.InvoiceNumber);
                            }
                        });
                        groups.forEach(function (group) {
                            var itemsGroup = {};
                            itemsGroup.group = group;
                            itemsGroup.items = [];
                            itemsGroup.deliveryNoteNumbers = [];
                            var elementIndex = 0;
                            data.forEach(function (item) {
                                if (item.InvoiceNumber != undefined && group == item.InvoiceNumber) {
                                    itemsGroup.items.push(item.Id);
                                    itemsGroup.deliveryNoteNumbers.push(item.DeliveryNoteNumber);
                                }
                                elementIndex++;
                            });
                            parent.groupsWithItems.push(itemsGroup);
                        });
                        parent.groupsWithItems.forEach(function (group) {
                            if (group.items.length > 1) {
                                var index = 0;
                                var startIndex = data.map(function (x) {
                                    return x.Id;
                                }).indexOf(group.items[index]);
                                index++;
                                group.items.forEach(function (item) {
                                    var buffIndex = data.map(function (x) {
                                        return x.Id;
                                    }).indexOf(group.items[index]);
                                    if (buffIndex != -1) {
                                        var objectForReplace = data.splice(buffIndex, 1);
                                        data.splice(startIndex + 1, 0, objectForReplace[0]);
                                        startIndex++;
                                        index++;
                                    }
                                });
                            }
                        });
                        var $table = $('#delivery-notes-table');
                        $table.bootstrapTable('load', data);
                        parent.groupsWithItems.forEach(function (gr) {
                            var index = 0;
                            var startIndex = data.map(function (x) {
                                return x.Id;
                            }).indexOf(gr.items[index]);
                            $table.bootstrapTable('mergeCells', {
                                index: startIndex,
                                field: 'InvoiceNumber',
                                rowspan: gr.items.length
                            });
                        });
                        var tbl = parent.$el.find('#delivery-notes-table');
                        var body = tbl.find('tbody');
                        var trs = body.find('tr');
                        trs.each(function () {
                            var row = this;
                            var num = row.cells[1].innerText;
                            var num2 = row.cells[2].innerText;
                            parent.groupsWithItems.forEach(function (gr) {
                                gr.deliveryNoteNumbers.forEach(function (el) {
                                    if (num.includes(el) || num2.includes(el)) {
                                        row.group = gr.group;
                                    }
                                });
                            });
                        });

                        trs.each(function () {
                            var row = this;
                            if (row.group != undefined) {
                                $(row).mouseenter(function () {
                                    trs.each(function () {
                                        var rowMouse = this;
                                        if (rowMouse.group == row.group) {
                                            $(rowMouse).addClass('hover-row');
                                        }
                                    });
                                });
                                $(row).mouseleave(function () {
                                    trs.each(function () {
                                        var rowMouse = this;
                                        if (rowMouse.group == row.group) {
                                            $(rowMouse).removeClass('hover-row');
                                        }
                                    });
                                });
                            }
                        });
                    } else {
                        var $table = $('#delivery-notes-table');
                        $table.bootstrapTable('load', data);
                    }
                    parent.drawSorts();
                    parent.$el.find('.show-delivery-note').each(function () {
                        if (this.dataset.id == parent.lastClicked) {
                            this.classList.add('last-clicked');
                        }
                    });
                    parent.$el.find('.show-invoice').each(function () {
                        if (this.dataset.id == parent.lastClickedInvoice) {
                            this.classList.add('last-clicked');
                        }
                    });
                    var showArrowsSummary;
                    if (typeof App.instance.thisUser.get('setting') !== 'undefined') {
                        showArrowsSummary = App.instance.thisUser.get('setting').showArrowsSummary;
                        if (showArrowsSummary == 'false') {
                            $('.arrowLineForTables span').css({'margin-left': '0'});
                        }
                    }
                }
            }
        });
    },
    clustering: function () {
        var parent = this;
        var data = parent.filterPeriod(true);
        var groups = [];
        parent.groupsWithItems = [];
        data.forEach(function (item) {
            if (item.InvoiceNumber != undefined && groups.indexOf(item.InvoiceNumber) == -1) {
                groups.push(item.InvoiceNumber);
            }
        });
        groups.forEach(function (group) {
            var itemsGroup = {};
            itemsGroup.group = group;
            itemsGroup.items = [];
            itemsGroup.deliveryNoteNumbers = [];
            var elementIndex = 0;
            data.forEach(function (item) {
                if (item.InvoiceNumber!= undefined && group == item.InvoiceNumber) {
                    itemsGroup.items.push(item.Id);
                    itemsGroup.deliveryNoteNumbers.push(item.DeliveryNoteNumber);
                }
                elementIndex++;
            });
            parent.groupsWithItems.push(itemsGroup);
        });
    },
    toCluster: function () {
        var parent = this;
        var data = parent.filterPeriod(true);
        if (parent.DeliveryNoteNumberColSort != 'no') {
            if (parent.DeliveryNoteNumberColSort == 'asc') {
                data.sort(function (a, b) {
                    return (a.DeliveryNoteNumber > b.DeliveryNoteNumber) ? 1 : ((b.DeliveryNoteNumber > a.DeliveryNoteNumber) ? -1 : 0);
                });
            } else {
                data.sort(function (a, b) {
                    return (a.DeliveryNoteNumber < b.DeliveryNoteNumber) ? 1 : ((b.DeliveryNoteNumber < a.DeliveryNoteNumber) ? -1 : 0);
                });
            }
        }
        if (parent.OrderCreateTimestampColSort != 'no') {
            if (parent.OrderCreateTimestampColSort == 'asc') {
                data.sort(function (a, b) {
                    return (a.OrderCreateTimestamp < b.OrderCreateTimestamp) ? 1 : ((b.OrderCreateTimestamp < a.OrderCreateTimestamp) ? -1 : 0);
                });
            } else {
                data.sort(function (a, b) {
                    return (a.OrderCreateTimestamp > b.OrderCreateTimestamp) ? 1 : ((b.OrderCreateTimestamp > a.OrderCreateTimestamp) ? -1 : 0);
                });
            }
        }
        if (parent.ModifyTimestampColSort != 'no') {
            if (parent.ModifyTimestampColSort == 'asc') {
                data.sort(function (a, b) {
                    return (a.ModifyTimestamp < b.ModifyTimestamp) ? 1 : ((b.ModifyTimestamp < a.ModifyTimestamp) ? -1 : 0);
                });
            } else {
                data.sort(function (a, b) {
                    return (a.ModifyTimestamp > b.ModifyTimestamp) ? 1 : ((b.ModifyTimestamp > a.ModifyTimestamp) ? -1 : 0);
                });
            }
        }
        if (parent.CompletedTimestampColSort != 'no') {
            if (parent.CompletedTimestampColSort == 'asc') {
                data.sort(function (a, b) {
                    return (a.CompletedTimestamp < b.CompletedTimestamp) ? 1 : ((b.CompletedTimestamp < a.CompletedTimestamp) ? -1 : 0);
                });
            } else {
                data.sort(function (a, b) {
                    return (a.CompletedTimestamp > b.CompletedTimestamp) ? 1 : ((b.CompletedTimestamp > a.CompletedTimestamp) ? -1 : 0);
                });
            }
        }
        if (parent.InvoiceNumberColSort != 'no') {
            if (parent.InvoiceNumberColSort == 'asc') {
                data.sort(function (a, b) {
                    return (a.InvoiceNumber > b.InvoiceNumber) ? 1 : ((b.InvoiceNumber > a.InvoiceNumber) ? -1 : 0);
                });
            } else {
                data.sort(function (a, b) {




                    return (a.InvoiceNumber < b.InvoiceNumber) ? 1 : ((b.InvoiceNumber < a.InvoiceNumber) ? -1 : 0);
                });
            }
        }
        if (parent.revenueColSort != 'no') {
            if (parent.revenueColSort == 'asc') {
                data.sort(function (a, b) {
                    return (a.revenue > b.revenue) ? 1 : ((b.revenue > a.revenue) ? -1 : 0);
                });
            } else {
                data.sort(function (a, b) {
                    return (a.revenue < b.revenue) ? 1 : ((b.revenue < a.revenue) ? -1 : 0);
                });
            }
        }
        var groups = [];
        parent.groupsWithItems = [];
        data.forEach(function (item) {
            if (item.InvoiceNumber != undefined && groups.indexOf(item.InvoiceNumber) == -1) {
                groups.push(item.InvoiceNumber);
            }
        });
        groups.forEach(function (group) {
            var itemsGroup = {};
            itemsGroup.group = group;
            itemsGroup.items = [];
            itemsGroup.deliveryNoteNumbers = [];
            var elementIndex = 0;
            data.forEach(function (item) {
                if (item.InvoiceNumber!= undefined && group == item.InvoiceNumber) {
                    itemsGroup.items.push(item.Id);
                    itemsGroup.deliveryNoteNumbers.push(item.DeliveryNoteNumber);
                }
                elementIndex++;
            });
            parent.groupsWithItems.push(itemsGroup);
        });
        parent.groupsWithItems.forEach(function (group) {
            if (group.items.length > 1) {
                var index = 0;
                var startIndex = data.map(function(x) {return x.Id; }).indexOf(group.items[index]);
                index++;
                group.items.forEach(function (item) {
                    var buffIndex = data.map(function(x) {return x.Id; }).indexOf(group.items[index]);
                    if (buffIndex != -1) {
                        var objectForReplace = data.splice(buffIndex, 1);
                        data.splice(startIndex + 1, 0, objectForReplace[0]);
                        startIndex++;
                        index++;
                    }
                });
            }
        });
        var $table = $('#delivery-notes-table');
        $table.bootstrapTable('load', data);
        parent.groupsWithItems.forEach(function (gr) {
            var index = 0;
            var startIndex = data.map(function(x) {return x.Id; }).indexOf(gr.items[index]);
            $table.bootstrapTable('mergeCells', {
                index: startIndex,
                field: 'InvoiceNumber',
                rowspan: gr.items.length
            });
        });
        var tbl = parent.$el.find('#delivery-notes-table');
        var body = tbl.find('tbody');
        var trs = body.find('tr');
        trs.each(function () {
            var row = this;
            if (row.cells[1] != undefined) {
                var num = row.cells[1].innerText;
                var num2 = row.cells[2].innerText;
                parent.groupsWithItems.forEach(function (gr) {
                    gr.deliveryNoteNumbers.forEach(function (el) {
                        if (num.includes(el) || num2.includes(el)) {
                            row.group = gr.group;
                        }
                    });
                });
            }
        });

        trs.each(function () {
            var row = this;
            if (row.group != undefined) {
                $(row).mouseenter( function() {
                    trs.each(function () {
                        var rowMouse = this;
                        if (rowMouse.group == row.group) {
                            $(rowMouse).addClass('hover-row');
                        }
                    });
                });
                $(row).mouseleave( function() {
                    trs.each(function () {
                        var rowMouse = this;
                        if (rowMouse.group == row.group) {
                            $(rowMouse).removeClass('hover-row');
                        }
                    });
                });
            }
        });

        var showArrowsSummary;
        if (typeof App.instance.thisUser.get('setting') !== 'undefined') {
            showArrowsSummary = App.instance.thisUser.get('setting').showArrowsSummary;
            if (showArrowsSummary == 'false') {
                $('.arrowLineForTables span').css({'margin-left': '0'});
            }
        }
    },
    deCluster: function () {
        var parent = this;
        var data = parent.filterPeriod(true);
        if (parent.DeliveryNoteNumberColSort != 'no') {
            if (parent.DeliveryNoteNumberColSort == 'asc') {
                data.sort(function (a, b) {
                    return (a.DeliveryNoteNumber > b.DeliveryNoteNumber) ? 1 : ((b.DeliveryNoteNumber > a.DeliveryNoteNumber) ? -1 : 0);
                });
            } else {
                data.sort(function (a, b) {
                    return (a.DeliveryNoteNumber < b.DeliveryNoteNumber) ? 1 : ((b.DeliveryNoteNumber < a.DeliveryNoteNumber) ? -1 : 0);
                });
            }
        }
        if (parent.OrderCreateTimestampColSort != 'no') {
            if (parent.OrderCreateTimestampColSort == 'asc') {
                data.sort(function (a, b) {
                    return (a.OrderCreateTimestamp < b.OrderCreateTimestamp) ? 1 : ((b.OrderCreateTimestamp < a.OrderCreateTimestamp) ? -1 : 0);
                });
            } else {
                data.sort(function (a, b) {
                    return (a.OrderCreateTimestamp > b.OrderCreateTimestamp) ? 1 : ((b.OrderCreateTimestamp > a.OrderCreateTimestamp) ? -1 : 0);
                });
            }
        }
        if (parent.ModifyTimestampColSort != 'no') {
            if (parent.ModifyTimestampColSort == 'asc') {
                data.sort(function (a, b) {
                    return (a.ModifyTimestamp < b.ModifyTimestamp) ? 1 : ((b.ModifyTimestamp < a.ModifyTimestamp) ? -1 : 0);
                });
            } else {
                data.sort(function (a, b) {
                    return (a.ModifyTimestamp > b.ModifyTimestamp) ? 1 : ((b.ModifyTimestamp > a.ModifyTimestamp) ? -1 : 0);
                });
            }
        }
        if (parent.CompletedTimestampColSort != 'no') {
            if (parent.CompletedTimestampColSort == 'asc') {
                data.sort(function (a, b) {
                    return (a.CompletedTimestamp < b.CompletedTimestamp) ? 1 : ((b.CompletedTimestamp < a.CompletedTimestamp) ? -1 : 0);
                });
            } else {
                data.sort(function (a, b) {
                    return (a.CompletedTimestamp > b.CompletedTimestamp) ? 1 : ((b.CompletedTimestamp > a.CompletedTimestamp) ? -1 : 0);
                });
            }
        }
        if (parent.InvoiceNumberColSort != 'no') {
            if (parent.InvoiceNumberColSort == 'asc') {
                data.sort(function (a, b) {
                    return (a.InvoiceNumber > b.InvoiceNumber) ? 1 : ((b.InvoiceNumber > a.InvoiceNumber) ? -1 : 0);
                });
            } else {
                data.sort(function (a, b) {
                    return (a.InvoiceNumber < b.InvoiceNumber) ? 1 : ((b.InvoiceNumber < a.InvoiceNumber) ? -1 : 0);
                });
            }
        }
        if (parent.revenueColSort != 'no') {
            if (parent.revenueColSort == 'asc') {
                data.sort(function (a, b) {
                    return (a.revenue > b.revenue) ? 1 : ((b.revenue > a.revenue) ? -1 : 0);
                });
            } else {
                data.sort(function (a, b) {
                    return (a.revenue < b.revenue) ? 1 : ((b.revenue < a.revenue) ? -1 : 0);
                });
            }
        }
        var $table = $('#delivery-notes-table');
        $table.bootstrapTable('load', data);
    },
    drawSorts: function () {
        var parent = this;
        var th = this.$el.find('#delivery-notes-table th');
        th.each(function (i, head) {
            if (head.attributes['data-field'].nodeValue == 'DeliveryNoteNumber') {
                head.firstChild.className = head.firstChild.className.replace('both-sort', '');
                head.firstChild.className = head.firstChild.className.replace('asc-sort', '');
                head.firstChild.className = head.firstChild.className.replace('desc-sort', '');
                if (parent.DeliveryNoteNumberColSort == 'no') {
                    head.firstChild.className += " both-sort";
                }
                if (parent.DeliveryNoteNumberColSort == 'asc') {
                    head.firstChild.className += " asc-sort";
                }
                if (parent.DeliveryNoteNumberColSort == 'desc') {
                    head.firstChild.className += " desc-sort";
                }
            }
            if (head.attributes['data-field'].nodeValue == 'OrderCreateTimestamp') {
                head.firstChild.className = head.firstChild.className.replace('both-sort', '');
                head.firstChild.className = head.firstChild.className.replace('asc-sort', '');
                head.firstChild.className = head.firstChild.className.replace('desc-sort', '');
                if (parent.OrderCreateTimestampColSort == 'no') {
                    head.firstChild.className += " both-sort";
                }
                if (parent.OrderCreateTimestampColSort == 'asc') {
                    head.firstChild.className += " asc-sort";
                }
                if (parent.OrderCreateTimestampColSort == 'desc') {
                    head.firstChild.className += " desc-sort";
                }
            }
            if (head.attributes['data-field'].nodeValue == 'ModifyTimestamp') {
                head.firstChild.className = head.firstChild.className.replace('both-sort', '');
                head.firstChild.className = head.firstChild.className.replace('asc-sort', '');
                head.firstChild.className = head.firstChild.className.replace('desc-sort', '');
                if (parent.ModifyTimestampColSort == 'no') {
                    head.firstChild.className += " both-sort";
                }
                if (parent.ModifyTimestampColSort == 'asc') {
                    head.firstChild.className += " asc-sort";
                }
                if (parent.ModifyTimestampColSort == 'desc') {
                    head.firstChild.className += " desc-sort";
                }
            }
            if (head.attributes['data-field'].nodeValue == 'CompletedTimestamp') {
                head.firstChild.className = head.firstChild.className.replace('both-sort', '');
                head.firstChild.className = head.firstChild.className.replace('asc-sort', '');
                head.firstChild.className = head.firstChild.className.replace('desc-sort', '');
                if (parent.CompletedTimestampColSort == 'no') {
                    head.firstChild.className += " both-sort";
                }
                if (parent.CompletedTimestampColSort == 'asc') {
                    head.firstChild.className += " asc-sort";
                }
                if (parent.CompletedTimestampColSort == 'desc') {
                    head.firstChild.className += " desc-sort";
                }
            }
            if (head.attributes['data-field'].nodeValue == 'InvoiceNumber') {
                head.firstChild.className = head.firstChild.className.replace('both-sort', '');
                head.firstChild.className = head.firstChild.className.replace('asc-sort', '');
                head.firstChild.className = head.firstChild.className.replace('desc-sort', '');
                if (parent.InvoiceNumberColSort == 'no') {
                    head.firstChild.className += " both-sort";
                }
                if (parent.InvoiceNumberColSort == 'asc') {
                    head.firstChild.className += " asc-sort";
                }
                if (parent.InvoiceNumberColSort == 'desc') {
                    head.firstChild.className += " desc-sort";
                }
            }
            if (head.attributes['data-field'].nodeValue == 'revenue') {
                head.firstChild.className = head.firstChild.className.replace('both-sort', '');
                head.firstChild.className = head.firstChild.className.replace('asc-sort', '');
                head.firstChild.className = head.firstChild.className.replace('desc-sort', '');
                if (parent.revenueColSort == 'no') {
                    head.firstChild.className += " both-sort";
                }
                if (parent.revenueColSort == 'asc') {
                    head.firstChild.className += " asc-sort";
                }
                if (parent.revenueColSort == 'desc') {
                    head.firstChild.className += " desc-sort";
                }
            }
        });
    },
    changeCheckboxSetting: function(e){
        e.preventDefault();
        e.stopPropagation();

        var codeSetting = e.target.getAttribute('id');
        var target = this.$el.find('#' + codeSetting);
        var value = target.prop('checked');

        disabledElementForSlowConnection();

        App.api.user.changeSetting.put(target[0].tagName.toLowerCase(), codeSetting, value).then(function (resp) {
            var setting_value = resp.toString();
            var settings = _.clone(App.instance.thisUser.get('setting'));

            if (settings) {
                if (codeSetting in settings) {
                    settings[codeSetting] = setting_value;
                }
            } else {
                settings = [];
                settings[codeSetting] = setting_value;
            }
            App.instance.thisUser.set('setting', settings);

            includedElementForSlowConnection();
        });
    },
    replacementData: function(){
        this.processedData = this.notes.toJSON();
    },
    changePeriodSetting: function(e) {
        var self = this;
        var codeSetting = 'periodForDN_' + e.target.getAttribute('id').split('-')[0] + 'Delivery';
        var target = 'periodForDN_';
        var value = 'true';
        var elements = ['periodForDN_allDelivery',
            'periodForDN_monthDelivery',
            'periodForDN_sevendaysDelivery',
            'periodForDN_todayDelivery',
            'periodForDN_weekDelivery',
            'periodForDN_yearDelivery',
            'periodForDN_yesterdayDelivery'];
        var showArrowsSummary;
        disabledElementForSlowConnection();

        App.api.user.changeSetting.put(target, codeSetting, value).then(function (resp) {
            var setting_value = resp.toString();
            var settings = _.clone(App.instance.thisUser.get('setting'));

            _.map(elements, function(element) {
                if (element in settings) {
                    return settings[element] = 'false';
                }
            });

            if (settings) {
                if (codeSetting in settings) {
                    settings[codeSetting] = setting_value;
                }
            } else {
                settings = [];
                settings[codeSetting] = setting_value;
            }
            App.instance.thisUser.set('setting', settings);

            includedElementForSlowConnection();
            if (typeof App.instance.thisUser.get('setting') !== 'undefined') {
                showArrowsSummary = App.instance.thisUser.get('setting').showArrowsSummary;
                if (showArrowsSummary == 'false') {
                    $('.arrowLineForTables i').css({'display': 'none'});
                    $('.arrowLineForTables span').css({'margin-left': '0'});
                }
            }
        });

        var dataForTopTable = this.recalculateTopTable($('#delivery-notes-table').bootstrapTable('getData'));

        var todaySum = dataForTopTable.todaySum;
        var todayMarAbs = dataForTopTable.todayMarAbs;
        var todayMwst = dataForTopTable.todayMwst;
        var thisWeekSum = dataForTopTable.thisWeekSum;
        var thisWeekMarAbs = dataForTopTable.thisWeekMarAbs;
        var thisWeekMwst = dataForTopTable.thisWeekMwst;
        var thisMonthSum = dataForTopTable.thisMonthSum;
        var thisMonthMarAbs = dataForTopTable.thisMonthMarAbs;
        var thisMonthMwst = dataForTopTable.thisMonthMwst;
        var thisYearSum = dataForTopTable.thisYearSum;
        var thisYearMarAbs = dataForTopTable.thisYearMarAbs;
        var thisYearMwst = dataForTopTable.thisYearMwst;
        var documentTextColor = dataForTopTable.documentTextColor;
        var todayTextColor = dataForTopTable.todayTextColor;
        var thisWeekTextColor = dataForTopTable.thisWeekTextColor;
        var thisMonthTextColor = dataForTopTable.thisMonthTextColor;
        var thisYearTextColor = dataForTopTable.thisYearTextColor;

        dataForTopTable.dataTop.forEach(function (value) {
            var productTotalSum = value.SumTotalPrice;
            var revenueString = formatProfitForPrint(productTotalSum);
            var valueTax = 0.0;
            value.Products.forEach(function (item) {
                valueTax += item.TotalTax;
            });
            var productTotalSumWithTax = productTotalSum + valueTax;
            var revenueBruttoString = formatProfitForPrint(productTotalSumWithTax);
            if (revenueString === '-') {
                value.revenue = '-';
            } else {
                var revenueInvoice = 0;

                if (App.instance.invoices) {
                    var invoice_id = value.InvoiceId;
                    if (invoice_id !== null) {

                        var Invoices_collection = App.instance.invoices;
                        var invoice = Invoices_collection.get(invoice_id);

                        if(invoice != undefined) {
                            revenueInvoice = typeof invoice.get('SumTotalPrice') !== 'undefined' ? invoice.get('SumTotalPrice') : null;
                            revenueInvoice = ' \u20AC ' + formatProfitForPrint(revenueInvoice);
                        }
                    } else {
                        revenueInvoice = '-';
                    }
                }
                documentTextColor = changeTextColorListDocumentsForDoc(value.containsDailyPriceCount);

                var nettoHidedClass = self.currentUmsatz === 'netto' ? '' : ' hided-content';
                var bruttoHidedClass = self.currentUmsatz === 'brutto' ? '' : ' hided-content';
                value.revenue = '<div class="revenueLine' + nettoHidedClass + '"><span class="' + documentTextColor + '">\u20AC ' + revenueString + '</span> / ' +
                    '<span class="' + documentTextColor + '">' + ' %' + formatProfitForPrint(value.SumTotalProfitPercent) + '</span> / ' +
                    '<span class="' + documentTextColor + '">' + formatProfitForPrint(value.SumTotalProfitAbsolute) + '</span> / ' +
                    '<span class="' + documentTextColor + '">' + revenueInvoice + '</span></div>' +
                    '<div class="revenueLineBruttoUmsatz' + bruttoHidedClass + '"><span class="' + documentTextColor + '">\u20AC ' + revenueBruttoString + '</span> / ' +
                    '<span class="' + documentTextColor + '">' + ' %' + formatProfitForPrint(value.SumTotalProfitPercent) + '</span> / ' +
                    '<span class="' + documentTextColor + '">' + formatProfitForPrint(value.SumTotalProfitAbsolute) + '</span> / ' +
                    '<span class="' + documentTextColor + '">' + revenueInvoice + '</span></div>';
            }
            // value.DeliveryNoteNumber = value.DeliveryNoteNumber + " (" + value.Company + ")";
        });

        this.renderTopTable(todaySum, todayMarAbs, todayMwst, thisWeekSum, thisWeekMarAbs, thisWeekMwst, thisMonthSum, thisMonthMarAbs, thisMonthMwst,
            thisYearSum, thisYearMarAbs, thisYearMwst, documentTextColor, todayTextColor, thisWeekTextColor, thisMonthTextColor, thisYearTextColor);

        if (self.currentUmsatz === 'brutto') {
            var elementsToShow = document.getElementsByClassName('revenueLineBruttoUmsatz');
            var elementsToHide = document.getElementsByClassName('revenueLine');
            _.each(elementsToShow, function (row) {
                row.classList.remove("hided-content");
            });
            _.each(elementsToHide, function (row) {
                row.classList.add("hided-content");
            });
        }
    },
    forSlowConnection: function (e) {
        disabledElementForSlowConnection();
    }
});