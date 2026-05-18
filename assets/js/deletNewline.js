function setStatus(message) {
    document.getElementById("toolStatus").textContent = message;
}

function deleteNewlines() {
    var inputText = document.getElementById("inputText").value;
    var outputText = inputText.replace(/(\r\n|\n|\r)+/g, " ").replace(/[ \t]{2,}/g, " ").trim();

    document.getElementById("outputText").value = outputText;
    setStatus(outputText ? "已删除换行。" : "请输入需要处理的文本。");
}

function clearText() {
    document.getElementById("inputText").value = "";
    document.getElementById("outputText").value = "";
    setStatus("");
}

function copyResult() {
    var outputText = document.getElementById("outputText").value;

    if (!outputText) {
        setStatus("没有可复制的内容。");
        return;
    }

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(outputText).then(function () {
            setStatus("已复制到剪贴板。");
        }).catch(function () {
            fallbackCopy(outputText);
        });
        return;
    }

    fallbackCopy(outputText);
}

function fallbackCopy(text) {
    var output = document.getElementById("outputText");

    output.focus();
    output.select();

    try {
        document.execCommand("copy");
        setStatus("已复制到剪贴板。");
    } catch (error) {
        setStatus("复制失败，请手动选择结果复制。");
    }

    output.setSelectionRange(0, text.length);
}

document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("deleteButton").addEventListener("click", deleteNewlines);
    document.getElementById("clearButton").addEventListener("click", clearText);
    document.getElementById("copyButton").addEventListener("click", copyResult);
});
