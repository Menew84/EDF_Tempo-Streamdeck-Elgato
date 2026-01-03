let websocket=null;let context=null;
const DEFAULTS={lang:"fr",showLabel:true,showDate:true,dateFormat:"ddmmyy",showColorText:true,showTimer:false,timerMode:"endOfDay"};
const $=(id)=>document.getElementById(id);
function send(event,payload){ if(!websocket||websocket.readyState!==WebSocket.OPEN) return; websocket.send(JSON.stringify({event,...payload})); }
function setSettings(s){ send("setSettings",{context,payload:s}); }
function sendToPlugin(s){ send("sendToPlugin",{context,payload:{settings:s}}); }
function getSettings(){ send("getSettings",{context}); }
function applyUI(s){
  $("lang").value=s.lang;
  $("dateFormat").value=s.dateFormat;
  $("timerMode").value=s.timerMode;
  $("showLabel").checked=!!s.showLabel;
  $("showDate").checked=!!s.showDate;
  $("showColorText").checked=!!s.showColorText;
  $("showTimer").checked=!!s.showTimer;
}
function readUI(){
  return {lang:$("lang").value,dateFormat:$("dateFormat").value,timerMode:$("timerMode").value,
          showLabel:$("showLabel").checked,showDate:$("showDate").checked,
          showColorText:$("showColorText").checked,showTimer:$("showTimer").checked};
}
function push(){
  const s=Object.assign({},DEFAULTS,readUI());
  setSettings(s); sendToPlugin(s);
  $("badge").style.display="block";
  clearTimeout(window.__b); window.__b=setTimeout(()=>{$("badge").style.display="none";},900);
}
function connectElgatoStreamDeckSocket(inPort,inUUID,inRegisterEvent,inInfo,inActionInfo){
  const ai=JSON.parse(inActionInfo);
  context=ai.context;
  websocket=new WebSocket("ws://127.0.0.1:"+inPort);
  websocket.onopen=()=>{
    websocket.send(JSON.stringify({event:inRegisterEvent,uuid:inUUID}));
    const s=Object.assign({},DEFAULTS,(ai.payload&&ai.payload.settings)||{});
    applyUI(s); getSettings();
  };
  websocket.onmessage=(evt)=>{
    const msg=JSON.parse(evt.data);
    if(msg.event==="didReceiveSettings" && msg.context===context){
      const s=Object.assign({},DEFAULTS,(msg.payload&&msg.payload.settings)||{});
      applyUI(s);
    }
  };
}
$("apply").addEventListener("click", push);
