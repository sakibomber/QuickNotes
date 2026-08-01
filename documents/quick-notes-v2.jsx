import { useState, useEffect, useRef } from "react";
import {
  Stethoscope, Heart, Users, Bell, CheckSquare, ShoppingCart,
  FileText, MessageCircle, Clock, Search, Settings, Inbox as InboxIcon,
  Archive, Mic, Play, Pause, Trash2, ChevronLeft, Check, Sun, Moon,
} from "lucide-react";

/* ── QUICK NOTES v2 — locked decisions build ─────────────────────────
   Inbox-first landing · dark primary + sepia light · 5-slot nav with
   center Record · swipe OR tap to file · bucket colors+icons · search
   · settings w/ audio retention. Transcription SIMULATED. */

const THEMES = {
  dark: {
    name: "dark",
    app: "#171B12", chrome: "#20261B", chromeLine: "#0E110A",
    surface: "#242B1D", surfaceAlt: "#2C3424", line: "#3A4430",
    text: "#EFE9D6", sub: "#9AA282", faint: "#6B7455",
    card: "#22291B", rule: "#333D28",
    red: "#C74A38", redText: "#F3D9D2", cream: "#F8F4E7",
    tan: "#B8AD89", olive: "#556440", check: "#7C9159",
  },
  sepia: {
    name: "sepia",
    app: "#EAE2C8", chrome: "#39422C", chromeLine: "#262D1D",
    surface: "#F1EBD8", surfaceAlt: "#E4DCC2", line: "#CFC5A4",
    text: "#20261B", sub: "#5A6547", faint: "#8B916F",
    card: "#F8F4E7", rule: "#D8CFB2",
    red: "#B23A2A", redText: "#F8F4E7", cream: "#F8F4E7",
    tan: "#B8AD89", olive: "#39422C", check: "#4A5A36",
  },
};

const DISPLAY = "'Oswald','Arial Narrow',system-ui,sans-serif";
const BODY = "'Public Sans',system-ui,-apple-system,sans-serif";

const BUCKETS = [
  { id: "temp", name: "Temp", type: "script", color: "#8B916F", Icon: Clock },
  { id: "reminders", name: "Reminders", type: "script", color: "#B07D3E", Icon: Bell },
  { id: "doc", name: "Doc", type: "script", color: "#3E6E8E", Icon: Stethoscope },
  { id: "wife", name: "Wife", type: "script", color: "#9E4A6B", Icon: Heart },
  { id: "kid", name: "Kid", type: "script", color: "#4E8E7A", Icon: Users },
  { id: "todo", name: "Todo", type: "checklist", color: "#5F6EA8", Icon: CheckSquare },
  { id: "grocery", name: "Grocery", type: "checklist", color: "#5E8E45", Icon: ShoppingCart },
  { id: "notes", name: "Notes", type: "script", color: "#7A7364", Icon: FileText },
  { id: "thoughts", name: "Thoughts", type: "script", color: "#7A5AA0", Icon: MessageCircle },
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
  { id: nid(), text: "This is your inbox. Swipe me right to file, left to trash — or just tap a bucket below. New recordings land here.", bucket: "inbox", createdAt: Date.now() - 86400000, checked: false, hasAudio: true },
  { id: nid(), text: "Follow up on shoulder pain and MRI results", bucket: "doc", createdAt: Date.now() - 172800000, checked: false, hasAudio: false },
  { id: nid(), text: "Ask about the vision threshold thing", bucket: "doc", createdAt: Date.now() - 90000000, checked: false, hasAudio: false },
  { id: nid(), text: "Refill list before the trip", bucket: "doc", createdAt: Date.now() - 260000000, checked: true, hasAudio: false },
  { id: nid(), text: "Milk", bucket: "grocery", createdAt: Date.now() - 300000, checked: false, hasAudio: false },
  { id: nid(), text: "Dog food", bucket: "grocery", createdAt: Date.now() - 300001, checked: false, hasAudio: false },
  { id: nid(), text: "Coffee", bucket: "grocery", createdAt: Date.now() - 300002, checked: true, hasAudio: false },
  { id: nid(), text: "Pain is temporary. Quitting lasts forever.", bucket: "thoughts", createdAt: Date.now() - 500000000, checked: false, hasAudio: false },
];

const timeAgo = (t) => {
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h";
  return Math.floor(h / 24) + "d";
};

/* ════════════════════════════ APP ════════════════════════════ */
export default function QuickNotes() {
  const [themeName, setThemeName] = useState("dark");
  const T = THEMES[themeName];
  const [tab, setTab] = useState("inbox"); // inbox | buckets | record | search | settings
  const [openBucket, setOpenBucket] = useState(null);
  const [notes, setNotes] = useState(seedNotes);
  const [retention, setRetention] = useState("filed"); // filed | always | ask
  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);

  const say = (m) => { setToast(m); clearTimeout(toastRef.current); toastRef.current = setTimeout(() => setToast(null), 1700); };

  const inbox = notes.filter((n) => n.bucket === "inbox").sort((a, b) => a.createdAt - b.createdAt);

  const addNote = (text) => setNotes((ns) => [...ns, { id: nid(), text, bucket: "inbox", createdAt: Date.now(), checked: false, hasAudio: true }]);
  const fileNote = (id, bucketId) => setNotes((ns) => ns.map((n) => n.id === id ? { ...n, bucket: bucketId, hasAudio: retention === "always" ? n.hasAudio : false } : n));
  const trashNote = (id) => setNotes((ns) => ns.filter((n) => n.id !== id));
  const editNote = (id, text) => setNotes((ns) => ns.map((n) => (n.id === id ? { ...n, text } : n)));
  const toggleNote = (id) => setNotes((ns) => ns.map((n) => (n.id === id ? { ...n, checked: !n.checked } : n)));
  const clearChecked = (bid) => setNotes((ns) => ns.filter((n) => !(n.bucket === bid && n.checked)));
  const addToBucket = (bid, text) => setNotes((ns) => [...ns, { id: nid(), text, bucket: bid, createdAt: Date.now(), checked: false, hasAudio: false }]);

  return (
    <div style={{ fontFamily: BODY, background: "#0C0E08", minHeight: "100vh", display: "flex", justifyContent: "center" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600&family=Public+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        button { cursor: pointer; border: none; font-family: inherit; background: none; padding: 0; }
        input, textarea { font-family: inherit; }
        @keyframes stampIn { from { transform: rotate(-9deg) scale(1.7); opacity: 0; } to { transform: rotate(-9deg) scale(1); opacity: 1; } }
        @keyframes pulseRing { 0% { transform: scale(1); opacity:.55; } 100% { transform: scale(1.55); opacity:0; } }
        @keyframes fadeUp { from { opacity:0; transform: translateY(8px);} to { opacity:1; transform:none; } }
        @keyframes blink { 50% { opacity: 0.25; } }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
      `}</style>

      <div style={{ width: "100%", maxWidth: 430, height: "100dvh", background: T.app, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden", transition: "background 240ms" }}>
        {/* header */}
        <header style={{ background: T.chrome, color: T.cream, padding: "13px 18px 11px", display: "flex", alignItems: "baseline", justifyContent: "space-between", borderBottom: `3px solid ${T.chromeLine}` }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 20, letterSpacing: "0.14em", textTransform: "uppercase" }}>Quick Notes</div>
          <div style={{ fontFamily: DISPLAY, fontSize: 11, letterSpacing: "0.2em", color: T.tan, textTransform: "uppercase" }}>Capture · File · Remember</div>
        </header>

        {/* body */}
        <main style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          {tab === "record" && <RecordScreen T={T} onSave={(t) => { addNote(t); say("Saved to Inbox"); setTab("inbox"); }} />}
          {tab === "inbox" && <Triage T={T} inbox={inbox} onEdit={editNote} onFile={fileNote} onTrash={trashNote} say={say} goRecord={() => setTab("record")} />}
          {tab === "buckets" && !openBucket && <BucketList T={T} notes={notes} onOpen={setOpenBucket} />}
          {tab === "buckets" && openBucket && (
            <BucketDetail T={T} bucket={BUCKETS.find((b) => b.id === openBucket)} notes={notes.filter((n) => n.bucket === openBucket)}
              onBack={() => setOpenBucket(null)} onToggle={toggleNote} onClear={() => { clearChecked(openBucket); say("Cleared completed"); }}
              onAdd={(t) => addToBucket(openBucket, t)} allNotes={notes} say={say} />
          )}
          {tab === "search" && <SearchScreen T={T} notes={notes} />}
          {tab === "settings" && <SettingsScreen T={T} themeName={themeName} setThemeName={setThemeName} retention={retention} setRetention={setRetention} say={say} />}
        </main>

        {/* 5-slot nav, raised center record */}
        <nav style={{ display: "grid", gridTemplateColumns: "1fr 1fr 92px 1fr 1fr", background: T.chrome, borderTop: `3px solid ${T.chromeLine}`, position: "relative" }}>
          <NavBtn T={T} label="Inbox" Icon={InboxIcon} active={tab === "inbox"} badge={inbox.length} onPress={() => { setTab("inbox"); setOpenBucket(null); }} />
          <NavBtn T={T} label="Buckets" Icon={Archive} active={tab === "buckets"} onPress={() => { setTab("buckets"); setOpenBucket(null); }} />
          <div style={{ position: "relative" }}>
            <button onClick={() => setTab("record")} aria-label="Record" style={{
              position: "absolute", left: "50%", top: -26, transform: "translateX(-50%)",
              width: 72, height: 72, borderRadius: 999, background: T.red,
              border: `4px solid ${T.chrome}`, boxShadow: "0 3px 10px rgba(0,0,0,0.35)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Mic size={30} color={T.cream} strokeWidth={2.2} />
            </button>
            <div style={{ height: 68, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 7 }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: T.tan }}>Record</span>
            </div>
          </div>
          <NavBtn T={T} label="Search" Icon={Search} active={tab === "search"} onPress={() => { setTab("search"); setOpenBucket(null); }} />
          <NavBtn T={T} label="Settings" Icon={Settings} active={tab === "settings"} onPress={() => { setTab("settings"); setOpenBucket(null); }} />
        </nav>

        {toast && (
          <div style={{ position: "absolute", bottom: 100, left: "50%", transform: "translateX(-50%)", background: T.text, color: T.app, fontFamily: DISPLAY, letterSpacing: "0.08em", textTransform: "uppercase", fontSize: 14, padding: "12px 22px", borderRadius: 6, animation: "fadeUp 200ms ease both", zIndex: 60, whiteSpace: "nowrap" }}>{toast}</div>
        )}
      </div>
    </div>
  );
}

function NavBtn({ T, label, Icon, active, onPress, badge }) {
  return (
    <button onClick={onPress} style={{ minHeight: 68, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, position: "relative", background: active ? T.chromeLine : "transparent", borderTop: active ? `3px solid ${T.tan}` : "3px solid transparent", marginTop: -3, color: active ? T.cream : T.tan }}>
      <Icon size={21} strokeWidth={2} />
      <span style={{ fontFamily: DISPLAY, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase" }}>{label}</span>
      {badge > 0 && (
        <span style={{ position: "absolute", top: 7, right: "18%", background: T.red, color: T.cream, fontFamily: DISPLAY, fontSize: 11, fontWeight: 600, minWidth: 20, height: 20, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center" }}>{badge}</span>
      )}
    </button>
  );
}

/* ════════════════════════════ RECORD ════════════════════════════ */
function RecordScreen({ T, onSave }) {
  const [rec, setRec] = useState(true); // auto-start: the shortcut lands here hot
  const [secs, setSecs] = useState(0);
  const [words, setWords] = useState([]);
  const sampleRef = useRef(SAMPLES[Math.floor(Math.random() * SAMPLES.length)]);
  const timers = useRef([]);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!rec || startedRef.current) return;
    startedRef.current = true;
    const tick = setInterval(() => setSecs((s) => s + 1), 1000);
    timers.current.push(tick);
    sampleRef.current.split(" ").forEach((w, i) => {
      timers.current.push(setTimeout(() => setWords((ws) => [...ws, w]), 600 + i * 330));
    });
    return () => { timers.current.forEach(clearTimeout); timers.current.forEach(clearInterval); };
  }, [rec]);

  const stop = () => {
    timers.current.forEach(clearTimeout); timers.current.forEach(clearInterval);
    onSave(sampleRef.current);
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#14170F", color: T.cream, minHeight: 430 }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, padding: 24 }}>
        <div style={{ position: "relative", width: 96, height: 96 }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: 999, border: `3px solid ${T.red}`, animation: "pulseRing 2s ease-out infinite" }} />
          <div style={{ position: "absolute", inset: 14, borderRadius: 999, background: T.red, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Mic size={34} color={T.cream} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 14, height: 14, borderRadius: 999, background: T.red, animation: "blink 1.1s step-end infinite" }} />
          <div style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 44, letterSpacing: "0.06em", fontVariantNumeric: "tabular-nums" }}>
            0:{String(secs).padStart(2, "0")}
          </div>
        </div>
        <div style={{ minHeight: 100, maxWidth: 330, textAlign: "center", fontSize: 19, lineHeight: 1.6, color: "#CFC9AF" }}>
          {words.join(" ")}<span style={{ opacity: 0.5 }}>▍</span>
        </div>
        <div style={{ fontFamily: DISPLAY, fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: "#6B7455" }}>
          recording started on open · simulated transcription
        </div>
      </div>
      <button onClick={stop} style={{ background: T.cream, color: "#20261B", minHeight: 88, fontFamily: DISPLAY, fontWeight: 600, fontSize: 24, letterSpacing: "0.16em", textTransform: "uppercase" }}>
        Stop &amp; save
      </button>
    </div>
  );
}

/* ════════════════════════════ TRIAGE ════════════════════════════ */
function Triage({ T, inbox, onEdit, onFile, onTrash, say, goRecord }) {
  const note = inbox[0];
  const [stamp, setStamp] = useState(null);
  const [picker, setPicker] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dx, setDx] = useState(0);
  const drag = useRef(null);

  useEffect(() => { setPlaying(false); setDx(0); setPicker(false); setEditing(false); }, [note && note.id]);

  if (!note) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 32, minHeight: 380 }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 24, letterSpacing: "0.12em", textTransform: "uppercase", color: T.text }}>Inbox zero</div>
        <div style={{ fontSize: 15, textAlign: "center", maxWidth: 250, lineHeight: 1.5, color: T.sub }}>Nothing waiting. Catch the next thought before it gets away.</div>
        <button onClick={goRecord} style={{ marginTop: 8, minHeight: 56, padding: "0 28px", background: T.red, color: T.cream, borderRadius: 8, fontFamily: DISPLAY, fontWeight: 600, fontSize: 16, letterSpacing: "0.12em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 10 }}>
          <Mic size={20} /> Record
        </button>
      </div>
    );
  }

  const doFile = (b) => {
    setPicker(false); setStamp(b.name); setDx(0);
    setTimeout(() => { onFile(note.id, b.id); setStamp(null); }, 500);
  };
  const doTrash = () => {
    setStamp("Trash"); setDx(0);
    setTimeout(() => { onTrash(note.id); setStamp(null); say("Trashed"); }, 450);
  };

  /* whole-screen swipe surface (disabled while editing) */
  const onDown = (e) => { if (editing || picker || stamp) return; drag.current = e.clientX; e.currentTarget.setPointerCapture(e.pointerId); };
  const onMove = (e) => { if (drag.current !== null) setDx(e.clientX - drag.current); };
  const onUp = () => {
    if (drag.current === null) return;
    const d = dx; drag.current = null;
    if (d > 90) { setPicker(true); setDx(0); }
    else if (d < -90) doTrash();
    else setDx(0);
  };

  return (
    <div
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      style={{ padding: "16px 14px 20px", display: "flex", flexDirection: "column", gap: 13, position: "relative", flex: 1, touchAction: "pan-y" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 13, letterSpacing: "0.18em", textTransform: "uppercase", color: T.sub }}>Sorting · {inbox.length} left</div>
        <div style={{ fontSize: 13, color: T.sub }}>{timeAgo(note.createdAt)} ago</div>
      </div>

      {/* swipe hints */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 6px", pointerEvents: "none" }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 14, letterSpacing: "0.12em", textTransform: "uppercase", color: T.red, opacity: dx < -30 ? 1 : 0.35, display: "flex", alignItems: "center", gap: 6 }}><Trash2 size={17} /> ← Trash</div>
        <div style={{ fontFamily: DISPLAY, fontSize: 14, letterSpacing: "0.12em", textTransform: "uppercase", color: T.check, opacity: dx > 30 ? 1 : 0.35 }}>File →</div>
      </div>

      {/* the card */}
      <div style={{
        position: "relative", background: T.card, borderRadius: 8, border: `1.5px solid ${T.line}`,
        boxShadow: "0 2px 0 rgba(0,0,0,0.25)", overflow: "hidden",
        transform: `translateX(${dx}px) rotate(${dx / 60}deg)`,
        transition: drag.current === null ? "transform 200ms ease" : "none",
        animation: "fadeUp 240ms ease both",
      }}>
        {stamp && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 30 }}>
            <div style={{ fontFamily: DISPLAY, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 28, color: T.red, border: `4px solid ${T.red}`, borderRadius: 6, padding: "9px 20px", transform: "rotate(-9deg)", background: T.card + "E6", animation: "stampIn 420ms cubic-bezier(.2,1.4,.4,1) both" }}>{stamp}</div>
          </div>
        )}
        {editing ? (
          <div>
            <textarea autoFocus value={note.text} onChange={(e) => onEdit(note.id, e.target.value)} rows={4}
              style={{ width: "100%", border: "none", outline: "none", resize: "none", padding: "15px 18px 8px", fontSize: 18, lineHeight: "32px", color: T.text, background: `repeating-linear-gradient(${T.card} 0px, ${T.card} 31px, ${T.rule} 31px, ${T.rule} 32px)`, backgroundAttachment: "local" }} />
            <button onClick={() => setEditing(false)} style={{ width: "100%", minHeight: 50, background: T.olive, color: T.cream, fontFamily: DISPLAY, fontWeight: 600, fontSize: 14, letterSpacing: "0.12em", textTransform: "uppercase" }}>Done editing</button>
          </div>
        ) : (
          <div style={{ position: "relative", padding: "15px 54px 12px 18px", fontSize: 18, lineHeight: "32px", color: T.text, minHeight: 128, background: `repeating-linear-gradient(${T.card} 0px, ${T.card} 31px, ${T.rule} 31px, ${T.rule} 32px)`, userSelect: "none" }}>
            {note.text}
            <button onClick={() => setEditing(true)} aria-label="Edit note" style={{ position: "absolute", top: 8, right: 8, width: 44, height: 44, borderRadius: 999, background: T.surfaceAlt, border: `1.5px solid ${T.line}`, display: "flex", alignItems: "center", justifyContent: "center", color: T.sub }}>
              <FileText size={18} />
            </button>
          </div>
        )}
        {note.hasAudio && !editing && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderTop: `1.5px dashed ${T.line}`, background: T.surfaceAlt }}>
            <button onClick={() => { setPlaying(true); setTimeout(() => setPlaying(false), 2600); }} style={{ width: 48, height: 48, borderRadius: 999, background: T.olive, color: T.cream, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {playing ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: 3 }} />}
            </button>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: T.sub, marginBottom: 5 }}>audio kept until filed — check the words</div>
              <div style={{ height: 6, background: T.line, borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", background: T.olive, borderRadius: 99, width: playing ? "100%" : "0%", transition: playing ? "width 2.6s linear" : "none" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* tap-to-file grid */}
      <div style={{ fontFamily: DISPLAY, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: T.sub }}>File to</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9 }}>
        {BUCKETS.map((b) => (
          <button key={b.id} onClick={() => doFile(b)} style={{ minHeight: 60, background: T.surface, border: `1.5px solid ${T.line}`, borderTop: `4px solid ${b.color}`, borderRadius: 7, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, color: T.text }}>
            <b.Icon size={17} color={b.color} strokeWidth={2.2} />
            <span style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 13.5, letterSpacing: "0.07em", textTransform: "uppercase" }}>{b.name}</span>
          </button>
        ))}
      </div>
      <button onClick={doTrash} style={{ minHeight: 52, border: `1.5px dashed ${T.red}`, borderRadius: 7, fontFamily: DISPLAY, fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", color: T.red, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <Trash2 size={16} /> Trash it
      </button>

      {/* swipe-right full picker overlay */}
      {picker && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 80 }} onClick={() => setPicker(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 430, background: T.app, borderRadius: "14px 14px 0 0", padding: "18px 14px 24px", animation: "fadeUp 200ms ease both" }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 14, letterSpacing: "0.18em", textTransform: "uppercase", color: T.sub, marginBottom: 12, textAlign: "center" }}>File to</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {BUCKETS.map((b) => (
                <button key={b.id} onClick={() => doFile(b)} style={{ minHeight: 72, background: T.surface, border: `1.5px solid ${T.line}`, borderTop: `4px solid ${b.color}`, borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, color: T.text }}>
                  <b.Icon size={20} color={b.color} strokeWidth={2.2} />
                  <span style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 14, letterSpacing: "0.07em", textTransform: "uppercase" }}>{b.name}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setPicker(false)} style={{ width: "100%", minHeight: 52, marginTop: 12, fontFamily: DISPLAY, fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", color: T.sub, border: `1.5px solid ${T.line}`, borderRadius: 7 }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════ BUCKETS ════════════════════════════ */
function BucketList({ T, notes, onOpen }) {
  return (
    <div style={{ padding: "16px 14px 20px", display: "flex", flexDirection: "column", gap: 9 }}>
      <div style={{ fontFamily: DISPLAY, fontSize: 13, letterSpacing: "0.18em", textTransform: "uppercase", color: T.sub, marginBottom: 3 }}>Buckets</div>
      {BUCKETS.map((b) => {
        const items = notes.filter((n) => n.bucket === b.id);
        const open = items.filter((n) => !n.checked).length;
        return (
          <button key={b.id} onClick={() => onOpen(b.id)} style={{ display: "flex", alignItems: "center", gap: 14, minHeight: 64, padding: "0 16px", background: T.surface, border: `1.5px solid ${T.line}`, borderLeft: `6px solid ${b.color}`, borderRadius: 7, textAlign: "left" }}>
            <b.Icon size={22} color={b.color} strokeWidth={2.2} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 17, letterSpacing: "0.08em", textTransform: "uppercase", color: T.text }}>{b.name}</div>
              <div style={{ fontSize: 12.5, color: T.sub, marginTop: 1 }}>{b.type === "checklist" ? "checklist" : "read-down script"}</div>
            </div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 16, color: open ? T.cream : T.faint, background: open ? b.color : "transparent", border: open ? "none" : `1.5px solid ${T.line}`, minWidth: 33, height: 33, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center" }}>{open}</div>
          </button>
        );
      })}
    </div>
  );
}

function BucketDetail({ T, bucket, notes, onBack, onToggle, onClear, onAdd, allNotes, say }) {
  const [draft, setDraft] = useState("");
  const isChecklist = bucket.type === "checklist";
  const active = notes.filter((n) => !n.checked).sort((a, b) => a.createdAt - b.createdAt);
  const done = notes.filter((n) => n.checked).sort((a, b) => a.createdAt - b.createdAt);
  const history = [...new Set([...(bucket.id === "grocery" ? GROCERY_DICT : []), ...allNotes.filter((n) => n.bucket === bucket.id).map((n) => n.text)])];
  const suggestions = draft.length >= 1 ? history.filter((h) => h.toLowerCase().startsWith(draft.toLowerCase()) && h.toLowerCase() !== draft.toLowerCase()).slice(0, 3) : [];
  const submit = (text) => { const t = (text || draft).trim(); if (!t) return; onAdd(t); setDraft(""); };

  return (
    <div style={{ padding: "16px 14px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} style={{ minWidth: 52, minHeight: 48, background: T.surface, border: `1.5px solid ${T.line}`, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", color: T.text }}><ChevronLeft size={24} /></button>
        <bucket.Icon size={24} color={bucket.color} strokeWidth={2.2} />
        <div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 21, letterSpacing: "0.1em", textTransform: "uppercase", color: T.text }}>{bucket.name}</div>
          <div style={{ fontSize: 12.5, color: T.sub }}>{isChecklist ? "tap to cross off" : "your call script — tap as you cover each"}</div>
        </div>
      </div>

      {isChecklist && (
        <div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder={"Add to " + bucket.name.toLowerCase() + "…"}
              style={{ flex: 1, minHeight: 54, padding: "0 16px", fontSize: 17, color: T.text, background: T.surface, border: `1.5px solid ${T.line}`, borderRadius: 7, outline: "none" }} />
            <button onClick={() => submit()} style={{ minWidth: 62, background: T.olive, color: T.cream, borderRadius: 7, fontFamily: DISPLAY, fontWeight: 600, fontSize: 14, letterSpacing: "0.1em", textTransform: "uppercase" }}>Add</button>
          </div>
          {suggestions.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {suggestions.map((s) => (
                <button key={s} onClick={() => submit(s)} style={{ minHeight: 44, padding: "0 16px", background: T.surfaceAlt, border: `1.5px dashed ${T.tan}`, borderRadius: 99, fontSize: 15, color: T.text }}>{s}</button>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ background: T.card, border: `1.5px solid ${T.line}`, borderRadius: 8, overflow: "hidden", boxShadow: "0 2px 0 rgba(0,0,0,0.2)" }}>
        {active.length === 0 && done.length === 0 && (
          <div style={{ padding: 24, fontSize: 15, color: T.sub, textAlign: "center" }}>Empty. Recordings you file to {bucket.name} land here.</div>
        )}
        {[...active, ...done].map((n, i) => (
          <button key={n.id} onClick={() => onToggle(n.id)} style={{ display: "flex", alignItems: "flex-start", gap: 14, width: "100%", minHeight: 58, padding: "14px 16px", textAlign: "left", borderTop: i === 0 ? "none" : `1px solid ${T.line}`, opacity: n.checked ? 0.55 : 1 }}>
            <div style={{ width: 28, height: 28, borderRadius: isChecklist ? 6 : 999, flexShrink: 0, marginTop: 1, border: `2.5px solid ${n.checked ? T.check : T.tan}`, background: n.checked ? T.check : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {n.checked && <Check size={16} color={T.cream} strokeWidth={3} />}
            </div>
            <div style={{ fontSize: 17, lineHeight: 1.45, color: T.text, textDecoration: n.checked ? "line-through" : "none" }}>{n.text}</div>
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
        <button onClick={() => say("Copied as text")} style={{ minHeight: 54, background: T.surface, border: `1.5px solid ${T.line}`, borderRadius: 7, fontFamily: DISPLAY, fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase", color: T.text }}>Copy as text</button>
        <button onClick={() => say("Opening share sheet…")} style={{ minHeight: 54, background: T.surface, border: `1.5px solid ${T.line}`, borderRadius: 7, fontFamily: DISPLAY, fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase", color: T.text }}>Email to myself</button>
      </div>
      {isChecklist && done.length > 0 && (
        <button onClick={onClear} style={{ minHeight: 54, border: `1.5px dashed ${T.red}`, borderRadius: 7, fontFamily: DISPLAY, fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", color: T.red }}>Clear completed ({done.length})</button>
      )}
    </div>
  );
}
/* ════════════════════════════ SEARCH ════════════════════════════ */
function SearchScreen({ T, notes }) {
  const [q, setQ] = useState("");
  const [chip, setChip] = useState("all");
  const filed = notes.filter((n) => n.bucket !== "inbox");
  const results = filed.filter((n) =>
    (chip === "all" || n.bucket === chip) &&
    (q.trim() === "" || n.text.toLowerCase().includes(q.toLowerCase()))
  ).sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div style={{ padding: "16px 14px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, background: T.surface, border: `1.5px solid ${T.line}`, borderRadius: 7, padding: "0 14px", minHeight: 54 }}>
        <Search size={19} color={T.sub} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your notes…" style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 17, color: T.text, minHeight: 52 }} />
      </div>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
        <Chip T={T} active={chip === "all"} label="All" onPress={() => setChip("all")} />
        {BUCKETS.map((b2) => (
          <Chip T={T} key={b2.id} active={chip === b2.id} label={b2.name} color={b2.color} onPress={() => setChip(b2.id)} />
        ))}
      </div>
      <div style={{ fontFamily: DISPLAY, fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: T.sub }}>{results.length} result{results.length === 1 ? "" : "s"}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {results.map((n) => {
          const b2 = BUCKETS.find((x) => x.id === n.bucket);
          return (
            <div key={n.id} style={{ background: T.card, border: `1.5px solid ${T.line}`, borderLeft: `5px solid ${b2 ? b2.color : T.line}`, borderRadius: 7, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontFamily: DISPLAY, fontSize: 11.5, letterSpacing: "0.14em", textTransform: "uppercase", color: b2 ? b2.color : T.sub }}>{b2 ? b2.name : "?"}</span>
                <span style={{ fontSize: 12, color: T.faint }}>{timeAgo(n.createdAt)} ago</span>
              </div>
              <div style={{ fontSize: 16, lineHeight: 1.45, color: T.text, textDecoration: n.checked ? "line-through" : "none", opacity: n.checked ? 0.6 : 1 }}>{n.text}</div>
            </div>
          );
        })}
        {results.length === 0 && <div style={{ padding: 24, fontSize: 15, color: T.sub, textAlign: "center" }}>Nothing matches yet. Filed notes show up here.</div>}
      </div>
    </div>
  );
}

function Chip({ T, active, label, color, onPress }) {
  return (
    <button onClick={onPress} style={{ minHeight: 42, padding: "0 16px", borderRadius: 99, whiteSpace: "nowrap", fontFamily: DISPLAY, fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", background: active ? (color || T.olive) : T.surface, color: active ? T.cream : T.sub, border: `1.5px solid ${active ? "transparent" : T.line}` }}>{label}</button>
  );
}

/* ════════════════════════════ SETTINGS ════════════════════════════ */
function SettingsScreen({ T, themeName, setThemeName, retention, setRetention, say }) {
  const Row = ({ children, onPress, active }) => (
    <button onClick={onPress} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 58, padding: "0 16px", textAlign: "left", background: active ? T.surfaceAlt : "transparent", borderTop: `1px solid ${T.line}`, color: T.text, fontSize: 16 }}>{children}</button>
  );
  const Section = ({ title, children }) => (
    <div>
      <div style={{ fontFamily: DISPLAY, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: T.sub, margin: "0 2px 8px" }}>{title}</div>
      <div style={{ background: T.card, border: `1.5px solid ${T.line}`, borderRadius: 8, overflow: "hidden" }}>{children}</div>
    </div>
  );
  const Dot = ({ on }) => (
    <div style={{ width: 26, height: 26, borderRadius: 999, border: `2.5px solid ${on ? T.check : T.tan}`, background: on ? T.check : "transparent", display: "flex", alignItems: "center", justifyContent: "center", marginLeft: "auto" }}>
      {on && <Check size={15} color={T.cream} strokeWidth={3} />}
    </div>
  );

  return (
    <div style={{ padding: "16px 14px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
      <Section title="Appearance">
        <Row onPress={() => setThemeName("dark")} active={themeName === "dark"}><Moon size={19} color={T.sub} /> Dark <Dot on={themeName === "dark"} /></Row>
        <Row onPress={() => setThemeName("sepia")} active={themeName === "sepia"}><Sun size={19} color={T.sub} /> Sepia (book) <Dot on={themeName === "sepia"} /></Row>
      </Section>
      <Section title="Audio retention">
        <Row onPress={() => setRetention("filed")} active={retention === "filed"}>Keep until filed (default) <Dot on={retention === "filed"} /></Row>
        <Row onPress={() => setRetention("always")} active={retention === "always"}>Always keep audio <Dot on={retention === "always"} /></Row>
        <Row onPress={() => setRetention("ask")} active={retention === "ask"}>Ask each time <Dot on={retention === "ask"} /></Row>
      </Section>
      <Section title="Data">
        <Row onPress={() => say("Backup created (readable JSON)")}>Export backup</Row>
        <Row onPress={() => say("Opening share sheet…")}>Email backup to myself</Row>
        <Row onPress={() => say("Restore from a backup file")}>Import backup</Row>
      </Section>
      <div style={{ textAlign: "center", fontSize: 13, color: T.faint, lineHeight: 1.6 }}>
        Quick Notes · prototype<br />All data stays on this device. Free, forever.
      </div>
    </div>
  );
}
