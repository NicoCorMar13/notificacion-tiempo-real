self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "Planning actualizado";
  const options = {
    body: data.body || "Se ha modificado el planning",
    icon: "/notificacion-tiempo-real/icono-192.png",
    data: { url: data.url || "./" }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "./";

  event.waitUntil((async () => {
    const wins = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.startsWith(self.location.origin) && "focus" in w) return w.focus();
    }
    return clients.openWindow(url);
  })());
});
