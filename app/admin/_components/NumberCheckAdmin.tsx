"use client";
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Icon from "@/components/ed/Icon";

const MtnVerificationAdmin = dynamic(() => import("./MtnVerificationAdmin"), { loading: () => <p className="ed-muted">Loading…</p> });

type Settings = { enabled: boolean; order: "yhangmhany_first" | "inventor_first"; onUnreachable: "block" | "allow"; cacheHours: 1 | 24; verifyUrl: string };
type Health = { id: "yhangmhany" | "inventor"; label: string; keySet: boolean; reachable: boolean | null; ms: number | null; balance: number | null };
type Blocked = { phone: string; tries: number; last: string; status: string };
type Payload = { settings: Settings; health: Health[]; blocked: Blocked[]; blockedToday: number };
type TestResult = { phone: string; answers: Record<"yhangmhany" | "inventor", "verified" | "not_verified" | "unknown" | "no_key"> };

const spaced = (p: string) => p.replace(/\s/g, "").replace(/^(\d{3})(\d{3})(\d{4})$/, "$1 $2 $3");
const when = (iso: string) => new Date(iso).toLocaleString("en-GH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const ANSWER_TEXT: Record<string, { text: string; good: boolean | null }> = {
  verified: { text: "on the list", good: true },
  not_verified: { text: "not on the list", good: false },
  unknown: { text: "could not answer", good: null },
  no_key: { text: "no key set", good: null },
};

export default function NumberCheckAdmin() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [link, setLink] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/number-check");
      if (!res.ok) { setError(res.status === 401 ? "Please sign in again." : "Could not load the number check."); return; }
      const d = (await res.json()) as Payload;
      setData(d);
      setLink(d.settings.verifyUrl);
      setError("");
    } catch { setError("Could not reach the server."); }
  }, []);

  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t); }, [load]);

  async function save(patch: Partial<Settings>, okText = "Saved.") {
    setMsg(null);
    const res = await fetch("/api/admin/number-check", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const d = (await res.json().catch(() => ({}))) as { settings?: Settings; error?: string };
    if (res.ok && d.settings) { setData((prev) => prev ? { ...prev, settings: d.settings! } : prev); setLink(d.settings.verifyUrl); setMsg({ ok: true, text: okText }); }
    else setMsg({ ok: false, text: d.error ?? "Could not save." });
  }

  async function runTest() {
    setTesting(true); setResult(null); setMsg(null);
    const res = await fetch("/api/admin/number-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: testPhone }) });
    const d = (await res.json().catch(() => ({}))) as TestResult & { error?: string };
    setTesting(false);
    if (res.ok && d.answers) setResult(d);
    else setMsg({ ok: false, text: d.error ?? "The test failed." });
  }

  if (error) return <p className="ad-msg bad">{error}</p>;
  if (!data) return <div style={{ padding: 40, display: "grid", placeItems: "center" }}><span className="ed-spin" style={{ width: 28, height: 28, color: "var(--ed-yellow)" }} /></div>;

  const { settings, health } = data;
  const ordered = settings.order === "yhangmhany_first" ? ["yhangmhany", "inventor"] as const : ["inventor", "yhangmhany"] as const;
  const byId = Object.fromEntries(health.map((h) => [h.id, h])) as Record<string, Health>;
  const needsVerifying = data.blocked.filter((b) => b.status === "not_verified");

  return (
    <div className="admin-section ad-numcheck">
      {msg && <p className={`ad-msg ${msg.ok ? "ok" : "bad"}`} role="status">{msg.text}</p>}

      <section className="ad-block">
        <div className="ad-trow">
          <div className="t"><b style={{ fontSize: 16 }}>Check numbers before payment</b>When on, a number that is on neither list cannot pay.</div>
          <button type="button" role="switch" aria-checked={settings.enabled} aria-label="Check numbers before payment" className="ad-sw" onClick={() => void save({ enabled: !settings.enabled })} />
        </div>
        {!settings.enabled && <p className="ad-warn">The check is off. Customers can pay for any number, and new numbers become manual orders.</p>}
      </section>

      <section className="ad-block">
        <h3 className="ad-h3">Who is asked, and in what order</h3>
        <div>
          {ordered.map((id, i) => {
            const h = byId[id];
            return (
              <div key={id} className="ad-prov">
                <span className="n">{i + 1}</span>
                <div className="t">
                  <b><i className={h.keySet && h.reachable ? "g" : h.keySet ? "a" : "rr"} />{h.label}</b>
                  <span>
                    {!h.keySet ? "No key set. This one is skipped." : h.reachable ? `Key set. Answered in ${((h.ms ?? 0) / 1000).toFixed(1)} s.${h.balance !== null ? ` Balance GH₵${h.balance.toLocaleString("en-GH", { maximumFractionDigits: 2 })}` : ""}` : "Key set, but it did not answer just now."}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="ed-muted" style={{ margin: 0, fontSize: 12 }}>The second list is asked only when the first does not have the number.</p>
        <button type="button" className="ed-btn o" style={{ alignSelf: "flex-start" }} onClick={() => void save({ order: settings.order === "yhangmhany_first" ? "inventor_first" : "yhangmhany_first" }, "Order changed.")}>
          <Icon name="retry" small />Swap the order
        </button>
      </section>

      <section className="ad-block">
        <h3 className="ad-h3">If neither list can be reached</h3>
        <div className="ad-seg2" role="radiogroup" aria-label="If neither list can be reached">
          <button type="button" role="radio" aria-checked={settings.onUnreachable === "block"} className={settings.onUnreachable === "block" ? "on" : ""} onClick={() => void save({ onUnreachable: "block" })}>Block and ask to try again</button>
          <button type="button" role="radio" aria-checked={settings.onUnreachable === "allow"} className={settings.onUnreachable === "allow" ? "on" : ""} onClick={() => void save({ onUnreachable: "allow" })}>Let the order through</button>
        </div>
        <h3 className="ad-h3" style={{ marginTop: 6 }}>Remember a number that passed for</h3>
        <div className="ad-seg2" role="radiogroup" aria-label="Remember a passed number for">
          <button type="button" role="radio" aria-checked={settings.cacheHours === 1} className={settings.cacheHours === 1 ? "on" : ""} onClick={() => void save({ cacheHours: 1 })}>1 hour</button>
          <button type="button" role="radio" aria-checked={settings.cacheHours === 24} className={settings.cacheHours === 24 ? "on" : ""} onClick={() => void save({ cacheHours: 24 })}>24 hours</button>
        </div>
      </section>

      <section className="ad-block">
        <h3 className="ad-h3">Verification page link</h3>
        <label className="ed-muted" htmlFor="verify-link" style={{ fontSize: 12 }}>Customers who tap Submit number to be verified go here. Paste the address of the page where new numbers are added.</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input id="verify-link" className="ad-input" type="url" inputMode="url" placeholder="https://" value={link} onChange={(e) => setLink(e.target.value)} />
          <button type="button" className="ed-btn y" style={{ minHeight: 48 }} onClick={() => void save({ verifyUrl: link }, link.trim() ? "Link saved." : "Link removed.")}>Save</button>
        </div>
        {!settings.verifyUrl && <p className="ad-warn">No link yet. Customers with a new number will be told to ask us on WhatsApp instead.</p>}
      </section>

      <section className="ad-block">
        <h3 className="ad-h3">Test a number</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="ad-input" type="tel" inputMode="tel" placeholder="024 123 4567" aria-label="Number to test" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />
          <button type="button" className="ed-btn y" style={{ minHeight: 48 }} disabled={testing || testPhone.replace(/\D/g, "").length < 10} onClick={() => void runTest()}>{testing ? "…" : "Check"}</button>
        </div>
        {result && (
          <div className="ad-chips2" aria-live="polite">
            {(["yhangmhany", "inventor"] as const).map((id) => {
              const a = ANSWER_TEXT[result.answers[id]];
              return <span key={id} className={a.good ? "ad-chipok" : "ad-chipwarn"} style={a.good === false ? { background: "rgba(239,68,68,.14)", color: "var(--ed-red)" } : undefined}>{byId[id].label}: {a.text}</span>;
            })}
          </div>
        )}
        {result && <p className="ed-muted" style={{ margin: 0, fontSize: 12 }}>{result.answers.yhangmhany === "verified" || result.answers.inventor === "verified" ? "This number can buy data." : result.answers.yhangmhany === "not_verified" && result.answers.inventor === "not_verified" ? "Blocked at checkout. Send this number to be verified." : "Could not be confirmed. The setting above decides what happens."}</p>}
      </section>

      <section className="ad-block">
        <div className="ad-orders-head" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <h3 className="ad-h3" style={{ margin: 0 }}>Numbers turned away <span className="ed-muted" style={{ fontWeight: 400 }}>({data.blockedToday} today)</span></h3>
          {needsVerifying.length > 0 && (
            <button type="button" className="ed-btn o" style={{ minHeight: 44 }} onClick={() => { navigator.clipboard?.writeText(needsVerifying.map((b) => b.phone).join("\n")).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); }}>
              <Icon name="copy" small />{copied ? "Copied" : `Copy all ${needsVerifying.length}`}
            </button>
          )}
        </div>
        {data.blocked.length === 0 ? <p className="ed-muted" style={{ margin: 0 }}>Nothing blocked yet.</p> : (
          <div>
            {data.blocked.slice(0, 30).map((b) => (
              <div key={b.phone} className="ad-numrow">
                <span><b className="ed-num">{spaced(b.phone)}</b><small>{when(b.last)}, {b.tries} {b.tries === 1 ? "try" : "tries"}</small></span>
                <span className={`ad-pill`} style={b.status === "not_verified" ? { background: "rgba(245,158,11,.16)", color: "var(--ed-amber)" } : { background: "rgba(148,163,184,.16)", color: "#94a3b8" }}>{b.status === "not_verified" ? "Needs verifying" : "Could not check"}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <details className="ad-block">
        <summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer", fontWeight: 800 }}>Every number that has ordered</summary>
        <div style={{ marginTop: 10 }}><MtnVerificationAdmin /></div>
      </details>
    </div>
  );
}
