(function () {
    "use strict";

    var STORAGE_KEY = "kuan.labReagents.v1";
    var LEGACY_STORAGE_KEY = "kuan.labConsumables.v1";
    var DATA_APP = "kuan-lab-reagents";
    var DATA_VERSION = 1;
    var MAX_IMPORT_BYTES = 5 * 1024 * 1024;
    var MAX_RECORDS = 10000;
    var MAX_QUANTITY = 1000000000;
    var MAX_MOLECULAR_WEIGHT_LENGTH = 80;
    var NUMBER_PRECISION = 1000000;
    var QUANTITY_EPSILON = 0.000000001;
    var EXCEL_DATA_SHEET_NAME = "试剂清单";
    var EXCEL_HELP_SHEET_NAME = "填写说明";
    var MAX_EXCEL_ERRORS = 10;
    var MAX_EXCEL_COLUMNS = 100;
    var ALLOWED_TEMPERATURES = ["room", "4", "-20", "-80"];
    var ALLOWED_LIGHT_VALUES = ["yes", "no", "unspecified"];
    var ALLOWED_SEALED_VALUES = ["yes", "no", "unspecified"];
    var TEMPERATURE_LABELS = {
        room: "室温",
        "4": "4°C",
        "-20": "-20°C",
        "-80": "-80°C"
    };
    var LIGHT_LABELS = {
        yes: "需要避光",
        no: "无需避光",
        unspecified: "避光不区分"
    };
    var SEALED_LABELS = {
        yes: "密封保存",
        no: "无需密封",
        unspecified: "密封不区分"
    };
    var EXCEL_COLUMNS = [
        { key: "chineseName", header: "中文名称", aliases: ["中文名称"] },
        { key: "englishName", header: "英文名称", aliases: ["英文名称"] },
        { key: "casNumber", header: "CAS号", aliases: ["CAS号", "CAS 号", "CAS Number", "CAS"] },
        { key: "specification", header: "规格", aliases: ["规格"] },
        { key: "brand", header: "品牌", aliases: ["品牌"] },
        { key: "lotNumber", header: "批号", aliases: ["批号", "Lot Number", "Lot"] },
        { key: "storageTemperature", header: "储存温度", aliases: ["储存温度", "保存温度"] },
        { key: "lightSensitive", header: "是否需要避光", aliases: ["是否需要避光", "是否避光", "避光"] },
        { key: "sealedStorage", header: "是否密封保存", aliases: ["是否密封保存", "是否密封", "密封保存"] },
        { key: "molecularWeight", header: "分子量", aliases: ["分子量", "分子量(g/mol)", "分子量（g/mol）"] },
        { key: "quantity", header: "库存量", aliases: ["库存量", "库存"] },
        { key: "location", header: "存放地", aliases: ["存放地", "存放位置"] },
        { key: "notes", header: "备注", aliases: ["备注"] },
        { key: "id", header: "记录ID（请勿修改）", aliases: ["记录ID（请勿修改）", "记录ID(请勿修改)", "记录ID", "系统ID（请勿修改，新建时留空）", "系统ID"], optional: true }
    ];
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
        elements.exportFormat = document.getElementById("exportFormat");
        elements.templateButton = document.getElementById("templateButton");
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
        var text;

        if (value === undefined || value === null || value === "") {
            return "";
        }

        if (typeof value === "number") {
            if (!Number.isFinite(value)) {
                throw new Error("分子量必须是文字或有限数字。");
            }
            text = String(value);
        } else if (typeof value === "string") {
            text = value.trim();
        } else {
            throw new Error("分子量必须是文字或数字。");
        }

        if (text.length > MAX_MOLECULAR_WEIGHT_LENGTH) {
            throw new Error("分子量内容不能超过 80 个字符。");
        }

        return text;
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

    function getDateStamp() {
        var today = new Date();

        return today.getFullYear() + "-" +
            String(today.getMonth() + 1).padStart(2, "0") + "-" +
            String(today.getDate()).padStart(2, "0");
    }

    function getSpreadsheetLibrary() {
        if (!window.XLSX || !window.XLSX.utils || typeof window.XLSX.read !== "function") {
            throw new Error("Excel 功能组件没有正确加载，请刷新页面后重试。JSON 备份仍可正常使用。");
        }

        return window.XLSX;
    }

    function normalizeExcelHeader(value) {
        if (value === undefined || value === null) {
            return "";
        }

        return String(value)
            .trim()
            .toLocaleLowerCase("zh-CN")
            .replace(/\s+/g, "")
            .replace(/（/g, "(")
            .replace(/）/g, ")");
    }

    function excelCellToText(value, label) {
        if (value === undefined || value === null || value === "") {
            return "";
        }
        if (typeof value !== "string" && typeof value !== "number") {
            throw new Error(label + "必须是文字或数字。");
        }
        if (typeof value === "number" && !Number.isFinite(value)) {
            throw new Error(label + "包含无效数字。");
        }

        return String(value).trim();
    }

    function normalizeExcelChoiceToken(value, label) {
        return excelCellToText(value, label)
            .toLocaleLowerCase("zh-CN")
            .replace(/\s+/g, "")
            .replace(/℃/g, "°c")
            .replace(/−|–|—/g, "-");
    }

    function excelTemperatureToValue(value) {
        var token = normalizeExcelChoiceToken(value, "储存温度");
        var mapping = {
            "室温": "room",
            "常温": "room",
            "room": "room",
            "roomtemperature": "room",
            "rt": "room",
            "4": "4",
            "4°c": "4",
            "-20": "-20",
            "-20°c": "-20",
            "-80": "-80",
            "-80°c": "-80"
        };

        return mapping[token] || token;
    }

    function excelRequirementToValue(value, type) {
        var label = type === "light" ? "是否需要避光" : "是否密封保存";
        var token = normalizeExcelChoiceToken(value, label);
        var common = {
            "是": "yes",
            "yes": "yes",
            "否": "no",
            "no": "no",
            "不区分": "unspecified",
            "unspecified": "unspecified"
        };
        var light = {
            "需要避光": "yes",
            "需避光": "yes",
            "无需避光": "no",
            "不需要避光": "no",
            "避光不区分": "unspecified"
        };
        var sealed = {
            "需要密封": "yes",
            "密封保存": "yes",
            "需密封": "yes",
            "无需密封": "no",
            "不需要密封": "no",
            "密封不区分": "unspecified"
        };

        return common[token] || (type === "light" ? light[token] : sealed[token]) || token;
    }

    function excelValueForReagent(reagent, key) {
        if (key === "storageTemperature") {
            return TEMPERATURE_LABELS[reagent.storageTemperature];
        }
        if (key === "lightSensitive") {
            return reagent.lightSensitive === "yes" ? "是" : reagent.lightSensitive === "no" ? "否" : "不区分";
        }
        if (key === "sealedStorage") {
            return reagent.sealedStorage === "yes" ? "是" : reagent.sealedStorage === "no" ? "否" : "不区分";
        }

        return reagent[key];
    }

    function createSpreadsheetWorkbook(sourceReagents) {
        var xlsx = getSpreadsheetLibrary();
        var workbook = xlsx.utils.book_new();
        var dataRows = [EXCEL_COLUMNS.map(function (column) {
            return column.header;
        })];
        var worksheet;
        var helpSheet;
        var textColumnIndexes = [];

        sourceReagents.forEach(function (reagent) {
            dataRows.push(EXCEL_COLUMNS.map(function (column) {
                return excelValueForReagent(reagent, column.key);
            }));
        });
        if (sourceReagents.length === 0) {
            dataRows.push(EXCEL_COLUMNS.map(function () {
                return "";
            }));
        }

        worksheet = xlsx.utils.aoa_to_sheet(dataRows);
        worksheet["!cols"] = [
            { wch: 20 }, { wch: 24 }, { wch: 16 }, { wch: 20 }, { wch: 16 }, { wch: 18 },
            { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 20 }, { wch: 12 }, { wch: 22 },
            { wch: 36 }, { wch: 40 }
        ];
        worksheet["!autofilter"] = { ref: "A1:N" + Math.max(dataRows.length, 1) };

        EXCEL_COLUMNS.forEach(function (column, columnIndex) {
            if (column.key !== "quantity") {
                textColumnIndexes.push(columnIndex);
            }
        });
        for (var rowIndex = 1; rowIndex < dataRows.length; rowIndex += 1) {
            textColumnIndexes.forEach(function (columnIndex) {
                var address = xlsx.utils.encode_cell({ r: rowIndex, c: columnIndex });
                var cell = worksheet[address];

                if (cell) {
                    cell.t = "s";
                    cell.z = "@";
                    delete cell.f;
                }
            });
        }

        helpSheet = xlsx.utils.aoa_to_sheet([
            ["实验室试剂管理 Excel 填写说明", ""],
            ["项目", "填写要求"],
            ["试剂清单", "请在“试剂清单”工作表中填写；每一行代表一条试剂记录，不要修改第一行表头。"],
            ["必填字段", "中文名称、规格、储存温度、是否需要避光、是否密封保存、库存量、存放地。"],
            ["储存温度", "只能填写：室温、4°C、-20°C、-80°C。"],
            ["是否需要避光", "只能填写：是、否、不区分。"],
            ["是否密封保存", "只能填写：是、否、不区分。"],
            ["分子量", "可填写数字、范围和单位，例如：180.16 g/mol、40–60 kDa、约 150 kDa。"],
            ["库存量", "填写 0 至 10 亿之间的数字，最多保留 6 位小数。"],
            ["文本编号", "CAS号、批号和记录 ID 请保留为文本；含前导零时不要改为数字。CAS 号示例：7732-18-5。"],
            ["记录ID", "从网页导出的现有记录请勿修改；复制一行创建新试剂时，请清空该行记录 ID。"],
            ["合并导入", "按记录 ID 更新或新增；从 Excel 删除的行不会删除网页中的原记录。"],
            ["替换导入", "网页清单会被文件中的全部记录替换；执行前会再次确认。"],
            ["安全提示", "请勿导入来源不明、损坏或加密的工作簿；公式单元格不会导入，请先复制并粘贴为值；系统不会执行宏。"]
        ]);
        helpSheet["!cols"] = [{ wch: 20 }, { wch: 92 }];

        xlsx.utils.book_append_sheet(workbook, worksheet, EXCEL_DATA_SHEET_NAME);
        xlsx.utils.book_append_sheet(workbook, helpSheet, EXCEL_HELP_SHEET_NAME);
        workbook.Props = {
            Title: "实验室试剂管理",
            Subject: "试剂信息导入导出",
            Author: "Kuan"
        };
        return workbook;
    }

    function writeSpreadsheetFile(workbook, format, filenameBase) {
        var xlsx = getSpreadsheetLibrary();
        var isLegacy;

        if (format !== "xlsx" && format !== "xls") {
            throw new Error("请选择 .xlsx 或 .xls 格式。");
        }
        isLegacy = format === "xls";

        xlsx.writeFile(workbook, filenameBase + (isLegacy ? ".xls" : ".xlsx"), {
            bookType: isLegacy ? "biff8" : "xlsx",
            bookSST: true,
            compression: !isLegacy
        });
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
        badges.appendChild(createBadge(LIGHT_LABELS[reagent.lightSensitive], reagent.lightSensitive === "yes" ? "requirement-light" : "requirement-neutral"));
        if (reagent.sealedStorage === "yes") {
            badges.appendChild(createBadge(SEALED_LABELS[reagent.sealedStorage], "requirement-sealed"));
        } else if (reagent.sealedStorage === "no") {
            badges.appendChild(createBadge(SEALED_LABELS[reagent.sealedStorage], "requirement-neutral"));
        } else {
            badges.appendChild(createBadge(SEALED_LABELS[reagent.sealedStorage], "requirement-neutral"));
        }
        storageCell.appendChild(badges);

        appendTextElement(molecularCell, "span", "molecular-weight", reagent.molecularWeight || "—");

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
            reagent.molecularWeight,
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
        elements.molecularWeight.value = reagent.molecularWeight || "";
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

    function downloadTextFile(content, mimeType, filename) {
        var blob = new Blob([content], { type: mimeType });
        var downloadUrl = URL.createObjectURL(blob);
        var link = document.createElement("a");

        link.href = downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(function () {
            URL.revokeObjectURL(downloadUrl);
        }, 0);
    }

    function exportJsonBackup() {
        var payload;

        payload = {
            app: DATA_APP,
            version: DATA_VERSION,
            exportedAt: new Date().toISOString(),
            reagents: reagents
        };
        downloadTextFile(
            JSON.stringify(payload, null, 2),
            "application/json",
            "lab-reagents-backup-" + getDateStamp() + ".json"
        );
    }

    function exportData() {
        var format = elements.exportFormat.value;

        if (reagents.length === 0) {
            setStatus("当前没有可导出的试剂记录；如需开始填写，请下载 Excel 模板。", true);
            return;
        }

        try {
            if (format === "json") {
                exportJsonBackup();
            } else {
                writeSpreadsheetFile(
                    createSpreadsheetWorkbook(reagents),
                    format,
                    "lab-reagents-" + getDateStamp()
                );
            }
            setStatus("已导出 " + reagents.length + " 条试剂记录（" + format.toUpperCase() + "）。", false);
        } catch (error) {
            setStatus(error.message || "导出失败，请刷新页面后重试。", true);
        }
    }

    function downloadExcelTemplate() {
        var format = elements.exportFormat.value;

        if (format !== "xlsx" && format !== "xls") {
            setStatus("请先选择 .xlsx 或 .xls 格式，再下载 Excel 模板。", true);
            return;
        }

        try {
            writeSpreadsheetFile(
                createSpreadsheetWorkbook([]),
                format,
                "lab-reagents-template"
            );
            setStatus("Excel 模板已下载。请在“试剂清单”工作表中填写数据。", false);
        } catch (error) {
            setStatus(error.message || "Excel 模板生成失败，请刷新页面后重试。", true);
        }
    }

    function updateTemplateButtonState() {
        var unavailable = elements.exportFormat.value === "json";

        elements.templateButton.disabled = unavailable;
        elements.templateButton.title = unavailable ? "请先选择一种 Excel 格式" : "";
    }

    function exportLegacyBackup() {
        if (!legacyRawData) {
            elements.exportLegacyButton.hidden = true;
            setStatus("没有检测到可导出的旧耗材数据。", true);
            return;
        }

        downloadTextFile(
            legacyRawData,
            "application/json",
            "lab-consumables-legacy-backup-" + getDateStamp() + ".json"
        );
        setStatus("旧耗材数据已按原始内容导出；浏览器中的旧数据仍保留。", false);
    }

    function parseJsonImport(text) {
        var parsed;

        try {
            parsed = JSON.parse(String(text).replace(/^\uFEFF/, ""));
        } catch (error) {
            throw new Error("JSON 文件无法解析，请确认文件没有损坏或被错误修改。");
        }

        if (!parsed || parsed.app !== DATA_APP || parsed.version !== DATA_VERSION || !Array.isArray(parsed.reagents)) {
            throw new Error("文件不是可识别的试剂备份，或备份版本不受支持。");
        }

        return normalizeCollection(parsed.reagents);
    }

    function excelColumnKeyForHeader(value) {
        var normalized = normalizeExcelHeader(value);
        var matchingColumn = EXCEL_COLUMNS.find(function (column) {
            return column.aliases.some(function (alias) {
                return normalizeExcelHeader(alias) === normalized;
            });
        });

        return matchingColumn ? matchingColumn.key : "";
    }

    function recognizedExcelHeaders(row) {
        var keys = new Set();

        row.forEach(function (value) {
            var key = excelColumnKeyForHeader(value);
            if (key) {
                keys.add(key);
            }
        });
        return keys;
    }

    function createExcelHeaderMap(row) {
        var headerMap = Object.create(null);
        var missingHeaders;

        row.forEach(function (value, columnIndex) {
            var key = excelColumnKeyForHeader(value);

            if (!key) {
                return;
            }
            if (headerMap[key] !== undefined) {
                throw new Error("Excel 表头“" + String(value).trim() + "”重复，请删除重复列后再导入。");
            }
            headerMap[key] = columnIndex;
        });

        missingHeaders = EXCEL_COLUMNS.filter(function (column) {
            return !column.optional && headerMap[column.key] === undefined;
        }).map(function (column) {
            return column.header;
        });

        if (missingHeaders.length > 0) {
            throw new Error("Excel 缺少必需表头：" + missingHeaders.join("、") + "。请使用页面提供的模板。");
        }

        return headerMap;
    }

    function locateExcelTable(workbook, xlsx) {
        var requiredHeaderCount = EXCEL_COLUMNS.filter(function (column) {
            return !column.optional;
        }).length;
        var sheetNames = workbook.SheetNames.slice();
        var preferredIndex = sheetNames.indexOf(EXCEL_DATA_SHEET_NAME);

        if (preferredIndex > 0) {
            sheetNames.splice(preferredIndex, 1);
            sheetNames.unshift(EXCEL_DATA_SHEET_NAME);
        }

        for (var sheetIndex = 0; sheetIndex < sheetNames.length; sheetIndex += 1) {
            var sheet = workbook.Sheets[sheetNames[sheetIndex]];
            var sheetRange;
            var previewRange;
            var previewRows;

            if (!sheet || !sheet["!ref"]) {
                continue;
            }
            sheetRange = xlsx.utils.decode_range(sheet["!ref"]);
            previewRange = {
                s: { r: sheetRange.s.r, c: sheetRange.s.c },
                e: {
                    r: Math.min(sheetRange.s.r + 9, sheetRange.e.r),
                    c: Math.min(sheetRange.s.c + MAX_EXCEL_COLUMNS - 1, sheetRange.e.c)
                }
            };
            previewRows = xlsx.utils.sheet_to_json(sheet, {
                header: 1,
                raw: true,
                defval: "",
                blankrows: true,
                range: xlsx.utils.encode_range(previewRange)
            });

            for (var rowIndex = 0; rowIndex < previewRows.length; rowIndex += 1) {
                if (recognizedExcelHeaders(previewRows[rowIndex]).size >= requiredHeaderCount) {
                    return {
                        sheet: sheet,
                        sheetName: sheetNames[sheetIndex],
                        headerRow: sheetRange.s.r + rowIndex,
                        startColumn: sheetRange.s.c,
                        headerMap: createExcelHeaderMap(previewRows[rowIndex])
                    };
                }
            }
        }

        throw new Error("Excel 中找不到完整的试剂表头。请下载并使用页面提供的模板。");
    }

    function excelRowIsBlank(row, headerMap) {
        return EXCEL_COLUMNS.filter(function (column) {
            return !column.optional;
        }).every(function (column) {
            var value = row[headerMap[column.key]];
            return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
        });
    }

    function excelRowToReagent(row, headerMap, seenIds) {
        var idValue = headerMap.id === undefined ? "" : excelCellToText(row[headerMap.id], "记录 ID");
        var existingReagent;
        var now = new Date().toISOString();

        if (idValue && seenIds.has(idValue)) {
            throw new Error("记录 ID 重复；复制现有行创建新试剂时，请清空记录 ID。");
        }
        if (idValue) {
            seenIds.add(idValue);
        }
        existingReagent = idValue ? reagents.find(function (reagent) {
            return reagent.id === idValue;
        }) : null;

        return normalizeReagent({
            id: idValue || createId(),
            chineseName: excelCellToText(row[headerMap.chineseName], "中文名称"),
            englishName: excelCellToText(row[headerMap.englishName], "英文名称"),
            casNumber: excelCellToText(row[headerMap.casNumber], "CAS 号"),
            specification: excelCellToText(row[headerMap.specification], "规格"),
            brand: excelCellToText(row[headerMap.brand], "品牌"),
            lotNumber: excelCellToText(row[headerMap.lotNumber], "批号"),
            storageTemperature: excelTemperatureToValue(row[headerMap.storageTemperature]),
            lightSensitive: excelRequirementToValue(row[headerMap.lightSensitive], "light"),
            sealedStorage: excelRequirementToValue(row[headerMap.sealedStorage], "sealed"),
            molecularWeight: excelCellToText(row[headerMap.molecularWeight], "分子量"),
            quantity: row[headerMap.quantity],
            location: excelCellToText(row[headerMap.location], "存放地"),
            notes: excelCellToText(row[headerMap.notes], "备注"),
            createdAt: existingReagent ? existingReagent.createdAt : now,
            updatedAt: now
        });
    }

    function excelFormulaField(sheet, headerMap, rowIndex, startColumn, xlsx) {
        var formulaColumn = EXCEL_COLUMNS.find(function (column) {
            var relativeColumn = headerMap[column.key];
            var cell;

            if (relativeColumn === undefined) {
                return false;
            }
            cell = sheet[xlsx.utils.encode_cell({
                r: rowIndex,
                c: startColumn + relativeColumn
            })];
            return Boolean(cell && typeof cell.f === "string" && cell.f.trim());
        });

        return formulaColumn ? formulaColumn.header : "";
    }

    function parseSpreadsheetImport(arrayBuffer) {
        var xlsx = getSpreadsheetLibrary();
        var workbook;
        var table;
        var range;
        var rows;
        var importedReagents = [];
        var errors = [];
        var seenIds = new Set();
        var nonBlankCount = 0;

        try {
            workbook = xlsx.read(arrayBuffer, {
                type: "array",
                sheetRows: MAX_RECORDS + 12,
                cellFormula: true,
                cellHTML: false,
                cellStyles: false,
                bookVBA: false
            });
        } catch (error) {
            throw new Error("Excel 文件无法读取，可能已损坏、加密或格式不受支持。请在 Excel 中另存为未加密的 .xlsx 后重试。");
        }

        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            throw new Error("Excel 文件中没有可读取的工作表。");
        }
        if (workbook.SheetNames.length > 50) {
            throw new Error("Excel 文件包含过多工作表，无法导入。");
        }

        table = locateExcelTable(workbook, xlsx);
        range = xlsx.utils.decode_range(table.sheet["!ref"]);
        range.s.r = table.headerRow;
        range.e.c = Math.min(range.s.c + MAX_EXCEL_COLUMNS - 1, range.e.c);
        rows = xlsx.utils.sheet_to_json(table.sheet, {
            header: 1,
            raw: true,
            defval: "",
            blankrows: true,
            range: xlsx.utils.encode_range(range)
        }).slice(1);

        rows.forEach(function (row, rowIndex) {
            var excelRowNumber = table.headerRow + rowIndex + 2;
            var formulaField = excelFormulaField(
                table.sheet,
                table.headerMap,
                table.headerRow + rowIndex + 1,
                table.startColumn,
                xlsx
            );

            if (formulaField) {
                nonBlankCount += 1;
                if (errors.length < MAX_EXCEL_ERRORS) {
                    errors.push("第 " + excelRowNumber + " 行“" + formulaField + "”含公式，请在 Excel 中复制并粘贴为值");
                }
                return;
            }

            if (excelRowIsBlank(row, table.headerMap)) {
                return;
            }
            nonBlankCount += 1;
            if (nonBlankCount > MAX_RECORDS) {
                return;
            }

            try {
                importedReagents.push(excelRowToReagent(row, table.headerMap, seenIds));
            } catch (error) {
                if (errors.length < MAX_EXCEL_ERRORS) {
                    errors.push("第 " + excelRowNumber + " 行：" + (error.message || "数据格式不正确"));
                }
            }
        });

        if (nonBlankCount > MAX_RECORDS) {
            throw new Error("Excel 中的试剂记录超过 10000 条，无法导入。");
        }
        if (errors.length > 0) {
            throw new Error("Excel 数据校验失败，当前清单未更改。" + errors.join("；") + (errors.length === MAX_EXCEL_ERRORS ? "；请修正后重新导入。" : ""));
        }

        return importedReagents;
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

    function readFileArrayBuffer(file) {
        if (typeof file.arrayBuffer === "function") {
            return file.arrayBuffer();
        }

        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.addEventListener("load", function () {
                resolve(reader.result);
            });
            reader.addEventListener("error", function () {
                reject(new Error("Excel 文件读取失败。"));
            });
            reader.readAsArrayBuffer(file);
        });
    }

    function importFileExtension(filename) {
        var match = String(filename || "").toLocaleLowerCase("en-US").match(/\.([^.]+)$/);
        return match ? match[1] : "";
    }

    function handleImportFile(event) {
        var file = event.target.files && event.target.files[0];
        var extension;
        var importPromise;

        if (!file) {
            return;
        }
        extension = importFileExtension(file.name);
        if (["json", "xlsx", "xls"].indexOf(extension) === -1) {
            setStatus("请选择 .xlsx、.xls 或 .json 文件。", true);
            elements.importFileInput.value = "";
            return;
        }
        if (file.size === 0) {
            setStatus("所选文件为空，当前清单未更改。", true);
            elements.importFileInput.value = "";
            return;
        }
        if (file.size > MAX_IMPORT_BYTES) {
            setStatus("文件超过 5 MB，无法导入。", true);
            elements.importFileInput.value = "";
            return;
        }

        setStatus("正在读取“" + file.name + "”…", false);
        importPromise = extension === "json" ?
            readFileText(file).then(parseJsonImport) :
            readFileArrayBuffer(file).then(parseSpreadsheetImport);

        importPromise.then(function (importedReagents) {
            if (importedReagents.length === 0) {
                throw new Error("文件只有表头或没有试剂记录，当前清单未更改。");
            }
            pendingImportReagents = importedReagents;
            elements.importForm.reset();
            clearDialogStatus(elements.importDialogStatus);
            elements.importSummary.textContent = "已从“" + file.name + "”读取 " + pendingImportReagents.length + " 条试剂记录，请选择导入方式。";
            showDialog(elements.importDialog, elements.importForm.querySelector("input[name='importMode']"));
        }).catch(function (error) {
            pendingImportReagents = null;
            setStatus(error.message || "文件读取失败，请检查文件后重试。", true);
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
        if (!pendingImportReagents || pendingImportReagents.length === 0) {
            closeDialog(elements.importDialog);
            setStatus("没有可导入的试剂数据，当前清单未更改。", true);
            return;
        }

        if (mode === "replace") {
            confirmed = window.confirm("替换会删除当前清单中未出现在文件里的记录，并以导入文件为准。确定继续吗？");
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

        elements.exportButton.addEventListener("click", exportData);
        elements.exportFormat.addEventListener("change", updateTemplateButtonState);
        elements.templateButton.addEventListener("click", downloadExcelTemplate);
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
        updateTemplateButtonState();
        bindEvents();
        render();

        if (initialStatus) {
            setStatus(initialStatus, initialStatusIsError);
        }
    });
}());
