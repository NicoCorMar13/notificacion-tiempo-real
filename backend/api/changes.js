import { createClient } from "@supabase/supabase-js";

function enableCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

export default async function handler(req, res) {
  enableCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { fam, viewerDeviceId, mode } = req.body || {};
    if (!fam || !viewerDeviceId) return res.status(400).json({ error: "Missing fam/viewerDeviceId" });

    const supabase = getSupabase();

    // last_seen
    const { data: seenRow, error: seenErr } = await supabase
      .from("change_seen")
      .select("last_seen_at")
      .eq("fam", fam)
      .eq("viewer_device_id", viewerDeviceId)
      .maybeSingle();
    if (seenErr) throw seenErr;

    const lastSeenAt = seenRow?.last_seen_at ?? "1970-01-01T00:00:00Z";

    // cambios desde last_seen
    const { data: changes, error: chErr } = await supabase
      .from("change_log")
      .select("id,fam,dia,old_value,new_value,actor_device_id,created_at")
      .eq("fam", fam)
      .gt("created_at", lastSeenAt)
      .order("created_at", { ascending: true });
    if (chErr) throw chErr;

    let out = (changes || []).filter(c => c.actor_device_id !== viewerDeviceId);

    // mode opcional: "last_per_day" => solo la última por día
    if (mode === "last_per_day") {
      const map = new Map();
      for (const c of out) map.set(c.dia, c);
      out = Array.from(map.values()).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }

    res.status(200).json({ lastSeenAt, count: out.length, changes: out });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
