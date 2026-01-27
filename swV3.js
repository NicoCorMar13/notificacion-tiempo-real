self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};

  const title = data.title || "Planning actualizado";
  const options = {
    body: data.body || "",
    icon: "/notificacion-tiempo-real/icono-192.png",
    tag: data.tag || "planing",
    data: { url: data.url || "./" },
    actions: [
      { action: "open", title: "Abrir App", icon: "/notificacion-tiempo-real/icono-192.png" }
    ],
  };

  event.waitUntil((async () => {
    // 1) Notificación
    await self.registration.showNotification(title, options);

    // 2) Mensaje a ventanas abiertas
    const wins = await clients.matchAll({ type: "window", includeUncontrolled: true });

    // DEBUG: para ver si hay ventanas
    // (esto se ve en DevTools > Application > Service Workers)
    console.log("[SW] push received. windows:", wins.length, "data:", data);

    for (const c of wins) {
      c.postMessage({
        type: data.type || "planning-updated",
        fam: data.fam,
        dia: data.dia,
        value: data.value,
        url: data.url
      });
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "./";
  const targetUrl = new URL(url, self.location.origin).href;

  event.waitUntil((async () => {
    const wins = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of wins) {
      if ("focus" in c) {
        await c.focus();
        if ("navigate" in c) await c.navigate(targetUrl);
        return;
      }
    }
    await clients.openWindow(targetUrl);
  })());
});
