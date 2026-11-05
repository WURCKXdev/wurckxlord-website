/* Offline support for the WurckxLord Skill Builder.
 * Bump VERSION whenever app files change so installed copies update. */
var VERSION = "skills-v2";
var SHELL = [
  "./skills.html",
  "./skills.css",
  "./skills.js",
  "./skills-data.js",
  "./pwa.js",
  "./manifest.webmanifest",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/apple-touch-icon.png"
];

self.addEventListener("install", function(e){
  e.waitUntil(caches.open(VERSION).then(function(c){ return c.addAll(SHELL); }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k !== VERSION; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

// Network first (so updates arrive), falling back to the cache when offline.
self.addEventListener("fetch", function(e){
  var req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(function(res){
      if (res.ok){ var copy = res.clone(); caches.open(VERSION).then(function(c){ c.put(req, copy); }); }
      return res;
    }).catch(function(){
      return caches.match(req, { ignoreSearch: true }).then(function(hit){
        return hit || (req.mode === "navigate" ? caches.match("./skills.html") : undefined);
      });
    })
  );
});
