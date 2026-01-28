console.log("🔥 main.js cargado");

const DIAS = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];

// URL del backend en Vercel
const API_BASE = "https://notificacion-tiempo-real-backend-we.vercel.app";

// VAPID PUBLIC KEY
const VAPID_PUBLIC_KEY = "BBbV8RuSxZyOGAtD53suSbyp-QoE1H6WhI6Wy7rL0RINNsbI2OYtXOHFn3YU8bIEU4lsOW1rQW1laZOx2AAvee4";

// DOM
const famInput = document.getElementById("fam");
const btnSetFam = document.getElementById("btnSetFam");
const btnPush = document.getElementById("btnPush");
const list = document.getElementById("list");

// deviceId
const deviceId =
  localStorage.getItem("deviceId") ||
  (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
localStorage.setItem("deviceId", deviceId);

// fam storage
function getFam() { return localStorage.getItem("fam") || ""; }
function setFam(v) { localStorage.setItem("fam", v); }

// VAPID helper
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

// Register SW
async function registerSW() {
  if (!("serviceWorker" in navigator)) throw new Error("Tu navegador no soporta Service Worker");
  return navigator.serviceWorker.register("/notificacion-tiempo-real/swV3.js");
}

// Asegurar que la pestaña quede controlada por el SW (1 reload como máximo)
async function ensureSWControlsPage() {
  if (!("serviceWorker" in navigator)) return;
  if (navigator.serviceWorker.controller) return;

  await navigator.serviceWorker.ready;

  await new Promise((resolve) => {
    navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true });
  });

  if (!sessionStorage.getItem("sw_reloaded_once")) {
    sessionStorage.setItem("sw_reloaded_once", "1");
    location.reload();
  }
}

// Push enable
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

// Render inputs
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

// Load planning
async function loadPlanning() {
  const fam = getFam();
  if (!fam) return;

  const r = await fetch(`${API_BASE}/api/planning?fam=${encodeURIComponent(fam)}`);
  const j = await r.json().catch(() => ({}));
  const data = j.data || {};

  DIAS.forEach(d => {
    const el = document.getElementById(d);
    if (el && document.activeElement !== el) el.value = data[d] || "";
  });

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

// Save day
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

  // No hace falta recargar todo aquí si luego ya te llega el postMessage en otros dispositivos,
  // pero en el que guarda, sí es útil para reflejar lo guardado.
  await loadPlanning();
}

// Realtime update from SW
function applyRemoteUpdate(msg) {
  if (!msg || msg.type !== "planning-updated") return;

  const fam = getFam();
  if (msg.fam && fam && msg.fam !== fam) return;

  if (!msg.dia || !DIAS.includes(msg.dia)) return;

  const el = document.getElementById(msg.dia);
  if (!el) return;

  if (document.activeElement === el) return;

  if (typeof msg.value === "string") {
    el.value = msg.value;
  } else {
    loadPlanning();
    return;
  }

  el.classList.add("highlight");
  setTimeout(() => el.classList.remove("highlight"), 1200);
}

function setupSWMessageListener() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.addEventListener("message", (event) => {
    console.log("[PAGE] mensaje SW:", event.data);
    applyRemoteUpdate(event.data);
  });
}

// Events
btnSetFam.addEventListener("click", async () => {
  const v = famInput.value.trim();
  if (!v) return alert("Pega un código de familia.");
  setFam(v);
  await loadPlanning();
  alert("Código de familia guardado ✅");
});

btnPush.addEventListener("click", enablePush);

// Init
(async function init() {
  renderInputs();
  setupSWMessageListener();

  try {
    await registerSW();
    await ensureSWControlsPage();
    const reg = await navigator.serviceWorker.ready;
    console.log("[PAGE] SW listo. Controller:", !!navigator.serviceWorker.controller, "scope:", reg.scope);
  } catch (e) {
    console.warn("[PAGE] Error SW:", e);
  }

  if (!getFam()) {
    const suggested = "fam_" + (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
    famInput.value = suggested;
  } else {
    famInput.value = getFam();
    loadPlanning();
  }
})();
