import { useState, useEffect, useRef } from "react";

/* ── QUICK NOTES — interactive prototype ─────────────────────────────
   Field-notebook design language: olive chrome, field-paper tan,
   ruled note lines, stamped labels, signal-red record surface.
   All data in-memory. Transcription is SIMULATED in this prototype. */

const C = {
  ink: "#20261B",
  olive: "#39422C",
  oliveDeep: "#262D1D",
  oliveMid: "#5A6547",
  paper: "#F1EBD8",
  paperDark: "#E4DCC2",
  line: "#CFC5A4",
  cream: "#F8F4E7",
  red: "#B23A2A",
  redDeep: "#8E2E21",
  tan: "#B8AD89",
  check: "#4A5A36",
};

const DISPLAY = "'Oswald','Arial Narrow',system-ui,sans-serif";
const BODY = "'Public Sans',system-ui,-apple-system,sans-serif";

const START_BUCKETS = [
  { id: "temp", name: "Temp", type: "script" },
  { id: "reminders", name: "Reminders", type: "script" },
  { id: "doc", name: "Doc", type: "script" },
  { id: "wife", name: "Wife", type: "script" },
  { id: "kid", name: "Kid", type: "script" },
  { id: "todo", name: "Todo", type: "checklist" },
  { id: "grocery", name: "Grocery", type: "checklist" },
  { id: "notes", name: "Notes", type: "script" },
  { id: "thoughts", name: "Thoughts", type: "script" },
];

const SAMPLES = [
  "Tell the doc the shoulder gets worse after overhead work — ask about the nerve block follow up",
  "Ask the wife if Saturday works for the lake trip",
  "Pick up dog food and coffee filters",
  "Idea for the game — injuries should cost time not points",
  "Remind the kid dentist is Tuesday after school",
];

const GROCERY_DICT = [
  "Milk","Eggs","Bread","Coffee","Dog food","Tortillas","Ground beef",
  "Cheese","Apples","Bananas","Oatmeal","Chicken thighs","Salsa","Butter","Spinach",
];

let _id = 100;
const nid = () => "n" + _id++;

const seedNotes = [
  {
    id: nid(),
    text: "This is your inbox. Tap a bucket below to file me — that's the whole system. New recordings land here first.",
    bucket: "inbox", createdAt: Date.now() - 86400000, checked: false, hasAudio: true,
  },
  { id: nid(), text: "Ask about the vision threshold thing at next visit", bucket: "doc", createdAt: Date.now() - 172800000, checked: false, hasAudio: false },
  { id: nid(), text: "Refill list before the trip", bucket: "doc", createdAt: Date.now() - 90000000, checked: true, hasAudio: false },
  { id: nid(), text: "Milk", bucket: "grocery", createdAt: Date.now() - 300000, checked: false, hasAudio: false },
  { id: nid(), text: "Dog food", bucket: "grocery", createdAt: Date.now() - 300001, checked: false, hasAudio: false },
  { id: nid(), text: "Coffee", bucket: "grocery", createdAt: Date.now() - 300002, checked: true, hasAudio: false },
];

/* ── tiny helpers ── */
const timeAgo = (t) => {
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
};

const Stamp = ({ label }) => (
  <div style={{
    position: "absolute", inset: 0, display: "flex",
    alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 30,
  }}>
    <div style={{
      fontFamily: DISPLAY, fontWeight: 600, letterSpacing: "0.12em",
      textTransform: "uppercase", fontSize: 30, color: C.red,
      border: `4px solid ${C.red}`, borderRadius: 6, padding: "10px 22px",
      transform: "rotate(-9deg)", background: "rgba(248,244,231,0.88)",
      animation: "stampIn 420ms cubic-bezier(.2,1.4,.4,1) both",
    }}>{label}</div>
  </div>
);

/* ── main ── */
export default function QuickNotes() {
  const [screen, setScreen] = useState("record"); // record | inbox | buckets
  const [openBucket, setOpenBucket] = useState(null);
  const [buckets] = useState(START_BUCKETS);
  const [notes, setNotes] = useState(seedNotes);
  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);

  const say = (msg) => {
    setToast(msg);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 1800);
  };

  const inbox = notes.filter((n) => n.bucket === "inbox").sort((a, b) => a.createdAt - b.createdAt);

  const addNote = (text) =>
    setNotes((ns) => [...ns, { id: nid(), text, bucket: "inbox", createdAt: Date.now(), checked: false, hasAudio: true }]);

  const fileNote = (id, bucketId) =>
    setNotes((ns) => ns.map((n) => (n.id === id ? { ...n, bucket: bucketId, hasAudio: false } : n)));

  const editNote = (id, text) =>
    setNotes((ns) => ns.map((n) => (n.id === id ? { ...n, text } : n)));

  const toggleNote = (id) =>
    setNotes((ns) => ns.map((n) => (n.id === id ? { ...n, checked: !n.checked } : n)));

  const removeChecked = (bucketId) =>
    setNotes((ns) => ns.filter((n) => !(n.bucket === bucketId && n.checked)));

  const addToBucket = (bucketId, text) =>
    setNotes((ns) => [...ns, { id: nid(), text, bucket: bucketId, createdAt: Date.now(), checked: false, hasAudio: false }]);

  return (
    <div style={{
      fontFamily: BODY, background: C.oliveDeep, minHeight: "100vh",
      display: "flex", justifyContent: "center",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600&family=Public+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        button { cursor: pointer; border: none; font-family: inherit; }
        textarea { font-family: inherit; }
        @keyframes stampIn { from { transform: rotate(-9deg) scale(1.7); opacity: 0; } to { transform: rotate(-9deg) scale(1); opacity: 1; } }
        @keyframes pulseRing { 0% { transform: scale(1); opacity:.55; } 100% { transform: scale(1.55); opacity:0; } }
        @keyframes fadeUp { from { opacity:0; transform: translateY(8px);} to { opacity:1; transform:none; } }
        @keyframes blink { 50% { opacity: 0.25; } }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
      `}</style>

      <div style={{
        width: "100%", maxWidth: 430, minHeight: "100vh", background: C.paper,
        display: "flex", flexDirection: "column", position: "relative", overflow: "hidden",
      }}>
        {/* header */}
        <header style={{
          background: C.olive, color: C.cream, padding: "14px 18px 12px",
          display: "flex", alignItems: "baseline", justifyContent: "space-between",
          borderBottom: `3px solid ${C.oliveDeep}`,
        }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 21, letterSpacing: "0.14em", textTransform: "uppercase" }}>
            Quick Notes
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 12, letterSpacing: "0.2em", color: C.tan, textTransform: "uppercase" }}>
            prototype
          </div>
        </header>

        {/* body */}
        <main style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          {screen === "record" && <RecordScreen onSave={(t) => { addNote(t); say("Saved to Inbox"); }} />}
          {screen === "inbox" && (
            <TriageScreen inbox={inbox} buckets={buckets} onEdit={editNote} onFile={fileNote} onTrash={(id) => { fileNote(id, "trash"); }} say={say} />
          )}
          {screen === "buckets" && !openBucket && (
            <BucketList buckets={buckets} notes={notes} onOpen={setOpenBucket} />
          )}
          {screen === "buckets" && openBucket && (
            <BucketDetail
              bucket={buckets.find((b) => b.id === openBucket)}
              notes={notes.filter((n) => n.bucket === openBucket)}
              onBack={() => setOpenBucket(null)}
              onToggle={toggleNote}
              onClear={() => { removeChecked(openBucket); say("Cleared completed"); }}
              onAdd={(t) => addToBucket(openBucket, t)}
              groceryDict={GROCERY_DICT}
              allNotes={notes}
              say={say}
            />
          )}
        </main>

        {/* bottom nav */}
        <nav style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
          background: C.oliveDeep, borderTop: `3px solid ${C.ink}`,
        }}>
          <NavBtn label="Record" active={screen === "record"} onPress={() => { setScreen("record"); setOpenBucket(null); }}
            icon={<div style={{ width: 16, height: 16, borderRadius: 999, background: C.red, border: `2px solid ${C.cream}` }} />} />
          <NavBtn label="Inbox" active={screen === "inbox"} onPress={() => { setScreen("inbox"); setOpenBucket(null); }}
            badge={inbox.length}
            icon={<div style={{ width: 18, height: 13, border: `2.5px solid ${C.cream}`, borderRadius: 2, borderTop: `5px solid ${C.cream}` }} />} />
          <NavBtn label="Buckets" active={screen === "buckets"} onPress={() => { setScreen("buckets"); setOpenBucket(null); }}
            icon={<div style={{ display: "flex", gap: 3 }}>{[0, 1, 2].map((i) => (<div key={i} style={{ width: 5, height: 15, background: C.cream, borderRadius: 1 }} />))}</div>} />
        </nav>

        {/* toast */}
        {toast && (
          <div style={{
            position: "absolute", bottom: 96, left: "50%", transform: "translateX(-50%)",
            background: C.ink, color: C.cream, fontFamily: DISPLAY, letterSpacing: "0.08em",
            textTransform: "uppercase", fontSize: 14, padding: "12px 22px", borderRadius: 6,
            animation: "fadeUp 200ms ease both", zIndex: 50, whiteSpace: "nowrap",
          }}>{toast}</div>
        )}
      </div>
    </div>
  );
}

function NavBtn({ label, icon, active, onPress, badge }) {
  return (
    <button onClick={onPress} style={{
      background: active ? C.olive : "transparent", color: C.cream,
      minHeight: 68, display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: 5, position: "relative",
      borderTop: active ? `3px solid ${C.tan}` : "3px solid transparent", marginTop: -3,
    }}>
      {icon}
      <span style={{ fontFamily: DISPLAY, fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase" }}>{label}</span>
      {badge > 0 && (
        <span style={{
          position: "absolute", top: 8, right: "24%", background: C.red, color: C.cream,
          fontFamily: DISPLAY, fontSize: 12, fontWeight: 600, minWidth: 21, height: 21,
          borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center",
        }}>{badge}</span>
      )}
    </button>
  );
}

/* ── RECORD ── */
function RecordScreen({ onSave }) {
  const [rec, setRec] = useState(false);
  const [secs, setSecs] = useState(0);
  const [words, setWords] = useState([]);
  const sampleRef = useRef("");
  const timers = useRef([]);

  const start = () => {
    const sample = SAMPLES[Math.floor(Math.random() * SAMPLES.length)];
    sampleRef.current = sample;
    setRec(true); setSecs(0); setWords([]);
    const tick = setInterval(() => setSecs((s) => s + 1), 1000);
    timers.current.push(tick);
    sample.split(" ").forEach((w, i) => {
      timers.current.push(setTimeout(() => setWords((ws) => [...ws, w]), 500 + i * 340));
    });
  };

  const stop = () => {
    timers.current.forEach(clearTimeout);
    timers.current.forEach(clearInterval);
    timers.current = [];
    onSave(sampleRef.current);
    setRec(false); setSecs(0); setWords([]);
  };

  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current.forEach(clearInterval); }, []);

  if (!rec) {
    return (
      <button onClick={start} style={{
        flex: 1, background: C.red, color: C.cream, display: "flex",
        flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22, minHeight: 420,
      }}>
        <div style={{ position: "relative", width: 118, height: 118 }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: 999, border: `3px solid ${C.cream}`, animation: "pulseRing 2.2s ease-out infinite" }} />
          <div style={{
            position: "absolute", inset: 12, borderRadius: 999, background: C.cream,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{ width: 34, height: 34, borderRadius: 999, background: C.red }} />
          </div>
        </div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 30, letterSpacing: "0.16em", textTransform: "uppercase" }}>
          Tap to record
        </div>
        <div style={{ fontSize: 15, opacity: 0.85, maxWidth: 260, lineHeight: 1.45 }}>
          The whole screen is the button. Talk, then save. Sort it later.
        </div>
      </button>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: C.ink, color: C.cream, minHeight: 420 }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 16, height: 16, borderRadius: 999, background: C.red, animation: "blink 1.1s step-end infinite" }} />
          <div style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 46, letterSpacing: "0.06em", fontVariantNumeric: "tabular-nums" }}>
            0:{String(secs).padStart(2, "0")}
          </div>
        </div>
        <div style={{
          minHeight: 110, maxWidth: 330, textAlign: "center", fontSize: 19, lineHeight: 1.6, color: C.paperDark,
        }}>
          {words.join(" ")}
          <span style={{ opacity: 0.5 }}>▍</span>
        </div>
        <div style={{ fontFamily: DISPLAY, fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: C.oliveMid }}>
          simulated transcription — demo only
        </div>
      </div>
      <button onClick={stop} style={{
        background: C.cream, color: C.ink, minHeight: 86,
        fontFamily: DISPLAY, fontWeight: 600, fontSize: 24, letterSpacing: "0.16em", textTransform: "uppercase",
      }}>
        Stop &amp; save
      </button>
    </div>
  );
}

/* ── TRIAGE ── */
function TriageScreen({ inbox, buckets, onEdit, onFile, say }) {
  const [stamp, setStamp] = useState(null);
  const [playing, setPlaying] = useState(false);
  const note = inbox[0];

  useEffect(() => { setPlaying(false); }, [note && note.id]);

  if (!note) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 32, color: C.oliveMid, minHeight: 380 }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 24, letterSpacing: "0.12em", textTransform: "uppercase", color: C.olive }}>Inbox zero</div>
        <div style={{ fontSize: 15, textAlign: "center", maxWidth: 250, lineHeight: 1.5 }}>
          Nothing waiting. Tap Record when the next thought shows up.
        </div>
      </div>
    );
  }

  const file = (b) => {
    setStamp(b.name);
    setTimeout(() => { onFile(note.id, b.id); setStamp(null); }, 520);
  };

  return (
    <div style={{ padding: "16px 14px 20px", display: "flex", flexDirection: "column", gap: 14, position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 14, letterSpacing: "0.18em", textTransform: "uppercase", color: C.oliveMid }}>
          Sorting · {inbox.length} left
        </div>
        <div style={{ fontSize: 13, color: C.oliveMid }}>{timeAgo(note.createdAt)}</div>
      </div>

      {/* the note card — ruled field-paper */}
      <div style={{
        position: "relative", background: C.cream, borderRadius: 8,
        border: `1.5px solid ${C.line}`, boxShadow: "0 2px 0 rgba(32,38,27,0.12)",
        overflow: "hidden", animation: "fadeUp 240ms ease both",
      }}>
        {stamp && <Stamp label={stamp} />}
        <textarea
          value={note.text}
          onChange={(e) => onEdit(note.id, e.target.value)}
          rows={4}
          style={{
            width: "100%", border: "none", outline: "none", resize: "none",
            padding: "16px 18px 8px", fontSize: 18, lineHeight: "32px", color: C.ink,
            background: `repeating-linear-gradient(${C.cream} 0px, ${C.cream} 31px, ${C.line} 31px, ${C.line} 32px)`,
            backgroundAttachment: "local",
          }}
        />
        {note.hasAudio && (
          <div style={{
            display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
            borderTop: `1.5px dashed ${C.line}`, background: C.paperDark,
          }}>
            <button onClick={() => { setPlaying(true); setTimeout(() => setPlaying(false), 2600); }} style={{
              width: 48, height: 48, borderRadius: 999, background: C.olive, color: C.cream,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              {playing
                ? <div style={{ display: "flex", gap: 4 }}><div style={{ width: 5, height: 18, background: C.cream }} /><div style={{ width: 5, height: 18, background: C.cream }} /></div>
                : <div style={{ width: 0, height: 0, borderTop: "10px solid transparent", borderBottom: "10px solid transparent", borderLeft: `16px solid ${C.cream}`, marginLeft: 4 }} />}
            </button>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: C.oliveMid, marginBottom: 5 }}>
                audio kept until filed — check the words
              </div>
              <div style={{ height: 6, background: C.line, borderRadius: 99, overflow: "hidden" }}>
                <div style={{
                  height: "100%", background: C.olive, borderRadius: 99,
                  width: playing ? "100%" : "0%", transition: playing ? "width 2.6s linear" : "none",
                }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* bucket grid */}
      <div style={{ fontFamily: DISPLAY, fontSize: 13, letterSpacing: "0.18em", textTransform: "uppercase", color: C.oliveMid, marginTop: 2 }}>
        File to
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9 }}>
        {buckets.map((b) => (
          <button key={b.id} onClick={() => file(b)} style={{
            minHeight: 58, background: C.paperDark, border: `1.5px solid ${C.tan}`,
            borderRadius: 7, fontFamily: DISPLAY, fontWeight: 500, fontSize: 15,
            letterSpacing: "0.08em", textTransform: "uppercase", color: C.ink,
          }}>{b.name}</button>
        ))}
      </div>
      <button onClick={() => file({ id: "trash", name: "Trash" })} style={{
        minHeight: 54, background: "transparent", border: `1.5px dashed ${C.red}`,
        borderRadius: 7, fontFamily: DISPLAY, fontSize: 14, letterSpacing: "0.14em",
        textTransform: "uppercase", color: C.red,
      }}>Trash it</button>
    </div>
  );
}

/* ── BUCKET LIST ── */
function BucketList({ buckets, notes, onOpen }) {
  return (
    <div style={{ padding: "16px 14px 20px", display: "flex", flexDirection: "column", gap: 9 }}>
      <div style={{ fontFamily: DISPLAY, fontSize: 14, letterSpacing: "0.18em", textTransform: "uppercase", color: C.oliveMid, marginBottom: 4 }}>
        Buckets
      </div>
      {buckets.map((b) => {
        const items = notes.filter((n) => n.bucket === b.id);
        const open = items.filter((n) => !n.checked).length;
        return (
          <button key={b.id} onClick={() => onOpen(b.id)} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            minHeight: 64, padding: "0 18px", background: C.cream,
            border: `1.5px solid ${C.line}`, borderLeft: `6px solid ${C.olive}`,
            borderRadius: 7, textAlign: "left",
          }}>
            <div>
              <div style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 18, letterSpacing: "0.08em", textTransform: "uppercase", color: C.ink }}>{b.name}</div>
              <div style={{ fontSize: 13, color: C.oliveMid, marginTop: 2 }}>
                {b.type === "checklist" ? "checklist" : "read-down script"}
              </div>
            </div>
            <div style={{
              fontFamily: DISPLAY, fontWeight: 600, fontSize: 17, color: open ? C.cream : C.oliveMid,
              background: open ? C.olive : "transparent", border: open ? "none" : `1.5px solid ${C.line}`,
              minWidth: 34, height: 34, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center",
            }}>{open}</div>
          </button>
        );
      })}
    </div>
  );
}

/* ── BUCKET DETAIL ── */
function BucketDetail({ bucket, notes, onBack, onToggle, onClear, onAdd, groceryDict, allNotes, say }) {
  const [draft, setDraft] = useState("");
  const isChecklist = bucket.type === "checklist";
  const active = notes.filter((n) => !n.checked).sort((a, b) => a.createdAt - b.createdAt);
  const done = notes.filter((n) => n.checked).sort((a, b) => a.createdAt - b.createdAt);

  // autocomplete: dictionary + everything ever filed to this bucket
  const history = [...new Set([...groceryDict, ...allNotes.filter((n) => n.bucket === bucket.id).map((n) => n.text)])];
  const suggestions = draft.length >= 1
    ? history.filter((h) => h.toLowerCase().startsWith(draft.toLowerCase()) && h.toLowerCase() !== draft.toLowerCase()).slice(0, 3)
    : [];

  const submit = (text) => {
    const t = (text || draft).trim();
    if (!t) return;
    onAdd(t); setDraft("");
  };

  return (
    <div style={{ padding: "16px 14px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} style={{
          minWidth: 52, minHeight: 48, background: C.paperDark, border: `1.5px solid ${C.tan}`,
          borderRadius: 7, fontFamily: DISPLAY, fontSize: 20, color: C.ink,
        }}>←</button>
        <div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 22, letterSpacing: "0.1em", textTransform: "uppercase", color: C.ink }}>{bucket.name}</div>
          <div style={{ fontSize: 13, color: C.oliveMid }}>{isChecklist ? "tap to cross off" : "your call script — tap as you cover each"}</div>
        </div>
      </div>

      {/* checklist quick-add with autocomplete */}
      {isChecklist && (
        <div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder={"Add to " + bucket.name.toLowerCase() + "…"}
              style={{
                flex: 1, minHeight: 54, padding: "0 16px", fontSize: 17, color: C.ink,
                background: C.cream, border: `1.5px solid ${C.line}`, borderRadius: 7, outline: "none",
              }}
            />
            <button onClick={() => submit()} style={{
              minWidth: 62, background: C.olive, color: C.cream, borderRadius: 7,
              fontFamily: DISPLAY, fontWeight: 600, fontSize: 15, letterSpacing: "0.1em", textTransform: "uppercase",
            }}>Add</button>
          </div>
          {suggestions.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {suggestions.map((s) => (
                <button key={s} onClick={() => submit(s)} style={{
                  minHeight: 44, padding: "0 16px", background: C.paperDark,
                  border: `1.5px dashed ${C.tan}`, borderRadius: 99, fontSize: 15, color: C.ink,
                }}>{s}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* items */}
      <div style={{
        background: C.cream, border: `1.5px solid ${C.line}`, borderRadius: 8, overflow: "hidden",
        boxShadow: "0 2px 0 rgba(32,38,27,0.12)",
      }}>
        {active.length === 0 && done.length === 0 && (
          <div style={{ padding: 24, fontSize: 15, color: C.oliveMid, textAlign: "center" }}>
            Empty. Recordings you file to {bucket.name} land here.
          </div>
        )}
        {[...active, ...done].map((n, i) => (
          <button key={n.id} onClick={() => onToggle(n.id)} style={{
            display: "flex", alignItems: "flex-start", gap: 14, width: "100%",
            minHeight: 58, padding: "14px 16px", textAlign: "left", background: "transparent",
            borderTop: i === 0 ? "none" : `1px solid ${C.line}`,
            opacity: n.checked ? 0.55 : 1,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: isChecklist ? 6 : 999, flexShrink: 0, marginTop: 1,
              border: `2.5px solid ${n.checked ? C.check : C.tan}`,
              background: n.checked ? C.check : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: C.cream, fontWeight: 700, fontSize: 16,
            }}>{n.checked ? "✓" : ""}</div>
            <div style={{
              fontSize: 17, lineHeight: 1.45, color: C.ink,
              textDecoration: n.checked ? "line-through" : "none",
            }}>{n.text}</div>
          </button>
        ))}
      </div>

      {/* actions */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
        <button onClick={() => say("Copied as text")} style={{
          minHeight: 54, background: C.paperDark, border: `1.5px solid ${C.tan}`, borderRadius: 7,
          fontFamily: DISPLAY, fontSize: 14, letterSpacing: "0.1em", textTransform: "uppercase", color: C.ink,
        }}>Copy as text</button>
        <button onClick={() => say("Opening share sheet…")} style={{
          minHeight: 54, background: C.paperDark, border: `1.5px solid ${C.tan}`, borderRadius: 7,
          fontFamily: DISPLAY, fontSize: 14, letterSpacing: "0.1em", textTransform: "uppercase", color: C.ink,
        }}>Email to myself</button>
      </div>
      {isChecklist && done.length > 0 && (
        <button onClick={onClear} style={{
          minHeight: 54, background: "transparent", border: `1.5px dashed ${C.red}`, borderRadius: 7,
          fontFamily: DISPLAY, fontSize: 14, letterSpacing: "0.14em", textTransform: "uppercase", color: C.red,
        }}>Clear completed ({done.length})</button>
      )}
    </div>
  );
}
