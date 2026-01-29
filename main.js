const DIAS = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];

// URL del backend en Vercel
const API_BASE = "https://notificacion-tiempo-real-backend-we.vercel.app";

// VAPID PUBLIC KEY
const VAPID_PUBLIC_KEY = "BBbV8RuSxZyOGAtD53suSbyp-QoE1H6WhI6Wy7rL0RINNsbI2OYtXOHFn3YU8bIEU4lsOW1rQW1laZOx2AAvee4";

// Obtenemos referencias a los elementos del DOM
const famInput = document.getElementById("fam");
const btnSetFam = document.getElementById("btnSetFam");
const btnPush = document.getElementById("btnPush");
const list = document.getElementById("list");

// Consultamos el codigo unico del dispositivo o lo generamos
const deviceId =
  localStorage.getItem("deviceId") ||
  (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
localStorage.setItem("deviceId", deviceId);

// funciones para el almacenamiento del código de familia
function getFam() { return localStorage.getItem("fam") || ""; }
function setFam(v) { localStorage.setItem("fam", v); }

// Convertimos la VAPID key de base64 a Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

// Funcion para registrarse el Service Worker
async function registerSW() {
  if (!("serviceWorker" in navigator)) throw new Error("Tu navegador no soporta Service Worker");
  return navigator.serviceWorker.register("/notificacion-tiempo-real/swV3.js");
}

// Funcion para asegurar que la pestaña quede controlada por el SW (1 reload como máximo)
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

//Funcion que comprueba si tenemos la aplicacion instalada
function isAppInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; //La segunda parte (despues de ||) es para iOS
}

//Comprobamos si la aplicacion esta instalada y en ese caso eliminamos el banner de recomendacion de instalacion
if (isAppInstalled()) {
  document.getElementById("banner-instalar")?.remove();
}

// Funcion para activar las notificaciones push
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

// Funcion para renderizar los inputs de los días
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

// Funcion para cargar el planning desde el backend
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

// Funcion para guardar el valor de un día específico
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
  await markChangesSeen();/*Marcamos como visto porque lo acabamos de cambiar*/
}

// Funcion para aplicar una actualización remota recibida desde el Service Worker
function applyRemoteUpdate(msg) {
  if (!msg) return;

  // Acepta ambos nombres
  if (msg.type !== "planning-update") return;

  const famLS = getFam();
  const famUI = famInput?.value?.trim() || "";
  const famActive = famLS || famUI;

  if (msg.fam && famActive && msg.fam !== famActive) return;

  if (!msg.dia || !DIAS.includes(msg.dia)) return;

  const el = document.getElementById(msg.dia);
  if (!el) return;

  if (document.activeElement === el) return;

  el.value = String(msg.value ?? "");

  el.classList.add("highlight");
  setTimeout(() => el.classList.remove("highlight"), 1200);

  markChangesSeen();/*Marcamos como visto porque lo estamos viendo en pantalla*/
}

// Configura el listener para mensajes desde el Service Worker
function setupSWMessageListener() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.addEventListener("message", (event) => {
    console.log("[PAGE] mensaje SW:", event.data);
    applyRemoteUpdate(event.data);
  });
}

// Evento al pulsar el botón de guardar familia
btnSetFam.addEventListener("click", async () => {
  const v = famInput.value.trim();
  if (!v) return alert("Pega un código de familia.");
  setFam(v);
  await loadPlanning();
  await checkChangesOnLoad();
  alert("Código de familia guardado ✅");
});

// Evento al pulsar el botón de activar notificaciones
btnPush.addEventListener("click", enablePush);

// Funciones auxiliares para el modal de cambios
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Formatea una fecha ISO a formato local
function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
}

// Abre el modal (o ventana emergente) de cambios agrupados por día
function openChangesModalGrouped(changes, onClose) {
  const modal = document.getElementById("changesModal");
  const body = document.getElementById("changesBody");
  const closeBtn = document.getElementById("changesClose");
  const okBtn = document.getElementById("changesOk");

  const groups = new Map();
  for (const c of changes) {
    const key = c.dia || "(sin día)";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }

  const orderedDays = Array.from(groups.keys()).sort((a, b) => {
    const ia = DIAS.indexOf(a);
    const ib = DIAS.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  body.innerHTML = orderedDays.map(dia => {
    const list = groups.get(dia) || [];
    const count = list.length;

    list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    const itemsHtml = list.map(c => `
      <div class="item">
        <div>
          ${c.old_value !== null ? `Antes: <i>${escapeHtml(c.old_value || "(vacío)")}</i><br>` : ""}
          Ahora: <b>${escapeHtml(c.new_value || "(vacío)")}</b>
        </div>
        <div class="meta">${fmtTime(c.created_at)}</div>
      </div>
    `).join("");

    return `
      <details class="group"><!--si ponemos open al final, vienen todos desplegados-->
        <summary><b>${escapeHtml(dia)}</b> <span class="count">(${count} cambio${count !== 1 ? "s" : ""})</span></summary>
        <div class="group-body">
          ${itemsHtml}
        </div>
      </details>
    `;
  }).join("");

  modal.classList.remove("hidden");

  function close() {
    modal.classList.add("hidden");
    closeBtn.removeEventListener("click", close);
    okBtn.removeEventListener("click", close);
    onClose?.();
  }

  closeBtn.addEventListener("click", close);
  okBtn.addEventListener("click", close);
}

// Comprueba si hay cambios no vistos al cargar la app
async function checkChangesOnLoad() {
  const fam = getFam();
  if (!fam) return;

  const r = await fetch(`${API_BASE}/api/changes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fam,
      viewerDeviceId: deviceId,
      mode: "all" // o "last_per_day" si lo mantuviste en backend
    })
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("changes error", j);
    return;
  }

  if ((j.count || 0) > 0) {
    const lastTs = j.changes[j.changes.length - 1]?.created_at;

    openChangesModalGrouped(j.changes, async () => {
      await fetch(`${API_BASE}/api/changesSeen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fam,
          viewerDeviceId: deviceId,
          seenAt: lastTs // <-- esto es la mejora (3)
        })
      }).catch(console.error);
    });
  }
}

/* Marca cambios como vistos si estamos con la aplicacion abierta. Implementado en saveDay y applyRemoteUpdate. 
Si queremos que se vea el dialogo con los cambios cuando se recargue la app quitar la llamada a esta funcion en las funciones saveDay y applyRemoteUpdate*/
async function markChangesSeen(seenAt) {
  const fam = getFam();
  if (!fam) return;

  await fetch(`${API_BASE}/api/changesSeen`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fam,
      viewerDeviceId: deviceId,
      seenAt // opcional
    })
  }).catch(console.error);
}

// Inicialización de la app
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
    await loadPlanning();
    await checkChangesOnLoad();
  }
})();
