function positionDialog(dialog, target) {
    var targetRect = target.getBoundingClientRect();
    var dialogRect = dialog.getBoundingClientRect();
    var margin = 8;
    var left = targetRect.left + targetRect.width / 2 - dialogRect.width / 2;
    var top = targetRect.bottom + margin;

    left = Math.max(margin, Math.min(left, window.innerWidth - dialogRect.width - margin));

    if (top + dialogRect.height > window.innerHeight) {
        top = targetRect.top - dialogRect.height - margin;
    }

    dialog.style.left = left + window.scrollX + "px";
    dialog.style.top = top + window.scrollY + "px";
}

function showDialog(content, dialogId, cell) {
    var dialog = document.getElementById(dialogId);

    if (!dialog) {
        return;
    }

    dialog.textContent = content;
    dialog.style.display = "block";
    positionDialog(dialog, cell);
}

function hideDialog(dialogId) {
    var dialog = document.getElementById(dialogId);

    if (!dialog) {
        return;
    }

    dialog.style.display = "none";
}

document.addEventListener("DOMContentLoaded", function () {
    var dialogId = "dialog1";
    var tagCells = document.querySelectorAll("[data-tooltip]");

    tagCells.forEach(function (cell) {
        var show = function () {
            showDialog(cell.dataset.tooltip, dialogId, cell);
        };
        var hide = function () {
            hideDialog(dialogId);
        };

        cell.addEventListener("mouseenter", show);
        cell.addEventListener("mouseleave", hide);
        cell.addEventListener("focus", show);
        cell.addEventListener("blur", hide);
        cell.addEventListener("click", show);
    });

    window.addEventListener("scroll", function () {
        hideDialog(dialogId);
    });
    window.addEventListener("resize", function () {
        hideDialog(dialogId);
    });
});
