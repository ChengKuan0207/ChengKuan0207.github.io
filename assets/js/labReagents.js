(function () {
    "use strict";

    var STORAGE_KEY = "kuan.labReagents.v1";
    var LEGACY_STORAGE_KEY = "kuan.labConsumables.v1";
    var DATA_APP = "kuan-lab-reagents";
    var DATA_VERSION = 1;
    var MAX_IMPORT_BYTES = 5 * 1024 * 1024;
    var MAX_RECORDS = 10000;
    var MAX_QUANTITY = 1000000000;
    var MAX_MOLECULAR_WEIGHT = 1000000000;
    var NUMBER_PRECISION = 1000000;
    var QUANTITY_EPSILON = 0.000000001;
    var ALLOWED_TEMPERATURES = ["room", "4", "-20", "-80"];
    var ALLOWED_LIGHT_VALUES = ["yes", "no"];
    var ALLOWED_SEALED_VALUES = ["yes", "no", "unspecified"];
    var TEMPERATURE_LABELS = {
        room: "室温",
        "4": "4°C",
        "-20": "-20°C",
        "-80": "-80°C"
    };
    var reagents = [];
    var pendingImportReagents = null;
    var legacyRawData = "";
    var initialStatus = "";
    var initialStatusIsError = false;
    var storageReadFailed = false;
    var dialogReturnFocus = new Map();
    var elements = {};

    function cacheElements() {
        elements.totalReagents = document.getElementById("totalReagents");
        elements.inStockReagents = document.getElementById("inStockReagents");
        elements.outOfStockReagents = document.getElementById("outOfStockReagents");
        elements.coldStorageReagents = document.getElementById("coldStorageReagents");
        elements.resultCount = document.getElementById("resultCount");
        elements.searchInput = document.getElementById("searchInput");
        elements.temperatureFilter = document.getElementById("temperatureFilter");
        elements.stockFilter = document.getElementById("stockFilter");
        elements.lightFilter = document.getElementById("lightFilter");
        elements.sealedFilter = document.getElementById("sealedFilter");
        elements.sortSelect = document.getElementById("sortSelect");
        elements.inventoryTableWrap = document.getElementById("inventoryTableWrap");
        elements.reagentTableBody = document.getElementById("reagentTableBody");
        elements.emptyState = document.getElementById("emptyState");
        elements.emptyStateTitle = document.getElementById("emptyStateTitle");
        elements.emptyStateText = document.getElementById("emptyStateText");
        elements.emptyAddButton = document.getElementById("emptyAddButton");
        elements.inventoryStatus = document.getElementById("inventoryStatus");
        elements.addReagentButton = document.getElementById("addReagentButton");
        elements.exportButton = document.getElementById("exportButton");
        elements.exportLegacyButton = document.getElementById("exportLegacyButton");
        elements.importButton = document.getElementById("importButton");
        elements.importFileInput = document.getElementById("importFileInput");

        elements.reagentDialog = document.getElementById("reagentDialog");
        elements.reagentDialogTitle = document.getElementById("reagentDialogTitle");
        elements.reagentForm = document.getElementById("reagentForm");
        elements.reagentId = document.getElementById("reagentId");
        elements.chineseName = document.getElementById("chineseName");
        elements.englishName = document.getElementById("englishName");
        elements.casNumber = document.getElementById("casNumber");
        elements.molecularWeight = document.getElementById("molecularWeight");
        elements.specification = document.getElementById("specification");
        elements.brand = document.getElementById("brand");
        elements.lotNumber = document.getElementById("lotNumber");
        elements.storageTemperature = document.getElementById("storageTemperature");
        elements.lightSensitive = document.getElementById("lightSensitive");
        elements.sealedStorage = document.getElementById("sealedStorage");
        elements.location = document.getElementById("location");
        elements.quantity = document.getElementById("quantity");
        elements.notes = document.getElementById("notes");
        elements.reagentDialogStatus = document.getElementById("reagentDialogStatus");
        elements.closeReagentDialogButton = document.getElementById("closeReagentDialogButton");
        elements.cancelReagentButton = document.getElementById("cancelReagentButton");

        elements.stockDialog = document.getElementById("stockDialog");
        elements.stockDialogTitle = document.getElementById("stockDialogTitle");
        elements.stockForm = document.getElementById("stockForm");
        elements.stockReagentName = document.getElementById("stockReagentName");
        elements.stockReagentId = document.getElementById("stockReagentId");
        elements.stockAmount = document.getElementById("stockAmount");
        elements.stockCurrent = document.getElementById("stockCurrent");
        elements.stockDialogStatus = document.getElementById("stockDialogStatus");
        elements.closeStockDialogButton = document.getElementById("closeStockDialogButton");
        elements.cancelStockButton = document.getElementById("cancelStockButton");

        elements.importDialog = document.getElementById("importDialog");
        elements.importForm = document.getElementById("importForm");
        elements.importSummary = document.getElementById("importSummary");
        elements.importDialogStatus = document.getElementById("importDialogStatus");
        elements.closeImportDialogButton = document.getElementById("closeImportDialogButton");
        elements.cancelImportButton = document.getElementById("cancelImportButton");
    }

    function createId() {
        if (window.crypto && typeof window.crypto.randomUUID === "function") {
            return window.crypto.randomUUID();
        }

        return "reagent-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    }

    function normalizeId(value) {
        if (value === undefined || value === null || value === "") {
            return createId();
        }

        if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > 120) {
            throw new Error("试剂记录 ID 格式不正确。");
        }

        return value.trim();
    }

    function normalizeText(value, maxLength, label, required) {
        var text;

        if (value === undefined || value === null) {
            if (required) {
                throw new Error(label + "不能为空。");
            }
            return "";
        }

        if (typeof value !== "string") {
            throw new Error(label + "必须是文本。");
        }

        text = value.trim();
        if (required && !text) {
            throw new Error(label + "不能为空。");
        }
        if (text.length > maxLength) {
            throw new Error(label + "内容过长。");
        }

        return text;
    }

    function normalizeEnum(value, allowedValues, label) {
        if (typeof value !== "string" || allowedValues.indexOf(value) === -1) {
            throw new Error(label + "选项不正确。");
        }

        return value;
    }

    function normalizeQuantity(value) {
        var number;

        if (value === null || value === undefined || value === "" || typeof value === "boolean") {
            return NaN;
        }

        number = Number(value);
        if (!Number.isFinite(number) || number < 0 || number > MAX_QUANTITY) {
            return NaN;
        }

        return Math.round(number * NUMBER_PRECISION) / NUMBER_PRECISION;
    }

    function normalizeMolecularWeight(value) {
        var number;

        if (value === undefined || value === null || value === "") {
            return null;
        }
        if (typeof value === "boolean") {
            return NaN;
        }

        number = Number(value);
        if (!Number.isFinite(number) || number <= 0 || number > MAX_MOLECULAR_WEIGHT) {
            return NaN;
        }

        return Math.round(number * NUMBER_PRECISION) / NUMBER_PRECISION;
    }

    function isValidCasNumber(value) {
        var digits;
        var checkDigit;
        var sum = 0;
        var weight = 1;
        var index;

        if (value === "") {
            return true;
        }
        if (!/^\d{2,7}-\d{2}-\d$/.test(value)) {
            return false;
        }

        digits = value.replace(/-/g, "");
        checkDigit = Number(digits.charAt(digits.length - 1));
        for (index = digits.length - 2; index >= 0; index -= 1) {
            sum += Number(digits.charAt(index)) * weight;
            weight += 1;
        }

        return sum % 10 === checkDigit;
    }

    function normalizeTimestamp(value, fallback) {
        if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
            return value;
        }

        return fallback;
    }

    function normalizeReagent(rawReagent) {
        var now = new Date().toISOString();
        var casNumber;
        var molecularWeight;
        var quantity;
        var reagent;

        if (!rawReagent || typeof rawReagent !== "object" || Array.isArray(rawReagent)) {
            throw new Error("试剂记录格式不正确。");
        }

        casNumber = normalizeText(rawReagent.casNumber, 20, "CAS 号", false);
        molecularWeight = normalizeMolecularWeight(rawReagent.molecularWeight);
        quantity = normalizeQuantity(rawReagent.quantity);

        if (!isValidCasNumber(casNumber)) {
            throw new Error("CAS 号格式或校验位不正确。");
        }
        if (Number.isNaN(molecularWeight)) {
            throw new Error("分子量必须是大于 0 且不超过 10 亿的数字。");
        }
        if (Number.isNaN(quantity)) {
            throw new Error("库存量必须是 0 至 10 亿之间的数字，最多保留 6 位小数。");
        }

        reagent = {
            id: normalizeId(rawReagent.id),
            chineseName: normalizeText(rawReagent.chineseName, 80, "中文名称", true),
            englishName: normalizeText(rawReagent.englishName, 120, "英文名称", false),
            casNumber: casNumber,
            specification: normalizeText(rawReagent.specification, 80, "规格", true),
            brand: normalizeText(rawReagent.brand, 60, "品牌", false),
            lotNumber: normalizeText(rawReagent.lotNumber, 60, "批号", false),
            storageTemperature: normalizeEnum(rawReagent.storageTemperature, ALLOWED_TEMPERATURES, "储存温度"),
            lightSensitive: normalizeEnum(rawReagent.lightSensitive, ALLOWED_LIGHT_VALUES, "避光要求"),
            sealedStorage: normalizeEnum(rawReagent.sealedStorage, ALLOWED_SEALED_VALUES, "密封要求"),
            molecularWeight: molecularWeight,
            quantity: quantity,
            location: normalizeText(rawReagent.location, 100, "存放地", true),
            notes: normalizeText(rawReagent.notes, 500, "备注", false),
            createdAt: normalizeTimestamp(rawReagent.createdAt, now),
            updatedAt: normalizeTimestamp(rawReagent.updatedAt, now)
        };

        return reagent;
    }

    function normalizeCollection(rawReagents) {
        var seenIds = new Set();

        if (!Array.isArray(rawReagents)) {
            throw new Error("备份中没有可读取的试剂清单。");
        }
        if (rawReagents.length > MAX_RECORDS) {
            throw new Error("备份记录超过 10000 条，无法导入。");
        }

        return rawReagents.map(function (rawReagent) {
            var reagent = normalizeReagent(rawReagent);

            if (seenIds.has(reagent.id)) {
                reagent.id = createId();
            }
            seenIds.add(reagent.id);
            return reagent;
        });
    }

    function loadReagents() {
        var rawData;
        var parsed;
        var legacyData;

        storageReadFailed = false;
        legacyRawData = "";

        try {
            legacyData = window.localStorage.getItem(LEGACY_STORAGE_KEY);
            if (legacyData) {
                legacyRawData = legacyData;
            }

            rawData = window.localStorage.getItem(STORAGE_KEY);
            if (!rawData) {
                if (legacyData) {
                    initialStatus = "检测到旧耗材数据；因字段含义不同，未自动转换。可先导出原始备份，旧数据不会被删除。";
                    initialStatusIsError = false;
                }
                return [];
            }

            parsed = JSON.parse(rawData);
            if (!parsed || parsed.app !== DATA_APP || parsed.version !== DATA_VERSION || !Array.isArray(parsed.reagents)) {
                throw new Error("本地数据版本无法识别。");
            }

            if (legacyData) {
                initialStatus = "检测到旧耗材数据；可用“导出旧耗材数据”保存原始备份，旧数据不会被删除。";
                initialStatusIsError = false;
            }

            return normalizeCollection(parsed.reagents);
        } catch (error) {
            storageReadFailed = true;
            initialStatus = "本地试剂数据无法读取。继续保存前会要求确认，以免覆盖损坏的数据。";
            initialStatusIsError = true;
            return [];
        }
    }

    function setStatus(message, isError) {
        var dialogPairs = [
            [elements.reagentDialog, elements.reagentDialogStatus],
            [elements.stockDialog, elements.stockDialogStatus],
            [elements.importDialog, elements.importDialogStatus]
        ];

        elements.inventoryStatus.textContent = message;
        elements.inventoryStatus.classList.toggle("is-error", Boolean(isError));

        dialogPairs.forEach(function (pair) {
            if (pair[0] && pair[0].open && pair[1]) {
                pair[1].textContent = message;
                pair[1].classList.toggle("is-error", Boolean(isError));
            }
        });
    }

    function clearDialogStatus(statusElement) {
        statusElement.textContent = "";
        statusElement.classList.remove("is-error");
    }

    function commitReagents(nextReagents, successMessage, allowRepair) {
        var validatedReagents;
        var payload;
        var confirmed;

        try {
            validatedReagents = normalizeCollection(nextReagents);
        } catch (error) {
            setStatus(error.message || "保存失败：试剂数据格式不正确。", true);
            return false;
        }

        if (storageReadFailed && !allowRepair) {
            confirmed = window.confirm("现有本地试剂数据无法读取。继续保存会用当前清单覆盖损坏数据，确定继续吗？");
            if (!confirmed) {
                setStatus("已取消保存，损坏的本地数据没有被覆盖。", true);
                return false;
            }
        }

        payload = {
            app: DATA_APP,
            version: DATA_VERSION,
            updatedAt: new Date().toISOString(),
            reagents: validatedReagents
        };

        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (error) {
            setStatus("保存失败：浏览器没有提供可用的本地存储空间。请导出现有数据后重试。", true);
            return false;
        }

        storageReadFailed = false;
        reagents = validatedReagents;
        render();
        setStatus(successMessage, false);
        return true;
    }

    function formatNumber(value) {
        return new Intl.NumberFormat("zh-CN", {
            maximumFractionDigits: 6
        }).format(value);
    }

    function appendTextElement(parent, tagName, className, textValue) {
        var element = document.createElement(tagName);
        if (className) {
            element.className = className;
        }
        element.textContent = textValue;
        parent.appendChild(element);
        return element;
    }

    function createBadge(label, className) {
        var badge = document.createElement("span");
        badge.className = "status-badge " + className;
        badge.textContent = label;
        return badge;
    }

    function temperatureClass(value) {
        if (value === "room") {
            return "temperature-room";
        }
        if (value === "4") {
            return "temperature-cold";
        }
        if (value === "-20") {
            return "temperature-frozen";
        }
        return "temperature-deep-frozen";
    }

    function createActionButton(label, action, reagent) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "row-action" + (action === "delete" ? " row-action-danger" : "");
        button.dataset.action = action;
        button.dataset.id = reagent.id;
        button.textContent = label;
        button.setAttribute("aria-label", label + "“" + reagent.chineseName + "”");
        return button;
    }

    function createTableCell(label) {
        var cell = document.createElement("td");
        cell.dataset.label = label;
        return cell;
    }

    function createReagentRow(reagent) {
        var row = document.createElement("tr");
        var reagentCell = createTableCell("试剂");
        var sourceCell = createTableCell("规格 / 来源");
        var storageCell = createTableCell("储存要求");
        var molecularCell = createTableCell("分子量");
        var stockCell = createTableCell("库存量");
        var locationCell = createTableCell("存放地");
        var actionCell = createTableCell("操作");
        var sourceParts = [];
        var badges = document.createElement("div");
        var actions = document.createElement("div");

        appendTextElement(reagentCell, "strong", "item-name", reagent.chineseName);
        if (reagent.englishName) {
            appendTextElement(reagentCell, "span", "reagent-english", reagent.englishName);
        }
        appendTextElement(reagentCell, "span", "reagent-cas", "CAS：" + (reagent.casNumber || "—"));

        appendTextElement(sourceCell, "strong", "source-specification", reagent.specification);
        if (reagent.brand) {
            sourceParts.push(reagent.brand);
        }
        if (reagent.lotNumber) {
            sourceParts.push("批号 " + reagent.lotNumber);
        }
        appendTextElement(sourceCell, "span", "item-meta", sourceParts.length ? sourceParts.join(" · ") : "品牌与批号未填写");

        badges.className = "badge-stack";
        badges.appendChild(createBadge(TEMPERATURE_LABELS[reagent.storageTemperature], temperatureClass(reagent.storageTemperature)));
        badges.appendChild(createBadge(reagent.lightSensitive === "yes" ? "需要避光" : "无需避光", reagent.lightSensitive === "yes" ? "requirement-light" : "requirement-neutral"));
        if (reagent.sealedStorage === "yes") {
            badges.appendChild(createBadge("密封保存", "requirement-sealed"));
        } else if (reagent.sealedStorage === "no") {
            badges.appendChild(createBadge("无需密封", "requirement-neutral"));
        } else {
            badges.appendChild(createBadge("密封不区分", "requirement-neutral"));
        }
        storageCell.appendChild(badges);

        appendTextElement(molecularCell, "span", "molecular-weight", reagent.molecularWeight === null ? "—" : formatNumber(reagent.molecularWeight) + " g/mol");

        appendTextElement(stockCell, "strong", "stock-quantity", formatNumber(reagent.quantity));
        stockCell.appendChild(createBadge(reagent.quantity > 0 ? "有库存" : "已用完", reagent.quantity > 0 ? "status-normal" : "status-out"));

        appendTextElement(locationCell, "span", "", reagent.location);
        if (reagent.notes) {
            appendTextElement(locationCell, "span", "item-note", reagent.notes);
        }

        actions.className = "row-actions";
        actions.appendChild(createActionButton("入库", "stock-add", reagent));
        actions.appendChild(createActionButton("领用", "stock-remove", reagent));
        actions.appendChild(createActionButton("编辑", "edit", reagent));
        actions.appendChild(createActionButton("删除", "delete", reagent));
        actionCell.appendChild(actions);

        row.appendChild(reagentCell);
        row.appendChild(sourceCell);
        row.appendChild(storageCell);
        row.appendChild(molecularCell);
        row.appendChild(stockCell);
        row.appendChild(locationCell);
        row.appendChild(actionCell);
        return row;
    }

    function renderSummary() {
        var inStockCount = 0;
        var outOfStockCount = 0;
        var coldStorageCount = 0;

        reagents.forEach(function (reagent) {
            inStockCount += reagent.quantity > 0 ? 1 : 0;
            outOfStockCount += reagent.quantity === 0 ? 1 : 0;
            coldStorageCount += reagent.storageTemperature !== "room" ? 1 : 0;
        });

        elements.totalReagents.textContent = String(reagents.length);
        elements.inStockReagents.textContent = String(inStockCount);
        elements.outOfStockReagents.textContent = String(outOfStockCount);
        elements.coldStorageReagents.textContent = String(coldStorageCount);
    }

    function matchesSearch(reagent, query) {
        var searchable = [
            reagent.chineseName,
            reagent.englishName,
            reagent.casNumber,
            reagent.specification,
            reagent.brand,
            reagent.lotNumber,
            reagent.location,
            reagent.notes
        ].join(" ").toLocaleLowerCase("zh-CN");

        return searchable.indexOf(query) !== -1;
    }

    function matchesStock(reagent, stockFilter) {
        if (stockFilter === "all") {
            return true;
        }

        return stockFilter === "in" ? reagent.quantity > 0 : reagent.quantity === 0;
    }

    function sortReagents(list, sortValue) {
        return list.sort(function (left, right) {
            if (sortValue === "chinese-asc") {
                return left.chineseName.localeCompare(right.chineseName, "zh-CN", { numeric: true, sensitivity: "base" });
            }
            if (sortValue === "english-asc") {
                if (!left.englishName && !right.englishName) {
                    return left.chineseName.localeCompare(right.chineseName, "zh-CN");
                }
                if (!left.englishName) {
                    return 1;
                }
                if (!right.englishName) {
                    return -1;
                }
                return left.englishName.localeCompare(right.englishName, "en", { numeric: true, sensitivity: "base" });
            }
            if (sortValue === "quantity-asc") {
                return left.quantity - right.quantity || left.chineseName.localeCompare(right.chineseName, "zh-CN");
            }

            return right.updatedAt.localeCompare(left.updatedAt);
        });
    }

    function getVisibleReagents() {
        var query = elements.searchInput.value.trim().toLocaleLowerCase("zh-CN");
        var temperature = elements.temperatureFilter.value;
        var stock = elements.stockFilter.value;
        var light = elements.lightFilter.value;
        var sealed = elements.sealedFilter.value;
        var visibleReagents = reagents.filter(function (reagent) {
            return (!query || matchesSearch(reagent, query)) &&
                (temperature === "all" || reagent.storageTemperature === temperature) &&
                matchesStock(reagent, stock) &&
                (light === "all" || reagent.lightSensitive === light) &&
                (sealed === "all" || reagent.sealedStorage === sealed);
        });

        return sortReagents(visibleReagents.slice(), elements.sortSelect.value);
    }

    function renderTable() {
        var visibleReagents = getVisibleReagents();
        var fragment = document.createDocumentFragment();
        var isFiltered = Boolean(elements.searchInput.value.trim()) ||
            elements.temperatureFilter.value !== "all" ||
            elements.stockFilter.value !== "all" ||
            elements.lightFilter.value !== "all" ||
            elements.sealedFilter.value !== "all";

        visibleReagents.forEach(function (reagent) {
            fragment.appendChild(createReagentRow(reagent));
        });
        elements.reagentTableBody.replaceChildren(fragment);

        elements.resultCount.textContent = isFiltered ?
            visibleReagents.length + " / " + reagents.length + " 条记录" :
            reagents.length + " 条记录";

        if (visibleReagents.length > 0) {
            elements.inventoryTableWrap.hidden = false;
            elements.emptyState.hidden = true;
            return;
        }

        elements.inventoryTableWrap.hidden = true;
        elements.emptyState.hidden = false;

        if (reagents.length === 0) {
            elements.emptyStateTitle.textContent = "还没有试剂记录";
            elements.emptyStateText.textContent = "点击“新增试剂”，录入第一条试剂信息。";
            elements.emptyAddButton.textContent = "新增第一条记录";
        } else {
            elements.emptyStateTitle.textContent = "没有符合条件的试剂";
            elements.emptyStateText.textContent = "试试修改搜索词，或选择其他储存与库存条件。";
            elements.emptyAddButton.textContent = "新增试剂";
        }
    }

    function render() {
        renderSummary();
        renderTable();
    }

    function restoreDialogFocus(dialog) {
        var trigger = dialogReturnFocus.get(dialog);
        dialogReturnFocus.delete(dialog);
        if (trigger && document.contains(trigger) && typeof trigger.focus === "function") {
            trigger.focus();
        }
    }

    function showDialog(dialog, focusTarget) {
        dialogReturnFocus.set(dialog, document.activeElement);
        if (typeof dialog.showModal === "function") {
            dialog.showModal();
        } else {
            dialog.setAttribute("open", "");
        }
        if (focusTarget) {
            focusTarget.focus();
        }
    }

    function closeDialog(dialog) {
        if (typeof dialog.close === "function") {
            dialog.close();
        } else {
            dialog.removeAttribute("open");
            restoreDialogFocus(dialog);
        }
    }

    function openCreateDialog() {
        elements.reagentForm.reset();
        elements.casNumber.setCustomValidity("");
        clearDialogStatus(elements.reagentDialogStatus);
        elements.reagentId.value = "";
        elements.quantity.value = "0";
        elements.reagentDialogTitle.textContent = "新增试剂";
        showDialog(elements.reagentDialog, elements.chineseName);
    }

    function openEditDialog(reagent) {
        elements.reagentForm.reset();
        elements.casNumber.setCustomValidity("");
        clearDialogStatus(elements.reagentDialogStatus);
        elements.reagentId.value = reagent.id;
        elements.chineseName.value = reagent.chineseName;
        elements.englishName.value = reagent.englishName;
        elements.casNumber.value = reagent.casNumber;
        elements.molecularWeight.value = reagent.molecularWeight === null ? "" : String(reagent.molecularWeight);
        elements.specification.value = reagent.specification;
        elements.brand.value = reagent.brand;
        elements.lotNumber.value = reagent.lotNumber;
        elements.storageTemperature.value = reagent.storageTemperature;
        elements.lightSensitive.value = reagent.lightSensitive;
        elements.sealedStorage.value = reagent.sealedStorage;
        elements.location.value = reagent.location;
        elements.quantity.value = String(reagent.quantity);
        elements.notes.value = reagent.notes;
        elements.reagentDialogTitle.textContent = "编辑试剂";
        showDialog(elements.reagentDialog, elements.chineseName);
    }

    function reagentFromForm() {
        var existingReagent = reagents.find(function (reagent) {
            return reagent.id === elements.reagentId.value;
        });
        var now = new Date().toISOString();

        return normalizeReagent({
            id: existingReagent ? existingReagent.id : createId(),
            chineseName: elements.chineseName.value,
            englishName: elements.englishName.value,
            casNumber: elements.casNumber.value,
            specification: elements.specification.value,
            brand: elements.brand.value,
            lotNumber: elements.lotNumber.value,
            storageTemperature: elements.storageTemperature.value,
            lightSensitive: elements.lightSensitive.value,
            sealedStorage: elements.sealedStorage.value,
            molecularWeight: elements.molecularWeight.value,
            quantity: elements.quantity.value,
            location: elements.location.value,
            notes: elements.notes.value,
            createdAt: existingReagent ? existingReagent.createdAt : now,
            updatedAt: now
        });
    }

    function handleReagentSubmit(event) {
        var savedReagent;
        var existingIndex;
        var nextReagents;
        var successMessage;

        event.preventDefault();
        elements.casNumber.setCustomValidity("");
        if (!elements.reagentForm.reportValidity()) {
            return;
        }

        try {
            savedReagent = reagentFromForm();
        } catch (error) {
            if (error.message.indexOf("CAS 号") !== -1) {
                elements.casNumber.setCustomValidity(error.message);
                elements.casNumber.reportValidity();
            }
            setStatus(error.message || "试剂信息不完整，无法保存。", true);
            return;
        }

        existingIndex = reagents.findIndex(function (reagent) {
            return reagent.id === savedReagent.id;
        });
        nextReagents = reagents.slice();

        if (existingIndex >= 0) {
            nextReagents[existingIndex] = savedReagent;
            successMessage = "已更新“" + savedReagent.chineseName + "”。";
        } else {
            nextReagents.unshift(savedReagent);
            successMessage = "已新增“" + savedReagent.chineseName + "”。";
        }

        if (commitReagents(nextReagents, successMessage, false)) {
            closeDialog(elements.reagentDialog);
        }
    }

    function openStockDialog(reagent, action) {
        var selectedRadio;

        elements.stockForm.reset();
        clearDialogStatus(elements.stockDialogStatus);
        selectedRadio = elements.stockForm.querySelector("input[name='stockAction'][value='" + action + "']");
        elements.stockReagentId.value = reagent.id;
        elements.stockReagentName.textContent = reagent.chineseName;
        elements.stockCurrent.textContent = "当前库存量：" + formatNumber(reagent.quantity);
        elements.stockAmount.value = "1";
        if (selectedRadio) {
            selectedRadio.checked = true;
        }
        elements.stockDialogTitle.textContent = action === "add" ? "试剂入库" : "领用试剂";
        showDialog(elements.stockDialog, elements.stockAmount);
    }

    function handleStockSubmit(event) {
        var reagentId = elements.stockReagentId.value;
        var reagentIndex = reagents.findIndex(function (reagent) {
            return reagent.id === reagentId;
        });
        var action = elements.stockForm.querySelector("input[name='stockAction']:checked").value;
        var amount = normalizeQuantity(elements.stockAmount.value);
        var reagent;
        var nextQuantity;
        var nextReagents;
        var updatedReagent;
        var actionName;

        event.preventDefault();
        if (!elements.stockForm.reportValidity() || reagentIndex < 0) {
            return;
        }
        if (Number.isNaN(amount) || amount <= 0) {
            setStatus("调整数量必须是大于 0 且不超过 10 亿的数字，最多保留 6 位小数。", true);
            return;
        }

        reagent = reagents[reagentIndex];
        nextQuantity = action === "add" ? reagent.quantity + amount : reagent.quantity - amount;
        if (!Number.isFinite(nextQuantity) || nextQuantity > MAX_QUANTITY) {
            setStatus("调整后的库存量不能超过 10 亿。", true);
            return;
        }
        if (nextQuantity < -QUANTITY_EPSILON) {
            setStatus("领用数量不能超过当前库存量 " + formatNumber(reagent.quantity) + "。", true);
            return;
        }
        nextQuantity = nextQuantity < 0 ? 0 : normalizeQuantity(nextQuantity);

        updatedReagent = Object.assign({}, reagent, {
            quantity: nextQuantity,
            updatedAt: new Date().toISOString()
        });
        nextReagents = reagents.slice();
        nextReagents[reagentIndex] = updatedReagent;
        actionName = action === "add" ? "入库" : "领用";

        if (commitReagents(nextReagents, "已为“" + reagent.chineseName + "”" + actionName + " " + formatNumber(amount) + "。", false)) {
            closeDialog(elements.stockDialog);
        }
    }

    function deleteReagent(reagent) {
        var confirmed = window.confirm("确定删除“" + reagent.chineseName + "”吗？此操作无法撤销。");
        var nextReagents;

        if (!confirmed) {
            return;
        }

        nextReagents = reagents.filter(function (candidate) {
            return candidate.id !== reagent.id;
        });
        commitReagents(nextReagents, "已删除“" + reagent.chineseName + "”。", false);
    }

    function handleTableAction(event) {
        var button = event.target.closest("button[data-action]");
        var reagent;

        if (!button) {
            return;
        }

        reagent = reagents.find(function (candidate) {
            return candidate.id === button.dataset.id;
        });
        if (!reagent) {
            setStatus("找不到这条试剂记录，请刷新页面后重试。", true);
            return;
        }

        if (button.dataset.action === "edit") {
            openEditDialog(reagent);
        } else if (button.dataset.action === "delete") {
            deleteReagent(reagent);
        } else if (button.dataset.action === "stock-add") {
            openStockDialog(reagent, "add");
        } else if (button.dataset.action === "stock-remove") {
            openStockDialog(reagent, "remove");
        }
    }

    function exportBackup() {
        var payload;
        var blob;
        var downloadUrl;
        var link;
        var today;

        if (reagents.length === 0) {
            setStatus("当前没有可导出的试剂记录。", true);
            return;
        }

        payload = {
            app: DATA_APP,
            version: DATA_VERSION,
            exportedAt: new Date().toISOString(),
            reagents: reagents
        };
        blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        downloadUrl = URL.createObjectURL(blob);
        link = document.createElement("a");
        today = new Date();
        link.href = downloadUrl;
        link.download = "lab-reagents-backup-" +
            today.getFullYear() + "-" +
            String(today.getMonth() + 1).padStart(2, "0") + "-" +
            String(today.getDate()).padStart(2, "0") + ".json";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(function () {
            URL.revokeObjectURL(downloadUrl);
        }, 0);
        setStatus("已导出 " + reagents.length + " 条试剂记录。", false);
    }

    function exportLegacyBackup() {
        var blob;
        var downloadUrl;
        var link;
        var today;

        if (!legacyRawData) {
            elements.exportLegacyButton.hidden = true;
            setStatus("没有检测到可导出的旧耗材数据。", true);
            return;
        }

        blob = new Blob([legacyRawData], { type: "application/json" });
        downloadUrl = URL.createObjectURL(blob);
        link = document.createElement("a");
        today = new Date();
        link.href = downloadUrl;
        link.download = "lab-consumables-legacy-backup-" +
            today.getFullYear() + "-" +
            String(today.getMonth() + 1).padStart(2, "0") + "-" +
            String(today.getDate()).padStart(2, "0") + ".json";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(function () {
            URL.revokeObjectURL(downloadUrl);
        }, 0);
        setStatus("旧耗材数据已按原始内容导出；浏览器中的旧数据仍保留。", false);
    }

    function parseImport(text) {
        var parsed = JSON.parse(text);

        if (!parsed || parsed.app !== DATA_APP || parsed.version !== DATA_VERSION || !Array.isArray(parsed.reagents)) {
            throw new Error("文件不是可识别的试剂备份，或备份版本不受支持。");
        }

        return normalizeCollection(parsed.reagents);
    }

    function readFileText(file) {
        if (typeof file.text === "function") {
            return file.text();
        }

        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.addEventListener("load", function () {
                resolve(String(reader.result));
            });
            reader.addEventListener("error", function () {
                reject(new Error("备份文件读取失败。"));
            });
            reader.readAsText(file);
        });
    }

    function handleImportFile(event) {
        var file = event.target.files && event.target.files[0];

        if (!file) {
            return;
        }
        if (file.size > MAX_IMPORT_BYTES) {
            setStatus("备份文件超过 5 MB，无法导入。", true);
            elements.importFileInput.value = "";
            return;
        }

        readFileText(file).then(function (text) {
            pendingImportReagents = parseImport(text);
            elements.importForm.reset();
            clearDialogStatus(elements.importDialogStatus);
            elements.importSummary.textContent = "已读取 " + pendingImportReagents.length + " 条试剂记录，请选择导入方式。";
            showDialog(elements.importDialog, elements.importForm.querySelector("input[name='importMode']"));
        }).catch(function (error) {
            pendingImportReagents = null;
            setStatus(error.message || "备份文件读取失败，请检查文件后重试。", true);
        }).then(function () {
            elements.importFileInput.value = "";
        });
    }

    function handleImportSubmit(event) {
        var mode = elements.importForm.querySelector("input[name='importMode']:checked").value;
        var nextReagents;
        var reagentMap;
        var confirmed;

        event.preventDefault();
        if (!pendingImportReagents) {
            closeDialog(elements.importDialog);
            setStatus("没有可导入的试剂备份数据。", true);
            return;
        }

        if (mode === "replace") {
            confirmed = window.confirm("替换会删除当前全部试剂记录。确定继续吗？");
            if (!confirmed) {
                return;
            }
            nextReagents = pendingImportReagents.slice();
        } else {
            reagentMap = new Map();
            reagents.forEach(function (reagent) {
                reagentMap.set(reagent.id, reagent);
            });
            pendingImportReagents.forEach(function (reagent) {
                reagentMap.set(reagent.id, reagent);
            });
            nextReagents = Array.from(reagentMap.values());
        }

        if (commitReagents(nextReagents, "导入完成，当前共有 " + nextReagents.length + " 条试剂记录。", mode === "replace")) {
            pendingImportReagents = null;
            closeDialog(elements.importDialog);
        }
    }

    function closeImportDialog() {
        pendingImportReagents = null;
        elements.importForm.reset();
        clearDialogStatus(elements.importDialogStatus);
        closeDialog(elements.importDialog);
    }

    function bindDialog(dialog, onClose) {
        dialog.addEventListener("click", function (event) {
            if (event.target === dialog) {
                closeDialog(dialog);
            }
        });
        dialog.addEventListener("close", function () {
            if (onClose) {
                onClose();
            }
            restoreDialogFocus(dialog);
        });
    }

    function bindEvents() {
        elements.addReagentButton.addEventListener("click", openCreateDialog);
        elements.emptyAddButton.addEventListener("click", openCreateDialog);
        elements.reagentForm.addEventListener("submit", handleReagentSubmit);
        elements.casNumber.addEventListener("input", function () {
            elements.casNumber.setCustomValidity("");
        });
        elements.closeReagentDialogButton.addEventListener("click", function () {
            closeDialog(elements.reagentDialog);
        });
        elements.cancelReagentButton.addEventListener("click", function () {
            closeDialog(elements.reagentDialog);
        });

        elements.stockForm.addEventListener("submit", handleStockSubmit);
        elements.closeStockDialogButton.addEventListener("click", function () {
            closeDialog(elements.stockDialog);
        });
        elements.cancelStockButton.addEventListener("click", function () {
            closeDialog(elements.stockDialog);
        });

        elements.reagentTableBody.addEventListener("click", handleTableAction);
        elements.searchInput.addEventListener("input", renderTable);
        elements.temperatureFilter.addEventListener("change", renderTable);
        elements.stockFilter.addEventListener("change", renderTable);
        elements.lightFilter.addEventListener("change", renderTable);
        elements.sealedFilter.addEventListener("change", renderTable);
        elements.sortSelect.addEventListener("change", renderTable);

        elements.exportButton.addEventListener("click", exportBackup);
        elements.exportLegacyButton.addEventListener("click", exportLegacyBackup);
        elements.importButton.addEventListener("click", function () {
            elements.importFileInput.value = "";
            elements.importFileInput.click();
        });
        elements.importFileInput.addEventListener("change", handleImportFile);
        elements.importForm.addEventListener("submit", handleImportSubmit);
        elements.closeImportDialogButton.addEventListener("click", closeImportDialog);
        elements.cancelImportButton.addEventListener("click", closeImportDialog);

        bindDialog(elements.reagentDialog);
        bindDialog(elements.stockDialog);
        bindDialog(elements.importDialog, function () {
            pendingImportReagents = null;
            elements.importForm.reset();
            clearDialogStatus(elements.importDialogStatus);
        });

        window.addEventListener("storage", function (event) {
            if (event.key === STORAGE_KEY || event.key === LEGACY_STORAGE_KEY) {
                initialStatus = "";
                initialStatusIsError = false;
                reagents = loadReagents();
                elements.exportLegacyButton.hidden = !legacyRawData;
                render();
                if (initialStatus) {
                    setStatus(initialStatus, initialStatusIsError);
                } else if (event.key === LEGACY_STORAGE_KEY) {
                    setStatus("已同步同一浏览器中旧耗材备份的状态。", false);
                } else {
                    setStatus("已同步同一浏览器中另一个标签页的试剂数据。", false);
                }
            }
        });
    }

    document.addEventListener("DOMContentLoaded", function () {
        cacheElements();
        reagents = loadReagents();
        elements.exportLegacyButton.hidden = !legacyRawData;
        bindEvents();
        render();

        if (initialStatus) {
            setStatus(initialStatus, initialStatusIsError);
        }
    });
}());
