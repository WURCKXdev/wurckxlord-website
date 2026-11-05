(function(){
  "use strict";
  var btn = document.getElementById("installBtn");
  var iosSheet = document.getElementById("iosSheet");
  var iosBackdrop = document.getElementById("iosBackdrop");
  var deferred = null;

  var standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  var ua = navigator.userAgent;
  var isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if ("serviceWorker" in navigator && location.protocol !== "file:"){
    window.addEventListener("load", function(){ navigator.serviceWorker.register("sw.js").catch(function(){}); });
  }

  if (standalone) return;

  // Android / Chrome / Edge / Samsung Internet: native install prompt
  window.addEventListener("beforeinstallprompt", function(e){
    e.preventDefault();
    deferred = e;
    btn.hidden = false;
  });
  window.addEventListener("appinstalled", function(){ btn.hidden = true; deferred = null; });

  // iOS Safari has no install prompt: show instructions instead
  if (isIOS) btn.hidden = false;

  function closeIOS(){ iosSheet.hidden = iosBackdrop.hidden = true; btn.focus(); }

  btn.addEventListener("click", function(){
    if (deferred){
      deferred.prompt();
      deferred.userChoice.then(function(){ deferred = null; btn.hidden = true; });
    } else if (isIOS){
      iosSheet.hidden = iosBackdrop.hidden = false;
      document.getElementById("iosClose").focus();
    }
  });
  document.getElementById("iosClose").addEventListener("click", closeIOS);
  iosBackdrop.addEventListener("click", closeIOS);
})();
