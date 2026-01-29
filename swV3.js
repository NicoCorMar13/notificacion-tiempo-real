// swV3.js - Service Worker para notificaciones push y mensajería con ventanas abiertas
self.addEventListener("install", () => self.skipWaiting());//Instala el Service Worker inmediatamente

// Toma el control de las páginas abiertas inmediatamente después de la activación
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Maneja los eventos de push entrantes
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

    // DEBUG: para ver si hay ventanas abiertas y los datos recibidos
    console.log("[SW] push received. windows:", wins.length, "data:", data);

    for (const c of wins) {
      c.postMessage({
        type: data.type || "planning-update",
        fam: data.fam,
        dia: data.dia,
        value: data.value,
        url: data.url
      });
    }
  })());
});

// Maneja el clic en la notificación
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
