import { useState, useCallback, useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════
const SLEEP_CYCLE_MIN = 90;
const MIN_WAKE_HOURS  = 4;
const MAX_SLEEP_H     = 9;
const TARGET_SLEEP_H  = 7.5;

// ═══════════════════════════════════════════════════════════════════════════
// TIME UTILITIES (DST-safe)
// ═══════════════════════════════════════════════════════════════════════════
const refNoon    = new Date(new Date().getFullYear(), 0, 1, 12, 0).getTime();
const MS_PER_DAY = 86400000;

function toMin(dateStr, timeStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, mn]   = timeStr.split(":").map(Number);
  const dayIdx    = Math.round((new Date(y, m-1, d, 12, 0).getTime() - refNoon) / MS_PER_DAY);
  return dayIdx * 1440 + h * 60 + mn;
}
function minToTime(absMin) {
  const pos = ((absMin % 1440) + 1440) % 1440;
  return `${String(Math.floor(pos/60)).padStart(2,"0")}:${String(pos%60).padStart(2,"0")}`;
}
function minToDate(absMin) {
  const d = new Date(new Date().getFullYear(), 0, 1);
  d.setDate(d.getDate() + Math.floor(absMin / 1440));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function localDate(offset = 0) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function nowMin() {
  const n = new Date();
  return toMin(localDate(0), `${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")}`);
}
function formatDur(min) {
  if (!min || min <= 0) return "–";
  return `${Math.floor(min/60)}t${min%60 ? ` ${min%60}m` : ""}`;
}
function friendlyDate(dateStr) {
  const days = ["søn","man","tir","ons","tor","fre","lør"];
  const d = new Date(dateStr + "T12:00:00");
  return `${days[d.getDay()]} ${d.getDate()}.${d.getMonth()+1}`;
}
function friendlyDateTime(absMin) {
  return `${friendlyDate(minToDate(absMin))} kl. ${minToTime(absMin)}`;
}
function parseWindow(w) {
  const start = toMin(w.date, w.startTime);
  const startH = parseInt(w.startTime), endH = parseInt(w.endTime);
  let end = toMin(w.date, w.endTime);
  if (endH < startH || (endH === startH && w.endTime <= w.startTime)) end += 1440;
  return { ...w, startMin: start, endMin: end };
}

// ═══════════════════════════════════════════════════════════════════════════
// MELATONIN MODEL
// ═══════════════════════════════════════════════════════════════════════════
function melatoninLevel(hour, shift = 0, amp = 1.0) {
  const peak = (2 + shift + 24) % 24;
  const base = Math.max(5, Math.round(((Math.cos(((hour-peak)/24)*2*Math.PI)+1)/2)*100));
  return Math.round(5 + (base-5)*amp);
}
function melatoninSleepScore(hour, shift = 0, amp = 1.0) {
  const base = melatoninLevel(hour, shift, amp);
  const dlmo = (21+shift+24)%24, dlmoEnd = (dlmo+4)%24;
  const inDlmo = dlmoEnd > dlmo ? (hour>=dlmo&&hour<=dlmoEnd) : (hour>=dlmo||hour<=dlmoEnd);
  if (inDlmo) return Math.min(100, Math.round(base+15*amp));
  if (hour>=13&&hour<=15) return Math.min(60, base+Math.round(10*amp));
  return base;
}

// ═══════════════════════════════════════════════════════════════════════════
// CALIBRATION
// ═══════════════════════════════════════════════════════════════════════════
function calibrateFromLog(log) {
  if (!log || log.length < 3) return { dlmoShift:0, amplitude:1.0, dataPoints:log?.length||0 };
  const hours = log.map(e => (e.sleepStart%1440)/60);
  const avg   = hours.reduce((a,b)=>a+b,0)/hours.length;
  const dlmoShift = ((((avg-2.5+24)%24)-21+12)%24)-12;
  const variance  = hours.reduce((acc,h)=>{ const d=Math.min(Math.abs(h-avg),24-Math.abs(h-avg)); return acc+d*d; },0)/hours.length;
  return { dlmoShift, amplitude: Math.max(0.5, 1.0-Math.sqrt(variance)/8), dataPoints: log.length };
}

// ═══════════════════════════════════════════════════════════════════════════
// CORE SLEEP OPTIMIZER
// ═══════════════════════════════════════════════════════════════════════════
function optimizeSleep(windows, lastWokeMin, calib = {}) {
  if (!windows.length) return [];
  const { dlmoShift:shift=0, amplitude:amp=1.0 } = calib;
  const wins = [...windows].sort((a,b)=>a.startMin-b.startMin);
  const budget = ((wins[wins.length-1].endMin - lastWokeMin)/60/24)*TARGET_SLEEP_H*60;
  let slept=0, lastWake=lastWokeMin;
  const results = [];

  for (let i=0; i<wins.length; i++) {
    const win=wins[i], next=wins[i+1]||null, dur=win.endMin-win.startMin;
    const hoursAwake = (win.startMin-lastWake)/60;
    if (hoursAwake < MIN_WAKE_HOURS) { results.push({win,skip:true,reason:`${Math.round(hoursAwake*10)/10}t siden sist – for lite til å sovne`,hoursAwake,slept}); continue; }

    const rawTarget = hoursAwake>=20?8:hoursAwake>=14?7.5:hoursAwake>=9?7:6;
    const bestMel = Math.max(melatoninSleepScore(Math.floor(win.startMin%1440/60),shift,amp), melatoninSleepScore(Math.floor(win.endMin%1440/60),shift,amp));
    let targetMin = (rawTarget + (bestMel>60?0:bestMel>30?-0.5:-1))*60;

    if (next) { const g=(next.startMin-win.endMin)/60; if(g<MIN_WAKE_HOURS&&g>0) targetMin=Math.min(targetMin,Math.max(SLEEP_CYCLE_MIN,(g/MIN_WAKE_HOURS)*targetMin)); }
    const fair=(budget-slept)/(wins.length-i);
    if (targetMin>fair*1.4&&slept>0) targetMin=Math.max(SLEEP_CYCLE_MIN,Math.min(targetMin,fair*1.2));
    targetMin = Math.min(targetMin,dur,MAX_SLEEP_H*60); targetMin=Math.max(0,targetMin);

    const dn=Math.floor(targetMin/SLEEP_CYCLE_MIN), up=Math.ceil(targetMin/SLEEP_CYCLE_MIN);
    let cycles=(Math.abs(up*SLEEP_CYCLE_MIN-targetMin)<=15&&up*SLEEP_CYCLE_MIN<=dur)?up:(Math.abs(dn*SLEEP_CYCLE_MIN-targetMin)<=Math.abs(up*SLEEP_CYCLE_MIN-targetMin)?dn:up);
    cycles=Math.max(1,cycles); let recMin=cycles*SLEEP_CYCLE_MIN;
    while(recMin>dur&&cycles>1){cycles--;recMin=cycles*SLEEP_CYCLE_MIN;}
    if(recMin>dur){results.push({win,skip:true,reason:"Vinduet er for kort (min. 90 min)",hoursAwake,slept});continue;}

    let bestStart=win.startMin;
    if(win.anchor==="bedtime") bestStart=win.startMin;
    else if(win.anchor==="waketime") bestStart=Math.max(win.startMin,win.endMin-recMin);
    else {
      let best=-Infinity;
      for(let t=win.startMin;t<=win.endMin-recMin;t+=15){
        const sh=Math.floor(t%1440/60),wh=Math.floor((t+recMin)%1440/60);
        let sc=melatoninSleepScore(sh,shift,amp)-melatoninLevel(wh,shift,amp)*0.25;
        if(hoursAwake>20) sc-=(t-win.startMin)/60;
        if(sc>best){best=sc;bestStart=t;}
      }
    }

    const sleepEnd=bestStart+recMin;
    const sh=Math.floor(bestStart%1440/60),wh=Math.floor(sleepEnd%1440/60);
    const melOnset=melatoninSleepScore(sh,shift,amp),melWake=melatoninLevel(wh,shift,amp);
    const quality=Math.min(100,Math.round((Math.min(cycles,5)/5)*40+melOnset*0.35+(100-melWake)*0.15+Math.min(10,hoursAwake*0.5)));
    results.push({win,skip:false,sleepStart:bestStart,sleepEnd,duration:recMin,cycles,hoursAwake:Math.round(hoursAwake*10)/10,slept:Math.round(slept),quality,melOnset,melWake,debug:{rawTargetH:Math.round(rawTarget*10)/10,windowConstraint:dur<rawTarget*60,windowMaxH:Math.round(dur/60*10)/10,budgetLeft:Math.round((budget-slept)/60*10)/10}});
    slept+=recMin; lastWake=sleepEnd;
  }
  return results;
}

// ═══════════════════════════════════════════════════════════════════════════
// INJECT FONTS & GLOBAL STYLES
// ═══════════════════════════════════════════════════════════════════════════
(function() {
  if (document.getElementById("os-fonts")) return;
  const link = document.createElement("link");
  link.id = "os-fonts"; link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap";
  document.head.appendChild(link);
  const style = document.createElement("style");
  style.textContent = `*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}input::-webkit-calendar-picker-indicator{filter:invert(.6)brightness(1.4);}select{appearance:none;}::-webkit-scrollbar{width:0;}@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}@keyframes glow{0%,100%{box-shadow:0 0 20px rgba(94,231,183,.15)}50%{box-shadow:0 0 40px rgba(94,231,183,.35)}}`;
  document.head.appendChild(style);
})();

// ═══════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════════════════
const T = {
  bg:"#060914", surface:"#0C1220", elevated:"#111A2E", border:"rgba(255,255,255,.06)",
  accent:"#5EE7B7", accentLo:"rgba(94,231,183,.12)", accentDim:"#2A6B55",
  gold:"#F0B952", goldLo:"rgba(240,185,82,.12)",
  blue:"#4FA3E0", blueLo:"rgba(79,163,224,.12)",
  red:"#E05C5C", redLo:"rgba(224,92,92,.12)",
  text:"#E2EAF4", sub:"#7A96B8", muted:"#3A4F6A",
  font:"'Sora',system-ui,sans-serif", mono:"'JetBrains Mono',monospace",
};

// ── Micro components ─────────────────────────────────────────────────────
const inp = { background:T.elevated, border:`1px solid ${T.border}`, borderRadius:12, color:T.text, padding:"11px 14px", fontSize:14, outline:"none", fontFamily:T.font, width:"100%", WebkitAppearance:"none" };

function Inp({ type, value, onChange, placeholder }) {
  return <input type={type} value={value} onChange={onChange} placeholder={placeholder} style={inp} />;
}
function Sel({ value, onChange, options }) {
  return (
    <div style={{position:"relative"}}>
      <select value={value} onChange={onChange} style={{...inp,paddingRight:36,cursor:"pointer"}}>
        {options.map(([v,l])=><option key={v} value={v}>{l}</option>)}
      </select>
      <div style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",color:T.muted,pointerEvents:"none"}}>▾</div>
    </div>
  );
}
function Lbl({ children }) {
  return <div style={{fontSize:10,fontWeight:600,color:T.muted,letterSpacing:"0.12em",marginBottom:6,fontFamily:T.mono}}>{children}</div>;
}
function Fld({ label, children }) { return <div><Lbl>{label}</Lbl>{children}</div>; }

function Card({ children, accent, glow, style={} }) {
  return <div style={{background:T.surface,border:`1px solid ${T.border}`,borderLeft:accent?`3px solid ${accent}`:undefined,borderRadius:20,padding:"18px 20px",marginBottom:12,animation:glow?"glow 3s ease-in-out infinite":undefined,...style}}>{children}</div>;
}

function PrimaryBtn({ children, onClick, disabled }) {
  return <button onClick={onClick} disabled={disabled} style={{width:"100%",padding:"15px",borderRadius:16,border:"none",background:disabled?T.elevated:`linear-gradient(135deg,${T.accent},${T.blue})`,color:disabled?T.muted:"#060914",fontFamily:T.font,fontSize:15,fontWeight:700,cursor:disabled?"not-allowed":"pointer",boxShadow:disabled?"none":"0 8px 32px rgba(94,231,183,.25)",transition:"all .2s"}}>{children}</button>;
}
function GhostBtn({ children, onClick }) {
  return <button onClick={onClick} style={{width:"100%",padding:"13px",borderRadius:14,border:`1px solid ${T.border}`,background:"transparent",color:T.sub,fontFamily:T.font,fontSize:14,cursor:"pointer"}}>{children}</button>;
}
function IconBtn({ icon, label, onClick, active, color=T.sub }) {
  return (
    <button onClick={onClick} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"8px 12px",background:"none",border:"none",cursor:"pointer",color:active?T.accent:color}}>
      <span style={{fontSize:22}}>{icon}</span>
      <span style={{fontSize:9,fontFamily:T.mono,letterSpacing:"0.08em",fontWeight:600}}>{label}</span>
    </button>
  );
}

function Pill({ children, color=T.accent }) {
  return <span style={{display:"inline-flex",alignItems:"center",gap:5,background:`${color}18`,border:`1px solid ${color}30`,borderRadius:8,padding:"3px 10px",fontSize:11,color,fontFamily:T.mono,fontWeight:500}}><span style={{width:5,height:5,borderRadius:"50%",background:color,display:"inline-block"}}/>{ children}</span>;
}

function QArc({ value }) {
  const col = value>=75?T.accent:value>=50?T.blue:T.gold;
  const r=20,c=26,circ=2*Math.PI*r;
  return (
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      <svg width={52} height={52} style={{transform:"rotate(-90deg)"}}>
        <circle cx={c} cy={c} r={r} fill="none" stroke={T.elevated} strokeWidth={4}/>
        <circle cx={c} cy={c} r={r} fill="none" stroke={col} strokeWidth={4} strokeDasharray={`${(value/100)*circ} ${circ}`} strokeLinecap="round"/>
      </svg>
      <div><div style={{fontSize:20,fontWeight:700,color:col,lineHeight:1}}>{value}%</div><div style={{fontSize:10,color:T.muted,fontFamily:T.mono,letterSpacing:"0.1em"}}>KVALITET</div></div>
    </div>
  );
}

function TimeBar({ sleepStart, sleepEnd, winStart, winEnd }) {
  const span=winEnd-winStart;
  const l=((sleepStart-winStart)/span)*100, w=((sleepEnd-sleepStart)/span)*100;
  return (
    <div style={{marginBottom:14}}>
      <div style={{height:5,background:T.elevated,borderRadius:3,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",left:`${l}%`,width:`${w}%`,height:"100%",background:`linear-gradient(90deg,${T.accent},${T.blue})`,borderRadius:3}}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
        <span style={{fontSize:10,color:T.muted,fontFamily:T.mono}}>{minToTime(winStart)}</span>
        <span style={{fontSize:10,color:T.muted,fontFamily:T.mono}}>{minToTime(winEnd)}</span>
      </div>
    </div>
  );
}

// Melatonin 24h ring (decorative)
function MelRing({ shift=0, amp=1.0, size=120 }) {
  const now = new Date().getHours() + new Date().getMinutes()/60;
  const points = Array.from({length:48},(_,i)=>{
    const h=i/2, mel=melatoninLevel(h,shift,amp)/100;
    const angle=(h/24)*2*Math.PI - Math.PI/2;
    const r=size/2*(0.35+mel*0.4);
    return [size/2+r*Math.cos(angle), size/2+r*Math.sin(angle)];
  });
  const path = points.map((p,i)=>`${i===0?"M":"L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")+"Z";
  const nowAngle=(now/24)*2*Math.PI-Math.PI/2;
  const nowMel=melatoninLevel(Math.floor(now),shift,amp)/100;
  const nowR=size/2*(0.35+nowMel*0.4);
  const nx=size/2+nowR*Math.cos(nowAngle), ny=size/2+nowR*Math.sin(nowAngle);
  return (
    <svg width={size} height={size}>
      <circle cx={size/2} cy={size/2} r={size*0.17} fill={T.elevated}/>
      <path d={path} fill={`${T.accent}20`} stroke={T.accent} strokeWidth={1.5} strokeLinejoin="round"/>
      <circle cx={nx} cy={ny} r={4} fill={T.accent}/>
      <circle cx={nx} cy={ny} r={8} fill={`${T.accent}30`}/>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCREEN: HOME
// ═══════════════════════════════════════════════════════════════════════════
function HomeScreen({ results, log, calib, onLogSleep, onGoToPlan, setTab }) {
  const [now, setNow] = useState(nowMin());
  const [clock, setClock] = useState(new Date());
  useEffect(()=>{ const t=setInterval(()=>{ setNow(nowMin()); setClock(new Date()); },60000); return()=>clearInterval(t); },[]);

  const nextSleep = results?.find(r=>!r.skip && r.sleepStart > now);
  const currentSleep = results?.find(r=>!r.skip && r.sleepStart<=now && r.sleepEnd>=now);
  const isSleeping = !!currentSleep;

  const minsToSleep = nextSleep ? nextSleep.sleepStart - now : null;
  const hoursToSleep = minsToSleep !== null ? Math.floor(minsToSleep/60) : null;
  const minsRem = minsToSleep !== null ? minsToSleep%60 : null;

  const lastEntry = log.length ? log[log.length-1] : null;
  const hoursAwakeNow = lastEntry ? (now - lastEntry.sleepEnd) / 60 : null;
  const restScore = lastEntry ? Math.max(0, Math.min(100, Math.round(100 - (hoursAwakeNow || 0)*4))) : null;

  const nowHour = clock.getHours();
  const greeting = nowHour < 5 ? "God natt" : nowHour < 12 ? "God morgen" : nowHour < 18 ? "God dag" : "God kveld";

  return (
    <div style={{animation:"fadeUp .4s ease"}}>
      {/* Greeting + time */}
      <div style={{padding:"28px 22px 16px"}}>
        <div style={{fontSize:13,color:T.sub,marginBottom:2}}>{greeting}</div>
        <div style={{fontSize:38,fontWeight:800,letterSpacing:"-0.05em",color:T.text,lineHeight:1}}>
          {String(clock.getHours()).padStart(2,"0")}:{String(clock.getMinutes()).padStart(2,"0")}
        </div>
      </div>

      <div style={{padding:"0 16px"}}>

        {/* HERO CARD — current status */}
        {isSleeping ? (
          <Card accent={T.accent} glow style={{marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
              <div>
                <Pill color={T.accent}>Sover nå</Pill>
                <div style={{fontSize:28,fontWeight:700,letterSpacing:"-0.04em",color:T.text,marginTop:8}}>
                  {minToTime(currentSleep.sleepStart)} → {minToTime(currentSleep.sleepEnd)}
                </div>
                <div style={{fontSize:13,color:T.sub,marginTop:2}}>
                  Sover til {minToTime(currentSleep.sleepEnd)} · {currentSleep.cycles} sykluser
                </div>
              </div>
              <div style={{fontSize:36}}>😴</div>
            </div>
            <div style={{background:T.elevated,borderRadius:10,height:6,overflow:"hidden"}}>
              <div style={{height:"100%",background:`linear-gradient(90deg,${T.accent},${T.blue})`,width:`${Math.max(0,Math.min(100,((now-currentSleep.sleepStart)/(currentSleep.sleepEnd-currentSleep.sleepStart))*100))}%`,borderRadius:10}}/>
            </div>
          </Card>
        ) : nextSleep ? (
          <Card style={{marginBottom:16,background:`linear-gradient(135deg,${T.elevated},${T.surface})`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
              <div>
                <div style={{fontSize:12,color:T.muted,fontFamily:T.mono,letterSpacing:"0.1em",marginBottom:6}}>NESTE SØVN</div>
                <div style={{fontSize:32,fontWeight:700,letterSpacing:"-0.04em",color:T.text}}>
                  {minToTime(nextSleep.sleepStart)}
                </div>
                <div style={{fontSize:13,color:T.sub,marginTop:2}}>
                  {friendlyDate(minToDate(nextSleep.sleepStart))} · {formatDur(nextSleep.duration)}
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:11,color:T.muted,fontFamily:T.mono,marginBottom:4}}>OM</div>
                <div style={{fontSize:28,fontWeight:700,color:T.accent,lineHeight:1}}>
                  {hoursToSleep}t{minsRem ? ` ${minsRem}m` : ""}
                </div>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
              {[
                ["Sykluser",`${nextSleep.cycles}×90m`,T.text],
                ["Kvalitet",`${nextSleep.quality}%`,nextSleep.quality>=75?T.accent:T.gold],
                ["Melatonin",`${nextSleep.melOnset}%`,nextSleep.melOnset>60?T.accent:T.gold],
              ].map(([l,v,c])=>(
                <div key={l} style={{background:T.bg,borderRadius:10,padding:"10px 12px"}}>
                  <div style={{fontSize:9,color:T.muted,fontFamily:T.mono,letterSpacing:"0.1em",marginBottom:2}}>{l}</div>
                  <div style={{fontSize:16,fontWeight:700,color:c}}>{v}</div>
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <Card style={{marginBottom:16,textAlign:"center",padding:"32px 20px"}}>
            <div style={{fontSize:36,marginBottom:12}}>🌙</div>
            <div style={{fontSize:16,fontWeight:600,color:T.text,marginBottom:8}}>Ingen plan ennå</div>
            <div style={{fontSize:13,color:T.sub,marginBottom:16}}>Legg inn sovevinduer for å få din personlige søvnplan</div>
            <PrimaryBtn onClick={onGoToPlan}>Lag søvnplan</PrimaryBtn>
          </Card>
        )}

        {/* MELATONIN + REST row */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
          <Card style={{margin:0}}>
            <div style={{fontSize:10,color:T.muted,fontFamily:T.mono,letterSpacing:"0.1em",marginBottom:8}}>MELATONIN NÅ</div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <div style={{fontSize:24,fontWeight:700,color:T.accent}}>{melatoninLevel(nowHour,calib.dlmoShift,calib.amplitude)}%</div>
                <div style={{fontSize:11,color:T.sub}}>{melatoninLevel(nowHour,calib.dlmoShift,calib.amplitude)>60?"Stiger":"Lavt"}</div>
              </div>
              <MelRing shift={calib.dlmoShift} amp={calib.amplitude} size={56}/>
            </div>
          </Card>
          <Card style={{margin:0}}>
            <div style={{fontSize:10,color:T.muted,fontFamily:T.mono,letterSpacing:"0.1em",marginBottom:8}}>RESTITUSJON</div>
            {restScore !== null ? (
              <div>
                <div style={{fontSize:24,fontWeight:700,color:restScore>=70?T.accent:restScore>=40?T.gold:T.red}}>{restScore}%</div>
                <div style={{fontSize:11,color:T.sub}}>{restScore>=70?"Godt hvilt":restScore>=40?"Moderat":hoursAwakeNow!==null?`${Math.round(hoursAwakeNow)}t siden søvn`:""}</div>
              </div>
            ) : (
              <div style={{fontSize:13,color:T.muted}}>Logg søvn for score</div>
            )}
          </Card>
        </div>

        {/* Today's plan mini */}
        {results?.filter(r=>!r.skip).length > 0 && (
          <Card style={{marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:600,color:T.sub,marginBottom:12}}>Kommende søvn</div>
            {results.filter(r=>!r.skip).slice(0,3).map((r,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:i<2?10:0,marginBottom:i<2?10:0,borderBottom:i<2?`1px solid ${T.border}`:undefined}}>
                <div>
                  <div style={{fontSize:14,fontWeight:600,color:T.text}}>{minToTime(r.sleepStart)} → {minToTime(r.sleepEnd)}</div>
                  <div style={{fontSize:11,color:T.muted}}>{friendlyDate(minToDate(r.sleepStart))} · {formatDur(r.duration)}</div>
                </div>
                <Pill color={r.quality>=75?T.accent:T.gold}>{r.quality}%</Pill>
              </div>
            ))}
          </Card>
        )}

        {/* Sleep hygiene tip */}
        <SleepHygieneTip hour={nowHour} calib={calib}/>

        {/* Quick log button */}
        <div style={{marginTop:16}}>
          <GhostBtn onClick={onLogSleep}>+ Logg søvnøkt raskt</GhostBtn>
        </div>
      </div>
    </div>
  );
}

function SleepHygieneTip({ hour, calib }) {
  const tips = [
    { hours:[20,21,22], icon:"💡", title:"Dim lysene", text:"Reduser lys nå for å la melatonin stige naturlig. Unngå sterkt tak-lys." },
    { hours:[21,22,23], icon:"📱", title:"Legg bort skjermen", text:"Blålys forsinker DLMO med opptil 1.5 timer. Bytt til nattmodus eller legg bort telefonen." },
    { hours:[6,7,8], icon:"☀️", title:"Søk dagslys", text:"Morgenlys nå hjelper å sette circadian-klokken for neste natt." },
    { hours:[14,15], icon:"☕", title:"Siste kaffe nå", text:"Koffein har 5-6t halveringstid. Etter kl 15 påvirker det nattesøvnen." },
    { hours:[13,14,15], icon:"😴", title:"Power-nap-vindu", text:"Ettermiddagsdipet er et naturlig mini-søvnvindu. 20 minutter er ideelt." },
  ];
  const tip = tips.find(t=>t.hours.includes(hour));
  if (!tip) return null;
  return (
    <Card style={{background:T.goldLo,borderColor:`${T.gold}30`}}>
      <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
        <div style={{fontSize:24,flexShrink:0}}>{tip.icon}</div>
        <div>
          <div style={{fontSize:13,fontWeight:600,color:T.gold,marginBottom:4}}>{tip.title}</div>
          <div style={{fontSize:12,color:T.sub,lineHeight:1.6}}>{tip.text}</div>
        </div>
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCREEN: PLAN
// ═══════════════════════════════════════════════════════════════════════════
function PlanScreen({ windows, setWindows, lwd, setLwd, lwt, setLwt, results, setResults, calib }) {
  const [expandDebug, setExpandDebug] = useState({});

  const addWindow = () => setWindows(w=>[...w,{id:Date.now(),date:localDate(1),startTime:"22:00",endTime:"06:00",anchor:"none"}]);
  const remWindow = id => setWindows(w=>w.filter(x=>x.id!==id));
  const updWindow = (id,f,v) => setWindows(w=>w.map(x=>x.id===id?{...x,[f]:v}:x));

  const calculate = () => {
    const res = optimizeSleep(windows.map(parseWindow), toMin(lwd,lwt), calib);
    setResults(res);
    setExpandDebug({});
  };

  const total = results?.filter(r=>!r.skip).reduce((s,r)=>s+r.duration,0)||0;

  return (
    <div style={{padding:"20px 16px",animation:"fadeUp .3s ease"}}>
      {/* Last woke */}
      <div style={{fontSize:13,fontWeight:600,color:T.sub,marginBottom:10}}>Sist våken</div>
      <Card>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Fld label="DATO"><Inp type="date" value={lwd} onChange={e=>setLwd(e.target.value)}/></Fld>
          <Fld label="KLOKKESLETT"><Inp type="time" value={lwt} onChange={e=>setLwt(e.target.value)}/></Fld>
        </div>
      </Card>

      {/* Windows */}
      <div style={{fontSize:13,fontWeight:600,color:T.sub,margin:"18px 0 6px"}}>Sovevinduer</div>
      <div style={{fontSize:12,color:T.muted,marginBottom:14,lineHeight:1.6}}>
        Når kan du sove? Appen velger optimalt tidspunkt innenfor hvert vindu.
      </div>

      {windows.map((w,idx)=>(
        <Card key={w.id}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:26,height:26,borderRadius:8,background:T.elevated,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:T.sub}}>{idx+1}</div>
              <span style={{fontSize:13,color:T.sub}}>{friendlyDate(w.date)}</span>
            </div>
            <button onClick={()=>remWindow(w.id)} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:22,padding:"0 4px"}}>×</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
            <Fld label="DATO"><Inp type="date" value={w.date} onChange={e=>updWindow(w.id,"date",e.target.value)}/></Fld>
            <Fld label="FRA"><Inp type="time" value={w.startTime} onChange={e=>updWindow(w.id,"startTime",e.target.value)}/></Fld>
            <Fld label="TIL"><Inp type="time" value={w.endTime} onChange={e=>updWindow(w.id,"endTime",e.target.value)}/></Fld>
          </div>
          <Fld label="FORANKRING">
            <Sel value={w.anchor||"none"} onChange={e=>updWindow(w.id,"anchor",e.target.value)} options={[["none","Auto – melatonin-optimalisert"],["bedtime","Fast leggetid (sover fra Fra-tid)"],["waketime","Fast opptid (sover til Til-tid)"]]}/>
          </Fld>
        </Card>
      ))}

      <button onClick={addWindow} style={{width:"100%",padding:"14px",background:"none",border:`1px dashed ${T.muted}`,borderRadius:16,color:T.muted,fontFamily:T.font,fontSize:14,cursor:"pointer",marginBottom:20}}>
        + Legg til sovingsvindu
      </button>
      <div style={{marginBottom:24}}><PrimaryBtn onClick={calculate}>Beregn søvnplan</PrimaryBtn></div>

      {/* Results inline */}
      {results?.length > 0 && (
        <>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:14,fontWeight:600,color:T.text}}>Din søvnplan</div>
            <Pill>{formatDur(total)} totalt</Pill>
          </div>
          {results.map((r,i)=>{
            const ws=minToTime(r.win.startMin),we=minToTime(r.win.endMin);
            if(r.skip) return (
              <Card key={i} accent={T.muted}>
                <div style={{fontSize:11,color:T.muted,fontFamily:T.mono,marginBottom:4}}>VINDU {i+1} · {ws}–{we}</div>
                <div style={{fontSize:13,color:T.sub}}>{r.reason}</div>
              </Card>
            );
            const open=expandDebug[i];
            return (
              <Card key={i} accent={T.accent}>
                <div style={{fontSize:11,color:T.muted,fontFamily:T.mono,marginBottom:4}}>VINDU {i+1} · {friendlyDate(r.win.date)} · {ws}–{we}</div>
                <div style={{fontSize:28,fontWeight:700,letterSpacing:"-0.04em",color:T.text,marginBottom:4}}>
                  {minToTime(r.sleepStart)}<span style={{color:T.muted,fontWeight:300,margin:"0 6px"}}>→</span>{minToTime(r.sleepEnd)}
                </div>
                <TimeBar sleepStart={r.sleepStart} sleepEnd={r.sleepEnd} winStart={r.win.startMin} winEnd={r.win.endMin}/>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
                  {[["Varighet",formatDur(r.duration),T.accent],["Sykluser",`${r.cycles}×90m`,T.text],["Våken før",`${r.hoursAwake}t`,T.sub]].map(([l,v,c])=>(
                    <div key={l} style={{background:T.elevated,borderRadius:12,padding:"10px 12px"}}>
                      <div style={{fontSize:9,color:T.muted,fontFamily:T.mono,letterSpacing:"0.1em",marginBottom:2}}>{l.toUpperCase()}</div>
                      <div style={{fontSize:16,fontWeight:700,color:c}}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <QArc value={r.quality}/>
                  <Pill color={r.melOnset>60?T.accent:r.melOnset>30?T.gold:T.red}>{r.melOnset>60?"Natt":r.melOnset>30?"Delvis":"Dag"} · {r.melOnset}%</Pill>
                </div>
                <button onClick={()=>setExpandDebug(d=>({...d,[i]:!d[i]}))} style={{width:"100%",padding:"9px",background:T.elevated,border:"none",borderRadius:10,color:T.muted,fontFamily:T.font,fontSize:12,cursor:"pointer",display:"flex",justifyContent:"space-between",marginBottom:open?0:0}}>
                  <span>Hvorfor dette?</span><span>{open?"▲":"▾"}</span>
                </button>
                {open&&<div style={{background:T.elevated,borderRadius:"0 0 10px 10px",padding:"12px 14px",fontSize:12,color:T.sub,lineHeight:1.9}}>
                  <div><span style={{color:T.text}}>Mål:</span> {r.debug.rawTargetH}t ({r.hoursAwake}t våken)</div>
                  {r.debug.windowConstraint&&<div style={{color:T.gold}}>⚠ Vindu begrenser til {r.debug.windowMaxH}t</div>}
                  <div><span style={{color:T.text}}>Melatonin:</span> {r.melOnset}% {r.melOnset>60?"— natt ✓":r.melOnset>30?"— delvis":"— dag, mål justert"}</div>
                  <div><span style={{color:T.text}}>Budsjett igjen:</span> {r.debug.budgetLeft}t</div>
                </div>}
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCREEN: ANALYSE
// ═══════════════════════════════════════════════════════════════════════════
function AnalyseScreen({ log, calib }) {
  const [quickDate, setQuickDate] = useState(localDate(0));
  const [quickStart, setQuickStart] = useState("23:00");
  const [quickEnd, setQuickEnd] = useState("07:00");
  const [savedLog, setSavedLog] = useState(log);

  useEffect(()=>setSavedLog(log),[log]);

  if (log.length === 0) return (
    <div style={{padding:"20px 16px",animation:"fadeUp .3s ease"}}>
      <div style={{fontSize:22,fontWeight:700,marginBottom:6}}>Analyse</div>
      <div style={{textAlign:"center",padding:"60px 0 40px",color:T.muted}}>
        <div style={{fontSize:48,marginBottom:16}}>📊</div>
        <div style={{fontSize:15,marginBottom:8,color:T.sub}}>Ingen data ennå</div>
        <div style={{fontSize:13}}>Logg noen søvnøkter for å se mønstre og statistikk</div>
      </div>
    </div>
  );

  // Stats
  const durations = log.map(e=>e.sleepEnd-e.sleepStart);
  const avgDur = durations.reduce((a,b)=>a+b,0)/durations.length;
  const avgBedtime = log.map(e=>(e.sleepStart%1440)/60).reduce((a,b)=>a+b,0)/log.length;
  const recent7 = log.slice(-7);
  const recent7avg = recent7.map(e=>e.sleepEnd-e.sleepStart).reduce((a,b)=>a+b,0)/recent7.length;

  // Chart: last 14 nights duration bars
  const chart = log.slice(-14);
  const maxDur = Math.max(...chart.map(e=>e.sleepEnd-e.sleepStart));

  return (
    <div style={{padding:"20px 16px",animation:"fadeUp .3s ease"}}>
      <div style={{fontSize:22,fontWeight:700,marginBottom:20}}>Analyse</div>

      {/* Calibration status */}
      {calib.dataPoints >= 3 && (
        <Card accent={T.accent} style={{marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:600,color:T.sub,marginBottom:12}}>Personlig kalibrering</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:12}}>
            {[["Netter",calib.dataPoints,T.accent],["DLMO-fase",`${calib.dlmoShift>=0?"+":""}${Math.round(calib.dlmoShift*10)/10}t`,T.text],["Amplitude",`${Math.round(calib.amplitude*100)}%`,calib.amplitude>0.8?T.accent:T.gold]].map(([l,v,c])=>(
              <div key={l} style={{background:T.elevated,borderRadius:12,padding:"12px"}}>
                <div style={{fontSize:9,color:T.muted,fontFamily:T.mono,letterSpacing:"0.1em",marginBottom:4}}>{l.toUpperCase()}</div>
                <div style={{fontSize:20,fontWeight:700,color:c}}>{v}</div>
              </div>
            ))}
          </div>
          {calib.dataPoints < 7 && <div style={{fontSize:12,color:T.muted}}>{7-calib.dataPoints} netter til for god kalibrering</div>}
        </Card>
      )}

      {/* Stats row */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
        {[
          ["Snitt søvn",formatDur(Math.round(avgDur)),avgDur>=420?T.accent:avgDur>=300?T.gold:T.red],
          ["Siste 7 netter",formatDur(Math.round(recent7avg)),recent7avg>=420?T.accent:recent7avg>=300?T.gold:T.red],
          ["Snitt leggetid",`${String(Math.floor(avgBedtime)).padStart(2,"0")}:${String(Math.round((avgBedtime%1)*60)).padStart(2,"0")}`,T.sub],
          ["Loggede netter",log.length,T.text],
        ].map(([l,v,c])=>(
          <Card key={l} style={{margin:0}}>
            <div style={{fontSize:10,color:T.muted,fontFamily:T.mono,letterSpacing:"0.1em",marginBottom:6}}>{l.toUpperCase()}</div>
            <div style={{fontSize:22,fontWeight:700,color:c}}>{v}</div>
          </Card>
        ))}
      </div>

      {/* Duration chart */}
      <Card>
        <div style={{fontSize:11,fontWeight:600,color:T.sub,marginBottom:14}}>Søvnlengde – siste {chart.length} netter</div>
        <div style={{display:"flex",alignItems:"flex-end",gap:4,height:80}}>
          {chart.map((e,i)=>{
            const dur=e.sleepEnd-e.sleepStart;
            const pct=(dur/maxDur)*100;
            const col=dur>=420?T.accent:dur>=300?T.gold:T.red;
            return (
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                <div style={{width:"100%",height:`${pct}%`,background:col,borderRadius:"3px 3px 0 0",opacity:.85,minHeight:4}}/>
                <div style={{fontSize:8,color:T.muted,fontFamily:T.mono}}>{minToDate(e.sleepStart).slice(8)}</div>
              </div>
            );
          })}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}>
          <Pill color={T.accent}>7t+ god</Pill>
          <Pill color={T.gold}>5-7t ok</Pill>
          <Pill color={T.red}>Under 5t</Pill>
        </div>
      </Card>

      {/* Melatonin ring */}
      <Card>
        <div style={{fontSize:11,fontWeight:600,color:T.sub,marginBottom:14}}>Din melatonin-kurve (24t)</div>
        <div style={{display:"flex",justifyContent:"center",marginBottom:12}}>
          <MelRing shift={calib.dlmoShift} amp={calib.amplitude} size={160}/>
        </div>
        <div style={{fontSize:12,color:T.muted,textAlign:"center",lineHeight:1.6}}>
          DLMO-fase: {calib.dlmoShift>=0?"+":""}{Math.round(calib.dlmoShift*10)/10}t fra standard · Amplitude {Math.round(calib.amplitude*100)}%
          {calib.amplitude < 0.8 && <span style={{color:T.gold}}> · Uregelmessig søvnmønster demper melatonin</span>}
        </div>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCREEN: PROFIL
// ═══════════════════════════════════════════════════════════════════════════
function ProfilScreen({ log, calib, onClearLog, alarmEnabled, setAlarmEnabled, name, setName }) {
  const [editing, setEditing] = useState(false);
  const [tmpName, setTmpName] = useState(name);

  return (
    <div style={{padding:"20px 16px",animation:"fadeUp .3s ease"}}>
      <div style={{fontSize:22,fontWeight:700,marginBottom:20}}>Profil & innstillinger</div>

      {/* Profile card */}
      <Card style={{marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16}}>
          <div style={{width:52,height:52,borderRadius:16,background:`linear-gradient(135deg,${T.accentDim},#1A2A4A)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>🌙</div>
          <div style={{flex:1}}>
            {editing ? (
              <input value={tmpName} onChange={e=>setTmpName(e.target.value)} autoFocus style={{...inp,fontSize:16,fontWeight:600,padding:"6px 10px"}}/>
            ) : (
              <div style={{fontSize:16,fontWeight:600,color:T.text}}>{name||"Bruker"}</div>
            )}
            <div style={{fontSize:12,color:T.muted}}>
              {calib.dataPoints >= 3 ? "Personlig modell aktiv" : `${calib.dataPoints}/3 netter for kalibrering`}
            </div>
          </div>
          <button onClick={()=>{ if(editing){setName(tmpName);} setEditing(!editing); }} style={{background:T.elevated,border:"none",borderRadius:10,padding:"8px 14px",color:T.sub,fontFamily:T.font,fontSize:12,cursor:"pointer"}}>
            {editing ? "Lagre" : "Endre"}
          </button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
          {[["Logget",`${calib.dataPoints} netter`,T.text],["DLMO",`${calib.dlmoShift>=0?"+":""}${Math.round(calib.dlmoShift*10)/10}t`,T.accent],["Amplitude",`${Math.round(calib.amplitude*100)}%`,calib.amplitude>0.8?T.accent:T.gold]].map(([l,v,c])=>(
            <div key={l} style={{background:T.elevated,borderRadius:12,padding:"10px 12px"}}>
              <div style={{fontSize:9,color:T.muted,fontFamily:T.mono,letterSpacing:"0.1em",marginBottom:2}}>{l.toUpperCase()}</div>
              <div style={{fontSize:15,fontWeight:700,color:c}}>{v}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Alarm setting */}
      <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:14,fontWeight:600,color:T.text,marginBottom:2}}>🔔 Smart vekkerklokke</div>
            <div style={{fontSize:12,color:T.muted}}>Alarm settes automatisk til anbefalt opptid</div>
          </div>
          <button onClick={()=>setAlarmEnabled(!alarmEnabled)} style={{width:44,height:26,borderRadius:13,border:"none",background:alarmEnabled?T.accent:T.elevated,cursor:"pointer",position:"relative",transition:"background .2s"}}>
            <div style={{width:20,height:20,borderRadius:"50%",background:"white",position:"absolute",top:3,left:alarmEnabled?21:3,transition:"left .2s"}}/>
          </button>
        </div>
      </Card>

      {/* Info cards */}
      <div style={{fontSize:13,fontWeight:600,color:T.sub,margin:"16px 0 10px"}}>Om appen</div>
      {[
        ["🧬","Melatonin-modell","Kosinus-kurve med personal DLMO-kalibrering basert på søvnhistorikk"],
        ["📈","Kalibrering","Etter 3+ loggede netter beregnes din personlige fase og amplitude"],
        ["🔄","Kontinuerlig tid","Algoritmen planlegger hele perioden som én tidslinje, ikke isolerte vinduer"],
        ["💤","Søvnsykluser","Anbefalt søvnlengde snapper til 90-minutters sykluser for optimal søvnarkitektur"],
      ].map(([icon,title,desc])=>(
        <Card key={title} style={{marginBottom:10}}>
          <div style={{display:"flex",gap:12}}>
            <div style={{fontSize:22,flexShrink:0}}>{icon}</div>
            <div><div style={{fontSize:13,fontWeight:600,color:T.text,marginBottom:3}}>{title}</div><div style={{fontSize:12,color:T.muted,lineHeight:1.6}}>{desc}</div></div>
          </div>
        </Card>
      ))}

      {/* Danger zone */}
      {log.length > 0 && (
        <div style={{marginTop:20}}>
          <button onClick={()=>{ if(window.confirm("Slette all søvnhistorikk?")) onClearLog(); }} style={{width:"100%",padding:"13px",borderRadius:14,border:`1px solid ${T.red}40`,background:T.redLo,color:T.red,fontFamily:T.font,fontSize:13,cursor:"pointer"}}>
            🗑 Slett all søvnhistorikk
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// QUICK LOG MODAL
// ═══════════════════════════════════════════════════════════════════════════
function QuickLogModal({ onSave, onClose }) {
  const [date, setDate]   = useState(localDate(0));
  const [start, setStart] = useState("23:00");
  const [end, setEnd]     = useState("07:00");
  const save = () => {
    const s=toMin(date,start); let e=toMin(date,end); if(e<=s) e+=1440;
    onSave({id:Date.now(),sleepStart:s,sleepEnd:e,loggedAt:Date.now()});
    onClose();
  };
  return (
    <div style={{position:"fixed",inset:0,zIndex:100,display:"flex",alignItems:"flex-end",background:"rgba(0,0,0,.7)"}} onClick={onClose}>
      <div style={{width:"100%",background:T.surface,borderRadius:"24px 24px 0 0",padding:"24px 20px 40px"}} onClick={e=>e.stopPropagation()}>
        <div style={{width:36,height:4,background:T.border,borderRadius:2,margin:"0 auto 20px",opacity:.6}}/>
        <div style={{fontSize:18,fontWeight:700,marginBottom:20}}>Logg søvnøkt</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
          {[["DATO","date",date,setDate],["LA DEG","time",start,setStart],["STOD OPP","time",end,setEnd]].map(([l,t,v,s])=>(
            <Fld key={l} label={l}><Inp type={t} value={v} onChange={e=>s(e.target.value)}/></Fld>
          ))}
        </div>
        <PrimaryBtn onClick={save}>Lagre søvnøkt</PrimaryBtn>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// ALARM SYSTEM
// Uses Web Audio API for sound + Notifications API for system alert
// ═══════════════════════════════════════════════════════════════════════════
// Alarm runs for up to 3 minutes, volume rising from near-silent to full.
// Pattern: soft sine-wave pulses that get louder and more frequent over time.
let _alarmCtx = null;
let _alarmStop = null;

function stopAlarm() {
  if (_alarmStop) { _alarmStop(); _alarmStop = null; }
}

function fireAlarm(alarm) {
  // ── Web Audio: gradually rising alarm ──
  try {
    stopAlarm(); // cancel any previous alarm
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    _alarmCtx = ctx;
    let stopped = false;
    _alarmStop = () => { stopped = true; try { ctx.close(); } catch(_){} };

    // Master gain that ramps from 0.02 → 1.0 over 3 minutes
    const master = ctx.createGain();
    master.connect(ctx.destination);
    master.gain.setValueAtTime(0.02, ctx.currentTime);
    master.gain.linearRampToValueAtTime(1.0, ctx.currentTime + 180);

    // Schedule repeating pulses. Interval shrinks from 4s → 1s over 3 min.
    // Each pulse = soft sine chord (fundamental + gentle overtone)
    const BASE_FREQ  = 432;   // slightly warm A
    const TOTAL_SECS = 180;
    let t = ctx.currentTime + 0.5;

    const schedulePulse = (startT, progress) => {
      if (stopped || startT > ctx.currentTime + TOTAL_SECS) return;
      // Two oscillators per pulse for warmth
      [[BASE_FREQ, 0.7], [BASE_FREQ * 1.5, 0.3]].forEach(([freq, relGain]) => {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.connect(env); env.connect(master);
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, startT);
        // Slight pitch rise within each pulse (dreamy feel)
        osc.frequency.linearRampToValueAtTime(freq * 1.04, startT + 0.8);
        // Envelope: fast attack, long tail
        env.gain.setValueAtTime(0, startT);
        env.gain.linearRampToValueAtTime(relGain, startT + 0.08);
        env.gain.exponentialRampToValueAtTime(0.001, startT + 1.6);
        osc.start(startT);
        osc.stop(startT + 1.7);
      });

      // Schedule next pulse: interval shrinks from 4s → 0.9s
      const interval = Math.max(0.9, 4 - progress * 3.1);
      const nextT = startT + interval;
      const delay = Math.max(0, (nextT - ctx.currentTime) * 1000 - 50);
      setTimeout(() => {
        if (!stopped) schedulePulse(nextT, Math.min(1, progress + interval / TOTAL_SECS));
      }, delay);
    };

    schedulePulse(t, 0);

    // Auto-stop after 3 min
    setTimeout(() => stopAlarm(), TOTAL_SECS * 1000);

  } catch(_) {}

  // ── Browser Notification ──
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("Optimal Slepp – tid for å stå opp", {
      body: alarm.label,
      tag: `alarm-${alarm.id}`,
      requireInteraction: true,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SMART WAKE ENGINE
// Microphone → AnalyserNode → RMS energy → sleep depth estimate
// Light sleep = higher RMS variance. Deep sleep = low, stable RMS.
// ═══════════════════════════════════════════════════════════════════════════
let _micStream   = null;
let _micAnalyser = null;
let _micCtx      = null;

async function startMicListening() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const ctx    = new (window.AudioContext || window.webkitAudioContext)();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    _micStream   = stream;
    _micCtx      = ctx;
    _micAnalyser = analyser;
    return true;
  } catch(_) { return false; }
}

function stopMicListening() {
  try { _micStream?.getTracks().forEach(t=>t.stop()); } catch(_) {}
  try { _micCtx?.close(); } catch(_) {}
  _micStream=null; _micCtx=null; _micAnalyser=null;
}

function getRMS() {
  if (!_micAnalyser) return 0;
  const buf = new Float32Array(_micAnalyser.fftSize);
  _micAnalyser.getFloatTimeDomainData(buf);
  const sum = buf.reduce((acc,v)=>acc+v*v, 0);
  return Math.sqrt(sum/buf.length);
}

// Sleep depth from rolling RMS history
// Returns 0 (deep sleep) to 1 (light sleep / awake)
function sleepDepth(history) {
  if (history.length < 4) return 0.5;
  const recent = history.slice(-20);
  const avg    = recent.reduce((a,b)=>a+b,0)/recent.length;
  const variance = recent.reduce((acc,v)=>acc+(v-avg)**2,0)/recent.length;
  // High variance + high avg = movement/noise = light sleep
  const raw = Math.min(1, avg*80 + Math.sqrt(variance)*120);
  return raw;
}

// ═══════════════════════════════════════════════════════════════════════════
// ALARM SCREEN
// ═══════════════════════════════════════════════════════════════════════════
function AlarmScreen({ activeAlarms, setActiveAlarms, alarmEnabled, onToggle, onDismiss, saveAlarms }) {
  const [ringing, setRinging]       = useState(false);
  const [listening, setListening]   = useState(false); // mic active
  const [depth, setDepth]           = useState(0.5);   // 0=deep, 1=light
  const [rmsHistory, setRmsHistory] = useState([]);
  const [micError, setMicError]     = useState(null);
  const [smartMins, setSmartMins]   = useState(30);
  const tickRef = useRef(null);

  const upcoming = activeAlarms.filter(a=>!a.fired).sort((a,b)=>a.fireAt-b.fireAt);
  const fired    = activeAlarms.filter(a=>a.fired);

  // Detect ringing
  useEffect(()=>{
    const hasFired = activeAlarms.some(a=>a.fired && Math.abs(a.fireAt-nowMin())<=5);
    setRinging(hasFired);
  }, [activeAlarms]);

  // Smart wake tick: every 10s sample mic, check if light sleep in window
  useEffect(()=>{
    if (tickRef.current) clearInterval(tickRef.current);
    if (!listening) return;

    tickRef.current = setInterval(()=>{
      const rms = getRMS();
      setRmsHistory(h=>{
        const next = [...h.slice(-60), rms]; // keep 10min history
        const d = sleepDepth(next);
        setDepth(d);

        // Check each alarm's smart wake window
        const now = nowMin();
        setActiveAlarms(prev=>{
          let changed=false;
          const updated = prev.map(a=>{
            if (!a.fired && !a.smartFired && a.smartWakeEnabled
                && now >= a.smartWakeStart && now <= a.fireAt
                && d >= 0.65) { // light sleep threshold
              changed=true;
              fireAlarm({ ...a, label:`Smart oppvåkning – du er i lett søvn · ${minToTime(now)}` });
              return { ...a, smartFired:true, fired:true };
            }
            return a;
          });
          if (changed) saveAlarms(updated);
          return changed ? updated : prev;
        });
        return next;
      });
    }, 10000);

    return ()=>clearInterval(tickRef.current);
  }, [listening]);

  const toggleMic = async () => {
    if (listening) {
      stopMicListening();
      setListening(false);
      setRmsHistory([]);
    } else {
      setMicError(null);
      const ok = await startMicListening();
      if (ok) setListening(true);
      else setMicError("Kunne ikke få tilgang til mikrofon. Sjekk nettleserinnstillinger.");
    }
  };

  const toggleSmartWake = (alarmId, enabled) => {
    const updated = activeAlarms.map(a=>a.id===alarmId?{...a,smartWakeEnabled:enabled}:a);
    saveAlarms(updated);
  };

  const handleStop = () => { stopAlarm(); setRinging(false); };

  // Depth meter color
  const depthColor = depth > 0.65 ? T.accent : depth > 0.35 ? T.gold : T.blue;
  const depthLabel = depth > 0.65 ? "Lett søvn" : depth > 0.35 ? "Mellom" : "Dyp søvn";

  return (
    <div style={{padding:"20px 16px", animation:"fadeUp .3s ease"}}>
      <div style={{fontSize:22, fontWeight:700, marginBottom:6}}>Vekkerklokke</div>
      <div style={{fontSize:14, color:T.sub, marginBottom:20}}>Automatiske og smarte alarmer fra søvnplanen din.</div>

      {/* Master toggle */}
      <Card style={{marginBottom:12}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
          <div>
            <div style={{fontSize:15, fontWeight:600, color:T.text, marginBottom:2}}>🔔 Smart alarm</div>
            <div style={{fontSize:12, color:T.muted}}>{alarmEnabled?"Aktiv – alarmer fra søvnplan":"Av – slå på for automatiske alarmer"}</div>
          </div>
          <button onClick={()=>onToggle(!alarmEnabled)} style={{width:48,height:28,borderRadius:14,border:"none",background:alarmEnabled?T.accent:T.elevated,cursor:"pointer",position:"relative",transition:"background .25s",flexShrink:0}}>
            <div style={{width:22,height:22,borderRadius:"50%",background:"white",position:"absolute",top:3,left:alarmEnabled?23:3,transition:"left .25s",boxShadow:"0 1px 4px rgba(0,0,0,.3)"}}/>
          </button>
        </div>
      </Card>

      {/* RINGING */}
      {ringing && (
        <button onClick={handleStop} style={{width:"100%",padding:"22px",borderRadius:20,border:"none",background:`linear-gradient(135deg,${T.red},#c0392b)`,color:"white",fontFamily:T.font,fontSize:18,fontWeight:800,cursor:"pointer",boxShadow:`0 8px 40px rgba(224,92,92,.5)`,marginBottom:16,animation:"glow 1s ease-in-out infinite"}}>
          ⏹ Stopp alarm
        </button>
      )}

      {/* Smart wake mic panel */}
      <Card style={{marginBottom:16, background: listening ? `${T.accent}08` : T.surface, borderColor: listening ? `${T.accent}40` : T.border}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom: listening ? 14 : 0}}>
          <div>
            <div style={{fontSize:14, fontWeight:600, color:T.text, marginBottom:3}}>🎤 Smart oppvåkning</div>
            <div style={{fontSize:12, color:T.muted, lineHeight:1.5}}>
              {listening ? "Lytter – vekker deg i lett søvn" : "Mikrofonen analyserer søvndybde og vekker deg i riktig søvnfase"}
            </div>
          </div>
          <button onClick={toggleMic} style={{padding:"8px 14px",borderRadius:10,border:`1px solid ${listening?T.red+"60":T.accent+"40"}`,background:listening?T.redLo:T.accentLo,color:listening?T.red:T.accent,fontFamily:T.font,fontSize:12,fontWeight:600,cursor:"pointer",flexShrink:0,marginLeft:10}}>
            {listening ? "Stopp" : "Start"}
          </button>
        </div>

        {micError && <div style={{fontSize:12,color:T.red,marginBottom:10}}>{micError}</div>}

        {listening && (
          <>
            {/* Depth meter */}
            <div style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:T.muted,fontFamily:T.mono,marginBottom:6}}>
                <span>SØVNDYBDE</span>
                <span style={{color:depthColor}}>{depthLabel}</span>
              </div>
              <div style={{height:8,background:T.elevated,borderRadius:4,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${Math.round(depth*100)}%`,background:`linear-gradient(90deg,${T.blue},${depthColor})`,borderRadius:4,transition:"width 1s ease"}}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:9,color:T.muted,fontFamily:T.mono}}>
                <span>DYPSØVN</span><span>LETT SØVN</span>
              </div>
            </div>

            {/* Live waveform dots */}
            <div style={{display:"flex",gap:3,alignItems:"center",height:20,marginBottom:4}}>
              {Array.from({length:20},(_,i)=>{
                const h = rmsHistory.slice(-20)[i]||0;
                return <div key={i} style={{flex:1,height:`${Math.max(15,Math.min(100,h*2000))}%`,background:depthColor,borderRadius:2,opacity:0.6+i*0.02,transition:"height .5s"}}/>;
              })}
            </div>
            <div style={{fontSize:10,color:T.muted,fontFamily:T.mono}}>LIVE LYDNIVÅ</div>
          </>
        )}
      </Card>

      {/* Smart wake window setting */}
      {alarmEnabled && upcoming.length > 0 && (
        <Card style={{marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:600,color:T.sub,marginBottom:10}}>Vekkevindu</div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{fontSize:13,color:T.text}}>Vekk meg innen</div>
            <select value={smartMins} onChange={e=>setSmartMins(Number(e.target.value))} style={{...inp,width:"auto",padding:"6px 12px",fontSize:13}}>
              {[15,20,30,45,60].map(m=><option key={m} value={m}>{m} min</option>)}
            </select>
            <div style={{fontSize:13,color:T.text}}>før planlagt tid</div>
          </div>
        </Card>
      )}

      {/* Upcoming alarms */}
      {upcoming.length > 0 ? (
        <>
          <div style={{fontSize:12,fontWeight:600,color:T.sub,marginBottom:10}}>Kommende alarmer</div>
          {upcoming.map(a=>{
            const minsUntil = a.fireAt - nowMin();
            const h=Math.floor(Math.abs(minsUntil)/60), m=Math.abs(minsUntil)%60;
            const inWindow = a.smartWakeEnabled && minsUntil <= a.smartWakeMins;
            return (
              <Card key={a.id} accent={inWindow?T.gold:T.accent} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                  <div>
                    <div style={{fontSize:28,fontWeight:700,letterSpacing:"-0.04em",color:T.text}}>{minToTime(a.fireAt)}</div>
                    <div style={{fontSize:12,color:T.muted,marginTop:2}}>{a.label}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:10,color:T.muted,fontFamily:T.mono,marginBottom:2}}>OM</div>
                    <div style={{fontSize:20,fontWeight:700,color:T.accent}}>{h>0?`${h}t `:""}{m}m</div>
                  </div>
                </div>
                {/* Smart wake toggle per alarm */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:10,borderTop:`1px solid ${T.border}`}}>
                  <div>
                    <div style={{fontSize:12,fontWeight:500,color:T.text}}>🎤 Smart oppvåkning</div>
                    <div style={{fontSize:11,color:T.muted}}>Vekk meg innen {smartMins} min i lett søvn</div>
                  </div>
                  <button onClick={()=>toggleSmartWake(a.id,!a.smartWakeEnabled)} style={{width:40,height:24,borderRadius:12,border:"none",background:a.smartWakeEnabled?T.accent:T.elevated,cursor:"pointer",position:"relative",transition:"background .2s",flexShrink:0}}>
                    <div style={{width:18,height:18,borderRadius:"50%",background:"white",position:"absolute",top:3,left:a.smartWakeEnabled?19:3,transition:"left .2s"}}/>
                  </button>
                </div>
                {inWindow && listening && (
                  <div style={{marginTop:10,padding:"8px 10px",background:T.goldLo,borderRadius:8,fontSize:12,color:T.gold}}>
                    ✨ I vekkevinduet – venter på lett søvn...
                  </div>
                )}
              </Card>
            );
          })}
        </>
      ) : alarmEnabled ? (
        <Card style={{textAlign:"center",padding:"32px 20px"}}>
          <div style={{fontSize:32,marginBottom:12}}>✅</div>
          <div style={{fontSize:15,color:T.sub}}>Ingen alarmer – lag en søvnplan i Plan-fanen</div>
        </Card>
      ) : null}

      {/* Fired alarms */}
      {fired.length > 0 && (
        <>
          <div style={{fontSize:12,fontWeight:600,color:T.sub,margin:"20px 0 10px"}}>Tidligere alarmer</div>
          {fired.map(a=>(
            <Card key={a.id} style={{opacity:0.5}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:18,fontWeight:600,color:T.text}}>{minToTime(a.fireAt)}{a.smartFired&&<span style={{fontSize:12,color:T.accent,marginLeft:6}}>🎤 smart</span>}</div>
                  <div style={{fontSize:12,color:T.muted}}>{a.label}</div>
                </div>
                <button onClick={()=>onDismiss(a.id)} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:20}}>×</button>
              </div>
            </Card>
          ))}
        </>
      )}

      <Card style={{marginTop:16,background:T.goldLo,borderColor:`${T.gold}30`}}>
        <div style={{fontSize:12,color:T.sub,lineHeight:1.7}}>
          <div style={{color:T.gold,fontWeight:600,marginBottom:6}}>💡 Om smart oppvåkning</div>
          Mikrofonen analyserer lydnivå og bevegelse. I lett søvn beveger du deg mer og lager mer lyd. Alarmen utløses automatisk i det beste øyeblikket innenfor vinduet – eller på fastsatt tid hvis vinduet går ut. Hold telefonen ved siden av sengen med skjermen dimmet.
        </div>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ONBOARDING
// ═══════════════════════════════════════════════════════════════════════════
const ONBOARDING_STEPS = [
  { id:"welcome", icon:"🌙", title:"Velkommen til\nOptimal Slepp", sub:"Søvnoptimering for deg som ikke sover samme tid hver dag.", cta:"Kom i gang" },
  { id:"problem", icon:"😵", title:"Turnus ødelegger\nsøvnen din", sub:"Når du bytter mellom dag- og nattevakter mister kroppen rytmen. Du legger deg men klarer ikke sove – eller sover for mye og er fortsatt trøtt.", cta:"Fortsett" },
  { id:"solution", icon:"🧬", title:"Appen bruker\nmelatonin-data", sub:"Vi modellerer kroppens melatonin-kurve og beregner nøyaktig når og hvor lenge du bør sove – basert på dine sovevinduer og søvnhistorikk.", cta:"Fortsett" },
  { id:"learns", icon:"📈", title:"Blir bedre\njover tid", sub:"Logg søvnen din etter hver økt. Etter 3+ netter kalibrerer appen din personlige fase og amplitude.", cta:"Fortsett" },
  { id:"name", icon:"👋", title:"Hva heter du?", sub:"Valgfritt – brukes kun til hilsen på hjemskjermen.", cta:"Fortsett", input:"name" },
  { id:"woke", icon:"⏰", title:"Når sto du opp\ni dag?", sub:"Dette er startpunktet for den første søvnplanen din.", cta:"Start appen", input:"time" },
];

function OnboardingScreen({ onComplete }) {
  const [step, setStep]     = useState(0);
  const [name, setName]     = useState("");
  const [woke, setWoke]     = useState("08:00");
  const [animKey, setAnimKey] = useState(0);
  const current = ONBOARDING_STEPS[step];
  const isLast  = step === ONBOARDING_STEPS.length - 1;
  const prog    = (step / (ONBOARDING_STEPS.length - 1)) * 100;

  const next = () => { if (isLast) { onComplete(name.trim(), woke); return; } setAnimKey(k=>k+1); setStep(s=>s+1); };
  const back = () => { if (step===0) return; setAnimKey(k=>k+1); setStep(s=>s-1); };

  return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",flexDirection:"column",fontFamily:T.font}}>
      <div style={{height:3,background:T.elevated}}>
        <div style={{height:"100%",width:`${prog}%`,background:`linear-gradient(90deg,${T.accent},${T.blue})`,borderRadius:2,transition:"width .5s cubic-bezier(.4,0,.2,1)"}}/>
      </div>
      <div style={{padding:"16px 20px 0",minHeight:44}}>
        {step>0&&<button onClick={back} style={{background:"none",border:"none",color:T.sub,cursor:"pointer",fontFamily:T.font,fontSize:14,padding:0}}>← Tilbake</button>}
      </div>
      <div key={animKey} style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center",padding:"0 28px 20px",animation:"fadeUp .4s cubic-bezier(.4,0,.2,1)"}}>
        <div style={{fontSize:72,lineHeight:1,marginBottom:32,filter:"drop-shadow(0 0 30px rgba(94,231,183,.3))"}}>{current.icon}</div>
        <div style={{fontSize:32,fontWeight:800,letterSpacing:"-0.04em",color:T.text,marginBottom:16,lineHeight:1.15,whiteSpace:"pre-line"}}>{current.title}</div>
        <div style={{fontSize:16,color:T.sub,lineHeight:1.65,marginBottom:32}}>{current.sub}</div>
        {current.id==="learns"&&(
          <div style={{marginBottom:24}}>
            {[[T.accent,"3+ netter","Personlig melatonin-fase estimert"],[T.blue,"7+ netter","God kalibrering av søvnmønster"],[T.gold,"30+ netter","Presis individuell søvnmodell"]].map(([col,lbl,desc])=>(
              <div key={lbl} style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:col,flexShrink:0}}/>
                <div><span style={{fontSize:13,fontWeight:600,color:col}}>{lbl} </span><span style={{fontSize:13,color:T.sub}}>{desc}</span></div>
              </div>
            ))}
          </div>
        )}
        {current.input==="name"&&(
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Ola Nordmann" autoFocus style={{...inp,fontSize:18,padding:"14px 18px",borderRadius:16,background:T.surface,marginBottom:8}}/>
        )}
        {current.input==="time"&&(
          <div style={{marginBottom:8}}>
            <div style={{fontSize:10,color:T.muted,fontFamily:T.mono,letterSpacing:"0.12em",marginBottom:8}}>KLOKKESLETT</div>
            <input type="time" value={woke} onChange={e=>setWoke(e.target.value)} style={{...inp,fontSize:28,fontWeight:700,padding:"16px 18px",borderRadius:16,background:T.surface,textAlign:"center"}}/>
          </div>
        )}
      </div>
      <div style={{padding:"0 24px 48px"}}>
        <div style={{display:"flex",justifyContent:"center",gap:6,marginBottom:24}}>
          {ONBOARDING_STEPS.map((_,i)=>(
            <div key={i} style={{width:i===step?20:6,height:6,borderRadius:3,background:i===step?T.accent:T.muted,transition:"all .3s"}}/>
          ))}
        </div>
        <PrimaryBtn onClick={next}>{isLast?"🚀 Start appen":current.cta}</PrimaryBtn>
        {step===0&&<div style={{textAlign:"center",marginTop:14,fontSize:12,color:T.muted}}>Ingen konto nødvendig · Alt lagres lokalt</div>}
      </div>
    </div>
  );
}

const INIT_WINDOWS = [
  {id:1,date:localDate(1),startTime:"05:00",endTime:"19:00",anchor:"none"},
  {id:2,date:localDate(2),startTime:"05:00",endTime:"11:00",anchor:"none"},
  {id:3,date:localDate(3),startTime:"05:00",endTime:"19:00",anchor:"none"},
  {id:4,date:localDate(3),startTime:"21:00",endTime:"11:00",anchor:"none"},
];

export default function App() {
  const [screen, setScreen]       = useState("home");
  const [windows, setWindows]     = useState(INIT_WINDOWS);
  const [lwd, setLwd]             = useState(localDate(0));
  const [lwt, setLwt]             = useState("08:00");
  const [results, setResults]     = useState(null);
  const [log, setLog]             = useState([]);
  const [calib, setCalib]         = useState({dlmoShift:0,amplitude:1.0,dataPoints:0});
  const [loading, setLoading]     = useState(true);
  const [showLog, setShowLog]     = useState(false);
  const [alarmEnabled, setAlarmEnabled] = useState(false);
  const [activeAlarms, setActiveAlarms] = useState([]); // [{id, fireAt, label, fired}]
  const alarmRef = useRef(null); // interval ref
  const [userName, setUserName]   = useState("");
  const [onboarded, setOnboarded] = useState(false);

  useEffect(()=>{
    (async()=>{
      try {
        const s=await window.storage.get("sleeplog-v2");
        if(s?.value){ const p=JSON.parse(s.value); setLog(p); setCalib(calibrateFromLog(p)); }
        const u=await window.storage.get("username");
        if(u?.value) setUserName(u.value);
        const ob=await window.storage.get("onboarded");
        if(ob?.value) setOnboarded(true);
        const al=await window.storage.get("alarm-enabled");
        if(al?.value) setAlarmEnabled(JSON.parse(al.value));
        const alarms=await window.storage.get("active-alarms");
        if(alarms?.value) setActiveAlarms(JSON.parse(alarms.value));
      } catch(_) {}
      setLoading(false);
    })();
  },[]);

  const saveLog = async (newLog) => {
    const t=newLog.slice(-90); setLog(t); setCalib(calibrateFromLog(t));
    try { await window.storage.set("sleeplog-v2",JSON.stringify(t)); } catch(_) {}
  };
  const saveName = async (n) => {
    setUserName(n);
    try { await window.storage.set("username",n); } catch(_) {}
  };

  const handleQuickLog = async (entry) => { await saveLog([...log,entry]); };
  const handleClearLog = async () => { await saveLog([]); };

  // Auto-schedule alarms when plan is calculated
  useEffect(() => {
    if (alarmEnabled && results) scheduleAlarmsFromResults(results);
  }, [results, alarmEnabled]);

  // Alarm tick: check every minute if an alarm should fire
  useEffect(() => {
    if (alarmRef.current) clearInterval(alarmRef.current);
    alarmRef.current = setInterval(() => {
      const now = nowMin();
      setActiveAlarms(prev => {
        let changed = false;
        const updated = prev.map(a => {
          if (!a.fired && Math.abs(a.fireAt - now) <= 1) {
            changed = true;
            fireAlarm(a);
            return { ...a, fired: true };
          }
          return a;
        });
        if (changed) {
          window.storage.set("active-alarms", JSON.stringify(updated)).catch(()=>{});
          return updated;
        }
        return prev;
      });
    }, 30000); // check every 30s
    return () => clearInterval(alarmRef.current);
  }, [alarmEnabled]);
  // ── Alarm helpers ──
  const saveAlarms = async (alarms) => {
    setActiveAlarms(alarms);
    try { await window.storage.set("active-alarms", JSON.stringify(alarms)); } catch(_) {}
  };

  const scheduleAlarmsFromResults = async (res, smartMins=30) => {
    if (!res) return;
    const alarms = res
      .filter(r => !r.skip)
      .map(r => ({
        id: r.sleepEnd,
        fireAt: r.sleepEnd,                    // hard deadline
        smartWakeStart: r.sleepEnd - smartMins, // window opens X min before
        smartWakeEnabled: false,               // user toggles per alarm
        smartWakeMins: smartMins,
        label: `Tid for å stå opp · ${minToTime(r.sleepEnd)}`,
        fired: false,
        smartFired: false,
      }));
    await saveAlarms(alarms);
  };

  const toggleAlarm = async (enabled) => {
    setAlarmEnabled(enabled);
    try { await window.storage.set("alarm-enabled", JSON.stringify(enabled)); } catch(_) {}
    if (enabled && results) await scheduleAlarmsFromResults(results);
    if (!enabled) await saveAlarms([]);
    // Request notification permission
    if (enabled && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  };

  const handleOnboardingComplete = async (name, wakeTime) => {
    await saveName(name);
    setLwt(wakeTime);
    setOnboarded(true);
    try { await window.storage.set("onboarded","1"); } catch(_) {}
    setScreen("plan");
  };

  if (loading) return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:16,animation:"pulse 2s infinite"}}>🌙</div>
        <div style={{color:T.muted,fontFamily:T.mono,fontSize:13}}>Optimal Slepp</div>
      </div>
    </div>
  );

  if (!onboarded) return <OnboardingScreen onComplete={handleOnboardingComplete}/>;

  const navItems = [
    ["home","🏠","Hjem"],
    ["plan","📅","Plan"],
    ["alarm","🔔","Alarm"],
    ["analyse","📊","Analyse"],
    ["profil","👤","Profil"],
  ];

  return (
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:T.font,paddingBottom:90}}>

      {/* Screen content */}
      {screen === "home" && (
        <HomeScreen results={results} log={log} calib={calib}
          onLogSleep={()=>setShowLog(true)}
          onGoToPlan={()=>setScreen("plan")}
          setTab={setScreen}/>
      )}
      {screen === "plan" && (
        <div style={{paddingTop:16}}>
          <div style={{padding:"12px 20px 4px",fontSize:22,fontWeight:700}}>Søvnplan</div>
          <PlanScreen windows={windows} setWindows={setWindows}
            lwd={lwd} setLwd={setLwd} lwt={lwt} setLwt={setLwt}
            results={results} setResults={setResults} calib={calib}/>
        </div>
      )}
      {screen === "alarm" && (
        <div style={{paddingTop:16}}>
          <AlarmScreen
            activeAlarms={activeAlarms}
            setActiveAlarms={setActiveAlarms}
            alarmEnabled={alarmEnabled}
            onToggle={toggleAlarm}
            onDismiss={async (id) => { await saveAlarms(activeAlarms.filter(a=>a.id!==id)); }}
            saveAlarms={saveAlarms}
          />
        </div>
      )}
      {screen === "analyse" && (
        <AnalyseScreen log={log} calib={calib}/>
      )}
      {screen === "profil" && (
        <ProfilScreen log={log} calib={calib}
          onClearLog={handleClearLog}
          alarmEnabled={alarmEnabled} setAlarmEnabled={toggleAlarm}
          name={userName} setName={saveName}/>
      )}

      {/* Bottom nav */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:T.surface,borderTop:`1px solid ${T.border}`,display:"flex",justifyContent:"space-around",padding:"8px 0 20px",zIndex:50}}>
        {navItems.map(([id,icon,label])=>(
          <IconBtn key={id} icon={icon} label={label} active={screen===id} onClick={()=>setScreen(id)}/>
        ))}
      </div>

      {/* Quick log modal */}
      {showLog && <QuickLogModal onSave={handleQuickLog} onClose={()=>setShowLog(false)}/>}
    </div>
  );
}
