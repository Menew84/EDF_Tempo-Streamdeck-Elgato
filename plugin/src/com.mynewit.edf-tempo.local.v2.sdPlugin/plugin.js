
let websocket=null;
const ACTIONS={"today": "com.mynewit.edf-tempo.local.v2.today", "tomorrow": "com.mynewit.edf-tempo.local.v2.tomorrow", "yesterday": "com.mynewit.edf-tempo.local.v2.yesterday", "stats_blue": "com.mynewit.edf-tempo.local.v2.stats.blue", "stats_white": "com.mynewit.edf-tempo.local.v2.stats.white", "stats_red": "com.mynewit.edf-tempo.local.v2.stats.red"};
const contexts=new Map();
let lastTempo={today:"UNKNOWN",tomorrow:"UNKNOWN",yesterday:"UNKNOWN",stats:{},fetchedAt:0,lastError:""};

const COLOR_MAP={BLUE:"#005AC8",WHITE:"#E6E6E6",RED:"#C80000",UNKNOWN:"#555555"};
const LOCAL_URL="http://127.0.0.1:9123/tempo";
const LOCAL_STATS="http://127.0.0.1:9123/stats";

const DEFAULTS={lang:"fr",showLabel:true,showDate:true,dateFormat:"ddmmyy",showColorText:true,showTimer:false,timerMode:"endOfDay"};

function connectElgatoStreamDeckSocket(inPort,inPluginUUID,inRegisterEvent,inInfo){
  websocket=new WebSocket("ws://127.0.0.1:"+inPort);
  websocket.onopen=()=>{
    websocket.send(JSON.stringify({event:inRegisterEvent,uuid:inPluginUUID}));
    scheduleLoops();
    refreshAll(true).catch(()=>{});
  };
  websocket.onmessage=(evt)=>{
    const msg=JSON.parse(evt.data);
    switch(msg.event){
      case "willAppear": onWillAppear(msg); break;
      case "willDisappear": contexts.delete(msg.context); break;
      case "keyDown": onKeyDown(msg); break;
      case "didReceiveSettings": onDidReceiveSettings(msg); break;
      case "sendToPlugin": onSendToPlugin(msg); break;
      default: break;
    }
  };
}

function send(event,payload){ if(!websocket||websocket.readyState!==WebSocket.OPEN) return; websocket.send(JSON.stringify({event,...payload})); }
function setImage(context,img){ send("setImage",{context,payload:{image:img,target:0}}); }
function setTitle(context,title){ send("setTitle",{context,payload:{title,target:0}}); }
function showOk(context){ send("showOk",{context}); }
function showAlert(context){ send("showAlert",{context}); }
function setSettings(context,settings){ send("setSettings",{context,payload:settings}); }
function getSettings(context){ send("getSettings",{context}); }

function mergeSettings(s){ return {...DEFAULTS, ...(s||{})}; }
function flash(ctx, txt){ setTitle(ctx, txt); setTimeout(()=>setTitle(ctx,""), 900); }

function onWillAppear(msg){
  const ctx=msg.context, action=msg.action;
  contexts.set(ctx,{action, settings: mergeSettings((msg.payload&&msg.payload.settings)||{})});
  getSettings(ctx);
  updateOne(ctx);
}
function onDidReceiveSettings(msg){
  const ctx=msg.context; const cur=contexts.get(ctx); if(!cur) return;
  cur.settings=mergeSettings((msg.payload&&msg.payload.settings)||{});
  contexts.set(ctx,cur);
  updateOne(ctx);
}
function onSendToPlugin(msg){
  const ctx=msg.context; const cur=contexts.get(ctx); if(!cur) return;
  if(msg.payload && msg.payload.settings){
    cur.settings=mergeSettings(msg.payload.settings);
    contexts.set(ctx,cur);
    setSettings(ctx,cur.settings);
    flash(ctx,"OK");
    updateOne(ctx);
  }
}
function onKeyDown(msg){
  const ctx=msg.context;
  refreshAll(true).then(()=>showOk(ctx)).catch(()=>showAlert(ctx));
}

function normalizeColor(c){
  c=String(c||"").toUpperCase();
  if(c.includes("BLEU")||c==="BLUE") return "BLUE";
  if(c.includes("BLANC")||c==="WHITE") return "WHITE";
  if(c.includes("ROUGE")||c==="RED") return "RED";
  return "UNKNOWN";
}

async function fetchJson(url){
  const r=await fetch(url,{cache:"no-store"});
  if(!r.ok) throw new Error("HTTP "+r.status+" "+url);
  return await r.json();
}

async function refreshAll(force=false){
  const now=Date.now();
  if(!force && (now-lastTempo.fetchedAt)<30000) return lastTempo;
  try{
    const t=await fetchJson(LOCAL_URL);
    lastTempo.today=normalizeColor(t.today);
    lastTempo.tomorrow=normalizeColor(t.tomorrow);
    lastTempo.yesterday=normalizeColor(t.yesterday);
    lastTempo.stats=t.stats||{};
    if(!lastTempo.stats || Object.keys(lastTempo.stats).length===0){
      try{ lastTempo.stats = await fetchJson(LOCAL_STATS); }catch(e){}
    }
    lastTempo.lastError=t.last_error||"";
  }catch(e){
    lastTempo.lastError=String(e);
  }
  lastTempo.fetchedAt=now;
  for(const [ctx] of contexts) updateOne(ctx);
  return lastTempo;
}

function pad2(n){return String(n).padStart(2,"0");}
function formatDate(d,fmt){
  const dd=pad2(d.getDate()), mm=pad2(d.getMonth()+1), yy=String(d.getFullYear()).slice(-2);
  return (fmt==="mmddyy")?`${mm}/${dd}/${yy}`:`${dd}/${mm}/${yy}`;
}
function formatColorName(color,lang){
  if(lang==="en") return color==="WHITE"?"WHITE":(color==="BLUE"?"BLUE":(color==="RED"?"RED":"N/A"));
  return color==="WHITE"?"BLANC":(color==="BLUE"?"BLEU":(color==="RED"?"ROUGE":"N/A"));
}
function labelFor(kind,lang){
  const mapFr={today:"AUJ",tomorrow:"DEMAIN",yesterday:"HIER"};
  const mapEn={today:"TODAY",tomorrow:"TOMORROW",yesterday:"YESTERDAY"};
  return (lang==="en" ? mapEn[kind] : mapFr[kind]) || "";
}
function countdownText(target,lang){
  const now=new Date();
  let ms=target.getTime()-now.getTime(); if(ms<0) ms=0;
  const totalMin=Math.floor(ms/60000);
  const hh=Math.floor(totalMin/60), mm=totalMin%60;
  const t=`${pad2(hh)}:${pad2(mm)}`;
  return (lang==="en")?`LEFT ${t}`:`RESTE ${t}`;
}
function makeIcon(bgColor,lines,invert){
  const size=144;
  const canvas=document.createElement("canvas"); canvas.width=size; canvas.height=size;
  const g=canvas.getContext("2d");
  g.fillStyle=bgColor; g.fillRect(0,0,size,size);
  g.strokeStyle="rgba(255,255,255,0.35)"; g.lineWidth=6; g.strokeRect(3,3,size-6,size-6);
  g.fillStyle=invert?"#000":"#FFF";
  g.textAlign="center"; g.textBaseline="middle";
  const safe=(lines||[]).filter(Boolean).slice(0,3);
  const y=safe.length===1?[72]:safe.length===2?[58,104]:[46,82,118];
  const fonts=safe.length===1?["bold 30px Arial"]:
              safe.length===2?["bold 26px Arial","bold 16px Arial"]:
              ["bold 22px Arial","bold 16px Arial","bold 14px Arial"];
  safe.forEach((txt,i)=>{g.font=fonts[i]||"bold 16px Arial"; g.fillText(txt,size/2,y[i]);});
  return canvas.toDataURL("image/png");
}

function updateOne(ctx){
  const cur=contexts.get(ctx); if(!cur) return;
  const {action,settings}=cur;
  const lang=settings.lang||"fr";

  if(action===ACTIONS.stats_blue || action===ACTIONS.stats_white || action===ACTIONS.stats_red){
    const s=lastTempo.stats||{};
    let key="bleu";
    if(action===ACTIONS.stats_white) key="blanc";
    if(action===ACTIONS.stats_red) key="rouge";
    const used = s[key+"_used"];
    const left = s[key+"_left"];
    const colorName = (key==="bleu")?"BLUE":(key==="blanc")?"WHITE":"RED";
    const bg = COLOR_MAP[colorName]||COLOR_MAP.UNKNOWN;
    const invert = (colorName==="WHITE");
    const label = (lang==="en") ? (key==="bleu"?"BLUE":(key==="blanc"?"WHITE":"RED")) : (key==="bleu"?"BLEU":(key==="blanc"?"BLANC":"ROUGE"));
    const l1 = label;
    const l2 = (lang==="en") ? `LEFT ${left ?? "?"}` : `RESTE ${left ?? "?"}`;
    const l3 = (lang==="en") ? `USED ${used ?? "?"}` : `PASSÉ ${used ?? "?"}`;
    setImage(ctx, makeIcon(bg, [l1,l2,l3], invert));
    return;
  }

  const now=new Date();
  const baseToday=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const kind = (action===ACTIONS.tomorrow)?"tomorrow":(action===ACTIONS.yesterday)?"yesterday":"today";
  const offset = (kind==="tomorrow")?1:(kind==="yesterday")?-1:0;
  const targetDate=new Date(baseToday.getTime()+offset*86400000);

  const color = (kind==="tomorrow")?lastTempo.tomorrow:(kind==="yesterday")?lastTempo.yesterday:lastTempo.today;
  const bg = COLOR_MAP[color]||COLOR_MAP.UNKNOWN;
  const invert=(color==="WHITE");

  const lines=[];
  if(settings.showLabel) lines.push(labelFor(kind,lang));
  if(settings.showDate) lines.push(formatDate(targetDate,settings.dateFormat));

  if(settings.showTimer){
    const base = (settings.timerMode==="endOfTargetDay")
      ? new Date(targetDate.getFullYear(),targetDate.getMonth(),targetDate.getDate())
      : new Date(baseToday.getFullYear(),baseToday.getMonth(),baseToday.getDate());
    const target = new Date(base.getTime()+86400000);
    lines.push(countdownText(target,lang));
  } else if(settings.showColorText){
    if(settings.showDate) lines.push(formatColorName(color,lang));
    else if(lines.length<2) lines.push(formatColorName(color,lang));
  }

  setImage(ctx, makeIcon(bg, lines, invert));
}

let tick=null, poll=null;
function scheduleLoops(){
  if(tick) clearInterval(tick);
  tick=setInterval(()=>{ for(const [ctx] of contexts) updateOne(ctx); }, 5000);
  if(poll) clearInterval(poll);
  poll=setInterval(()=>refreshAll(false).catch(()=>{}), 60000);
}
