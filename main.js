const DIAS = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];

// 1) URL de tu backend en Vercel (la pondremos luego)
const API_BASE = "https://TU-BACKEND.vercel.app";

// 2) Tu VAPID PUBLIC KEY (la pondremos luego)
const VAPID_PUBLIC_KEY = "TU_VAPID_PUBLIC_KEY";

const famInput = document.getElementById("fam");
const btnSetFam = document.getElementById("btnSetFam");
const btnPush = document.getElementById("btnPush");
const list = document.getElementById("list");

// ID de dispositivo (para no notificarte a ti mismo)
const deviceId = localStorage.getItem("deviceId") || (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
localStorage.setItem("deviceId", deviceId);

function getFam() {
  return localStorage.getItem("fam") || "";
}
function setFam(v) {
  localStorage.setItem("fam", v);
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

async function registerSW() {
  if (!("serviceWorker" in navigator)) throw new Error("Tu navegador no soporta Service Worker");
  return navigator.serviceWorker.register("/notificacion-tiempo-real/sw.js");
}

async function enablePush() {
  const fam = getFam();
  if (!fam) return alert("Primero guarda el código de familia.");

  const reg = await registerSW();

  const perm = await Notification.requestPermission();
  if (perm !== "granted") return alert("Permiso de notificaciones denegado.");

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  });

  const r = await fetch(`${API_BASE}/api/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fam, subscription: sub, deviceId })
  });

  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    console.error(j);
    return alert("Error al activar notificaciones (mira la consola).");
  }

  alert("Notificaciones activadas ✅");
}

function renderInputs() {
  list.innerHTML = "";
  DIAS.forEach(dia => {
    const row = document.createElement("div");
    row.className = "row";

    const label = document.createElement("div");
    label.textContent = dia;

    const input = document.createElement("input");
    input.id = dia;

    const btn = document.createElement("button");
    btn.textContent = "Guardar";
    btn.addEventListener("click", () => saveDay(dia));

    row.append(label, input, btn);
    list.appendChild(row);
  });
}

async function loadPlanning() {
  const fam = getFam();
  if (!fam) return;

  const r = await fetch(`${API_BASE}/api/planning?fam=${encodeURIComponent(fam)}`);
  const j = await r.json().catch(() => ({}));
  const data = j.data || {};

  DIAS.forEach(d => {
    const el = document.getElementById(d);
    if (el) el.value = data[d] || "";
  });

  // Si se abre desde notificación con ?dia=...
  const params = new URLSearchParams(location.search);
  const dia = params.get("dia");
  if (dia && DIAS.includes(dia)) {
    const el = document.getElementById(dia);
    if (el) {
      el.classList.add("highlight");
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => el.classList.remove("highlight"), 2500);
    }
  }
}

async function saveDay(dia) {
  const fam = getFam();
  if (!fam) return alert("Primero guarda el código de familia.");

  const value = document.getElementById(dia).value;

  const r = await fetch(`${API_BASE}/api/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fam,
      dia,
      value,
      url: `/notificacion-tiempo-real/?dia=${encodeURIComponent(dia)}`,
      deviceId
    })
  });

  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    console.error(j);
    return alert("Error guardando (mira la consola).");
  }

  await loadPlanning();
}

btnSetFam.addEventListener("click", async () => {
  const v = famInput.value.trim();
  if (!v) return alert("Pega un código de familia.");
  setFam(v);
  await loadPlanning();
});

btnPush.addEventListener("click", enablePush);

(function init() {
  renderInputs();

  // Si no hay fam guardada, sugerimos una (la compartes con tu familia)
  if (!getFam()) {
    const suggested = "fam_" + (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
    famInput.value = suggested;
  } else {
    famInput.value = getFam();
    loadPlanning();
  }

  // “casi” tiempo real gratis: polling cada 5s
  setInterval(loadPlanning, 5000);
})();
