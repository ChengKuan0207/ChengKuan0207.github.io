const submit = document.querySelector(".btn")
const pikachu = document.querySelector(".pikachu")

submit.addEventListener("click", function () {
  toggleAppear();
  setTimeout(function () {
    toggleAppear();
    window.location.href = "html/main-1.html";
  }, 1000);
});

function toggleAppear() {
  pikachu.classList.toggle("active")
}