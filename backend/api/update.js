import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

function enableCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://nicocormar13.github.io");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const DIAS = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  enableCors(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { fam, dia, value, url, deviceId } = req.body || {};
    if (!fam || !DIAS.includes(dia)) return res.status(400).json({ error: "Missing fam or invalid dia" });

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // 1) Leer planning actual
    const { data: row, error: selErr } = await supabase
      .from("planning")
      .select("data")
      .eq("fam", fam)
      .maybeSingle();
    if (selErr) throw selErr;

    const current = row?.data || {};
    const next = { ...current, [dia]: String(value ?? "") };

    // 2) Guardar planning
    if (!row) {
      const { error: insErr } = await supabase.from("planning").insert({ fam, data: next });
      if (insErr) throw insErr;
    } else {
      const { error: updErr } = await supabase.from("planning").update({ data: next }).eq("fam", fam);
      if (updErr) throw updErr;
    }

    // 3) Enviar push a la familia (menos este device)
    const { data: subs, error: subErr } = await supabase
      .from("subscriptions")
      .select("endpoint,p256dh,auth,device_id")
      .eq("fam", fam);
    if (subErr) throw subErr;

    const payload = JSON.stringify({
      title: "Planning actualizado",
      body: `Se actualizó ${dia}`,
      url: url || `./?dia=${encodeURIComponent(dia)}`
    });

    const toDelete = [];
    const tasks = (subs || [])
      .filter(s => !deviceId || s.device_id !== deviceId)
      .map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload
          );
        } catch (err) {
          const code = err?.statusCode;
          if (code === 410 || code === 404) toDelete.push(s.endpoint);
        }
      });

    await Promise.all(tasks);

    if (toDelete.length) {
      await supabase.from("subscriptions").delete().in("endpoint", toDelete);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
