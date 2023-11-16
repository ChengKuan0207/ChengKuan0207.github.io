function showDialog(content, dialogId, cell) {
    var dialog = document.getElementById(dialogId);
    dialog.innerHTML = content;
    dialog.style.display = "block";

    var leftOffset = 80; // 您希望的左移距离
    var leftPosition = cell.offsetLeft - leftOffset;
    dialog.style.top = cell.offsetTop + cell.offsetHeight + "px";
    dialog.style.left = leftPosition + "px";
}

function hideDialog(dialogId) {
    var dialog = document.getElementById(dialogId);
    dialog.style.display = "none";
}

