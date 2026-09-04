(function () {
    "use strict";

    var STORAGE_KEY = "kuan.todayTodos.v1";
    var DATA_APP = "kuan-today-todos";
    var DATA_VERSION = 1;
    var MAX_IMPORT_BYTES = 16 * 1024 * 1024;
    var MAX_TASKS = 10000;
    var MAX_TASK_LENGTH = 240;
    var MAX_EXCEL_ERRORS = 10;
    var MAX_EXCEL_COLUMNS = 50;
    var EXCEL_DATA_SHEET_NAME = "待办记录";
    var EXCEL_HELP_SHEET_NAME = "填写说明";
    var ALLOWED_STATUSES = ["pending", "completed"];
    var EXCEL_COLUMNS = [
        { key: "date", header: "日期", aliases: ["日期", "记录日期"] },
        { key: "text", header: "事项内容", aliases: ["事项内容", "事项", "待办事项", "今日待办"] },
        { key: "status", header: "状态", aliases: ["状态", "完成状态"] },
        { key: "createdAt", header: "创建时间（选填）", aliases: ["创建时间（选填）", "创建时间(选填)", "创建时间"], optional: true },
        { key: "updatedAt", header: "更新时间（选填）", aliases: ["更新时间（选填）", "更新时间(选填)", "更新时间"], optional: true },
        { key: "completedAt", header: "完成时间（选填）", aliases: ["完成时间（选填）", "完成时间(选填)", "完成时间"], optional: true },
        { key: "endedAt", header: "今日结束时间（选填）", aliases: ["今日结束时间（选填）", "今日结束时间(选填)", "今日结束时间", "归档时间"], optional: true },
        { key: "id", header: "记录ID（请勿修改）", aliases: ["记录ID（请勿修改）", "记录ID(请勿修改)", "记录ID", "系统ID"], optional: true }
    ];

    var dataState = createEmptyState();
    var currentTodayKey = localDateKey(new Date());
    var calendarCursor = firstDayOfMonth(new Date());
    var pendingImportState = null;
    var editingDateKey = "";
    var initialStatus = "";
    var initialStatusIsError = false;
    var storageReadFailed = false;
    var dateCheckTimer = null;
    var dialogReturnFocus = new Map();
    var celebrationFrame = null;
    var celebrationTimer = null;
    var celebrationResizeHandler = null;
    var elements = {};

    function cacheElements() {
        elements.todayDate = document.getElementById("todayDate");
        elements.calendarJumpButton = document.getElementById("calendarJumpButton");
        elements.finishDayButton = document.getElementById("finishDayButton");
        elements.totalTasks = document.getElementById("totalTasks");
        elements.pendingTasks = document.getElementById("pendingTasks");
        elements.completedTasks = document.getElementById("completedTasks");
        elements.dayStatus = document.getElementById("dayStatus");
        elements.dayStatusHint = document.getElementById("dayStatusHint");
        elements.quickAddForm = document.getElementById("quickAddForm");
        elements.taskText = document.getElementById("taskText");
        elements.pendingCount = document.getElementById("pendingCount");
        elements.completedCount = document.getElementById("completedCount");
        elements.pendingTitle = document.getElementById("pendingTitle");
        elements.completedTitle = document.getElementById("completedTitle");
        elements.pendingList = document.getElementById("pendingList");
        elements.completedList = document.getElementById("completedList");
        elements.pendingEmpty = document.getElementById("pendingEmpty");
        elements.completedEmpty = document.getElementById("completedEmpty");
        elements.calendarSection = document.getElementById("calendarSection");
        elements.currentMonthButton = document.getElementById("currentMonthButton");
        elements.previousMonthButton = document.getElementById("previousMonthButton");
        elements.nextMonthButton = document.getElementById("nextMonthButton");
        elements.calendarMonthLabel = document.getElementById("calendarMonthLabel");
        elements.calendarBody = document.getElementById("calendarBody");
        elements.exportFormat = document.getElementById("exportFormat");
        elements.exportButton = document.getElementById("exportButton");
        elements.templateButton = document.getElementById("templateButton");
        elements.importButton = document.getElementById("importButton");
        elements.importFileInput = document.getElementById("importFileInput");
        elements.todoStatus = document.getElementById("todoStatus");

        elements.editDialog = document.getElementById("editDialog");
        elements.editForm = document.getElementById("editForm");
        elements.editingTaskId = document.getElementById("editingTaskId");
        elements.editingTaskText = document.getElementById("editingTaskText");
        elements.editDialogStatus = document.getElementById("editDialogStatus");
        elements.closeEditDialogButton = document.getElementById("closeEditDialogButton");
        elements.cancelEditButton = document.getElementById("cancelEditButton");

        elements.dayDialog = document.getElementById("dayDialog");
        elements.dayDialogTitle = document.getElementById("dayDialogTitle");
        elements.dayDialogSummary = document.getElementById("dayDialogSummary");
        elements.dayDialogContent = document.getElementById("dayDialogContent");
        elements.closeDayDialogButton = document.getElementById("closeDayDialogButton");
        elements.confirmDayDialogButton = document.getElementById("confirmDayDialogButton");

        elements.importDialog = document.getElementById("importDialog");
        elements.importForm = document.getElementById("importForm");
        elements.importSummary = document.getElementById("importSummary");
        elements.importDialogStatus = document.getElementById("importDialogStatus");
        elements.closeImportDialogButton = document.getElementById("closeImportDialogButton");
        elements.cancelImportButton = document.getElementById("cancelImportButton");

        elements.celebrationOverlay = document.getElementById("celebrationOverlay");
        elements.fireworksCanvas = document.getElementById("fireworksCanvas");
        elements.celebrationSummary = document.getElementById("celebrationSummary");
    }

    function createEmptyState() {
        return {
            days: {},
            updatedAt: ""
        };
    }

    function padNumber(value) {
        return String(value).padStart(2, "0");
    }

    function localDateKey(date) {
        return date.getFullYear() + "-" + padNumber(date.getMonth() + 1) + "-" + padNumber(date.getDate());
    }

    function dateKeyFromParts(year, month, day) {
        return String(year).padStart(4, "0") + "-" + padNumber(month) + "-" + padNumber(day);
    }

    function localDateFromKey(dateKey) {
        var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey));
        var date;

        if (!match) {
            return null;
        }
        date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
        if (date.getFullYear() !== Number(match[1]) ||
                date.getMonth() !== Number(match[2]) - 1 ||
                date.getDate() !== Number(match[3])) {
            return null;
        }
        return date;
    }

    function normalizeDateKey(value) {
        var dateKey = typeof value === "string" ? value.trim() : "";

        if (!localDateFromKey(dateKey)) {
            throw new Error("日期格式不正确，应为 YYYY-MM-DD。");
        }
        return dateKey;
    }

    function firstDayOfMonth(date) {
        return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
    }

    function createId() {
        if (window.crypto && typeof window.crypto.randomUUID === "function") {
            return window.crypto.randomUUID();
        }
        return "todo-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    }

    function normalizeId(value) {
        if (value === undefined || value === null || value === "") {
            return createId();
        }
        if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > 120) {
            throw new Error("记录 ID 格式不正确。");
        }
        return value.trim();
    }

    function normalizeTaskText(value) {
        var text;

        if (typeof value !== "string") {
            throw new Error("事项内容必须是文字。");
        }
        text = value.trim();
        if (!text) {
            throw new Error("事项内容不能为空。");
        }
        if (text.length > MAX_TASK_LENGTH) {
            throw new Error("事项内容不能超过 240 个字符。");
        }
        return text;
    }

    function normalizeStatus(value) {
        if (typeof value !== "string" || ALLOWED_STATUSES.indexOf(value) === -1) {
            throw new Error("事项状态不正确。");
        }
        return value;
    }

    function normalizeTimestamp(value, label, fallback) {
        var text;
        var timestamp;

        if (value === undefined || value === null || value === "") {
            return fallback || "";
        }
        if (typeof value !== "string") {
            throw new Error(label + "格式不正确。");
        }
        text = value.trim();
        if (text.length > 80) {
            throw new Error(label + "格式不正确。");
        }
        timestamp = Date.parse(text);
        if (Number.isNaN(timestamp)) {
            throw new Error(label + "格式不正确。");
        }
        return new Date(timestamp).toISOString();
    }

    function defaultTimestampForDate(dateKey, index) {
        var date = localDateFromKey(dateKey);

        date.setHours(9, Number(index || 0) % 60, 0, 0);
        return date.toISOString();
    }

    function normalizeTask(rawTask, dateKey, index) {
        var status;
        var createdAt;
        var updatedAt;
        var completedAt;

        if (!rawTask || typeof rawTask !== "object" || Array.isArray(rawTask)) {
            throw new Error("事项记录格式不正确。");
        }
        status = normalizeStatus(rawTask.status);
        createdAt = normalizeTimestamp(rawTask.createdAt, "创建时间", defaultTimestampForDate(dateKey, index));
        updatedAt = normalizeTimestamp(rawTask.updatedAt, "更新时间", createdAt);
        completedAt = status === "completed" ?
            normalizeTimestamp(rawTask.completedAt, "完成时间", updatedAt) : "";

        return {
            id: normalizeId(rawTask.id),
            text: normalizeTaskText(rawTask.text),
            status: status,
            createdAt: createdAt,
            updatedAt: updatedAt,
            completedAt: completedAt
        };
    }

    function normalizeState(rawState) {
        var normalizedState = createEmptyState();
        var rawDays;
        var seenIds = new Set();
        var taskCount = 0;

        if (!rawState || typeof rawState !== "object" || Array.isArray(rawState)) {
            throw new Error("待办数据格式不正确。");
        }
        rawDays = rawState.days;
        if (!rawDays || typeof rawDays !== "object" || Array.isArray(rawDays)) {
            throw new Error("待办数据中没有可读取的每日记录。");
        }

        Object.keys(rawDays).sort().forEach(function (rawDateKey) {
            var dateKey = normalizeDateKey(rawDateKey);
            var rawDay = rawDays[rawDateKey];
            var day;

            if (!rawDay || typeof rawDay !== "object" || Array.isArray(rawDay) || !Array.isArray(rawDay.tasks)) {
                throw new Error(dateKey + " 的每日记录格式不正确。");
            }
            if (rawDay.date && normalizeDateKey(rawDay.date) !== dateKey) {
                throw new Error(dateKey + " 的日期字段不一致。");
            }
            day = {
                date: dateKey,
                endedAt: normalizeTimestamp(rawDay.endedAt, "今日结束时间", ""),
                updatedAt: normalizeTimestamp(rawDay.updatedAt, "每日更新时间", ""),
                tasks: []
            };
            rawDay.tasks.forEach(function (rawTask, index) {
                var task = normalizeTask(rawTask, dateKey, index);

                taskCount += 1;
                if (taskCount > MAX_TASKS) {
                    throw new Error("待办记录超过 10000 条，无法读取。");
                }
                if (seenIds.has(task.id)) {
                    throw new Error("待办数据中存在重复的记录 ID。");
                }
                seenIds.add(task.id);
                day.tasks.push(task);
            });
            if (!day.updatedAt) {
                day.updatedAt = day.tasks.reduce(function (latest, task) {
                    return task.updatedAt > latest ? task.updatedAt : latest;
                }, day.endedAt || "");
            }
            normalizedState.days[dateKey] = day;
        });

        normalizedState.updatedAt = normalizeTimestamp(rawState.updatedAt, "数据更新时间", "");
        return normalizedState;
    }

    function cloneState(sourceState) {
        return JSON.parse(JSON.stringify(sourceState));
    }

    function statePayload(sourceState) {
        return {
            app: DATA_APP,
            version: DATA_VERSION,
            updatedAt: sourceState.updatedAt || new Date().toISOString(),
            days: sourceState.days
        };
    }

    function loadState() {
        var rawData;
        var parsed;

        storageReadFailed = false;
        try {
            rawData = window.localStorage.getItem(STORAGE_KEY);
        } catch (error) {
            storageReadFailed = true;
            initialStatus = "浏览器不允许读取本地待办数据；请检查隐私设置。";
            initialStatusIsError = true;
            return createEmptyState();
        }
        if (!rawData) {
            return createEmptyState();
        }
        try {
            parsed = JSON.parse(rawData);
            if (!parsed || parsed.app !== DATA_APP || parsed.version !== DATA_VERSION) {
                throw new Error("版本不受支持");
            }
            return normalizeState(parsed);
        } catch (error) {
            storageReadFailed = true;
            initialStatus = "现有本地待办数据无法读取；在覆盖前请先保留浏览器中的原始数据。";
            initialStatusIsError = true;
            return createEmptyState();
        }
    }

    function setStatus(message, isError) {
        elements.todoStatus.textContent = message || "";
        elements.todoStatus.classList.toggle("is-error", Boolean(isError));
    }

    function setDialogStatus(element, message, isError) {
        element.textContent = message || "";
        element.classList.toggle("is-error", Boolean(isError));
    }

    function commitState(nextState, successMessage) {
        var normalized;
        var confirmed;

        try {
            normalized = normalizeState(nextState);
            normalized.updatedAt = new Date().toISOString();
        } catch (error) {
            setStatus(error.message || "待办数据校验失败。", true);
            return false;
        }

        if (storageReadFailed) {
            confirmed = window.confirm("现有本地待办数据无法读取。继续保存会覆盖损坏数据，确定继续吗？");
            if (!confirmed) {
                setStatus("已取消保存，现有本地数据未被覆盖。", true);
                return false;
            }
        }
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(statePayload(normalized)));
        } catch (error) {
            setStatus("保存失败，浏览器本地空间可能不足或被禁用。请先导出现有记录。", true);
            return false;
        }

        dataState = normalized;
        storageReadFailed = false;
        render();
        setStatus(successMessage, false);
        return true;
    }

    function getDay(sourceState, dateKey) {
        return sourceState.days[dateKey] || null;
    }

    function ensureDay(sourceState, dateKey) {
        if (!sourceState.days[dateKey]) {
            sourceState.days[dateKey] = {
                date: dateKey,
                endedAt: "",
                updatedAt: "",
                tasks: []
            };
        }
        return sourceState.days[dateKey];
    }

    function findTask(sourceState, taskId) {
        var result = null;

        Object.keys(sourceState.days).some(function (dateKey) {
            var day = sourceState.days[dateKey];
            var taskIndex = day.tasks.findIndex(function (task) {
                return task.id === taskId;
            });

            if (taskIndex === -1) {
                return false;
            }
            result = {
                dateKey: dateKey,
                day: day,
                task: day.tasks[taskIndex],
                taskIndex: taskIndex
            };
            return true;
        });
        return result;
    }

    function totalTaskCount(sourceState) {
        return Object.keys(sourceState.days).reduce(function (sum, dateKey) {
            return sum + sourceState.days[dateKey].tasks.length;
        }, 0);
    }

    function ensureImportDatesAreNotFuture(sourceState) {
        Object.keys(sourceState.days).forEach(function (dateKey) {
            if (dateKey > currentTodayKey) {
                throw new Error("导入记录中的日期不能晚于今天。");
            }
        });
        return sourceState;
    }

    function dayCounts(day) {
        var completed = day ? day.tasks.filter(function (task) {
            return task.status === "completed";
        }).length : 0;
        var total = day ? day.tasks.length : 0;

        return {
            total: total,
            completed: completed,
            pending: total - completed
        };
    }

    function formatFullDate(dateKey) {
        var date = localDateFromKey(dateKey);

        return new Intl.DateTimeFormat("zh-CN", {
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "long"
        }).format(date);
    }

    function formatMonth(date) {
        return new Intl.DateTimeFormat("zh-CN", {
            year: "numeric",
            month: "long"
        }).format(date);
    }

    function formatTime(timestamp) {
        if (!timestamp) {
            return "";
        }
        return new Intl.DateTimeFormat("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        }).format(new Date(timestamp));
    }

    function refreshTodayContext(announce) {
        var nextTodayKey = localDateKey(new Date());

        if (nextTodayKey === currentTodayKey) {
            return false;
        }
        currentTodayKey = nextTodayKey;
        calendarCursor = firstDayOfMonth(new Date());
        render();
        if (announce) {
            setStatus("日期已更新，正在记录新一天的待办事项。", false);
        }
        return true;
    }

    function createTaskAction(label, action, task, dateKey, className) {
        var button = document.createElement("button");
        var taskSummary = task.text.replace(/\s+/g, " ");

        button.type = "button";
        button.className = "task-action" + (className ? " " + className : "");
        button.dataset.action = action;
        button.dataset.id = task.id;
        button.dataset.date = dateKey;
        button.textContent = label;
        button.setAttribute("aria-label", label + "：" + taskSummary.slice(0, 80));
        return button;
    }

    function findRenderedTaskButton(taskId, action) {
        return Array.from(document.querySelectorAll("button[data-id][data-action]")).find(function (button) {
            return button.dataset.id === taskId && button.dataset.action === action;
        }) || null;
    }

    function focusAfterTaskMutation(taskId, action, wasCompleted) {
        var targetButton;
        var targetHeading;

        if (action === "complete" || action === "reopen") {
            targetButton = findRenderedTaskButton(taskId, action === "complete" ? "reopen" : "complete");
        } else if (action === "delete") {
            targetButton = (wasCompleted ? elements.completedList : elements.pendingList).querySelector("button[data-action]");
            targetHeading = wasCompleted ? elements.completedTitle : elements.pendingTitle;
        }
        if (targetButton) {
            targetButton.focus();
        } else if (targetHeading) {
            targetHeading.focus();
        }
    }

    function renderTaskList(listElement, tasks, dateKey, completed) {
        listElement.replaceChildren();
        tasks.forEach(function (task) {
            var item = document.createElement("li");
            var copy = document.createElement("div");
            var text = document.createElement("p");
            var meta = document.createElement("span");
            var actions = document.createElement("div");

            item.className = "task-item" + (completed ? " is-completed" : "");
            copy.className = "task-copy";
            text.className = "task-text";
            text.textContent = task.text;
            meta.className = "task-meta";
            meta.textContent = completed ? "完成于 " + formatTime(task.completedAt) : "创建于 " + formatTime(task.createdAt);
            copy.appendChild(text);
            copy.appendChild(meta);

            actions.className = "task-actions";
            if (completed) {
                actions.appendChild(createTaskAction("退回未完成", "reopen", task, dateKey, "task-action-complete"));
            } else {
                actions.appendChild(createTaskAction("完成", "complete", task, dateKey, "task-action-complete"));
            }
            actions.appendChild(createTaskAction("编辑", "edit", task, dateKey, ""));
            actions.appendChild(createTaskAction("删除", "delete", task, dateKey, "task-action-danger"));
            item.appendChild(copy);
            item.appendChild(actions);
            listElement.appendChild(item);
        });
    }

    function renderToday() {
        var day = getDay(dataState, currentTodayKey);
        var counts = dayCounts(day);
        var pending = day ? day.tasks.filter(function (task) {
            return task.status === "pending";
        }) : [];
        var completed = day ? day.tasks.filter(function (task) {
            return task.status === "completed";
        }) : [];
        var isEnded = Boolean(day && day.endedAt);

        elements.todayDate.textContent = formatFullDate(currentTodayKey);
        elements.totalTasks.textContent = String(counts.total);
        elements.pendingTasks.textContent = String(counts.pending);
        elements.completedTasks.textContent = String(counts.completed);
        elements.pendingCount.textContent = counts.pending + " 项";
        elements.completedCount.textContent = counts.completed + " 项";
        elements.dayStatus.textContent = isEnded ? "已归档" : "进行中";
        elements.dayStatus.classList.toggle("is-ended", isEnded);
        elements.dayStatusHint.textContent = isEnded ? "记录已保存到历史日历" : "完成后点击“今日结束”";
        elements.finishDayButton.textContent = isEnded ? "今日已结束" : "今日结束";
        elements.finishDayButton.classList.toggle("is-ended", isEnded);
        elements.finishDayButton.setAttribute("aria-pressed", isEnded ? "true" : "false");

        renderTaskList(elements.pendingList, pending, currentTodayKey, false);
        renderTaskList(elements.completedList, completed, currentTodayKey, true);
        elements.pendingEmpty.hidden = pending.length > 0;
        elements.completedEmpty.hidden = completed.length > 0;
    }

    function calendarAriaLabel(dateKey, counts, endedAt) {
        var statusText = counts.total === 0 ? "没有事项" :
            "完成 " + counts.completed + " 项，未完成 " + counts.pending + " 项";

        return formatFullDate(dateKey) + "，" + statusText + (endedAt ? "，今日已结束" : "，尚未结束");
    }

    function renderCalendar() {
        var year = calendarCursor.getFullYear();
        var month = calendarCursor.getMonth();
        var firstDate = new Date(year, month, 1, 12, 0, 0, 0);
        var firstOffset = (firstDate.getDay() + 6) % 7;
        var daysInMonth = new Date(year, month + 1, 0, 12, 0, 0, 0).getDate();
        var totalCells = Math.ceil((firstOffset + daysInMonth) / 7) * 7;
        var currentMonth = firstDayOfMonth(new Date());

        elements.calendarMonthLabel.textContent = formatMonth(calendarCursor);
        elements.nextMonthButton.disabled = calendarCursor.getTime() >= currentMonth.getTime();
        elements.calendarBody.replaceChildren();

        for (var rowIndex = 0; rowIndex < totalCells / 7; rowIndex += 1) {
            var row = document.createElement("tr");

            for (var columnIndex = 0; columnIndex < 7; columnIndex += 1) {
                var cellIndex = rowIndex * 7 + columnIndex;
                var dayNumber = cellIndex - firstOffset + 1;
                var cell = document.createElement("td");

                if (dayNumber < 1 || dayNumber > daysInMonth) {
                    cell.className = "calendar-empty-cell";
                    cell.setAttribute("aria-hidden", "true");
                } else {
                    var dateKey = dateKeyFromParts(year, month + 1, dayNumber);
                    var day = getDay(dataState, dateKey);
                    var counts = dayCounts(day);
                    var button = document.createElement("button");
                    var number = document.createElement("span");
                    var summary = document.createElement("span");
                    var indicator = document.createElement("span");
                    var isFuture = dateKey > currentTodayKey;

                    button.type = "button";
                    button.className = "calendar-day";
                    button.dataset.date = dateKey;
                    button.disabled = isFuture;
                    button.setAttribute("aria-label", calendarAriaLabel(dateKey, counts, day && day.endedAt));
                    if (dateKey === currentTodayKey) {
                        button.classList.add("is-today");
                        button.setAttribute("aria-current", "date");
                    }
                    if (day && day.endedAt) {
                        button.classList.add("is-ended");
                    }
                    if (counts.total > 0) {
                        button.classList.add(counts.pending > 0 ? "has-pending" : "has-done");
                    }

                    number.className = "calendar-day-number";
                    number.textContent = String(dayNumber);
                    summary.className = "calendar-day-summary";
                    summary.textContent = counts.total ? counts.completed + "/" + counts.total + " 完成" : (isFuture ? "" : "无记录");
                    indicator.className = "calendar-day-indicator";
                    indicator.textContent = counts.total ? (counts.pending ? "待完成" : "已完成") : "";
                    button.appendChild(number);
                    button.appendChild(summary);
                    button.appendChild(indicator);
                    cell.appendChild(button);
                }
                row.appendChild(cell);
            }
            elements.calendarBody.appendChild(row);
        }
    }

    function render() {
        renderToday();
        renderCalendar();
        updateTemplateButtonState();
    }

    function mutateTodayTask(taskId, action, successMessage) {
        var actionDateKey = currentTodayKey;
        var nextState;
        var found;
        var now;
        var day;
        var wasEnded;
        var wasCompleted;

        refreshTodayContext(false);
        if (actionDateKey !== currentTodayKey) {
            setStatus("日期刚刚发生变化，请在新一天的清单中重新操作。", true);
            return false;
        }
        nextState = cloneState(dataState);
        found = findTask(nextState, taskId);
        if (!found || found.dateKey !== currentTodayKey) {
            setStatus("找不到这条今日事项，请刷新页面后重试。", true);
            return false;
        }
        day = found.day;
        wasEnded = Boolean(day.endedAt);
        wasCompleted = found.task.status === "completed";
        now = new Date().toISOString();

        if (action === "complete") {
            found.task.status = "completed";
            found.task.completedAt = now;
            found.task.updatedAt = now;
        } else if (action === "reopen") {
            found.task.status = "pending";
            found.task.completedAt = "";
            found.task.updatedAt = now;
        } else if (action === "delete") {
            day.tasks.splice(found.taskIndex, 1);
        } else {
            return false;
        }
        day.endedAt = "";
        day.updatedAt = now;
        if (day.tasks.length === 0) {
            delete nextState.days[currentTodayKey];
        }
        if (commitState(nextState, successMessage + (wasEnded ? " 今日记录有更新，请重新点击“今日结束”。" : ""))) {
            focusAfterTaskMutation(taskId, action, wasCompleted);
            return true;
        }
        return false;
    }

    function handleQuickAdd(event) {
        var text;
        var nextState;
        var day;
        var now;
        var wasEnded;

        event.preventDefault();
        refreshTodayContext(false);
        try {
            text = normalizeTaskText(elements.taskText.value);
        } catch (error) {
            elements.taskText.setCustomValidity(error.message);
            elements.taskText.reportValidity();
            return;
        }
        elements.taskText.setCustomValidity("");
        nextState = cloneState(dataState);
        day = ensureDay(nextState, currentTodayKey);
        wasEnded = Boolean(day.endedAt);
        now = new Date().toISOString();
        day.tasks.push({
            id: createId(),
            text: text,
            status: "pending",
            createdAt: now,
            updatedAt: now,
            completedAt: ""
        });
        day.endedAt = "";
        day.updatedAt = now;
        if (commitState(nextState, "已加入今日待办。" + (wasEnded ? " 今日记录已重新开启。" : ""))) {
            elements.quickAddForm.reset();
            elements.taskText.focus();
        }
    }

    function openEditDialog(task, dateKey, returnFocus) {
        editingDateKey = dateKey;
        elements.editingTaskId.value = task.id;
        elements.editingTaskText.value = task.text;
        setDialogStatus(elements.editDialogStatus, "", false);
        showDialog(elements.editDialog, elements.editingTaskText, returnFocus);
    }

    function handleEditSubmit(event) {
        var taskId = elements.editingTaskId.value;
        var text;
        var nextState;
        var found;
        var now;
        var wasEnded;

        event.preventDefault();
        refreshTodayContext(false);
        if (editingDateKey !== currentTodayKey) {
            setDialogStatus(elements.editDialogStatus, "日期已经变化，请关闭后在新一天重新操作。", true);
            return;
        }
        try {
            text = normalizeTaskText(elements.editingTaskText.value);
        } catch (error) {
            setDialogStatus(elements.editDialogStatus, error.message, true);
            return;
        }
        nextState = cloneState(dataState);
        found = findTask(nextState, taskId);
        if (!found || found.dateKey !== currentTodayKey) {
            setDialogStatus(elements.editDialogStatus, "找不到这条事项，它可能已在其他标签页中被修改。", true);
            return;
        }
        now = new Date().toISOString();
        wasEnded = Boolean(found.day.endedAt);
        found.task.text = text;
        found.task.updatedAt = now;
        found.day.endedAt = "";
        found.day.updatedAt = now;
        if (commitState(nextState, "事项已更新。" + (wasEnded ? " 今日记录已重新开启。" : ""))) {
            dialogReturnFocus.set(elements.editDialog, findRenderedTaskButton(taskId, "edit"));
            closeDialog(elements.editDialog);
        }
    }

    function handleTaskAction(event) {
        var button = event.target.closest("button[data-action]");
        var found;

        if (!button) {
            return;
        }
        refreshTodayContext(false);
        if (button.dataset.date !== currentTodayKey) {
            setStatus("日期刚刚发生变化，请在新一天的清单中重新操作。", true);
            return;
        }
        found = findTask(dataState, button.dataset.id);
        if (!found) {
            setStatus("找不到这条事项，请刷新页面后重试。", true);
            return;
        }

        if (button.dataset.action === "edit") {
            openEditDialog(found.task, found.dateKey, button);
        } else if (button.dataset.action === "complete") {
            mutateTodayTask(found.task.id, "complete", "已将事项标记为完成。");
        } else if (button.dataset.action === "reopen") {
            mutateTodayTask(found.task.id, "reopen", "事项已退回到待完成区域。");
        } else if (button.dataset.action === "delete") {
            if (window.confirm("确定删除“" + found.task.text + "”吗？此操作无法撤销。")) {
                mutateTodayTask(found.task.id, "delete", "事项已删除。");
            }
        }
    }

    function showDialog(dialog, initialFocus, returnFocus) {
        dialogReturnFocus.set(dialog, returnFocus || document.activeElement);
        if (typeof dialog.showModal === "function") {
            dialog.showModal();
        } else {
            dialog.setAttribute("open", "");
        }
        window.setTimeout(function () {
            if (initialFocus && typeof initialFocus.focus === "function") {
                initialFocus.focus();
            }
        }, 0);
    }

    function closeDialog(dialog) {
        if (!dialog.open && !dialog.hasAttribute("open")) {
            return;
        }
        if (typeof dialog.close === "function") {
            dialog.close();
        } else {
            dialog.removeAttribute("open");
            restoreDialogFocus(dialog);
        }
    }

    function restoreDialogFocus(dialog) {
        var returnFocus = dialogReturnFocus.get(dialog);

        dialogReturnFocus.delete(dialog);
        if (returnFocus && document.contains(returnFocus) && typeof returnFocus.focus === "function") {
            returnFocus.focus();
        }
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

    function appendDayRecordGroup(parent, title, tasks) {
        var group = document.createElement("section");
        var heading = document.createElement("h3");

        group.className = "day-record-group";
        heading.textContent = title + "（" + tasks.length + "）";
        group.appendChild(heading);
        if (tasks.length === 0) {
            var empty = document.createElement("p");
            empty.className = "day-record-empty";
            empty.textContent = "没有记录。";
            group.appendChild(empty);
        } else {
            var list = document.createElement("ul");
            list.className = "day-record-list";
            tasks.forEach(function (task) {
                var item = document.createElement("li");
                item.textContent = task.text;
                list.appendChild(item);
            });
            group.appendChild(list);
        }
        parent.appendChild(group);
    }

    function openDayDialog(dateKey, returnFocus) {
        var day = getDay(dataState, dateKey);
        var counts = dayCounts(day);
        var pending = day ? day.tasks.filter(function (task) {
            return task.status === "pending";
        }) : [];
        var completed = day ? day.tasks.filter(function (task) {
            return task.status === "completed";
        }) : [];

        elements.dayDialogTitle.textContent = formatFullDate(dateKey);
        elements.dayDialogSummary.textContent = counts.total === 0 ? "当天没有事项记录。" :
            "共 " + counts.total + " 项，完成 " + counts.completed + " 项，未完成 " + counts.pending + " 项。" +
            (day && day.endedAt ? " 已于 " + formatTime(day.endedAt) + " 结束今日。" : " 当天尚未点击“今日结束”。");
        elements.dayDialogContent.replaceChildren();
        appendDayRecordGroup(elements.dayDialogContent, "已完成", completed);
        appendDayRecordGroup(elements.dayDialogContent, "未完成", pending);
        showDialog(elements.dayDialog, elements.confirmDayDialogButton, returnFocus);
    }

    function handleCalendarClick(event) {
        var button = event.target.closest("button[data-date]");

        if (!button || button.disabled) {
            return;
        }
        openDayDialog(button.dataset.date, button);
    }

    function stopCelebration() {
        if (celebrationFrame !== null) {
            window.cancelAnimationFrame(celebrationFrame);
            celebrationFrame = null;
        }
        if (celebrationTimer !== null) {
            window.clearTimeout(celebrationTimer);
            celebrationTimer = null;
        }
        if (celebrationResizeHandler) {
            window.removeEventListener("resize", celebrationResizeHandler);
            celebrationResizeHandler = null;
        }
        if (elements.celebrationOverlay) {
            elements.celebrationOverlay.hidden = true;
        }
    }

    function playCelebration(completed, pending) {
        var overlay = elements.celebrationOverlay;
        var canvas = elements.fireworksCanvas;
        var prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        var duration = prefersReducedMotion ? 1200 : 2100;

        stopCelebration();
        elements.celebrationSummary.textContent = "完成 " + completed + " 项，未完成 " + pending + " 项 · 记录已存入日历";
        overlay.hidden = false;

        if (!prefersReducedMotion && canvas.getContext) {
            var context = canvas.getContext("2d", { alpha: true, desynchronized: true });
            var particles = [];
            var burstTimes = [0, 220, 430, 670, 920, 1180];
            var nextBurst = 0;
            var startTime = null;
            var lastTime = null;
            var colors = ["#ff375f", "#ff9f0a", "#ffd60a", "#64d2ff", "#bf5af2", "#30d158"];
            var canvasWidth = 0;
            var canvasHeight = 0;
            var particleCount = 28;

            if (context) {
                celebrationResizeHandler = function () {
                    var cssPixelCount;
                    var pixelRatio;

                    canvasWidth = window.innerWidth;
                    canvasHeight = window.innerHeight;
                    cssPixelCount = Math.max(1, canvasWidth * canvasHeight);
                    pixelRatio = Math.min(
                        window.devicePixelRatio || 1,
                        1.25,
                        Math.sqrt(2200000 / cssPixelCount)
                    );
                    canvas.width = Math.max(1, Math.round(canvasWidth * pixelRatio));
                    canvas.height = Math.max(1, Math.round(canvasHeight * pixelRatio));
                    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
                    context.globalCompositeOperation = "lighter";
                    context.lineCap = "round";
                    context.lineJoin = "round";
                    particleCount = cssPixelCount > 1800000 || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ? 22 : 28;
                };

                function createBurst(index) {
                    var originX = canvasWidth * (0.16 + Math.random() * 0.68);
                    var originY = canvasHeight * (0.16 + Math.random() * 0.42);
                    var color = colors[index % colors.length];

                    for (var particleIndex = 0; particleIndex < particleCount; particleIndex += 1) {
                        var angle = (Math.PI * 2 * particleIndex / particleCount) + (Math.random() - 0.5) * 0.16;
                        var speed = 95 + Math.random() * 145;
                        particles.push({
                            x: originX,
                            y: originY,
                            previousX: originX,
                            previousY: originY,
                            velocityX: Math.cos(angle) * speed,
                            velocityY: Math.sin(angle) * speed,
                            age: 0,
                            life: 700 + Math.random() * 460,
                            color: color,
                            size: 1.15 + Math.random() * 1.35
                        });
                    }
                }

                function animate(timestamp) {
                    var elapsed;
                    var delta;
                    var damping;
                    var particleIndex;
                    var writeIndex = 0;

                    if (startTime === null) {
                        startTime = timestamp;
                        lastTime = timestamp;
                    }
                    elapsed = timestamp - startTime;
                    delta = Math.min((timestamp - lastTime) / 1000, 0.034);
                    lastTime = timestamp;
                    damping = Math.pow(0.986, delta * 60);
                    while (nextBurst < burstTimes.length && elapsed >= burstTimes[nextBurst]) {
                        createBurst(nextBurst);
                        nextBurst += 1;
                    }

                    context.clearRect(0, 0, canvasWidth, canvasHeight);
                    for (particleIndex = 0; particleIndex < particles.length; particleIndex += 1) {
                        var particle = particles[particleIndex];
                        var alpha;

                        particle.age += delta * 1000;
                        if (particle.age >= particle.life) {
                            continue;
                        }
                        particle.previousX = particle.x;
                        particle.previousY = particle.y;
                        particle.velocityY += 92 * delta;
                        particle.velocityX *= damping;
                        particle.velocityY *= damping;
                        particle.x += particle.velocityX * delta;
                        particle.y += particle.velocityY * delta;
                        alpha = Math.max(0, 1 - particle.age / particle.life);
                        context.beginPath();
                        context.moveTo(particle.previousX, particle.previousY);
                        context.lineTo(particle.x, particle.y);
                        context.strokeStyle = particle.color;
                        context.globalAlpha = alpha * alpha;
                        context.lineWidth = particle.size;
                        context.stroke();
                        particles[writeIndex] = particle;
                        writeIndex += 1;
                    }
                    particles.length = writeIndex;
                    context.globalAlpha = 1;

                    if (elapsed < duration) {
                        celebrationFrame = window.requestAnimationFrame(animate);
                    }
                }

                celebrationResizeHandler();
                window.addEventListener("resize", celebrationResizeHandler);
                celebrationFrame = window.requestAnimationFrame(animate);
            }
        }
        celebrationTimer = window.setTimeout(stopCelebration, duration + 100);
    }

    function finishToday() {
        var nextState;
        var day;
        var counts;
        var now;

        refreshTodayContext(false);
        day = getDay(dataState, currentTodayKey);
        counts = dayCounts(day);
        if (counts.total === 0) {
            setStatus("今天还没有事项，先写下一件要做的事情。", true);
            elements.taskText.focus();
            return;
        }
        if (day.endedAt) {
            setStatus("今天的记录已经保存到历史日历。", false);
            return;
        }
        nextState = cloneState(dataState);
        day = ensureDay(nextState, currentTodayKey);
        now = new Date().toISOString();
        day.endedAt = now;
        day.updatedAt = now;
        if (commitState(nextState, "今日记录已保存到历史日历。")) {
            playCelebration(counts.completed, counts.pending);
        }
    }

    function getSpreadsheetLibrary() {
        if (!window.XLSX || !window.XLSX.utils || typeof window.XLSX.read !== "function") {
            throw new Error("Excel 功能组件没有正确加载，请刷新页面后重试。JSON 备份仍可正常使用。");
        }
        return window.XLSX;
    }

    function getDateStamp() {
        return localDateKey(new Date());
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

    function excelColumnKeyForHeader(value) {
        var normalized = normalizeExcelHeader(value);
        var column = EXCEL_COLUMNS.find(function (candidate) {
            return candidate.aliases.some(function (alias) {
                return normalizeExcelHeader(alias) === normalized;
            });
        });

        return column ? column.key : "";
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
        var map = Object.create(null);
        var missing;

        row.forEach(function (value, index) {
            var key = excelColumnKeyForHeader(value);

            if (!key) {
                return;
            }
            if (map[key] !== undefined) {
                throw new Error("Excel 表头“" + String(value).trim() + "”重复，请删除重复列后再导入。");
            }
            map[key] = index;
        });
        missing = EXCEL_COLUMNS.filter(function (column) {
            return !column.optional && map[column.key] === undefined;
        }).map(function (column) {
            return column.header;
        });
        if (missing.length) {
            throw new Error("Excel 缺少必需表头：" + missing.join("、") + "。请使用页面提供的模板。");
        }
        return map;
    }

    function locateExcelTable(workbook, xlsx) {
        var requiredCount = EXCEL_COLUMNS.filter(function (column) {
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
            var rows;

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
            rows = xlsx.utils.sheet_to_json(sheet, {
                header: 1,
                raw: true,
                defval: "",
                blankrows: true,
                range: xlsx.utils.encode_range(previewRange)
            });
            for (var rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
                if (recognizedExcelHeaders(rows[rowIndex]).size >= requiredCount) {
                    return {
                        sheet: sheet,
                        sheetName: sheetNames[sheetIndex],
                        headerRow: sheetRange.s.r + rowIndex,
                        startColumn: sheetRange.s.c,
                        headerMap: createExcelHeaderMap(rows[rowIndex])
                    };
                }
            }
        }
        throw new Error("Excel 中找不到完整的待办表头。请下载并使用页面提供的模板。");
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

    function excelRowIsBlank(row, headerMap) {
        return EXCEL_COLUMNS.every(function (column) {
            var columnIndex = headerMap[column.key];
            var value;

            if (columnIndex === undefined) {
                return true;
            }
            value = row[columnIndex];
            return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
        });
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

    function excelDateToKey(value, xlsx) {
        var parts;
        var match;
        var dateKey;

        if (value instanceof Date && !Number.isNaN(value.getTime())) {
            dateKey = dateKeyFromParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
        } else if (typeof value === "number" && Number.isFinite(value) && xlsx.SSF && xlsx.SSF.parse_date_code) {
            parts = xlsx.SSF.parse_date_code(value);
            if (!parts) {
                throw new Error("日期格式不正确。");
            }
            dateKey = dateKeyFromParts(parts.y, parts.m, parts.d);
        } else {
            match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(excelCellToText(value, "日期"));
            if (!match) {
                throw new Error("日期格式不正确，应为 YYYY-MM-DD。");
            }
            dateKey = dateKeyFromParts(Number(match[1]), Number(match[2]), Number(match[3]));
        }
        dateKey = normalizeDateKey(dateKey);
        if (dateKey > currentTodayKey) {
            throw new Error("日期不能晚于今天。");
        }
        return dateKey;
    }

    function excelStatusToValue(value) {
        var token = excelCellToText(value, "状态").toLocaleLowerCase("zh-CN").replace(/\s+/g, "");
        var map = {
            "未完成": "pending",
            "待完成": "pending",
            "pending": "pending",
            "已完成": "completed",
            "完成": "completed",
            "completed": "completed"
        };

        if (!map[token]) {
            throw new Error("状态只能填写“未完成”或“已完成”。");
        }
        return map[token];
    }

    function excelTimestampToIso(value, label, xlsx) {
        var parts;
        var date;
        var text;
        var localMatch;

        if (value === undefined || value === null || value === "") {
            return "";
        }
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
            return value.toISOString();
        }
        if (typeof value === "number" && Number.isFinite(value) && xlsx.SSF && xlsx.SSF.parse_date_code) {
            parts = xlsx.SSF.parse_date_code(value);
            if (!parts) {
                throw new Error(label + "格式不正确。");
            }
            date = new Date(parts.y, parts.m - 1, parts.d, parts.H || 0, parts.M || 0, Math.floor(parts.S || 0), 0);
            if (date.getFullYear() !== parts.y || date.getMonth() !== parts.m - 1 || date.getDate() !== parts.d) {
                throw new Error(label + "格式不正确。");
            }
            return date.toISOString();
        }
        text = excelCellToText(value, label);
        localMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
        if (localMatch) {
            date = new Date(
                Number(localMatch[1]),
                Number(localMatch[2]) - 1,
                Number(localMatch[3]),
                Number(localMatch[4]),
                Number(localMatch[5]),
                Number(localMatch[6] || 0),
                0
            );
            if (date.getFullYear() !== Number(localMatch[1]) ||
                    date.getMonth() !== Number(localMatch[2]) - 1 ||
                    date.getDate() !== Number(localMatch[3]) ||
                    date.getHours() !== Number(localMatch[4]) ||
                    date.getMinutes() !== Number(localMatch[5])) {
                throw new Error(label + "格式不正确。");
            }
            return date.toISOString();
        }
        return normalizeTimestamp(text, label, "");
    }

    function spreadsheetRows(sourceState) {
        var rows = [];

        Object.keys(sourceState.days).sort().forEach(function (dateKey) {
            var day = sourceState.days[dateKey];
            day.tasks.forEach(function (task) {
                rows.push({
                    date: dateKey,
                    text: task.text,
                    status: task.status === "completed" ? "已完成" : "未完成",
                    createdAt: task.createdAt,
                    updatedAt: task.updatedAt,
                    completedAt: task.completedAt,
                    endedAt: day.endedAt,
                    id: task.id
                });
            });
        });
        return rows;
    }

    function createSpreadsheetWorkbook(sourceState) {
        var xlsx = getSpreadsheetLibrary();
        var workbook = xlsx.utils.book_new();
        var rows = spreadsheetRows(sourceState);
        var dataRows = [EXCEL_COLUMNS.map(function (column) {
            return column.header;
        })];
        var worksheet;
        var helpSheet;

        rows.forEach(function (row) {
            dataRows.push(EXCEL_COLUMNS.map(function (column) {
                return row[column.key] || "";
            }));
        });
        if (rows.length === 0) {
            dataRows.push(EXCEL_COLUMNS.map(function () {
                return "";
            }));
        }

        worksheet = xlsx.utils.aoa_to_sheet(dataRows);
        worksheet["!cols"] = [
            { wch: 14 }, { wch: 48 }, { wch: 12 }, { wch: 27 },
            { wch: 27 }, { wch: 27 }, { wch: 27 }, { wch: 40 }
        ];
        worksheet["!autofilter"] = { ref: "A1:H" + Math.max(dataRows.length, 1) };
        for (var rowIndex = 1; rowIndex < dataRows.length; rowIndex += 1) {
            for (var columnIndex = 0; columnIndex < EXCEL_COLUMNS.length; columnIndex += 1) {
                var address = xlsx.utils.encode_cell({ r: rowIndex, c: columnIndex });
                var cell = worksheet[address];

                if (cell) {
                    cell.t = "s";
                    cell.z = "@";
                    delete cell.f;
                }
            }
        }

        helpSheet = xlsx.utils.aoa_to_sheet([
            ["今日待办 Excel 填写说明", ""],
            ["项目", "填写要求"],
            ["待办记录", "请在“待办记录”工作表中填写；每一行代表一条事项，不要修改第一行表头。"],
            ["必填字段", "日期、事项内容、状态。"],
            ["日期", "填写 YYYY-MM-DD，例如：2026-09-04；日期不能晚于导入当天。"],
            ["状态", "只能填写：未完成、已完成。"],
            ["时间字段", "创建、更新、完成和今日结束时间可以留空；网页会自动补齐。"],
            ["记录ID", "从网页导出的现有事项请勿修改；复制一行新增事项时，请清空该行记录 ID。"],
            ["合并导入", "按记录 ID 更新或新增；文件中没有的网页记录仍会保留。"],
            ["替换导入", "网页中的全部日期和事项会被文件内容替换；执行前会再次确认。"],
            ["安全提示", "公式单元格不会导入，请先复制并粘贴为值；系统不会执行宏。"]
        ]);
        helpSheet["!cols"] = [{ wch: 20 }, { wch: 92 }];

        xlsx.utils.book_append_sheet(workbook, worksheet, EXCEL_DATA_SHEET_NAME);
        xlsx.utils.book_append_sheet(workbook, helpSheet, EXCEL_HELP_SHEET_NAME);
        workbook.Props = {
            Title: "今日待办记录",
            Subject: "每日待办与完成情况",
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

    function parseSpreadsheetImport(arrayBuffer) {
        var xlsx = getSpreadsheetLibrary();
        var workbook;
        var table;
        var range;
        var rows;
        var importedState = createEmptyState();
        var errors = [];
        var seenIds = new Set();
        var nonBlankCount = 0;

        try {
            workbook = xlsx.read(arrayBuffer, {
                type: "array",
                sheetRows: MAX_TASKS + 12,
                cellDates: true,
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
        if (table.sheet["!fullref"]) {
            throw new Error("Excel 的使用区域超过可安全读取的范围。请删除表格底部多余的空行，或将记录拆分后重新导入。");
        }
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
                    errors.push("第 " + excelRowNumber + " 行“" + formulaField + "”含公式，请粘贴为值");
                }
                return;
            }
            if (excelRowIsBlank(row, table.headerMap)) {
                return;
            }
            nonBlankCount += 1;
            if (nonBlankCount > MAX_TASKS) {
                return;
            }

            try {
                var dateKey = excelDateToKey(row[table.headerMap.date], xlsx);
                var idValue = table.headerMap.id === undefined ? "" : excelCellToText(row[table.headerMap.id], "记录 ID");
                var existing = idValue ? findTask(dataState, idValue) : null;
                var status = excelStatusToValue(row[table.headerMap.status]);
                var now = new Date().toISOString();
                var createdAt = table.headerMap.createdAt === undefined ? "" : excelTimestampToIso(row[table.headerMap.createdAt], "创建时间", xlsx);
                var updatedAt = table.headerMap.updatedAt === undefined ? "" : excelTimestampToIso(row[table.headerMap.updatedAt], "更新时间", xlsx);
                var completedAt = table.headerMap.completedAt === undefined ? "" : excelTimestampToIso(row[table.headerMap.completedAt], "完成时间", xlsx);
                var endedAt = table.headerMap.endedAt === undefined ? "" : excelTimestampToIso(row[table.headerMap.endedAt], "今日结束时间", xlsx);
                var day = ensureDay(importedState, dateKey);
                var task;

                if (idValue && seenIds.has(idValue)) {
                    throw new Error("记录 ID 重复；复制一行新增事项时，请清空记录 ID。");
                }
                if (idValue) {
                    seenIds.add(idValue);
                }
                if (day.endedAt && endedAt && day.endedAt !== endedAt) {
                    throw new Error("同一天的“今日结束时间”不一致。");
                }
                if (endedAt) {
                    day.endedAt = endedAt;
                }
                task = normalizeTask({
                    id: idValue || createId(),
                    text: excelCellToText(row[table.headerMap.text], "事项内容"),
                    status: status,
                    createdAt: createdAt || (existing ? existing.task.createdAt : defaultTimestampForDate(dateKey, rowIndex)),
                    updatedAt: updatedAt || now,
                    completedAt: status === "completed" ?
                        (completedAt || (existing && existing.task.status === "completed" ? existing.task.completedAt : now)) : ""
                }, dateKey, rowIndex);
                day.tasks.push(task);
                day.updatedAt = task.updatedAt > day.updatedAt ? task.updatedAt : day.updatedAt;
            } catch (error) {
                if (errors.length < MAX_EXCEL_ERRORS) {
                    errors.push("第 " + excelRowNumber + " 行：" + (error.message || "数据格式不正确"));
                }
            }
        });

        if (nonBlankCount > MAX_TASKS) {
            throw new Error("Excel 中的事项超过 10000 条，无法导入。");
        }
        if (errors.length) {
            throw new Error("Excel 数据校验失败，当前记录未更改。" + errors.join("；") +
                (errors.length === MAX_EXCEL_ERRORS ? "；请修正后重新导入。" : ""));
        }
        return ensureImportDatesAreNotFuture(normalizeState(importedState));
    }

    function parseJsonImport(text) {
        var parsed;

        try {
            parsed = JSON.parse(String(text).replace(/^\uFEFF/, ""));
        } catch (error) {
            throw new Error("JSON 文件无法解析，请确认文件没有损坏或被错误修改。");
        }
        if (!parsed || parsed.app !== DATA_APP || parsed.version !== DATA_VERSION) {
            throw new Error("文件不是可识别的今日待办备份，或备份版本不受支持。");
        }
        return ensureImportDatesAreNotFuture(normalizeState(parsed));
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

    function exportData() {
        var format = elements.exportFormat.value;
        var count = totalTaskCount(dataState);

        if (count === 0) {
            setStatus("当前没有可导出的事项；如需批量填写，请下载 Excel 模板。", true);
            return;
        }
        try {
            if (format === "json") {
                var payload = statePayload(dataState);
                payload.exportedAt = new Date().toISOString();
                downloadTextFile(
                    JSON.stringify(payload, null, 2),
                    "application/json",
                    "today-todos-backup-" + getDateStamp() + ".json"
                );
            } else {
                writeSpreadsheetFile(
                    createSpreadsheetWorkbook(dataState),
                    format,
                    "today-todos-" + getDateStamp()
                );
            }
            setStatus("已导出全部 " + count + " 条事项（" + format.toUpperCase() + "）。", false);
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
            writeSpreadsheetFile(createSpreadsheetWorkbook(createEmptyState()), format, "today-todos-template");
            setStatus("Excel 模板已下载，请在“待办记录”工作表中填写。", false);
        } catch (error) {
            setStatus(error.message || "Excel 模板生成失败，请刷新页面后重试。", true);
        }
    }

    function updateTemplateButtonState() {
        var unavailable = elements.exportFormat && elements.exportFormat.value === "json";

        if (!elements.templateButton) {
            return;
        }
        elements.templateButton.disabled = unavailable;
        elements.templateButton.title = unavailable ? "请先选择一种 Excel 格式" : "";
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
                reject(new Error("文件读取失败。"));
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
            setStatus("所选文件为空，当前记录未更改。", true);
            elements.importFileInput.value = "";
            return;
        }
        if (file.size > MAX_IMPORT_BYTES) {
            setStatus("文件超过 16 MB，无法导入。", true);
            elements.importFileInput.value = "";
            return;
        }

        setStatus("正在读取“" + file.name + "”…", false);
        importPromise = extension === "json" ?
            readFileText(file).then(parseJsonImport) :
            readFileArrayBuffer(file).then(parseSpreadsheetImport);
        importPromise.then(function (importedState) {
            var taskCount = totalTaskCount(importedState);
            var dayCount = Object.keys(importedState.days).length;

            if (taskCount === 0) {
                throw new Error("文件只有表头或没有事项记录，当前记录未更改。");
            }
            pendingImportState = importedState;
            elements.importForm.reset();
            setDialogStatus(elements.importDialogStatus, "", false);
            elements.importSummary.textContent = "已从“" + file.name + "”读取 " + taskCount + " 条事项，涉及 " + dayCount + " 天，请选择导入方式。";
            showDialog(elements.importDialog, elements.importForm.querySelector("input[name='importMode']"), elements.importButton);
        }).catch(function (error) {
            pendingImportState = null;
            setStatus(error.message || "文件读取失败，请检查后重试。", true);
        }).then(function () {
            elements.importFileInput.value = "";
        });
    }

    function cleanupEmptyDays(sourceState) {
        Object.keys(sourceState.days).forEach(function (dateKey) {
            var day = sourceState.days[dateKey];
            if (day.tasks.length === 0 && !day.endedAt) {
                delete sourceState.days[dateKey];
            }
        });
    }

    function mergeStates(baseState, importedState) {
        var nextState = cloneState(baseState);
        var changedDates = new Set();
        var mergeTimestamp = new Date().toISOString();

        Object.keys(importedState.days).forEach(function (dateKey) {
            var importedDay = importedState.days[dateKey];

            importedDay.tasks.forEach(function (importedTask) {
                var existing = findTask(nextState, importedTask.id);

                if (existing) {
                    existing.day.tasks.splice(existing.taskIndex, 1);
                    existing.day.endedAt = "";
                    changedDates.add(existing.dateKey);
                }
            });
        });

        Object.keys(importedState.days).forEach(function (dateKey) {
            var importedDay = importedState.days[dateKey];
            var targetDay = ensureDay(nextState, dateKey);
            var hasRetainedLocalTasks = targetDay.tasks.length > 0;

            importedDay.tasks.forEach(function (importedTask) {
                targetDay.tasks.push(cloneState(importedTask));
            });
            targetDay.endedAt = hasRetainedLocalTasks ? "" : (importedDay.endedAt || "");
            changedDates.add(dateKey);
        });

        changedDates.forEach(function (dateKey) {
            var day = nextState.days[dateKey];
            var latestTimestamp;

            if (!day) {
                return;
            }
            latestTimestamp = day.tasks.reduce(function (latest, task) {
                return task.updatedAt > latest ? task.updatedAt : latest;
            }, day.endedAt > mergeTimestamp ? day.endedAt : mergeTimestamp);
            day.updatedAt = latestTimestamp;
        });
        cleanupEmptyDays(nextState);
        return normalizeState(nextState);
    }

    function handleImportSubmit(event) {
        var checkedMode;
        var mode;
        var nextState;

        event.preventDefault();
        if (!pendingImportState || totalTaskCount(pendingImportState) === 0) {
            closeDialog(elements.importDialog);
            setStatus("没有可导入的待办记录，当前数据未更改。", true);
            return;
        }
        checkedMode = elements.importForm.querySelector("input[name='importMode']:checked");
        mode = checkedMode ? checkedMode.value : "merge";
        try {
            if (mode === "replace") {
                if (!window.confirm("替换会删除当前日历中未出现在文件里的记录，并以导入文件为准。确定继续吗？")) {
                    return;
                }
                nextState = cloneState(pendingImportState);
            } else {
                nextState = mergeStates(dataState, pendingImportState);
            }
        } catch (error) {
            setDialogStatus(elements.importDialogStatus, error.message || "导入数据无法合并，当前记录未更改。", true);
            return;
        }

        if (commitState(nextState, "导入完成，当前共有 " + totalTaskCount(nextState) + " 条事项。")) {
            pendingImportState = null;
            closeDialog(elements.importDialog);
        } else {
            setDialogStatus(elements.importDialogStatus, "导入未能保存，当前记录未更改。请检查页面提示后重试。", true);
        }
    }

    function closeImportDialog() {
        pendingImportState = null;
        elements.importForm.reset();
        setDialogStatus(elements.importDialogStatus, "", false);
        closeDialog(elements.importDialog);
    }

    function bindEvents() {
        elements.quickAddForm.addEventListener("submit", handleQuickAdd);
        elements.taskText.addEventListener("input", function () {
            elements.taskText.setCustomValidity("");
        });
        elements.pendingList.addEventListener("click", handleTaskAction);
        elements.completedList.addEventListener("click", handleTaskAction);
        elements.finishDayButton.addEventListener("click", finishToday);
        elements.calendarJumpButton.addEventListener("click", function () {
            var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

            elements.calendarSection.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
            elements.calendarMonthLabel.focus({ preventScroll: true });
        });

        elements.previousMonthButton.addEventListener("click", function () {
            calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1, 12, 0, 0, 0);
            renderCalendar();
        });
        elements.nextMonthButton.addEventListener("click", function () {
            var nextMonth = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1, 12, 0, 0, 0);
            var currentMonth = firstDayOfMonth(new Date());

            if (nextMonth.getTime() <= currentMonth.getTime()) {
                calendarCursor = nextMonth;
                renderCalendar();
            }
        });
        elements.currentMonthButton.addEventListener("click", function () {
            calendarCursor = firstDayOfMonth(new Date());
            renderCalendar();
        });
        elements.calendarBody.addEventListener("click", handleCalendarClick);

        elements.editForm.addEventListener("submit", handleEditSubmit);
        elements.closeEditDialogButton.addEventListener("click", function () {
            closeDialog(elements.editDialog);
        });
        elements.cancelEditButton.addEventListener("click", function () {
            closeDialog(elements.editDialog);
        });
        elements.closeDayDialogButton.addEventListener("click", function () {
            closeDialog(elements.dayDialog);
        });
        elements.confirmDayDialogButton.addEventListener("click", function () {
            closeDialog(elements.dayDialog);
        });

        elements.exportButton.addEventListener("click", exportData);
        elements.exportFormat.addEventListener("change", updateTemplateButtonState);
        elements.templateButton.addEventListener("click", downloadExcelTemplate);
        elements.importButton.addEventListener("click", function () {
            elements.importFileInput.value = "";
            elements.importFileInput.click();
        });
        elements.importFileInput.addEventListener("change", handleImportFile);
        elements.importForm.addEventListener("submit", handleImportSubmit);
        elements.closeImportDialogButton.addEventListener("click", closeImportDialog);
        elements.cancelImportButton.addEventListener("click", closeImportDialog);

        bindDialog(elements.editDialog, function () {
            editingDateKey = "";
            elements.editForm.reset();
            setDialogStatus(elements.editDialogStatus, "", false);
        });
        bindDialog(elements.dayDialog);
        bindDialog(elements.importDialog, function () {
            pendingImportState = null;
            elements.importForm.reset();
            setDialogStatus(elements.importDialogStatus, "", false);
        });

        window.addEventListener("focus", function () {
            refreshTodayContext(true);
        });
        document.addEventListener("visibilitychange", function () {
            if (document.visibilityState === "visible") {
                refreshTodayContext(true);
            } else {
                stopCelebration();
            }
        });
        window.addEventListener("storage", function (event) {
            if (event.key === STORAGE_KEY) {
                initialStatus = "";
                initialStatusIsError = false;
                dataState = loadState();
                render();
                setStatus(initialStatus || "已同步同一浏览器中另一个标签页的待办数据。", initialStatusIsError);
            }
        });
        window.addEventListener("pagehide", stopCelebration);

        dateCheckTimer = window.setInterval(function () {
            refreshTodayContext(true);
        }, 60000);
    }

    document.addEventListener("DOMContentLoaded", function () {
        cacheElements();
        dataState = loadState();
        currentTodayKey = localDateKey(new Date());
        calendarCursor = firstDayOfMonth(new Date());
        bindEvents();
        render();
        if (initialStatus) {
            setStatus(initialStatus, initialStatusIsError);
        }
    });
}());
