const CACHE_NAME = "swing-log-v99";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./images/field-bg.jpg",
  "./images/logo.png",
  "./images/pen.png",
  "./images/icon_home_transparent.png",
  "./images/icon_challenge_transparent.png",
  "./images/icon_badge_transparent.png",
  "./images/icon_data_transparent.png",
  "./images/icon_settings_transparent.png",
  "./images/bat.svg",
  "./images/calendar.svg",
  "./images/count.svg",
  "./images/average.svg",
  "./images/best.svg",
  "./images/flag.svg",
  "./images/trophy.svg",
  "./images/bat-icon.svg",
  "./images/rarity_d.svg",
  "./images/rarity_c.svg",
  "./images/rarity_b.svg",
  "./images/rarity_a.svg",
  "./images/rarity_s.svg",
  "./images/rarity_ss.svg",
  "./images/D_bronze_nameplate.png",
  "./images/C_green_nameplate.png",
  "./images/B_blue_nameplate.png",
  "./images/A_red_nameplate.png",
  "./images/S_silver_nameplate.png",
  "./images/SS_gold_nameplate.png",
  "./images/D_card.png",
  "./images/C_card.png",
  "./images/B_card.png",
  "./images/A_card.png",
  "./images/S_card.png",
  "./images/SS_card.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("./index.html")));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
