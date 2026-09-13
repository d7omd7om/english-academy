import { useState, useEffect, useRef, useCallback } from "react";

// ─── Claude API call (internal) ───────────────────────────────────────────────
async function askClaude(messages, system, maxTokens = 700) {
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, system, maxTokens }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "API error");
    return data.text;
  } catch (e) {
    return `__ERROR__${e.message}`;
  }
}

// ─── Shared speech helpers ─────────────────────────────────────────────────────
function pickBestVoice(voices, lang) {
  if (!voices?.length) return null;
  // Prefer higher-quality voices by name — most browsers label their best
  // voices with these words. Falls back gracefully if none match.
  const qualityHints = ["Natural", "Online", "Neural", "Premium", "Google", "Microsoft"];
  const byLang = voices.filter(v => v.lang?.toLowerCase().startsWith(lang));
  const pool = byLang.length ? byLang : voices.filter(v => v.lang?.toLowerCase().startsWith("en"));
  const best = pool.find(v => qualityHints.some(h => v.name.includes(h)));
  return best || pool[0] || voices[0];
}

function speakText(text, { rate = 1, lang = "en", onStart, onEnd, simpleVoice = false } = {}) {
  const synth = window.speechSynthesis;
  if (!synth) { onEnd?.(); return; }
  synth.cancel();
  const clean = text.replace(/[^\w\s.,!?'-]/g, " ").trim();
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = lang === "ar" ? "ar-SA" : "en-AU";
  u.rate = rate;
  u.pitch = 1;
  // Some "enhanced/premium" voices ignore the rate property on certain
  // platforms — when precise speed control matters more than voice
  // polish (Listening, Vocabulary), skip the quality-voice override and
  // let the browser's default voice handle the rate reliably.
  if (!simpleVoice) {
    const voices = synth.getVoices();
    const v = pickBestVoice(voices, lang === "ar" ? "ar" : "en");
    if (v) u.voice = v;
  }
  u.onstart = () => onStart?.();
  u.onend = u.onerror = () => onEnd?.();
  // small delay avoids a known cancel()+speak() race in some browsers
  setTimeout(() => synth.speak(u), 60);
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

// Cloud TTS (natural voice, real speed control) with automatic fallback to
// the browser's built-in voice — the fallback keeps things working inside
// the Claude Artifact preview (no backend there) and before a Cloud TTS
// key is configured on the deployed site.
async function speak(text, { rate = 1, lang = "en", onStart, onEnd } = {}) {
  // Using the browser's built-in voice for now (no cloud TTS key configured) —
  // this keeps things free with no usage limits. speakText already picks the
  // clearest available system voice and applies the chosen rate.
  speakText(text, { rate, lang, onStart, onEnd, simpleVoice: true });
}
function stopSpeaking() {
  window.speechSynthesis?.cancel();
}

// ─── Levels config ─────────────────────────────────────────────────────────────
const LEVELS = [
  { id: "A1", label: "A1", name: "Beginner", color: "#4F9B6E", desc: "Basic words & simple sentences" },
  { id: "A2", label: "A2", name: "Pre-Intermediate", color: "#C9A227", desc: "Short conversations & familiar topics" },
  { id: "B1", label: "B1", name: "Intermediate", color: "#B8703A", desc: "Everyday situations & opinions" },
  { id: "B2", label: "B2", name: "Upper-Intermediate", color: "#B4453A", desc: "Complex topics & fluent conversation" },
  { id: "C1", label: "C1", name: "Advanced", color: "#8570B3", desc: "Professional & academic English" },
];

const SECTIONS = [
  { id: "home",      ar: "الرئيسية", en: "Home"       },
  { id: "speaking",  ar: "المحادثة", en: "Speaking"   },
  { id: "writing",   ar: "الكتابة",  en: "Writing"    },
  { id: "listening", ar: "الاستماع", en: "Listening"  },
  { id: "reading",   ar: "القراءة",  en: "Reading"    },
  { id: "vocab",     ar: "المفردات", en: "Vocabulary" },
  { id: "pte",       ar: "اختبار PTE", en: "PTE Mock" },
];

// ─── Styles ────────────────────────────────────────────────────────────────────
const S = {
  app: {
    fontFamily: "'Outfit', sans-serif",
    background: "#F7F3EC",
    color: "#2A2620",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    position: "relative",
  },
  // orb bg
  orb: (color, top, left, size) => ({
    position: "fixed", borderRadius: "50%",
    width: size, height: size,
    background: `radial-gradient(circle, ${color}22 0%, transparent 70%)`,
    top, left, pointerEvents: "none", zIndex: 0,
    animation: "orbFloat 12s ease-in-out infinite alternate",
  }),
  // topbar
  topbar: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "12px 20px",
    background: "rgba(247,243,236,0.92)",
    backdropFilter: "blur(20px)",
    borderBottom: "1px solid rgba(42,38,32,0.06)",
    position: "relative", zIndex: 50, flexShrink: 0,
  },
  brandRow: { display: "flex", alignItems: "center", gap: 10 },
  brandIcon: {
    width: 34, height: 34, borderRadius: "50%",
    background: "#2A2620",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 15, fontFamily: "'Georgia', serif", color: "#F7F3EC", fontWeight: 600,
  },
  brandName: { fontWeight: 700, fontSize: 16.5, letterSpacing: -0.3, fontFamily: "'Georgia', serif" },
  brandSub: { fontSize: 11, color: "#8A8074", fontWeight: 400 },
  levelBadge: (color) => ({
    padding: "4px 12px", borderRadius: 20,
    border: `1px solid ${color}55`,
    background: `${color}15`,
    color, fontSize: 12, fontWeight: 700,
    cursor: "pointer", transition: "all 0.2s",
  }),
  xpRow: { display: "flex", alignItems: "center", gap: 8 },
  xpTrack: {
    width: 70, height: 5, background: "#E7DFCF",
    borderRadius: 99, overflow: "hidden",
  },
  xpFill: (pct, color) => ({
    height: "100%", width: `${pct}%`,
    background: `linear-gradient(90deg, ${color}, #4E8B8B)`,
    borderRadius: 99, transition: "width 0.6s ease",
  }),
  xpNum: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11, color: "#4E8B8B", fontWeight: 700,
  },
  // nav
  nav: {
    display: "flex", gap: 4, padding: "8px 16px",
    background: "rgba(247,243,236,0.7)",
    borderBottom: "1px solid rgba(42,38,32,0.05)",
    overflowX: "auto", flexShrink: 0,
    scrollbarWidth: "none", position: "relative", zIndex: 40,
  },
  navBtn: (active, color) => ({
    display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
    padding: "8px 3px", marginRight: 16, borderRadius: 0,
    border: "none", borderBottom: active ? `2px solid ${color}` : "2px solid transparent",
    background: "transparent",
    color: active ? "#2A2620" : "#8A8074",
    fontFamily: "'Outfit', sans-serif",
    fontSize: 12, fontWeight: active ? 700 : 500, cursor: "pointer",
    transition: "all 0.2s", whiteSpace: "nowrap",
  }),
  // main content
  main: {
    flex: 1, overflow: "hidden",
    display: "flex", flexDirection: "column",
    position: "relative", zIndex: 10,
  },
  scroll: {
    flex: 1, overflowY: "auto",
    padding: "16px",
    scrollbarWidth: "thin",
    scrollbarColor: "#E7DFCF transparent",
  },
  // cards
  card: (border) => ({
    background: "#FFFFFF",
    border: `1px solid ${border || "rgba(42,38,32,0.07)"}`,
    borderRadius: 16, padding: "16px 18px",
    marginBottom: 12,
  }),
  // chat
  msgRow: (isUser) => ({
    display: "flex", gap: 10,
    justifyContent: isUser ? "flex-end" : "flex-start",
    marginBottom: 12, animation: "fadeUp 0.25s ease",
  }),
  avatar: (isUser) => ({
    width: 32, height: 32, borderRadius: "50%",
    background: isUser
      ? "linear-gradient(135deg,#C98A2B,#B4453A)"
      : "linear-gradient(135deg,#3D4F91,#4E8B8B)",
    display: "flex", alignItems: "center",
    justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#FFFFFF", fontFamily: "'Georgia', serif",
    flexShrink: 0, boxShadow: isUser ? "0 0 10px #C98A2B33" : "0 0 10px #3D4F9133",
  }),
  bubble: (isUser) => ({
    maxWidth: "82%", padding: "10px 14px", borderRadius: 14,
    background: isUser ? "#E4E7F2" : "#FFFFFF",
    border: `1px solid ${isUser ? "rgba(42,38,32,0.1)" : "rgba(42,38,32,0.06)"}`,
    borderTopRightRadius: isUser ? 4 : 14,
    borderTopLeftRadius: isUser ? 14 : 4,
    fontSize: 13.5, lineHeight: 1.65,
  }),
  fbBox: {
    marginTop: 8, padding: "10px 13px",
    background: "rgba(61,79,145,0.07)",
    border: "1px solid rgba(61,79,145,0.25)",
    borderRadius: 10, fontSize: 12, lineHeight: 1.7,
    color: "#6B6154",
  },
  // input bar
  inputBar: {
    padding: "12px 16px",
    background: "rgba(247,243,236,0.92)",
    borderTop: "1px solid rgba(42,38,32,0.06)",
    display: "flex", gap: 8, alignItems: "flex-end",
    flexShrink: 0, backdropFilter: "blur(20px)",
  },
  textarea: {
    flex: 1, background: "#FFFFFF",
    border: "1px solid rgba(42,38,32,0.09)",
    borderRadius: 12, padding: "10px 14px",
    color: "#2A2620", fontFamily: "'Outfit', sans-serif",
    fontSize: 13, resize: "none", outline: "none",
    minHeight: 42, maxHeight: 100, lineHeight: 1.5,
  },
  iconBtn: (active, color) => ({
    width: 42, height: 42, borderRadius: 11,
    border: `1px solid ${active ? color : "rgba(42,38,32,0.09)"}`,
    background: active ? `${color}22` : "#FFFFFF",
    color: active ? color : "#6B6154",
    fontSize: 17, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "all 0.2s", flexShrink: 0,
    animation: active ? "micPulse 1s infinite" : "none",
  }),
  sendBtn: (color) => ({
    width: 42, height: 42, borderRadius: 11,
    background: `linear-gradient(135deg, ${color}, #4E8B8B)`,
    border: "none", color: "#fff", fontSize: 16,
    cursor: "pointer", display: "flex",
    alignItems: "center", justifyContent: "center",
    flexShrink: 0, transition: "all 0.2s",
    boxShadow: `0 4px 15px ${color}44`,
  }),
  // buttons
  primaryBtn: (color) => ({
    padding: "10px 20px", borderRadius: 11,
    background: `${color}20`, border: `1px solid ${color}55`,
    color, fontFamily: "'Outfit', sans-serif",
    fontSize: 13, fontWeight: 600, cursor: "pointer",
    transition: "all 0.2s",
  }),
  genBtn: {
    width: "100%", padding: "12px",
    background: "transparent",
    border: "1px dashed rgba(42,38,32,0.15)",
    borderRadius: 12, color: "#6B6154",
    fontFamily: "'Outfit', sans-serif",
    fontSize: 13, fontWeight: 600,
    cursor: "pointer", marginBottom: 14,
    display: "flex", alignItems: "center",
    justifyContent: "center", gap: 8,
    transition: "all 0.2s",
  },
  // quiz option
  qOpt: (state) => ({
    width: "100%", padding: "10px 14px",
    borderRadius: 10, marginBottom: 6, textAlign: "left",
    fontFamily: "'Outfit', sans-serif", fontSize: 13,
    cursor: state === "idle" ? "pointer" : "default",
    border: state === "correct" ? "1px solid #4F9B6E"
          : state === "wrong"   ? "1px solid #B4453A"
          : "1px solid rgba(42,38,32,0.08)",
    background: state === "correct" ? "rgba(79,155,110,0.1)"
              : state === "wrong"   ? "rgba(180,69,58,0.1)"
              : "#FFFFFF",
    color: state === "correct" ? "#4F9B6E"
         : state === "wrong"   ? "#B4453A"
         : "#6B6154",
    transition: "all 0.2s",
  }),
  tag: (color) => ({
    display: "inline-block", padding: "2px 8px",
    borderRadius: 6, background: `${color}20`,
    border: `1px solid ${color}44`, color,
    fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
    marginRight: 6, marginBottom: 4,
  }),
  timer: (urgent) => ({
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 20, fontWeight: 700,
    color: urgent ? "#B4453A" : "#2A2620",
    textAlign: "center", marginBottom: 8,
  }),
  progressRing: { display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" },
  ringDot: (done, color) => ({
    width: 8, height: 8, borderRadius: "50%",
    background: done ? color : "#E7DFCF",
    transition: "background 0.3s",
  }),
  // speaking wave
  waveBar: {
    display: "flex", alignItems: "center", gap: 8,
    padding: "7px 14px", margin: "0 0 6px",
    background: "rgba(61,79,145,0.07)",
    border: "1px solid rgba(61,79,145,0.2)",
    borderRadius: 9, fontSize: 11, color: "#3D4F91",
  },
  wave: { display: "flex", gap: 3, alignItems: "center" },
};

// ─── Typing dots ───────────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div style={{ display: "flex", gap: 4, padding: "4px 0" }}>
      {[0,1,2].map(i => (
        <div key={i} style={{
          width: 6, height: 6, borderRadius: "50%",
          background: "#6B6154",
          animation: `td 1.2s ${i*0.15}s infinite`,
        }}/>
      ))}
    </div>
  );
}

// ─── Wave animation ────────────────────────────────────────────────────────────
function WaveAnim({ color }) {
  return (
    <div style={S.wave}>
      {[8,13,10,15,8].map((h,i) => (
        <div key={i} style={{
          width: 3, height: h, background: color,
          borderRadius: 2,
          animation: `wave 0.7s ${i*0.1}s infinite`,
        }}/>
      ))}
    </div>
  );
}

// ─── Score ring ────────────────────────────────────────────────────────────────
function ScoreRing({ score, max = 5, color = "#3D4F91" }) {
  const pct = (score / max) * 100;
  const r = 20, c = 2 * Math.PI * r;
  return (
    <svg width={50} height={50} style={{ flexShrink: 0 }}>
      <circle cx={25} cy={25} r={r} fill="none" stroke="#E7DFCF" strokeWidth={4}/>
      <circle cx={25} cy={25} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={c} strokeDashoffset={c - (pct/100)*c}
        strokeLinecap="round" transform="rotate(-90 25 25)"
        style={{ transition: "stroke-dashoffset 0.8s ease" }}/>
      <text x={25} y={30} textAnchor="middle" fill={color}
        fontSize={11} fontWeight={700} fontFamily="JetBrains Mono">
        {score}/{max}
      </text>
    </svg>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN APP
// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [section, setSection] = useState("home");
  const [level, setLevel]     = useState("A2");
  const [xp, setXp]           = useState(0);
  const [showLevelPicker, setShowLevelPicker] = useState(false);

  const addXp = useCallback((n) => setXp(p => p + n), []);
  const lvl   = LEVELS.find(l => l.id === level);
  const xpPct = Math.min(100, (xp % 200) / 200 * 100 + 2);

  const navColor = {
    home: "#3D4F91", speaking: "#C98A2B", writing: "#4F9B6E",
    listening: "#5B8FBF", reading: "#8570B3", vocab: "#B8703A", pte: "#B04A5A",
  };

  return (
    <div style={S.app}>
      {/* CSS animations */}
      <style>{`
        @keyframes orbFloat { 0%{transform:translate(0,0) scale(1)} 100%{transform:translate(30px,20px) scale(1.08)} }
        @keyframes fadeUp   { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
        @keyframes td       { 0%,80%,100%{transform:scale(0.6);opacity:0.4} 40%{transform:scale(1);opacity:1} }
        @keyframes wave     { 0%,100%{transform:scaleY(0.5)} 50%{transform:scaleY(1)} }
        @keyframes micPulse { 0%,100%{box-shadow:0 0 0 0 rgba(61,79,145,0.4)} 50%{box-shadow:0 0 0 7px rgba(61,79,145,0)} }
        @keyframes spin     { to{transform:rotate(360deg)} }
        @keyframes slideIn  { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:none} }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:#E7DFCF;border-radius:99px}
        textarea:focus{border-color:rgba(42,38,32,0.18)!important;box-shadow:0 0 0 3px rgba(61,79,145,0.1)}
      `}</style>

      {/* subtle background texture — one quiet accent, not a scattered glow field */}
      <div style={S.orb("#C98A2B","-15%","70%","420px")}/>

      {/* TOP BAR */}
      <div style={S.topbar}>
        <div style={S.brandRow}>
          <div style={S.brandIcon}>E</div>
          <div>
            <div style={S.brandName}>EnglishPro</div>
            <div style={S.brandSub}>Abdulrahman's practice space</div>
          </div>
        </div>

        <div style={{ display:"flex", gap:10, alignItems:"center", position:"relative" }}>
          <button style={S.levelBadge(lvl.color)} onClick={() => setShowLevelPicker(p=>!p)}>
            {lvl.id} ▾
          </button>
          {showLevelPicker && (
            <div style={{
              position:"absolute", top:"calc(100% + 8px)", right:0,
              background:"#F1EAD9", border:"1px solid rgba(42,38,32,0.1)",
              borderRadius:14, padding:8, zIndex:200, minWidth:220,
              animation:"slideIn 0.2s ease",
            }}>
              {LEVELS.map(l => (
                <div key={l.id} onClick={() => { setLevel(l.id); setShowLevelPicker(false); }}
                  style={{
                    padding:"9px 14px", borderRadius:10, cursor:"pointer",
                    background: l.id === level ? `${l.color}15` : "transparent",
                    display:"flex", alignItems:"center", gap:10,
                    transition:"background 0.15s",
                  }}>
                  <span style={{ ...S.tag(l.color), margin:0 }}>{l.id}</span>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:l.id===level?l.color:"#2A2620" }}>{l.name}</div>
                    <div style={{ fontSize:10, color:"#6B6154" }}>{l.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={S.xpRow}>
            <span style={{ fontSize:10, color:"#6B6154" }}>XP</span>
            <div style={S.xpTrack}><div style={S.xpFill(xpPct, lvl.color)}/></div>
            <span style={S.xpNum}>{xp}</span>
          </div>
        </div>
      </div>

      {/* NAV */}
      <div style={S.nav}>
        {SECTIONS.map(s => (
          <button key={s.id} style={S.navBtn(section===s.id, navColor[s.id])}
            onClick={() => setSection(s.id)}>
            <span>{s.ar}</span>
            <span style={{ fontSize:9.5, opacity:0.65 }}>{s.en}</span>
          </button>
        ))}
      </div>

      {/* PANELS */}
      <div style={S.main}>
        {section === "home"      && <HomePanel level={level} lvl={lvl} xp={xp} setSection={setSection} navColor={navColor}/>}
        {section === "speaking"  && <SpeakingPanel level={level} lvl={lvl} addXp={addXp}/>}
        {section === "writing"   && <WritingPanel  level={level} lvl={lvl} addXp={addXp}/>}
        {section === "listening" && <ListeningPanel level={level} lvl={lvl} addXp={addXp}/>}
        {section === "reading"   && <ReadingPanel  level={level} lvl={lvl} addXp={addXp}/>}
        {section === "vocab"     && <VocabPanel    level={level} lvl={lvl} addXp={addXp}/>}
        {section === "pte"       && <PTEPanel      level={level} lvl={lvl} addXp={addXp}/>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  HOME PANEL
// ══════════════════════════════════════════════════════════════════════════════
function HomePanel({ level, lvl, xp, setSection, navColor }) {
  const skills = [
    { id:"speaking",  label:"Speaking",  desc:"Conversation with AI teacher", color:"#C98A2B" },
    { id:"writing",   label:"Writing",   desc:"Tasks with detailed corrections",  color:"#4F9B6E" },
    { id:"listening", label:"Listening", desc:"Audio exercises and questions",   color:"#5B8FBF" },
    { id:"reading",   label:"Reading",   desc:"Texts with comprehension checks",    color:"#8570B3" },
    { id:"vocab",     label:"Vocabulary",desc:"Flashcards, quizzes, example sentences", color:"#B8703A" },
    { id:"pte",       label:"PTE Mock",  desc:"Full timed exam simulation",         color:"#B04A5A" },
  ];
  const tips = {
    A1: "Start with Speaking — use simple phrases. Don't be afraid to make mistakes.",
    A2: "Pair Vocabulary with Speaking. Ten new words and one short conversation a day adds up fast.",
    B1: "Try writing longer paragraphs, then use the feedback to fix recurring grammar patterns.",
    B2: "Push into longer Reading passages and challenge yourself with less familiar vocabulary.",
    C1: "PTE Mock is your best tool now — practice under real timed conditions.",
  };
  return (
    <div style={S.scroll}>
      {/* Hero */}
      <div style={{
        background: "#FFFFFF",
        border: "1px solid rgba(42,38,32,0.08)",
        borderRadius: 18, padding: "22px 20px",
        marginBottom: 18,
      }}>
        <div style={{ fontFamily:"'Georgia', serif", fontSize:24, fontWeight:600, color:"#2A2620", marginBottom:8, lineHeight:1.3 }}>
          Ready to practice?
        </div>
        <div style={{ fontSize:13.5, color:"#6B6154", lineHeight:1.7 }}>
          You're currently at <span style={{ color: lvl.color, fontWeight:700 }}>{lvl.id} — {lvl.name}</span>. Steady daily practice is what gets you to C1 before university starts.
        </div>
        <div style={{ display:"flex", gap:20, marginTop:16, paddingTop:16, borderTop:"1px solid rgba(42,38,32,0.07)" }}>
          {[["XP earned", xp, "#3D4F91"], ["Level", lvl.id, lvl.color], ["Goal", "C1", "#B04A5A"]].map(([k,v,c]) => (
            <div key={k}>
              <div style={{ fontSize:19, fontWeight:700, color:c, fontFamily:"'Georgia', serif" }}>{v}</div>
              <div style={{ fontSize:11, color:"#8A8074" }}>{k}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Skills list */}
      <div style={{ fontSize:13, color:"#2A2620", fontWeight:600, marginBottom:10 }}>Choose a skill</div>
      <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:18 }}>
        {skills.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)} style={{
            background:"#FFFFFF",
            border:"1px solid rgba(42,38,32,0.08)",
            borderLeft: `3px solid ${s.color}`,
            borderRadius:10, padding:"13px 16px",
            textAlign:"left", cursor:"pointer",
            display:"flex", flexDirection:"column", gap:2,
            transition:"border-color 0.2s",
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor=`rgba(42,38,32,0.08)`; e.currentTarget.style.borderLeftColor=s.color; }}>
            <div style={{ fontSize:13.5, fontWeight:700, color:"#2A2620" }}>{s.label}</div>
            <div style={{ fontSize:11.5, color:"#6B6154" }}>{s.desc}</div>
          </button>
        ))}
      </div>

      {/* Tip */}
      <div style={{
        background:"#F1EAD9",
        border:"1px solid rgba(184,112,58,0.2)",
        borderRadius: 14, padding: "14px 16px",
      }}>
        <div style={{ fontSize:12, fontWeight:700, color:"#B8703A", marginBottom:4 }}>Study tip for {lvl.id}</div>
        <div style={{ fontSize:12.5, color:"#6B6154", lineHeight:1.65 }}>{tips[level]}</div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  SPEAKING PANEL
// ══════════════════════════════════════════════════════════════════════════════
function SpeakingPanel({ level, lvl, addXp }) {
  const [messages, setMessages] = useState([]);
  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [scenario, setScenario] = useState("open");
  const chatRef  = useRef(null);
  const recognRef = useRef(null);
  const synthRef  = useRef(window.speechSynthesis);

  const scenarios = [
    { id:"open",       ar:"موضوع مفتوح", en:"Open Topic" },
    { id:"university", ar:"الجامعة",     en:"University" },
    { id:"cafe",       ar:"مقهى",        en:"Café" },
    { id:"interview",  ar:"مقابلة عمل",  en:"Interview" },
    { id:"shopping",   ar:"تسوق",        en:"Shopping" },
    { id:"doctor",     ar:"عند الطبيب",  en:"Doctor" },
    { id:"travel",     ar:"سفر",         en:"Travel" },
  ];

  const sysPrompt = scenario === "open"
    ? `You are Alex, D7's English conversation buddy in Melbourne, chatting casually like a normal friend — not a formal teacher. D7 is practicing English at ${level} level. There's no fixed topic or time limit — follow wherever D7 wants to take the conversation, and if they don't bring up a topic, ask something casual and open like you would with a friend.
Rules:
- Talk like a real person texting a friend: relaxed, warm, natural. 2-3 sentences max. Vocabulary appropriate for ${level}.
- D7 may switch to Arabic mid-sentence when they don't know an English word or phrase — this is expected and fine. When that happens: understand the Arabic part, give the correct English word/phrase for it in your reply (in English), briefly show how it fits into their sentence, then continue the conversation naturally in English. Keep this teaching moment to one short line — don't turn it into a grammar lecture.
- After your reply add exactly: |||FB|||
- Then write:
  Good: (one thing they did well, 1 line, casual tone)
  Fix: (one gentle correction if needed, wrong→correct. If nothing to fix, write "Nothing to fix, nice!")
  Try saying: (a natural alternative phrase)
  Score: X/5
Never sound like a script or an exam. Be a genuinely warm, casual conversation partner.`
    : `You are Alex, a friendly conversation partner chatting with D7 like a normal person — not a formal teacher — in a ${scenario} setting, helping D7 practice English at ${level} level in Melbourne, Australia.
Rules:
- Talk casually and naturally, like texting a friend, in 2-3 sentences max. Vocabulary appropriate for ${level}.
- D7 may switch to Arabic mid-sentence when they don't know an English word or phrase — this is expected and fine. When that happens: understand the Arabic part, give the correct English word/phrase for it in your reply (in English), briefly show how it fits into their sentence, then continue the conversation naturally in English. Keep this teaching moment to one short line — don't turn it into a grammar lecture.
- After your reply add exactly: |||FB|||
- Then write:
  Good: (one thing they did well, 1 line, casual tone)
  Fix: (one gentle correction if needed, wrong→correct. If nothing to fix, write "Nothing to fix, nice!")
  Try saying: (a natural alternative phrase)
  Score: X/5
Never sound like a script or an exam. Be warm, relaxed, and genuinely conversational.`;

  const initChat = useCallback(async (sc) => {
    setMessages([]);
    setLoading(true);
    const startPrompt = sc === "open"
      ? "Start with a short, casual, friendly greeting like you're texting a friend (1-2 sentences), and naturally ask what's on their mind or how their day is going — no fixed topic. No feedback for this first message."
      : `Start the ${sc} conversation with a short friendly greeting (1-2 sentences). No feedback for this first message.`;
    const reply = await askClaude(
      [{ role:"user", content: startPrompt }],
      sysPrompt, 150
    );
    if (reply.startsWith("__ERROR__")) {
      setMessages([{ role:"ai", text:"Couldn't connect right now — " + reply.replace("__ERROR__","") + " Try again in a moment.", fb:null }]);
      setLoading(false);
      return;
    }
    const text = reply.split("|||FB|||")[0].trim();
    setMessages([{ role:"ai", text, fb:null }]);
    setLoading(false);
    tts(text);
  }, [scenario, level]);

  useEffect(() => { initChat(scenario); }, [scenario, level]);
  useEffect(() => { if(chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [messages, loading]);

  const currentAudioRef = useRef(null);

  const tts = (text, onDone) => {
    speak(text, {
      rate: 0.95,
      onStart: () => setIsSpeaking(true),
      onEnd: () => { setIsSpeaking(false); onDone?.(); },
    });
  };

  const stopTts = () => { stopSpeaking(); setIsSpeaking(false); };

  // ── Continuous voice mode: press once, keep talking, AI replies out loud,
  // mic automatically listens again after each reply — until you press stop. ──
  const sessionOnRef = useRef(false);
  const [sessionOn, setSessionOn] = useState(false);
  const [micError, setMicError] = useState("");

  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setMicError("This browser doesn't support voice input — try Chrome."); setSessionOn(false); sessionOnRef.current=false; return; }
    const r = new SR();
    r.lang = "en-US"; r.continuous = false; r.interimResults = true;
    let finalText = "";
    r.onresult = (e) => {
      const t = Array.from(e.results).map(x=>x[0].transcript).join("");
      setInput(t);
      if (e.results[e.results.length-1].isFinal) finalText = t;
    };
    r.onerror = (e) => {
      setIsListening(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setMicError("Microphone access was blocked. Allow microphone permission for this page and try again.");
        setSessionOn(false); sessionOnRef.current = false;
      } else if (e.error === "no-speech") {
        // just silence — if session still on, listen again after a short
        // delay so the browser has time to release the mic first
        if (sessionOnRef.current) setTimeout(startListening, 400);
      }
    };
    r.onend = () => {
      setIsListening(false);
      if (finalText.trim()) {
        setInput("");
        send(finalText.trim(), () => { if (sessionOnRef.current) setTimeout(startListening, 400); });
      } else if (sessionOnRef.current) {
        setTimeout(startListening, 400);
      }
    };
    recognRef.current = r;
    setMicError("");
    setIsListening(true);
    try { r.start(); } catch { setIsListening(false); if (sessionOnRef.current) setTimeout(startListening, 500); }
  };

  const toggleSession = () => {
    if (sessionOn) {
      sessionOnRef.current = false;
      setSessionOn(false);
      recognRef.current?.stop();
      stopTts();
      setIsListening(false);
    } else {
      sessionOnRef.current = true;
      setSessionOn(true);
      stopTts();
      startListening();
    }
  };

  const send = async (voiceText, onComplete) => {
    const txt = (typeof voiceText === "string" ? voiceText : input).trim();
    if (!txt || loading) { onComplete?.(); return; }
    setInput("");
    const newMsgs = [...messages, { role:"user", text:txt }];
    setMessages(newMsgs);
    setLoading(true);
    const history = newMsgs.map(m => ({ role: m.role==="ai"?"assistant":"user", content: m.text + (m.fb?"|||FB|||"+m.fb:"") }));
    const reply = await askClaude(history, sysPrompt, 400);
    if (reply.startsWith("__ERROR__")) {
      setMessages(p => [...p, { role:"ai", text:"❌ " + reply.replace("__ERROR__",""), fb:null }]);
      setLoading(false);
      onComplete?.();
    } else {
      const [main, fb] = reply.split("|||FB|||");
      setMessages(p => [...p, { role:"ai", text:main.trim(), fb:fb?.trim()||null }]);
      addXp(10);
      setLoading(false);
      tts(main.trim(), onComplete);
    }
  };

  return (
    <div style={{ ...S.main }}>
      {/* scenario bar */}
      <div style={{ display:"flex", gap:6, padding:"8px 14px", overflowX:"auto", scrollbarWidth:"none", flexShrink:0, borderBottom:"1px solid rgba(42,38,32,0.05)" }}>
        {scenarios.map(s => (
          <button key={s.id} onClick={() => setScenario(s.id)} style={{
            padding:"6px 12px", borderRadius:20,
            border:`1px solid ${scenario===s.id?"#C98A2B55":"rgba(42,38,32,0.07)"}`,
            background: scenario===s.id?"rgba(245,158,11,0.12)":"transparent",
            color: scenario===s.id?"#C98A2B":"#6B6154",
            fontFamily:"'Outfit',sans-serif", fontSize:11, fontWeight:600,
            cursor:"pointer", whiteSpace:"nowrap", lineHeight:1.3,
            display:"flex", flexDirection:"column", alignItems:"center",
          }}>
            <span>{s.ar}</span>
            <span style={{ fontSize:9, opacity:0.7 }}>{s.en}</span>
          </button>
        ))}
      </div>

      {/* speaking bar */}
      {isSpeaking && (
        <div style={S.waveBar}>
          <WaveAnim color="#3D4F91"/>
          <span style={{ marginLeft:4 }}>AI is speaking...</span>
          <button onClick={stopTts} style={{ marginLeft:"auto", background:"none", border:"none", color:"#6B6154", cursor:"pointer" }}>⏹</button>
        </div>
      )}

      {/* chat */}
      <div ref={chatRef} style={S.scroll}>
        {messages.map((m, i) => (
          <div key={i} style={S.msgRow(m.role==="user")}>
            {m.role==="ai" && <div style={S.avatar(false)}>AI</div>}
            <div style={{ maxWidth:"82%" }}>
              <div style={S.bubble(m.role==="user")} dangerouslySetInnerHTML={{ __html: m.text.replace(/\n/g,"<br/>") }}/>
              {m.fb && (
                <div style={S.fbBox}>
                  <div style={{ fontSize:10, fontWeight:700, color:"#3D4F91", letterSpacing:0.5, marginBottom:5 }}>الملاحظات · Feedback</div>
                  <div dangerouslySetInnerHTML={{ __html: m.fb.replace(/\n/g,"<br/>").replace(/([1-5])\/5/,'<span style="color:#C98A2B;font-weight:700">$1/5</span>') }}/>
                </div>
              )}
            </div>
            {m.role==="user" && <div style={S.avatar(true)}>A</div>}
          </div>
        ))}
        {loading && (
          <div style={S.msgRow(false)}>
            <div style={S.avatar(false)}>AI</div>
            <div style={S.bubble(false)}><TypingDots/></div>
          </div>
        )}
        {!loading && messages.length===1 && messages[0].text.startsWith("Couldn't connect") && (
          <button style={S.primaryBtn("#3D4F91")} onClick={()=>initChat(scenario)}>Try again</button>
        )}
      </div>

      {micError && (
        <div style={{ margin:"0 14px 8px", padding:"8px 12px", background:"rgba(180,69,58,0.1)", border:"1px solid rgba(180,69,58,0.25)", borderRadius:10, fontSize:11.5, color:"#B4453A" }}>
          {micError}
        </div>
      )}

      {/* input */}
      <div style={S.inputBar}>
        <textarea style={S.textarea} value={input}
          placeholder={sessionOn ? (isListening ? "Listening... just talk" : isSpeaking ? "Alex is speaking..." : "Thinking...") : "Type, or press the mic to talk hands-free"}
          disabled={sessionOn}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();} }}
          rows={1} onInput={e=>{e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,100)+"px";}}
        />
        <button
          style={{ ...S.iconBtn(sessionOn,"#3D4F91"), background: sessionOn ? (isListening ? "#3D4F91" : "#8570B3") : undefined }}
          onClick={toggleSession}
          title={sessionOn ? "End voice conversation" : "Start hands-free voice conversation"}
        >{sessionOn ? "⏹" : "🎙"}</button>
        {!sessionOn && <button style={S.sendBtn("#C98A2B")} onClick={send} disabled={loading}>➤</button>}
      </div>
      {sessionOn && (
        <div style={{ textAlign:"center", fontSize:10.5, color:"#8A8074", padding:"0 14px 8px" }}>
          مكالمة صوتية مستمرة — اضغط ⏹ لإنهائها · Continuous voice call — press ⏹ to end
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  WRITING PANEL
// ══════════════════════════════════════════════════════════════════════════════
function WritingPanel({ level, lvl, addXp }) {
  const [messages, setMessages] = useState([]);
  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [taskReady, setTaskReady] = useState(false);
  const [taskType, setTaskType] = useState("paragraph");
  const chatRef = useRef(null);

  const taskTypes = [
    { id:"paragraph", label:"📄 Paragraph" },
    { id:"email",     label:"📧 Email" },
    { id:"story",     label:"Short Story" },
    { id:"opinion",   label:"💭 Opinion" },
    { id:"describe",  label:"🖼 Description" },
  ];

  const sysPrompt = `You are a friendly English writing teacher. D7 is at ${level} level.
Rules:
- Give writing tasks suitable for ${level} level. Task type: ${taskType}.
- D7 may write part of their message in Arabic when they don't know an English word — that's fine. Understand it, tell them the correct English word/phrase, and continue naturally in your feedback.
- When D7 submits writing, give detailed, simple feedback.
- Add separator: |||FB|||
- Then write:
  ✅ Strengths: (2 things done well)
  📝 Grammar fixes: (list corrections as: ❌wrong → ✅correct — explain simply)
  🔤 Better vocabulary: (2-3 word upgrades)
  Scores: Grammar X/5 | Vocabulary X/5 | Structure X/5
  📌 Next task: (give a new, slightly harder task)
Keep explanations simple and encouraging!`;

  useEffect(() => {
    setMessages([]);
    setTaskReady(false);
    (async () => {
      setLoading(true);
      const reply = await askClaude(
        [{ role:"user", content:`Give me my first ${taskType} writing task for ${level} level. Just the task description, no feedback yet. Make it interesting and clear.` }],
        sysPrompt, 200
      );
      if (reply.startsWith("__ERROR__")) {
        setMessages([{ role:"ai", text:"Couldn't load a task right now — " + reply.replace("__ERROR__","") + " Try switching tabs or reopening this section.", fb:null }]);
      } else {
        setMessages([{ role:"ai", text:reply.split("|||FB|||")[0].trim(), fb:null }]);
        setTaskReady(true);
      }
      setLoading(false);
    })();
  }, [taskType, level]);

  useEffect(() => { if(chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [messages, loading]);

  const send = async () => {
    const txt = input.trim();
    if (!txt || loading || !taskReady) return;
    setInput("");
    const newMsgs = [...messages, { role:"user", text:txt }];
    setMessages(newMsgs);
    setLoading(true);
    const history = newMsgs.map(m => ({ role:m.role==="ai"?"assistant":"user", content:m.text+(m.fb?"|||FB|||"+m.fb:"") }));
    const reply = await askClaude(history, sysPrompt, 700);
    if (reply.startsWith("__ERROR__")) {
      setMessages(p=>[...p,{role:"ai",text:"❌ "+reply.replace("__ERROR__",""),fb:null}]);
    } else {
      const [main, fb] = reply.split("|||FB|||");
      setMessages(p=>[...p,{role:"ai",text:main.trim(),fb:fb?.trim()||null}]);
      addXp(15);
    }
    setLoading(false);
  };

  return (
    <div style={S.main}>
      <div style={{ display:"flex", gap:6, padding:"8px 14px", overflowX:"auto", scrollbarWidth:"none", flexShrink:0, borderBottom:"1px solid rgba(42,38,32,0.05)" }}>
        {taskTypes.map(t => (
          <button key={t.id} onClick={()=>setTaskType(t.id)} style={{
            padding:"5px 12px", borderRadius:20,
            border:`1px solid ${taskType===t.id?"#4F9B6E55":"rgba(42,38,32,0.07)"}`,
            background:taskType===t.id?"rgba(52,211,153,0.12)":"transparent",
            color:taskType===t.id?"#4F9B6E":"#6B6154",
            fontFamily:"'Outfit',sans-serif", fontSize:11, fontWeight:600,
            cursor:"pointer", whiteSpace:"nowrap",
          }}>{t.label}</button>
        ))}
      </div>

      <div ref={chatRef} style={S.scroll}>
        {messages.map((m, i) => (
          <div key={i} style={S.msgRow(m.role==="user")}>
            {m.role==="ai" && <div style={S.avatar(false)}>AI</div>}
            <div style={{ maxWidth:"90%" }}>
              <div style={S.bubble(m.role==="user")} dangerouslySetInnerHTML={{ __html:m.text.replace(/\n/g,"<br/>") }}/>
              {m.fb && (
                <div style={S.fbBox}>
                  <div style={{ fontSize:10, fontWeight:700, color:"#4F9B6E", letterSpacing:0.5, marginBottom:5 }}>📝 FEEDBACK</div>
                  <div dangerouslySetInnerHTML={{ __html:m.fb.replace(/\n/g,"<br/>") }}/>
                </div>
              )}
            </div>
            {m.role==="user" && <div style={S.avatar(true)}>A</div>}
          </div>
        ))}
        {loading && (
          <div style={S.msgRow(false)}>
            <div style={S.avatar(false)}>AI</div>
            <div style={S.bubble(false)}><TypingDots/></div>
          </div>
        )}
      </div>

      <div style={S.inputBar}>
        <textarea style={S.textarea} value={input} placeholder={taskReady ? "Write your answer here..." : "Loading your task..."}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
          rows={3} onInput={e=>{e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,100)+"px";}}
        />
        <button style={S.sendBtn("#4F9B6E")} onClick={send} disabled={loading || !taskReady} title={!taskReady?"Waiting for the task to load...":""}>➤</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  LISTENING PANEL
// ══════════════════════════════════════════════════════════════════════════════
function ListeningPanel({ level, lvl, addXp }) {
  const [exercise, setExercise] = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [answers,  setAnswers]  = useState({});
  const [revealed, setRevealed] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const gen = async () => {
    setLoading(true); setExercise(null); setAnswers({}); setRevealed(false);
    const prompt = `Create a listening exercise for ${level} English level.
Return ONLY valid JSON (no markdown):
{
  "title": "...",
  "topic": "...", 
  "script": "A natural spoken paragraph, 5-8 sentences, appropriate for ${level} level.",
  "vocabulary": ["word1","word2","word3"],
  "questions": [
    {"q":"...","answer":"..."},
    {"q":"...","answer":"..."},
    {"q":"...","answer":"..."}
  ]
}
Topics: Melbourne life, university, daily routines, Australian culture, travel, food, technology.`;
    const raw = await askClaude([{role:"user",content:prompt}], "Return ONLY valid JSON. No markdown.", 500);
    try {
      const data = JSON.parse(raw.replace(/```json|```/g,"").trim());
      setExercise(data);
      addXp(5);
    } catch { setExercise({ error:true }); }
    setLoading(false);
  };

  useEffect(() => { gen(); }, [level]);

  const play = () => {
    if (!exercise?.script) return;
    speak(exercise.script, {
      rate: speed,
      onStart: () => setIsPlaying(true),
      onEnd: () => setIsPlaying(false),
    });
  };
  const stopPlay = () => { stopSpeaking(); setIsPlaying(false); };

  return (
    <div style={S.scroll}>
      <button style={S.genBtn} onClick={gen} disabled={loading}>
        <span style={loading?{animation:"spin 1s linear infinite",display:"inline-block"}:{}}>
          {loading ? "⟳" : "✨"}
        </span>
        {loading ? "Generating exercise..." : "New Listening Exercise"}
      </button>

      {exercise && !exercise.error && (
        <div style={{ display:"flex", alignItems:"center", gap:6, margin:"10px 0 4px", flexWrap:"wrap" }}>
          <span style={{ fontSize:11, color:"#8A8074" }}>السرعة · Speed</span>
          {SPEEDS.map(s => (
            <button key={s} onClick={()=>setSpeed(s)} style={{
              padding:"3px 9px", borderRadius:12,
              border:`1px solid ${speed===s?"#5B8FBF55":"rgba(42,38,32,0.08)"}`,
              background: speed===s?"rgba(91,143,191,0.12)":"transparent",
              color: speed===s?"#5B8FBF":"#8A8074",
              fontSize:11, fontWeight:600, cursor:"pointer",
            }}>{s}x</button>
          ))}
        </div>
      )}

      {exercise && !exercise.error && (
        <div style={S.card("rgba(56,189,248,0.2)")}>
          <div style={S.tag("#5B8FBF")}>LISTENING</div>
          <div style={S.tag(lvl.color)}>{level}</div>
          <h3 style={{ fontSize:15, fontWeight:700, margin:"8px 0 4px" }}>{exercise.title}</h3>
          <p style={{ fontSize:12, color:"#6B6154", marginBottom:12 }}>{exercise.topic}</p>

          {exercise.vocabulary && (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:10, color:"#6B6154", fontWeight:700, letterSpacing:0.5, marginBottom:5 }}>KEY VOCABULARY</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {exercise.vocabulary.map((w,i) => <span key={i} style={S.tag("#8570B3")}>{w}</span>)}
              </div>
            </div>
          )}

          <button onClick={isPlaying?stopPlay:play} style={{
            ...S.primaryBtn("#5B8FBF"),
            display:"flex", alignItems:"center", gap:7, marginBottom:16,
          }}>
            {isPlaying ? <><WaveAnim color="#5B8FBF"/> Stop</> : "▶ Play Audio"}
          </button>

          {exercise.questions.map((q, i) => (
            <div key={i} style={{ marginBottom:12 }}>
              <p style={{ fontSize:13, fontWeight:600, marginBottom:5 }}>{i+1}. {q.q}</p>
              <input
                value={answers[i]||""} onChange={e=>setAnswers(p=>({...p,[i]:e.target.value}))}
                placeholder="Your answer..."
                style={{ width:"100%", background:"#F1EAD9", border:"1px solid rgba(42,38,32,0.08)", borderRadius:9, padding:"8px 12px", color:"#2A2620", fontFamily:"'Outfit',sans-serif", fontSize:13, outline:"none" }}
              />
              {revealed && (
                <div style={{ fontSize:12, color:"#4F9B6E", marginTop:4 }}>✅ {q.answer}</div>
              )}
            </div>
          ))}

          <button style={{ ...S.primaryBtn("#5B8FBF") }} onClick={()=>{setRevealed(true);addXp(20);}}>
            Check Answers ✓
          </button>
        </div>
      )}
      {exercise?.error && <p style={{ color:"#B4453A", fontSize:13 }}>Could not generate. Try again.</p>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  READING PANEL
// ══════════════════════════════════════════════════════════════════════════════
function ReadingPanel({ level, lvl, addXp }) {
  const [article,  setArticle]  = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [qStates,  setQStates]  = useState({});
  const [tooltip,  setTooltip]  = useState(null);
  const [readingAloud, setReadingAloud] = useState(false);

  const gen = async () => {
    setLoading(true); setArticle(null); setQStates({});
    const prompt = `Create a reading exercise for ${level} English level.
Return ONLY valid JSON (no markdown):
{
  "title": "...",
  "text": "A 6-8 sentence passage for ${level} level. Include 4 key vocabulary words marked like [[word]] in the text.",
  "vocab": [{"word":"...","type":"...","def":"simple definition"}],
  "questions": [
    {"q":"...","opts":["A...","B...","C...","D..."],"ans":0},
    {"q":"...","opts":["A...","B...","C...","D..."],"ans":1},
    {"q":"...","opts":["A...","B...","C...","D..."],"ans":2},
    {"q":"...","opts":["A...","B...","C...","D..."],"ans":3}
  ]
}
Topics: Melbourne, Australian culture, science, travel, student life, environment, technology.`;
    const raw = await askClaude([{role:"user",content:prompt}],"Return ONLY valid JSON.",600);
    try {
      const data = JSON.parse(raw.replace(/```json|```/g,"").trim());
      setArticle(data);
      addXp(5);
    } catch { setArticle({ error:true }); }
    setLoading(false);
  };

  useEffect(()=>{ gen(); },[level]);

  const checkAns = (qi, chosen, correct) => {
    setQStates(p=>({...p,[qi]:{chosen,correct}}));
    if(chosen===correct) addXp(10);
  };

  const speakWord = (e, word) => {
    e.stopPropagation();
    speak(word.replace(/[.,!?;:]/g,""), { rate:0.8 });
  };

  const renderText = (text, vocab) => {
    if (!text) return null;
    const parts = text.split(/\[\[(\w+)\]\]/g);
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        const vItem = vocab?.find(v=>v.word.toLowerCase()===part.toLowerCase());
        return (
          <span key={i} style={{
            background:"rgba(167,139,250,0.15)", borderBottom:"1px solid #8570B3",
            borderRadius:3, padding:"0 2px", cursor:"pointer",
          }} onClick={(e)=>{
            e.stopPropagation();
            speak(part, { rate:0.8 });
            const r = e.target.getBoundingClientRect();
            setTooltip({ word:part, def:vItem?.def||"", type:vItem?.type||"", x:r.left, y:r.bottom+4 });
            setTimeout(()=>setTooltip(null),3000);
          }}>{part}</span>
        );
      }
      // split plain text into clickable words, keeping spaces/punctuation intact
      return part.split(/(\s+)/).map((w, wi) => {
        if (!w.trim() || !/[a-zA-Z]/.test(w)) return <span key={`${i}-${wi}`}>{w}</span>;
        return (
          <span key={`${i}-${wi}`} onClick={(e)=>speakWord(e, w)}
            style={{ cursor:"pointer" }}
            onMouseEnter={e=>e.target.style.textDecoration="underline dotted"}
            onMouseLeave={e=>e.target.style.textDecoration="none"}
          >{w}</span>
        );
      });
    });
  };

  return (
    <div style={S.scroll} onClick={()=>setTooltip(null)}>
      {tooltip && (
        <div style={{
          position:"fixed", left:Math.min(tooltip.x,window.innerWidth-220), top:tooltip.y,
          background:"#F1EAD9", border:"1px solid #8570B355",
          borderRadius:10, padding:"10px 13px", zIndex:999,
          fontSize:12, maxWidth:210, boxShadow:"0 8px 30px rgba(0,0,0,0.5)",
          animation:"slideIn 0.2s ease",
        }}>
          <div style={{ color:"#8570B3", fontWeight:700, fontSize:14 }}>{tooltip.word}</div>
          <div style={{ color:"#6B6154", fontSize:10, marginBottom:3 }}>{tooltip.type}</div>
          <div style={{ color:"#3A352C" }}>{tooltip.def}</div>
        </div>
      )}

      <button style={S.genBtn} onClick={gen} disabled={loading}>
        <span style={loading?{animation:"spin 1s linear infinite",display:"inline-block"}:{}}>
          {loading?"⟳":"✨"}
        </span>
        {loading?"Generating article...":"New Reading Exercise"}
      </button>

      {article && !article.error && (
        <div style={S.card("rgba(167,139,250,0.2)")}>
          <div style={{ display:"flex", gap:6, marginBottom:8, flexWrap:"wrap", alignItems:"center" }}>
            <span style={S.tag("#8570B3")}>READING · {level}</span>
            <span style={{ fontSize:10, color:"#6B6154" }}>اضغط أي كلمة تسمع نطقها · Tap any word to hear it</span>
          </div>
          <h3 style={{ fontSize:16, fontWeight:800, marginBottom:10 }}>{article.title}</h3>
          <button onClick={()=>{
            if (readingAloud) { stopSpeaking(); setReadingAloud(false); return; }
            speak(article.text.replace(/\[\[|\]\]/g,""), {
              rate:0.85,
              onStart:()=>setReadingAloud(true),
              onEnd:()=>setReadingAloud(false),
            });
          }} style={{
            display:"flex", alignItems:"center", gap:6, marginBottom:12,
            padding:"7px 14px", borderRadius:20, border:"1px solid rgba(133,112,179,0.3)",
            background: readingAloud ? "#8570B3" : "rgba(133,112,179,0.1)",
            color: readingAloud ? "#FFFFFF" : "#8570B3",
            fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"'Outfit',sans-serif",
          }}>
            {readingAloud ? "⏹ إيقاف · Stop" : "🔊 اقرأ النص كامل · Read passage aloud"}
          </button>
          <p style={{ fontSize:13.5, lineHeight:1.9, color:"#3A352C", marginBottom:16 }}>
            {renderText(article.text, article.vocab)}
          </p>

          <div style={{ borderTop:"1px solid rgba(42,38,32,0.06)", paddingTop:14 }}>
            <div style={{ fontSize:11, color:"#6B6154", fontWeight:700, letterSpacing:0.5, marginBottom:12 }}>COMPREHENSION QUESTIONS</div>
            {article.questions?.map((q, qi) => {
              const st = qStates[qi];
              return (
                <div key={qi} style={{ marginBottom:16 }}>
                  <p style={{ fontSize:13, fontWeight:600, marginBottom:7 }}>{qi+1}. {q.q}</p>
                  {q.opts?.map((o, oi) => {
                    let state = "idle";
                    if (st) state = oi===q.ans?"correct": oi===st.chosen?"wrong":"idle";
                    return (
                      <button key={oi} style={S.qOpt(state)}
                        onClick={()=>{ if(!st) checkAns(qi,oi,q.ans); }}>
                        {o}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {article?.error && <p style={{ color:"#B4453A", fontSize:13 }}>Could not generate. Try again.</p>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  VOCABULARY PANEL
// ══════════════════════════════════════════════════════════════════════════════
const DEFAULT_WORDS = [
  {w:"achieve",t:"verb",d:"To reach a goal successfully",ex:"She achieved a high score in the exam."},
  {w:"improve",t:"verb",d:"To make something better",ex:"I want to improve my English every day."},
  {w:"confident",t:"adj",d:"Feeling sure about yourself",ex:"He felt confident before the interview."},
  {w:"communicate",t:"verb",d:"To share ideas or feelings",ex:"It is important to communicate clearly."},
  {w:"opportunity",t:"noun",d:"A chance to do something",ex:"University gives many opportunities."},
  {w:"challenge",t:"noun",d:"Something difficult that tests you",ex:"Speaking English is a challenge I enjoy."},
  {w:"experience",t:"noun",d:"Things you have done or felt",ex:"She has experience working in Melbourne."},
  {w:"prepare",t:"verb",d:"To get ready for something",ex:"I prepare for class every morning."},
  {w:"focus",t:"verb",d:"To give attention to one thing",ex:"Focus on your pronunciation today."},
  {w:"progress",t:"noun",d:"Moving forward or improving",ex:"My English progress is getting better."},
];

function VocabPanel({ level, lvl, addXp }) {
  const [mode,    setMode]    = useState("flash");
  const [words,   setWords]   = useState(DEFAULT_WORDS);
  const [loading, setLoading] = useState(false);
  const [revealed, setRevealed] = useState({});
  const [quizState, setQuizState] = useState(null);
  const [fillState, setFillState] = useState(null);
  const [fillInput, setFillInput] = useState("");

  const modes = [
    { id:"flash",   label:"🃏 Flashcards" },
    { id:"quiz",    label:"🎯 Quiz" },
    { id:"fill",    label:"✏️ Fill in" },
    { id:"learn",   label:"Study All" },
  ];

  const genWords = async () => {
    setLoading(true);
    const prompt = `Give 10 useful English vocabulary words for ${level} level learner going to university in Melbourne.
Return ONLY valid JSON array (no markdown):
[{"w":"word","t":"noun/verb/adj/adv","d":"simple definition max 8 words","ex":"short example sentence"}]`;
    const raw = await askClaude([{role:"user",content:prompt}],"Return ONLY valid JSON array.",400);
    try {
      const arr = JSON.parse(raw.replace(/```json|```/g,"").trim());
      if(Array.isArray(arr)&&arr.length>0){ setWords(arr); setRevealed({}); addXp(5); }
    } catch{}
    setLoading(false);
  };

  const newQuiz = () => {
    const w = [...words].sort(()=>Math.random()-0.5)[0];
    const distractors = words.filter(x=>x.w!==w.w).sort(()=>Math.random()-0.5).slice(0,3);
    const opts = [w,...distractors].sort(()=>Math.random()-0.5);
    const ci = opts.findIndex(o=>o.w===w.w);
    setQuizState({ word:w, opts, ci, chosen:null });
  };

  const newFill = () => {
    const w = [...words].sort(()=>Math.random()-0.5)[0];
    const blanked = w.ex.replace(new RegExp(w.w,"gi"), "_____");
    setFillState({ word:w, blanked, checked:false, correct:false });
    setFillInput("");
  };

  useEffect(()=>{ if(mode==="quiz") newQuiz(); if(mode==="fill") newFill(); },[mode, words]);

  return (
    <div style={S.scroll}>
      {/* mode tabs */}
      <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
        {modes.map(m=>(
          <button key={m.id} onClick={()=>setMode(m.id)} style={{
            padding:"6px 13px", borderRadius:10,
            border:`1px solid ${mode===m.id?"#B8703A55":"rgba(42,38,32,0.07)"}`,
            background:mode===m.id?"rgba(184,112,58,0.12)":"transparent",
            color:mode===m.id?"#B8703A":"#6B6154",
            fontFamily:"'Outfit',sans-serif", fontSize:12, fontWeight:600, cursor:"pointer",
          }}>{m.label}</button>
        ))}
        <button onClick={genWords} disabled={loading} style={{
          padding:"6px 13px", borderRadius:10,
          border:"1px solid rgba(42,38,32,0.07)",
          background:"transparent", color:"#6B6154",
          fontFamily:"'Outfit',sans-serif", fontSize:12, fontWeight:600, cursor:"pointer",
        }}>
          <span style={loading?{animation:"spin 1s linear infinite",display:"inline-block"}:{}}>
            {loading?"⟳":"✨"}
          </span> New Words ({level})
        </button>
      </div>

      {/* FLASHCARDS */}
      {mode==="flash" && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
          {words.map((w,i)=>(
            <div key={i} style={{
              background:"#FFFFFF", border:`1px solid ${revealed[i]?"#B8703A33":"rgba(42,38,32,0.07)"}`,
              borderRadius:14, padding:"14px 14px", cursor:"pointer",
              transition:"all 0.2s", position:"relative", minHeight:90,
            }}>
              <div onClick={()=>setRevealed(p=>({...p,[i]:!p[i]}))} style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div style={{ fontSize:15, fontWeight:800, marginBottom:3 }}>{w.w}</div>
                <button onClick={(e)=>{ e.stopPropagation(); speak(w.w, { rate:0.7 }); }} style={{
                  width:26, height:26, borderRadius:"50%", border:"none",
                  background:"rgba(184,112,58,0.12)", color:"#B8703A",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:12, cursor:"pointer", flexShrink:0,
                }} title="Play pronunciation">▶</button>
              </div>
              <div onClick={()=>setRevealed(p=>({...p,[i]:!p[i]}))}>
                <div style={{ ...S.tag("#B8703A"), margin:"0 0 6px" }}>{w.t}</div>
                {revealed[i] ? (
                  <>
                    <div style={{ fontSize:12, color:"#6B6154", lineHeight:1.5, marginBottom:4 }}>{w.d}</div>
                    <div style={{ fontSize:11, color:"#6B6154", fontStyle:"italic" }}>"{w.ex}"</div>
                  </>
                ) : (
                  <div style={{ fontSize:11, color:"#8A8074" }}>Tap to reveal ↓</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* QUIZ */}
      {mode==="quiz" && quizState && (
        <div style={S.card("rgba(184,112,58,0.2)")}>
          <div style={{ fontSize:11, color:"#B8703A", fontWeight:700, letterSpacing:0.5, marginBottom:12 }}>QUIZ — WHAT WORD MEANS:</div>
          <div style={{ fontSize:17, fontWeight:800, color:"#2A2620", marginBottom:16, lineHeight:1.5 }}>
            "{quizState.word.d}"
          </div>
          {quizState.opts.map((o,i)=>{
            let state="idle";
            if(quizState.chosen!==null){
              state = i===quizState.ci?"correct": i===quizState.chosen?"wrong":"idle";
            }
            return (
              <button key={i} style={S.qOpt(state)} onClick={()=>{
                if(quizState.chosen!==null) return;
                setQuizState(p=>({...p,chosen:i}));
                if(i===quizState.ci) addXp(15);
              }}>{o.w}</button>
            );
          })}
          {quizState.chosen!==null && (
            <button style={{ ...S.primaryBtn("#B8703A"), marginTop:10 }} onClick={newQuiz}>
              Next Question →
            </button>
          )}
        </div>
      )}

      {/* FILL IN */}
      {mode==="fill" && fillState && (
        <div style={S.card("rgba(52,211,153,0.2)")}>
          <div style={{ fontSize:11, color:"#4F9B6E", fontWeight:700, letterSpacing:0.5, marginBottom:12 }}>FILL IN THE BLANK</div>
          <div style={{ fontSize:16, fontWeight:700, color:"#2A2620", marginBottom:6 }}>
            {fillState.word.d}
          </div>
          <div style={{ fontSize:13, color:"#6B6154", marginBottom:14 }}>
            <span style={S.tag(lvl.color)}>{fillState.word.t}</span>
          </div>
          <p style={{ fontSize:14, lineHeight:1.8, marginBottom:12, color:"#3A352C" }}>
            {fillState.blanked}
          </p>
          <input value={fillInput} onChange={e=>setFillInput(e.target.value)}
            placeholder="Type the missing word..."
            style={{ width:"100%", background:"#F1EAD9", border:"1px solid rgba(42,38,32,0.08)", borderRadius:9, padding:"9px 12px", color:"#2A2620", fontFamily:"'Outfit',sans-serif", fontSize:14, outline:"none", marginBottom:8 }}
          />
          {fillState.checked ? (
            <>
              <div style={{ fontSize:13, color: fillState.correct?"#4F9B6E":"#B4453A", marginBottom:10 }}>
                {fillState.correct ? "✅ Correct! Well done!" : `❌ The answer is: ${fillState.word.w}`}
              </div>
              <button style={S.primaryBtn("#4F9B6E")} onClick={newFill}>Next Word →</button>
            </>
          ) : (
            <button style={S.primaryBtn("#4F9B6E")} onClick={()=>{
              const ok = fillInput.trim().toLowerCase()===fillState.word.w.toLowerCase();
              setFillState(p=>({...p,checked:true,correct:ok}));
              if(ok) addXp(20);
            }}>Check ✓</button>
          )}
        </div>
      )}

      {/* LEARN ALL */}
      {mode==="learn" && (
        <div>
          {words.map((w,i)=>(
            <div key={i} style={{ ...S.card(), display:"flex", alignItems:"flex-start", gap:12 }}>
              <div style={{ minWidth:40, textAlign:"center" }}>
                <div style={{ fontSize:18, fontWeight:800, color:"#B8703A" }}>{w.w[0].toUpperCase()}</div>
                <div style={{ ...S.tag("#B8703A"), margin:"4px 0 0", display:"inline-block" }}>{w.t}</div>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ fontSize:15, fontWeight:700 }}>{w.w}</div>
                  <button onClick={()=>speak(w.w,{rate:0.7})} style={{
                    width:22, height:22, borderRadius:"50%", border:"none",
                    background:"rgba(184,112,58,0.12)", color:"#B8703A",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:10, cursor:"pointer",
                  }}>▶</button>
                </div>
                <div style={{ fontSize:12, color:"#6B6154", margin:"4px 0" }}>{w.d}</div>
                <div style={{ fontSize:11.5, color:"#6B6154", fontStyle:"italic" }}>"{w.ex}"</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  PTE MOCK TEST PANEL
// ══════════════════════════════════════════════════════════════════════════════
const PTE_TASKS = [
  { id:"read_aloud",    label:"Read Aloud",         icon:"🔊", section:"Speaking",  time:40,  color:"#C98A2B", desc:"Read the text aloud clearly and naturally." },
  { id:"repeat",        label:"Repeat Sentence",    icon:"🔁", section:"Speaking",  time:15,  color:"#C98A2B", desc:"You will hear a sentence. Repeat it exactly." },
  { id:"desc_image",    label:"Describe Image",     icon:"🖼", section:"Speaking",  time:40,  color:"#C98A2B", desc:"Describe what you see in the image in detail." },
  { id:"summarize_w",   label:"Summarize Written",  icon:"📝", section:"Writing",   time:600, color:"#4F9B6E", desc:"Write a one-sentence summary of the passage." },
  { id:"essay",         label:"Write Essay",        icon:"📄", section:"Writing",   time:1200,color:"#4F9B6E", desc:"Write 200-300 words on the given topic." },
  { id:"fill_blanks",   label:"Fill in the Blanks", icon:"✏️", section:"Reading",   time:120, color:"#8570B3", desc:"Choose the correct word for each blank." },
  { id:"mcq_reading",   label:"MCQ Reading",        icon:"📖", section:"Reading",   time:120, color:"#8570B3", desc:"Read and answer multiple-choice questions." },
  { id:"summarize_s",   label:"Summarize Spoken",   icon:"🎧", section:"Listening", time:600, color:"#5B8FBF", desc:"After listening, write a summary in 50-70 words." },
  { id:"highlight",     label:"Highlight Correct",  icon:"🎯", section:"Listening", time:90,  color:"#5B8FBF", desc:"Listen and select the option that best matches." },
];

function PTEPanel({ level, lvl, addXp }) {
  const [taskIdx,   setTaskIdx]   = useState(null);
  const [exercise,  setExercise]  = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [timeLeft,  setTimeLeft]  = useState(0);
  const [timerOn,   setTimerOn]   = useState(false);
  const [answer,    setAnswer]    = useState("");
  const [feedback,  setFeedback]  = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [qStates,   setQStates]   = useState({});
  const [recording, setRecording] = useState(false);
  const [micError,  setMicError]  = useState("");
  const timerRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const recognRef = useRef(null);

  const SPEAKING_TASKS = ["read_aloud","repeat","desc_image"];

  const toggleRecording = () => {
    if (recording) { recognRef.current?.stop(); setRecording(false); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setMicError("This browser doesn't support voice recording — try Chrome."); return; }
    const r = new SR();
    r.lang = "en-US"; r.continuous = true; r.interimResults = true;
    r.onresult = (e) => {
      const t = Array.from(e.results).map(x=>x[0].transcript).join(" ");
      setAnswer(t);
    };
    r.onerror = (e) => {
      setRecording(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setMicError("Microphone access was blocked. Allow microphone permission and try again.");
      }
    };
    r.onend = () => setRecording(false);
    recognRef.current = r;
    setMicError("");
    setAnswer("");
    setRecording(true);
    try { r.start(); } catch { setRecording(false); }
  };

  useEffect(()=>{
    if(timerOn && timeLeft>0){
      timerRef.current = setTimeout(()=>setTimeLeft(p=>p-1),1000);
    } else if(timerOn && timeLeft<=0){
      setTimerOn(false);
    }
    return ()=>clearTimeout(timerRef.current);
  },[timerOn,timeLeft]);

  const startTask = async (idx) => {
    setTaskIdx(idx); setExercise(null); setFeedback(null);
    setAnswer(""); setSubmitted(false); setQStates({});
    setLoading(true);
    const task = PTE_TASKS[idx];

    const prompts = {
      read_aloud:   `Generate a short passage (4-6 sentences) for a PTE "Read Aloud" task at ${level} level. Return ONLY JSON: {"text":"..."}`,
      repeat:       `Generate a natural spoken sentence for PTE "Repeat Sentence" at ${level} level. Return ONLY JSON: {"sentence":"..."}`,
      desc_image:   `Describe a PTE-style chart or image for ${level}. Return ONLY JSON: {"description":"A bar chart showing ...(describe a real scenario with numbers)","prompt":"Describe this chart:"}`,
      summarize_w:  `Write a ${level}-level academic passage (6-8 sentences) for PTE "Summarize Written Text". Return ONLY JSON: {"passage":"...","topic":"..."}`,
      essay:        `Give a PTE essay topic appropriate for ${level}. Return ONLY JSON: {"topic":"...","points":["point1","point2","point3"]}`,
      fill_blanks:  `Create a PTE fill-in-blanks for ${level}. Return ONLY JSON: {"sentence":"...with [blank1] and [blank2] in the text...","blanks":[{"pos":"blank1","opts":["A","B","C","D"],"ans":0},{"pos":"blank2","opts":["A","B","C","D"],"ans":2}]}`,
      mcq_reading:  `Create a ${level} PTE reading MCQ. Return ONLY JSON: {"passage":"...","question":"...","opts":["A...","B...","C...","D..."],"ans":0}`,
      summarize_s:  `Write a short spoken passage (6-8 sentences) for PTE "Summarize Spoken Text" at ${level}. Return ONLY JSON: {"script":"...","topic":"..."}`,
      highlight:    `Create a PTE "Highlight Correct Summary" task for ${level}. Return ONLY JSON: {"script":"short spoken text...","summaries":["A - correct summary","B - wrong","C - wrong","D - wrong"],"ans":0}`,
    };

    const raw = await askClaude([{role:"user",content:prompts[task.id]}],"Return ONLY valid JSON.",600);
    try {
      const data = JSON.parse(raw.replace(/```json|```/g,"").trim());
      setExercise(data);
      setTimeLeft(task.time);
      setTimerOn(true);
      addXp(5);
      // auto-play for listening tasks
      if(task.id==="repeat"||task.id==="summarize_s"||task.id==="highlight"){
        setTimeout(()=>playText(data.sentence||data.script), 500);
      }
    } catch { setExercise({error:true}); }
    setLoading(false);
  };

  const playText = (text) => {
    if (!text) return;
    speak(text, { rate: 0.85 });
  };

  const submitAnswer = async () => {
    if(submitted) return;
    recognRef.current?.stop();
    setRecording(false);
    setSubmitted(true);
    setTimerOn(false);
    clearTimeout(timerRef.current);
    const task = PTE_TASKS[taskIdx];

    if(!answer.trim()&&task.id!=="fill_blanks"&&task.id!=="mcq_reading"&&task.id!=="highlight") {
      setFeedback({ text: SPEAKING_TASKS.includes(task.id) ? "⚠️ No speech was recorded. Go back and try again, and make sure to allow microphone access." : "⚠️ No answer submitted.", score:0 });
      return;
    }
    setLoading(true);

    const evalPrompts = {
      read_aloud:   `Evaluate this PTE Read Aloud response for ${level} level.\nText to read: "${exercise?.text}"\nStudent's actual spoken transcript: "${answer}"\nCompare the transcript to the original text. Give brief feedback on accuracy, fluency, and any missing/wrong words. Score /5.`,
      repeat:       `Evaluate this PTE Repeat Sentence response for ${level}.\nOriginal: "${exercise?.sentence}"\nStudent's actual spoken transcript: "${answer}"\nWas it accurate? Give score /5.`,
      desc_image:   `Evaluate this PTE Describe Image response for ${level}.\nImage context: "${exercise?.description}"\nStudent's actual spoken transcript: "${answer}"\nFeedback + score /5.`,
      summarize_w:  `Evaluate this PTE Written Summary for ${level}.\nPassage: "${exercise?.passage}"\nStudent summary: "${answer}"\nFeedback on content, grammar, length (should be 1 sentence). Score /5.`,
      essay:        `Evaluate this PTE essay for ${level}.\nTopic: "${exercise?.topic}"\nEssay: "${answer}"\nFeedback on: content (ideas), grammar, vocabulary, structure. Overall score /90 (PTE-style).`,
      summarize_s:  `Evaluate this PTE spoken summary (written response) for ${level}.\nOriginal script: "${exercise?.script}"\nStudent summary: "${answer}"\nFeedback + score /5.`,
    };

    if(evalPrompts[task.id]){
      const fb = await askClaude([{role:"user",content:evalPrompts[task.id]}],"You are a PTE examiner. Be brief, fair, and helpful. Include a clear score.",400);
      setFeedback({ text: fb.startsWith("__ERROR__")?fb.replace("__ERROR__","❌ "):fb });
      addXp(25);
    }
    setLoading(false);
  };

  const fmt = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
  const task = taskIdx!==null ? PTE_TASKS[taskIdx] : null;

  return (
    <div style={S.scroll}>
      {taskIdx === null ? (
        <>
          <div style={{ ...S.card("rgba(244,63,94,0.2)"), marginBottom:16 }}>
            <div style={{ fontSize:11, color:"#B04A5A", fontWeight:700, letterSpacing:1, marginBottom:6 }}>PTE ACADEMIC MOCK TEST</div>
            <div style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>Practice all PTE task types</div>
            <div style={{ fontSize:12, color:"#6B6154", lineHeight:1.6 }}>
              Each task is timed and AI-evaluated — just like the real PTE exam. Level: <span style={{ color:lvl.color, fontWeight:700 }}>{level}</span>
            </div>
          </div>

          {["Speaking","Writing","Reading","Listening"].map(sec => (
            <div key={sec} style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, color:"#6B6154", fontWeight:700, letterSpacing:0.5, marginBottom:8 }}>{sec.toUpperCase()}</div>
              {PTE_TASKS.filter(t=>t.section===sec).map((t,i) => {
                const gi = PTE_TASKS.indexOf(t);
                return (
                  <button key={t.id} onClick={()=>startTask(gi)} style={{
                    width:"100%", background:"#FFFFFF",
                    border:`1px solid ${t.color}22`,
                    borderRadius:12, padding:"12px 14px",
                    textAlign:"left", cursor:"pointer", marginBottom:7,
                    display:"flex", alignItems:"center", gap:12,
                    transition:"all 0.2s",
                  }}
                    onMouseEnter={e=>{ e.currentTarget.style.borderColor=`${t.color}55`; }}
                    onMouseLeave={e=>{ e.currentTarget.style.borderColor=`${t.color}22`; }}>
                    <span style={{ fontSize:20 }}>{t.icon}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:"#2A2620", marginBottom:2 }}>{t.label}</div>
                      <div style={{ fontSize:11, color:"#6B6154" }}>{t.desc}</div>
                    </div>
                    <span style={{ fontSize:10, color:t.color, fontFamily:"'JetBrains Mono',monospace", fontWeight:600 }}>
                      {fmt(t.time)}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </>
      ) : (
        <>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
            <button onClick={()=>{setTaskIdx(null);stopSpeaking();recognRef.current?.stop();setRecording(false);clearTimeout(timerRef.current);}}
              style={{ background:"#FFFFFF", border:"1px solid rgba(42,38,32,0.08)", borderRadius:9, padding:"6px 12px", color:"#6B6154", cursor:"pointer", fontSize:12, fontFamily:"'Outfit',sans-serif" }}>
              ← Back
            </button>
            <div style={{ flex:1 }}>
              <span style={S.tag(task?.color)}>{task?.section}</span>
              <span style={{ fontSize:14, fontWeight:700 }}>{task?.label}</span>
            </div>
            <div style={S.timer(timeLeft < 20 && timeLeft > 0)}>{fmt(timeLeft)}</div>
          </div>

          {loading && !exercise && (
            <div style={{ textAlign:"center", padding:"30px 0", color:"#6B6154" }}>
              <div style={{ fontSize:24, animation:"spin 1s linear infinite", display:"inline-block", marginBottom:8 }}>⟳</div>
              <div style={{ fontSize:13 }}>Generating task...</div>
            </div>
          )}

          {exercise && !exercise.error && (
            <div style={{ ...S.card(`${task?.color}33`) }}>
              <div style={{ fontSize:11, color:task?.color, fontWeight:700, letterSpacing:0.5, marginBottom:10 }}>
                {task?.desc}
              </div>

              {/* READ ALOUD */}
              {task?.id==="read_aloud" && (
                <>
                  <p style={{ fontSize:14, lineHeight:1.9, color:"#2A2620", marginBottom:12 }}>{exercise.text}</p>
                  {!submitted && <button style={{ ...S.primaryBtn(task.color), marginBottom:12 }} onClick={()=>playText(exercise.text)}>Hear it first</button>}
                </>
              )}

              {/* REPEAT SENTENCE */}
              {task?.id==="repeat" && (
                <>
                  <button style={{ ...S.primaryBtn(task.color), marginBottom:12 }} onClick={()=>playText(exercise.sentence)}>▶ Play Sentence</button>
                  <p style={{ fontSize:12, color:"#6B6154" }}>Type what you heard:</p>
                </>
              )}

              {/* DESCRIBE IMAGE */}
              {task?.id==="desc_image" && (
                <>
                  <div style={{ background:"#F1EAD9", border:"1px solid rgba(42,38,32,0.08)", borderRadius:10, padding:14, marginBottom:12 }}>
                    <div style={{ fontSize:10, color:"#6B6154", marginBottom:4 }}>IMAGE CONTEXT</div>
                    <p style={{ fontSize:13, color:"#3A352C", lineHeight:1.6 }}>{exercise.description}</p>
                  </div>
                  <p style={{ fontSize:12, color:"#6B6154", marginBottom:8 }}>{exercise.prompt}</p>
                </>
              )}

              {/* SUMMARIZE WRITTEN */}
              {task?.id==="summarize_w" && (
                <>
                  <div style={{ background:"#F1EAD9", borderRadius:10, padding:14, marginBottom:12, border:"1px solid rgba(42,38,32,0.06)" }}>
                    <div style={{ fontSize:10, color:"#6B6154", marginBottom:6, fontWeight:700 }}>PASSAGE — {exercise.topic}</div>
                    <p style={{ fontSize:13, lineHeight:1.85, color:"#3A352C" }}>{exercise.passage}</p>
                  </div>
                  <p style={{ fontSize:12, color:"#6B6154" }}>Write ONE sentence summarizing the main idea:</p>
                </>
              )}

              {/* ESSAY */}
              {task?.id==="essay" && (
                <>
                  <div style={{ background:"#F1EAD9", borderRadius:10, padding:14, marginBottom:12 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:"#2A2620", marginBottom:8 }}>{exercise.topic}</div>
                    <div style={{ fontSize:11, color:"#6B6154" }}>Key points to consider:</div>
                    {exercise.points?.map((p,i)=>(
                      <div key={i} style={{ fontSize:12, color:"#6B6154", padding:"4px 0" }}>• {p}</div>
                    ))}
                  </div>
                  <p style={{ fontSize:12, color:"#6B6154" }}>Write 200-300 words:</p>
                </>
              )}

              {/* FILL IN BLANKS */}
              {task?.id==="fill_blanks" && (
                <>
                  <p style={{ fontSize:14, lineHeight:1.9, color:"#2A2620", marginBottom:14 }}>
                    {exercise.sentence}
                  </p>
                  {exercise.blanks?.map((b,bi)=>{
                    const st = qStates[bi];
                    return (
                      <div key={bi} style={{ marginBottom:12 }}>
                        <div style={{ fontSize:11, color:"#6B6154", marginBottom:5 }}>Blank {bi+1}: [{b.pos}]</div>
                        {b.opts?.map((o,oi)=>{
                          let state = "idle";
                          if(st!==undefined) state = oi===b.ans?"correct": oi===st?"wrong":"idle";
                          return (
                            <button key={oi} style={S.qOpt(state)} onClick={()=>{
                              if(st!==undefined||submitted) return;
                              setQStates(p=>({...p,[bi]:oi}));
                              if(oi===b.ans) addXp(10);
                            }}>{o}</button>
                          );
                        })}
                      </div>
                    );
                  })}
                </>
              )}

              {/* MCQ READING */}
              {task?.id==="mcq_reading" && (
                <>
                  <div style={{ background:"#F1EAD9", borderRadius:10, padding:14, marginBottom:12 }}>
                    <p style={{ fontSize:13, lineHeight:1.85, color:"#3A352C" }}>{exercise.passage}</p>
                  </div>
                  <p style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>{exercise.question}</p>
                  {exercise.opts?.map((o,i)=>{
                    const st = qStates[0];
                    let state = "idle";
                    if(st!==undefined) state = i===exercise.ans?"correct": i===st?"wrong":"idle";
                    return (
                      <button key={i} style={S.qOpt(state)} onClick={()=>{
                        if(st!==undefined) return;
                        setQStates({0:i});
                        if(i===exercise.ans) addXp(15);
                      }}>{o}</button>
                    );
                  })}
                </>
              )}

              {/* SUMMARIZE SPOKEN */}
              {task?.id==="summarize_s" && (
                <>
                  <button style={{ ...S.primaryBtn(task.color), marginBottom:12 }} onClick={()=>playText(exercise.script)}>▶ Play Audio — {exercise.topic}</button>
                  <p style={{ fontSize:12, color:"#6B6154" }}>Write a summary in 50-70 words:</p>
                </>
              )}

              {/* HIGHLIGHT CORRECT */}
              {task?.id==="highlight" && (
                <>
                  <button style={{ ...S.primaryBtn(task.color), marginBottom:12 }} onClick={()=>playText(exercise.script)}>▶ Play Audio</button>
                  <div style={{ fontSize:12, color:"#6B6154", marginBottom:8 }}>Select the best summary:</div>
                  {exercise.summaries?.map((s,i)=>{
                    const st = qStates[0];
                    let state = "idle";
                    if(st!==undefined) state = i===exercise.ans?"correct": i===st?"wrong":"idle";
                    return (
                      <button key={i} style={S.qOpt(state)} onClick={()=>{
                        if(st!==undefined) return;
                        setQStates({0:i});
                        if(i===exercise.ans) addXp(15);
                      }}>{s}</button>
                    );
                  })}
                </>
              )}

              {/* VOICE ANSWER — Speaking tasks (Read Aloud, Repeat Sentence, Describe Image) */}
              {SPEAKING_TASKS.includes(task?.id) && !submitted && (
                <div style={{ marginTop:8 }}>
                  {micError && (
                    <div style={{ marginBottom:10, padding:"8px 12px", background:"rgba(180,69,58,0.1)", border:"1px solid rgba(180,69,58,0.25)", borderRadius:10, fontSize:11.5, color:"#B4453A" }}>
                      {micError}
                    </div>
                  )}
                  <button onClick={toggleRecording} style={{
                    display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                    width:"100%", padding:"14px", borderRadius:12, border:"none", cursor:"pointer",
                    background: recording ? "#B4453A" : task.color,
                    color:"#FFFFFF", fontSize:13.5, fontWeight:700, fontFamily:"'Outfit',sans-serif",
                  }}>
                    {recording ? "⏹ Stop Recording" : "🎙 Start Speaking"}
                  </button>
                  {recording && <div style={{ textAlign:"center", fontSize:11.5, color:"#8A8074", marginTop:8 }}>يسجل الآن... تكلم بوضوح · Recording... speak clearly</div>}
                  {answer && !recording && (
                    <div style={{ marginTop:10, padding:"10px 12px", background:"#F1EAD9", borderRadius:10, fontSize:12.5, color:"#3A352C", lineHeight:1.6 }}>
                      <div style={{ fontSize:10, color:"#8A8074", marginBottom:4 }}>What you said:</div>
                      {answer}
                    </div>
                  )}
                </div>
              )}

              {/* TEXT ANSWER INPUT — Writing & Listening-summary tasks */}
              {["summarize_w","essay","summarize_s"].includes(task?.id) && !submitted && (
                <textarea value={answer} onChange={e=>setAnswer(e.target.value)}
                  placeholder={task?.id==="essay"?"Write your essay here (200-300 words)...":"Your answer..."}
                  style={{ ...S.textarea, width:"100%", minHeight: task?.id==="essay"?200:80, marginTop:8, resize:"vertical" }}
                  rows={task?.id==="essay"?10:3}
                />
              )}

              {/* SUBMIT */}
              {!submitted && ["read_aloud","repeat","desc_image","summarize_w","essay","summarize_s"].includes(task?.id) && (
                <button style={{ ...S.primaryBtn(task?.color||"#3D4F91"), marginTop:10 }} onClick={submitAnswer} disabled={loading || recording}>
                  {loading?"Evaluating...":"Submit Answer →"}
                </button>
              )}

              {/* FEEDBACK */}
              {feedback && (
                <div style={{ marginTop:14, padding:"14px 16px", background:"rgba(61,79,145,0.08)", border:"1px solid rgba(61,79,145,0.25)", borderRadius:12 }}>
                  <div style={{ fontSize:11, color:"#3D4F91", fontWeight:700, letterSpacing:0.5, marginBottom:8 }}>AI examiner feedback</div>
                  <div style={{ fontSize:13, color:"#3A352C", lineHeight:1.7 }} dangerouslySetInnerHTML={{ __html:feedback.text.replace(/\n/g,"<br/>") }}/>
                </div>
              )}

              {(submitted || ["fill_blanks","mcq_reading","highlight"].includes(task?.id)) && (
                <button style={{ ...S.primaryBtn("#3D4F91"), marginTop:12 }} onClick={()=>startTask(taskIdx)}>
                  Try again
                </button>
              )}
            </div>
          )}
          {exercise?.error && <p style={{ color:"#B4453A" }}>Could not generate task. Go back and try again.</p>}
        </>
      )}
    </div>
  );
}
