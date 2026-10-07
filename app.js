document.getElementById("year").textContent = new Date().getFullYear();
document.querySelectorAll('[data-disabled="true"]').forEach(function(el){
  el.addEventListener("click", function(e){ e.preventDefault(); });
});