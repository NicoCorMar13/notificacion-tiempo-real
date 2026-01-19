const DIAS = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
const familiaId = "familia-demo"; // luego lo haces configurable
const VAPID_PUBLIC_KEY = "PEGA_AQUI_TU_PUBLIC_KEY";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

async function registerSW() {
  if (!("serviceWorker" in navigator)) throw new Error("No hay service worker");
  return navigator.serviceWorker.register("/sw.js");
}

async function enablePush() {
  const reg = await registerSW();

  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Permiso de notificaciones denegado");

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  }); // subscribe() estándar :contentReference[oaicite:5]{index=5}

  await fetch("https://TU-BACKEND.vercel.app/api/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ familiaId, subscription: sub }),
  });

  alert("Notificaciones activadas ✅");
}

async function loadPlanning() {
  const r = await fetch(`https://TU-BACKEND.vercel.app/api/planning?familiaId=${encodeURIComponent(familiaId)}`);
  const data = await r.json();
  for (const d of DIAS) {
    const el = document.getElementById(d);
    if (el) el.value = data[d] || "";
  }
}

async function saveDay(dia) {
  const value = document.getElementById(dia).value;

  await fetch("https://TU-BACKEND.vercel.app/api/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      familiaId,
      dia,
      value,
      // opcional: url para abrir y resaltar el día
      url: `/?dia=${encodeURIComponent(dia)}`
    }),
  });
}
