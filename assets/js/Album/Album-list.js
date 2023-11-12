const slider = document.querySelector('.slider');

function activate(e) {
    const items = document.querySelectorAll('.item');
    e.target.matches('.next') && slider.append(items[0])
    e.target.matches('.prev') && slider.prepend(items[items.length - 1]);
}


document.getElementById("btn1").addEventListener("click", function () {
    window.location.href = "/html/Alum-BJ.html";
});