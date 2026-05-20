// ─────────────────────────────────────────────────────────────────────────────
// SLEEP ENGINE  –  pure JS, no React. Works in background tasks.
// ─────────────────────────────────────────────────────────────────────────────
const SLEEP_CYCLE_MIN = 90;
const MIN_WAKE_HOURS  = 4;
const MAX_SLEEP_H     = 9;
const TARGET_SLEEP_H  = 7.5;

const refNoon    = new Date(new Date().getFullYear(), 0, 1, 12, 0).getTime();
const MS_PER_DAY = 86400000;

export function toMin(dateStr, timeStr) {
  const [y,m,d] = dateStr.split('-').map(Number);
  const [h,mn]  = timeStr.split(':').map(Number);
  const dayIdx  = Math.round((new Date(y,m-1,d,12,0).getTime()-refNoon)/MS_PER_DAY);
  return dayIdx*1440+h*60+mn;
}
export function minToTime(abs) {
  const p=((abs%1440)+1440)%1440;
  return `${String(Math.floor(p/60)).padStart(2,'0')}:${String(p%60).padStart(2,'0')}`;
}
export function minToDate(abs) {
  const d=new Date(new Date().getFullYear(),0,1);
  d.setDate(d.getDate()+Math.floor(abs/1440));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function localDate(offset=0) {
  const d=new Date(); d.setDate(d.getDate()+offset);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function nowMin() {
  const n=new Date();
  return toMin(localDate(0),`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`);
}
export function formatDur(min) {
  if(!min||min<=0) return '–';
  return `${Math.floor(min/60)}t${min%60?` ${min%60}m`:''}`;
}
export function parseWindow(w) {
  const start=toMin(w.date,w.startTime);
  const startH=parseInt(w.startTime),endH=parseInt(w.endTime);
  let end=toMin(w.date,w.endTime);
  if(endH<startH||(endH===startH&&w.endTime<=w.startTime)) end+=1440;
  return {...w,startMin:start,endMin:end};
}

// ── Melatonin model ──────────────────────────────────────────────────────────
export function melatoninLevel(hour,shift=0,amp=1.0) {
  const peak=(2+shift+24)%24;
  const base=Math.max(5,Math.round(((Math.cos(((hour-peak)/24)*2*Math.PI)+1)/2)*100));
  return Math.round(5+(base-5)*amp);
}
export function melatoninSleepScore(hour,shift=0,amp=1.0) {
  const base=melatoninLevel(hour,shift,amp);
  const dlmo=(21+shift+24)%24,dlmoEnd=(dlmo+4)%24;
  const inDlmo=dlmoEnd>dlmo?(hour>=dlmo&&hour<=dlmoEnd):(hour>=dlmo||hour<=dlmoEnd);
  if(inDlmo) return Math.min(100,Math.round(base+15*amp));
  if(hour>=13&&hour<=15) return Math.min(60,base+Math.round(10*amp));
  return base;
}

// ── Calibration ──────────────────────────────────────────────────────────────
//
// Returns:
//   dlmoShift     – hours offset from default DLMO (21:00); positive = night owl
//   amplitude     – melatonin amplitude 0.5–1.0 (lower = irregular schedule)
//   dataPoints    – total nights in log
//   dlmoPeakHour  – estimated melatonin peak as decimal hour (e.g. 2.5 = 02:30)
//   hasQualityData – true if any log entry carries a quality score
//   qualityNights – count of entries with quality scores
//
// Algorithm:
//   Pass 1 – weighted average sleep onset (weight = decay × quality)
//             Exponential time-decay: half-life 10 days so recent nights dominate.
//             Quality-weight: good-quality nights (0–100) contribute more strongly
//             because they reflect unforced circadian timing.
//   Pass 2 – weighted circular variance → amplitude
//   Pass 3 – quality-based DLMO correction
//             If quality-annotated nights show poor sleep despite the onset being
//             "on schedule", the DLMO estimate is biased. We nudge the shift toward
//             the direction that would have put the onset inside the person's actual
//             DLMO window (capped at ±1.5 h to prevent runaway drift).
export function calibrateFromLog(log) {
  if(!log||log.length<3)
    return {dlmoShift:0,amplitude:1.0,dataPoints:log?.length||0,dlmoPeakHour:2,hasQualityData:false,qualityNights:0};

  const now           = Date.now();
  const DECAY_PER_MS  = Math.LN2 / (10 * 24 * 60 * 60 * 1000); // 10-day half-life

  // ── Pass 1: exponential-decay + quality-weighted average sleep onset ────────
  let sumW=0, sumWH=0;
  for(const e of log){
    const age      = now - (e.loggedAt ?? now);
    const timeW    = Math.exp(-DECAY_PER_MS * age);
    // Quality range 0–100; unknown → neutral 65.
    // Low-quality nights may reflect situational disruption (jetlag, illness) rather
    // than true chronotype, so they anchor the estimate less firmly.
    const q        = e.quality != null ? e.quality : 65;
    const qualityW = 0.4 + (q / 100) * 0.6; // [0.40, 1.00]
    const w        = timeW * qualityW;
    const h        = (e.sleepStart % 1440) / 60;
    sumW  += w;
    sumWH += w * h;
  }
  const avgH = sumWH / sumW;

  // Sleep onset ≈ DLMO + 2.5 h; DLMO baseline = 21:00
  const rawShift = ((((avgH - 2.5 + 24) % 24) - 21 + 12) % 24) - 12;

  // ── Pass 2: weighted circular variance → amplitude ──────────────────────────
  let sumWD2=0;
  for(const e of log){
    const age      = now - (e.loggedAt ?? now);
    const timeW    = Math.exp(-DECAY_PER_MS * age);
    const q        = e.quality != null ? e.quality : 65;
    const qualityW = 0.4 + (q / 100) * 0.6;
    const w        = timeW * qualityW;
    const h        = (e.sleepStart % 1440) / 60;
    const d        = Math.min(Math.abs(h - avgH), 24 - Math.abs(h - avgH));
    sumWD2 += w * d * d;
  }
  const weightedVariance = sumWD2 / sumW;

  // ── Pass 3: quality-based DLMO correction ───────────────────────────────────
  // For each night with quality data: if the person's sleep onset was EARLIER than
  // the model's expected onset and quality was still poor, DLMO is probably later
  // than estimated. The correction is proportional to the timing mismatch and
  // inversely proportional to quality (worse nights → stronger signal).
  const qualityEntries = log.filter(e => e.quality != null);
  let dlmoCorrection   = 0;
  if(qualityEntries.length >= 2){
    // Expected onset under the current (uncorrected) DLMO estimate
    const expectedOnset = (21 + rawShift + 2.5 + 24) % 24;
    let sumCorr=0, sumCorrW=0;
    for(const e of qualityEntries){
      const age           = now - (e.loggedAt ?? now);
      const w             = Math.exp(-DECAY_PER_MS * age);
      const h             = (e.sleepStart % 1440) / 60;
      // timingError > 0 → went to bed later than expected (possible DLMO already)
      // timingError < 0 → went to bed earlier than expected (DLMO may be later)
      const timingError   = ((h - expectedOnset + 12) % 24) - 12;
      if(e.quality < 50){
        // Poor quality: the model's predicted window was wrong.
        // Direction: negate timing error so "early onset + bad quality → push DLMO later"
        sumCorr  += w * (-timingError) * 0.25;
        sumCorrW += w;
      }
      // High-quality nights: they reinforce the model — no correction term needed.
    }
    if(sumCorrW > 0)
      dlmoCorrection = Math.max(-1.5, Math.min(1.5, sumCorr / sumCorrW));
  }

  const dlmoShift    = rawShift + dlmoCorrection;
  // Melatonin peak ≈ 5 h after DLMO onset (model: peak = 02:00 + shift)
  const dlmoPeakHour = ((2 + dlmoShift) % 24 + 24) % 24;

  return {
    dlmoShift,
    amplitude:      Math.max(0.5, 1.0 - Math.sqrt(weightedVariance) / 8),
    dataPoints:     log.length,
    dlmoPeakHour,
    hasQualityData: qualityEntries.length > 0,
    qualityNights:  qualityEntries.length,
  };
}

// ── Optimizer ────────────────────────────────────────────────────────────────
export function optimizeSleep(windows,lastWokeMin,calib={}) {
  if(!windows.length) return [];
  const {dlmoShift:shift=0,amplitude:amp=1.0}=calib;
  const wins=[...windows].sort((a,b)=>a.startMin-b.startMin);
  const budget=((wins[wins.length-1].endMin-lastWokeMin)/60/24)*TARGET_SLEEP_H*60;
  let slept=0,lastWake=lastWokeMin;
  const results=[];
  for(let i=0;i<wins.length;i++){
    const win=wins[i],next=wins[i+1]||null,dur=win.endMin-win.startMin;
    const hoursAwake=(win.startMin-lastWake)/60;
    if(hoursAwake<MIN_WAKE_HOURS){results.push({win,skip:true,reason:`${Math.round(hoursAwake*10)/10}h since last`,hoursAwake,slept});continue;}
    const rawTarget=hoursAwake>=20?8:hoursAwake>=14?7.5:hoursAwake>=9?7:6;
    const bestMel=Math.max(melatoninSleepScore(Math.floor(win.startMin%1440/60),shift,amp),melatoninSleepScore(Math.floor(win.endMin%1440/60),shift,amp));
    let targetMin=(rawTarget+(bestMel>60?0:bestMel>30?-0.5:-1))*60;
    if(next){const g=(next.startMin-win.endMin)/60;if(g<MIN_WAKE_HOURS&&g>0)targetMin=Math.min(targetMin,Math.max(SLEEP_CYCLE_MIN,(g/MIN_WAKE_HOURS)*targetMin));}
    const fair=(budget-slept)/(wins.length-i);
    if(targetMin>fair*1.4&&slept>0)targetMin=Math.max(SLEEP_CYCLE_MIN,Math.min(targetMin,fair*1.2));
    targetMin=Math.min(targetMin,dur,MAX_SLEEP_H*60);targetMin=Math.max(0,targetMin);
    const dn=Math.floor(targetMin/SLEEP_CYCLE_MIN),up=Math.ceil(targetMin/SLEEP_CYCLE_MIN);
    let cycles=(Math.abs(up*SLEEP_CYCLE_MIN-targetMin)<=15&&up*SLEEP_CYCLE_MIN<=dur)?up:(Math.abs(dn*SLEEP_CYCLE_MIN-targetMin)<=Math.abs(up*SLEEP_CYCLE_MIN-targetMin)?dn:up);
    cycles=Math.max(1,cycles);let recMin=cycles*SLEEP_CYCLE_MIN;
    while(recMin>dur&&cycles>1){cycles--;recMin=cycles*SLEEP_CYCLE_MIN;}
    if(recMin>dur){results.push({win,skip:true,reason:'Window too short (min 90 min)',hoursAwake,slept});continue;}
    let bestStart=win.startMin;
    if(win.anchor==='bedtime') bestStart=win.startMin;
    else if(win.anchor==='waketime') bestStart=Math.max(win.startMin,win.endMin-recMin);
    else{let best=-Infinity;for(let t=win.startMin;t<=win.endMin-recMin;t+=15){const sh=Math.floor(t%1440/60),wh=Math.floor((t+recMin)%1440/60);let sc=melatoninSleepScore(sh,shift,amp)-melatoninLevel(wh,shift,amp)*0.25;if(hoursAwake>20)sc-=(t-win.startMin)/60;if(sc>best){best=sc;bestStart=t;}}}
    const sleepEnd=bestStart+recMin;
    const sh=Math.floor(bestStart%1440/60),wh=Math.floor(sleepEnd%1440/60);
    const melOnset=melatoninSleepScore(sh,shift,amp),melWake=melatoninLevel(wh,shift,amp);
    const quality=Math.min(100,Math.round((Math.min(cycles,5)/5)*40+melOnset*0.35+(100-melWake)*0.15+Math.min(10,hoursAwake*0.5)));
    results.push({win,skip:false,sleepStart:bestStart,sleepEnd,duration:recMin,cycles,hoursAwake:Math.round(hoursAwake*10)/10,slept:Math.round(slept),quality,melOnset,melWake,debug:{rawTargetH:Math.round(rawTarget*10)/10,windowConstraint:dur<rawTarget*60,windowMaxH:Math.round(dur/60*10)/10,budgetLeft:Math.round((budget-slept)/60*10)/10}});
    slept+=recMin;lastWake=sleepEnd;
  }
  return results;
}

// ── Full-night recording analysis ────────────────────────────────────────────
// samples: [{t, rms, movement?, heartRate?, heartRateVar?}]
//
// Phase detection uses available signals with equal weights:
//   mic only          → activity + local-variance classifier
//   + accelerometer   → adds muscle-atonia criterion for REM
//   + heartRate       → HR level (deep = lowest HR) + HR variability (REM = high HRV)
//   + heartRateVar    → within-window HRV proxy from raw Apple Watch readings
export function analyseNightRecording(samples) {
  if(!samples||samples.length<10) return null;

  const hasMov   = samples.some(s=>s.movement!=null);
  const hasHR    = samples.some(s=>s.heartRate!=null);
  const hasHRVar = samples.some(s=>s.heartRateVar!=null);

  // 2-min rolling average (12 × 10s)
  const SMOOTH=12;
  const smoothed=samples.map((s,i)=>{
    const sl=samples.slice(Math.max(0,i-SMOOTH),i+1);
    const rms=sl.reduce((a,b)=>a+b.rms,0)/sl.length;
    let movement=null;
    if(hasMov){const mv=sl.filter(x=>x.movement!=null);movement=mv.length?mv.reduce((a,b)=>a+b.movement,0)/mv.length:null;}
    // HR: carry the closest non-null value backwards up to 5 min (30 samples)
    let heartRate=null,heartRateVar=null;
    if(hasHR){
      for(let j=i;j>=Math.max(0,i-30);j--){
        if(samples[j].heartRate!=null){heartRate=samples[j].heartRate;heartRateVar=samples[j].heartRateVar??null;break;}
      }
    }
    return {t:s.t,rms,movement,heartRate,heartRateVar};
  });

  // Normalise each signal to 0-1 using the night's own range
  function normArr(arr){
    const vals=arr.filter(v=>v!=null);
    if(!vals.length) return arr.map(()=>0);
    let mn=vals[0],mx=vals[0];
    for(const v of vals){if(v<mn)mn=v;if(v>mx)mx=v;}
    const rng=mx-mn||1;
    return arr.map(v=>v!=null?(v-mn)/rng:null);
  }
  const rmsN   = normArr(smoothed.map(s=>s.rms));
  const movN   = hasMov   ? normArr(smoothed.map(s=>s.movement))    : null;
  const hrN    = hasHR    ? normArr(smoothed.map(s=>s.heartRate))   : null;
  const hrVarN = hasHRVar ? normArr(smoothed.map(s=>s.heartRateVar)): null;

  // Between-sample HR variance (±6 samples) — detects HR fluctuation over ~1 min
  const VAR_WIN=6;
  const hrBetweenVar = hasHR ? hrN.map((_,i)=>{
    const sl=hrN.slice(Math.max(0,i-VAR_WIN),Math.min(hrN.length,i+VAR_WIN+1)).filter(v=>v!=null);
    if(sl.length<3) return 0;
    const avg=sl.reduce((a,b)=>a+b,0)/sl.length;
    return sl.reduce((a,b)=>a+(b-avg)**2,0)/sl.length;
  }) : null;

  // Combined activity score — equal weight per available signal
  // Carries individual normalised values forward for the phase classifier
  const combined=smoothed.map((_,i)=>{
    const parts=[rmsN[i]??0];
    if(movN) parts.push(movN[i]??rmsN[i]??0);
    if(hrN&&hrN[i]!=null) parts.push(hrN[i]);
    return {
      t:      smoothed[i].t,
      a:      parts.reduce((a,b)=>a+b,0)/parts.length,
      hv:     hrBetweenVar?hrBetweenVar[i]:0,  // between-sample HR variance
      hrLev:  hrN    ?hrN[i]   :null,           // normalised HR level
      movLev: movN   ?movN[i]  :null,           // normalised movement
      hrwv:   hrVarN ?hrVarN[i]:null,           // within-window HRV proxy
    };
  });

  // Detect sleep window via sustained low-activity streak
  const SLEEP_TH=0.35,WAKE_TH=0.60,MIN_STREAK=6;
  let sleepStart=null,sleepEnd=null,streak=0;
  for(let i=0;i<combined.length;i++){
    if(combined[i].a<SLEEP_TH){streak++;if(streak>=MIN_STREAK&&sleepStart===null)sleepStart=combined[Math.max(0,i-MIN_STREAK)].t;}
    else streak=0;
  }
  for(let i=combined.length-1;i>=0;i--){if(combined[i].a<WAKE_TH){sleepEnd=combined[i].t;break;}}
  if(!sleepStart||!sleepEnd||sleepEnd<=sleepStart) return null;

  const sleeping=combined.filter(s=>s.t>=sleepStart&&s.t<=sleepEnd);
  if(sleeping.length<5) return null;

  // Local variance of combined activity (±6)
  const withVar=sleeping.map((s,i)=>{
    const sl=sleeping.slice(Math.max(0,i-VAR_WIN),Math.min(sleeping.length,i+VAR_WIN+1));
    const avg=sl.reduce((a,b)=>a+b.a,0)/sl.length;
    const v=sl.reduce((a,b)=>a+(b.a-avg)**2,0)/sl.length;
    return {...s,v}; // spread preserves hrLev, movLev, hv, hrwv
  });

  // Phase classifier
  //
  // With HR data — physiologically grounded:
  //   Deep:  quiet + HR in its lowest quartile of the night
  //          (NREM3: lowest HR, highest parasympathetic tone, stable)
  //   REM:   muscle atonia (low movement) + HR elevated above deep baseline
  //          + high HR variability (cardiac dysregulation during dreaming)
  //   Light: everything in between
  //   Awake: high combined activity
  //
  // Without HR — activity + variance fallback:
  //   Deep:  very low activity
  //   REM:   moderate activity + high local variance (mic/movement transitions)
  //   Light: moderate, stable activity
  const phases=withVar.map(({t,a,v,hv,hrLev,movLev,hrwv})=>{
    let phase;

    if(a>=0.65){
      phase='awake';
    } else if(hasHR&&hrLev!==null){
      // Atonia: accelerometer low OR accelerometer unavailable (mic is quiet too)
      const atonia   = movLev===null ? a<0.35 : movLev<0.30;
      // HR clearly above the night's deep-sleep floor
      const hrUp     = hrLev>0.35;
      // Any HR variability signal — between-sample fluctuation OR within-window spread
      const hrVarHigh= hv>0.012||(hrwv!==null&&hrwv>0.25);

      if(atonia&&hrUp&&hrVarHigh){
        // REM: low movement + elevated HR + high HR variability
        phase='rem';
      } else if(a<0.35&&hrLev<0.40){
        // Deep: quiet + HR in lowest 40 % of the night
        phase='deep';
      } else if(a<0.18){
        // Very quiet even without clear HR evidence
        phase='deep';
      } else {
        phase='light';
      }
    } else {
      // No HR available — mic + movement only
      if(a<0.18)                              phase='deep';
      else if(a<0.60&&(v>0.012||hv>0.015))   phase='rem';
      else                                    phase='light';
    }

    return {t,depth:a,phase};
  });

  // Cycle markers: first sample after each deep block ends
  const cycleMarkers=[];
  let inDeep=false;
  for(const p of phases){
    if(p.phase==='deep'){inDeep=true;}
    else if(inDeep){inDeep=false;cycleMarkers.push(p.t);}
  }

  const totalMin  = sleepEnd-sleepStart;
  const cycles    = Math.max(1,cycleMarkers.length);
  const avgDepth  = phases.reduce((a,b)=>a+b.depth,0)/(phases.length||1);
  const deepMin   = phases.filter(p=>p.phase==='deep').length/6;
  const quality   = Math.min(100,Math.round(
    (Math.min(cycles,5)/5)*40+Math.min(30,deepMin)+Math.min(30,totalMin/16)
  ));
  const signals=['microphone',...(hasMov?['accelerometer']:[]),...(hasHR?['heartRate']:[])];
  return {sleepStart,sleepEnd,duration:totalMin,cycles,cycleMarkers,quality,phases,avgDepth,signals};
}

// ── Sleep depth from live RMS buffer ─────────────────────────────────────────
export function sleepDepthFromRMS(history) {
  if(history.length<4) return 0.5;
  const recent=history.slice(-20);
  const avg=recent.reduce((a,b)=>a+b,0)/recent.length;
  const variance=recent.reduce((acc,v)=>acc+(v-avg)**2,0)/recent.length;
  return Math.min(1,avg*80+Math.sqrt(variance)*120);
}
