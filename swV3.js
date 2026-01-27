// Servicio Worker para gestionar las notificaciones push, se dispara al escuchar un push
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};//Obtiene los datos del push
  const title = data.title || "Planning actualizado";//Título de la notificación
  const options = {//Opciones de la notificación
    body: data.body || "",//Cuerpo de la notificación
    icon: "/notificacion-tiempo-real/icono-192.png",//Icono de la notificación
    tag: data.tag || "planing",//Etiqueta para agrupar notificaciones similares
    data: { url: data.url || "./" },//Datos adicionales, como la URL a abrir al hacer clic
    actions: [
      { action: 'open', title: 'Abrir App', icon: '/notificacion-tiempo-real/icono-192.png' }
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));//Muestra la notificación, "waitUntil" asegura que el SW no se cierre antes de mostrarla
});

// Maneja el clic en la notificación
self.addEventListener("notificationclick", (event) => {
  event.notification.close();//Cierra la notificación al hacer clic
  const url = event.notification.data?.url || "./";//Obtiene la URL a abrir desde los datos de la notificación, si no la obtiene, usa la raíz(./)
  const targetUrl = new URL(url, self.location.origin).href;//URL absoluta basada en la URL proporcionada y el origen del SW

  // Abre la URL en una nueva ventana o enfoca una existente, usando "waitUntil" para mantener el SW activo hasta completar la acción
  event.waitUntil((async () => {
    const wins = await clients.matchAll({ type: "window", includeUncontrolled: true });//Obtiene todas las ventanas abiertas bajo el control del SW
    for (const c of wins) {//Revisa cada ventana abierta
      if ("focus" in c) {
        await c.focus();//Intenta enfocar la ventana
        if ("navigate" in c) await c.navigate(targetUrl);//Navega a la URL especificada si es posible
        return;
      }
    }
    await clients.openWindow(targetUrl);//Si no hay ventanas abiertas, abre una nueva con la URL especificada
  })());
});
