// swV3.js - Service Worker para notificaciones push y mensajería con ventanas abiertas

self.addEventListener("install", () => self.skipWaiting());//Instala el Service Worker inmediatamente

// Toma el control de las páginas abiertas inmediatamente después de la activación
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Maneja los eventos de push entrantes
self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let data = {};
    if (event.data) {
      try {
        data = await event.data.json();
      } catch {
        data = { body: await event.data.text() };
      }
    }

    // Enviamos el mensaje a las ventanas abiertas
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    console.log("[SW] push real recibido. wins:", wins.length, "data:", data);

    for (const c of wins) {
      //Mensaje para actualizar los imputs si la app está abierta
      c.postMessage({
        type: data.type || "planning-update",
        fam: data.fam,
        dia: data.dia,
        value: data.value,
        url: data.url
      });

      //Mensaje para mostrar notificacion in-app si la app está abierta
      c.postMessage({
        type: "inapp-notif",
        notif: {
        id: data.id || (self.crypto?.randomUUID ? self.crypto.randomUUID() : String(Date.now()) + Math.random()),
        fam: data.fam,
        title: data.title || "Planning actualizado",
        body: data.body || "",
        dia: data.dia || null,
        url: data.url || "./",
        createdAt: data.createdAt || new Date().toISOString()
        }
      });
    }

    //Enviamos la notificación
    try {
      if (self.registration.showNotification && Notification.permission === "granted") {
        await self.registration.showNotification(
          data.title || "Planning actualizado",
          {
            body: data.body || "",
            icon: "/notificacion-tiempo-real/icono-192.png",
            tag: data.tag || "planing",
            data: { url: data.url || "./" }
          }
        );
      }
    } catch (e) {
      console.warn("Error mostrando la notificación:", e);
    }
  })());
});


// Maneja el clic en la notificación
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "./";
  const targetUrl = new URL(url, self.location.origin).href;

  // Intentamos enfocar una ventana existente o abrir una nueva
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

