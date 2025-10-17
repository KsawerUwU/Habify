/* Habify — офлайн, cookie-only. Исправлено: переключение вкладок, стабильные Статистика/Галерея, светлая тема, онбординг, PWA */
(() => {
  // ===== Константы =====
  const COOKIE_NAME = "habify";
  const COOKIE_DAYS = 365;
  const BASE_XP = 5;
  const weekStart = 1; // понедельник

  const byId = id => document.getElementById(id);
  const pad = n => String(n).padStart(2,"0");
  const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const todayKey = () => keyOf(new Date());
  const DOW = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];

  // ===== Предупреждение о file:// =====
  const isFile = location.protocol === "file:";
  if (isFile) byId("envWarning")?.classList.remove("hidden");

  // ===== Cookie utils =====
  const COOKIES_OK = !isFile;
  function setCookie(name,val,days){
    if(!COOKIES_OK) return;
    const exp = new Date(Date.now()+days*864e5).toUTCString();
    const secure = (location.protocol==="https:")?"; Secure":"";
    document.cookie = `${name}=${encodeURIComponent(val)}; Expires=${exp}; Path=/; SameSite=Lax${secure}`;
  }
  function getCookie(name){
    if(!COOKIES_OK) return "";
    const pairs = document.cookie.split("; ").filter(Boolean);
    for(const p of pairs){ const [k,v]=p.split("="); if(k===name) return decodeURIComponent(v); }
    return "";
  }
  function delCookie(name){ if(!COOKIES_OK) return; document.cookie=`${name}=; Expires=Thu, 01 Jan 1970 00:00:01 GMT; Path=/`; }

  // ===== Состояние =====
  const state = {
    theme:"auto",
    xp:0,
    profile:{name:"", avatar:"🙂"},
    event:"thu2",        // бонус ×2 по четвергам
    firstRun:true,       // онбординг 1 раз
    habits:[],           // {id,name,mode,days,createdAt,history:{},streak}
    guests:[]            // [{name, avatar, data}]
  };

  // сериализация
  function encode(){
    const obj = {
      t:state.theme, x:state.xp, f:state.firstRun, e:state.event,
      p:state.profile, g:state.guests,
      h:state.habits.map(h=>({i:h.id,n:h.name,m:h.mode,d:h.days,c:h.createdAt,r:h.streak,hi:h.history}))
    };
    return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
  }
  function decode(b64){
    const obj = JSON.parse(decodeURIComponent(escape(atob(b64))));
    state.theme   = obj.t ?? "auto";
    state.xp      = obj.x ?? 0;
    state.firstRun= obj.f ?? false;
    state.event   = obj.e ?? "thu2";
    state.profile = obj.p ?? state.profile;
    state.guests  = Array.isArray(obj.g) ? obj.g : [];
    state.habits  = (obj.h||[]).map(o=>({id:o.i,name:o.n,mode:o.m,days:o.d||[],createdAt:o.c,streak:o.r||0,history:o.hi||{}}));
  }
  function save(){ setCookie(COOKIE_NAME, encode(), COOKIE_DAYS); }
  function load(){ const c=getCookie(COOKIE_NAME); if(c){ decode(c); return true; } return false; }

  // ===== PWA: SW =====
  if (!isFile && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(console.warn);
    });
  }

  // ===== Инициализация =====
  const existed = load();
  if (!existed && COOKIES_OK) save();
  applyTheme();
  updateProfileUI();
  wireNav();
  switchPage("home");  // гарантируем стартовую
  renderAll();
  maybeOnboard();

  // ===== Переключение страниц =====
  function switchPage(id){
    document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
    document.querySelector(`.tab[data-page="${id}"]`)?.classList.add("active");
    document.querySelectorAll(".page").forEach(p=>p.classList.remove("show"));
    byId(`page-${id}`)?.classList.add("show");
    if (id==="stats") renderStats();
    if (id==="gallery") renderGuests();
  }

  // ===== Навигация и действия =====
  function wireNav(){
    // делегирование кликов по вкладкам
    const tabsHost = document.querySelector(".tabs");
    tabsHost?.addEventListener("click",(e)=>{
      const btn = e.target.closest(".tab");
      if(!btn) return;
      const id = btn.getAttribute("data-page");
      if(!id) return;
      e.preventDefault();
      switchPage(id);
    });

    byId("btnAdd")?.addEventListener("click", openNew);
    byId("btnSettings")?.addEventListener("click", ()=>{ fillSettings(); byId("dlgSettings").showModal(); });
    byId("btnInfo")?.addEventListener("click", ()=> byId("dlgInfo").showModal());
    byId("btnProfile")?.addEventListener("click", openProfile);
    byId("btnCancelProfile")?.addEventListener("click", ()=> byId("dlgProfile").close());
    byId("btnSaveProfile")?.addEventListener("click", saveProfile);

    // Привычка
    byId("btnCancelHabit")?.addEventListener("click", ()=> byId("dlgHabit").close());
    byId("btnSaveHabit")?.addEventListener("click", saveHabit);
    byId("dlgHabit")?.addEventListener("change", e=>{ if(e.target.name==="mode") toggleDays(); });

    // Настройки
    byId("btnReset")?.addEventListener("click", ()=>{
      if(!confirm("Удалить все данные?")) return;
      delCookie(COOKIE_NAME);
      Object.assign(state,{theme:"auto",xp:0,profile:{name:"",avatar:"🙂"},event:"thu2",firstRun:false,habits:[],guests:[]});
      if(COOKIES_OK) save();
      renderAll(); toast("Сброшено");
    });
    byId("btnCopyExport")?.addEventListener("click", ()=>{
      const payload = "HABIFY1|" + encode();
      navigator.clipboard.writeText(payload).then(()=>toast("Экспорт скопирован"));
    });
    byId("btnDownloadExport")?.addEventListener("click", ()=>{
      const payload = "HABIFY1|" + encode();
      const blob = new Blob([payload],{type:"text/plain;charset=utf-8"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href=url; a.download="habify-backup.txt"; a.click(); URL.revokeObjectURL(url);
      toast("Файл скачан");
    });
    byId("btnDoImport")?.addEventListener("click", ()=>{
      const s = (byId("impText")?.value||"").trim(); if(!s) return;
      try{ let p = s.startsWith("HABIFY1|") ? s.slice(8) : s; decode(p); save(); renderAll(); toast("Импортировано"); }
      catch{ alert("Неверная строка экспорта"); }
    });

    // Галерея
    byId("btnAddGuest")?.addEventListener("click", ()=>{
      const s = (byId("guestText")?.value||"").trim(); if(!s) return;
      try{
        let p = s.startsWith("HABIFY1|") ? s.slice(8) : s;
        const snap = JSON.parse(decodeURIComponent(escape(atob(p))));
        const name = (snap.p && snap.p.name) || "Гость";
        const avatar = (snap.p && snap.p.avatar) || "👤";
        state.guests.push({name, avatar, data:snap});
        save(); renderGuests(); byId("guestText").value=""; toast("Добавлено в галерею");
      }catch(e){ console.warn(e); alert("Не удалось прочитать экспорт друга"); }
    });

    byId("btnTips")?.addEventListener("click", ()=> toast("Создай привычку (+), отмечай −/+, прошлые дни — «История», всё офлайн."));
  }

  // ===== Онбординг =====
  function maybeOnboard(){
    if (state.firstRun && COOKIES_OK){
      const dlg = byId("dlgOnboard");
      const dont = byId("onbDont");
      dlg?.addEventListener("close", ()=>{
        state.firstRun = !(dont?.checked); // показывать снова, если не чекнули
        save();
      });
      dlg?.showModal();
    }
  }

  // ===== Профиль =====
  function openProfile(){
    byId("profName").value = state.profile.name || "";
    document.querySelectorAll("#avatarPick button").forEach(b=>{
      b.onclick = ()=> { state.profile.avatar = b.textContent; updateProfileUI(); };
    });
    byId("dlgProfile").showModal();
  }
  function saveProfile(e){
    e.preventDefault();
    state.profile.name = byId("profName").value.trim();
    save(); updateProfileUI(); byId("dlgProfile").close();
  }
  function updateProfileUI(){
    byId("avatarEmoji").textContent = state.profile.avatar || "🙂";
    byId("helloName").textContent = state.profile.name ? `Привет, ${state.profile.name}!` : "Привет!";
  }

  // ===== Тема / Настройки =====
  function applyTheme(){
    document.documentElement.classList.remove("light");
    if(state.theme==="light"){ document.documentElement.classList.add("light"); }
    if(state.theme==="auto" && window.matchMedia("(prefers-color-scheme: light)").matches){
      document.documentElement.classList.add("light");
    }
  }
  function fillSettings(){
    const themeSel = byId("theme"); const ev = byId("eventSelect");
    if (themeSel){ themeSel.value = state.theme; themeSel.onchange = ()=>{ state.theme = themeSel.value; applyTheme(); save(); }; }
    if (ev){ ev.value = state.event; ev.onchange = ()=>{ state.event = ev.value; recalcXP(); renderAll(); save(); }; }
  }

  // ===== Модель привычек =====
  function openNew(){
    const dlg = byId("dlgHabit");
    byId("fId").value=""; byId("fName").value="";
    dlg.querySelector("input[value='daily']").checked = true;
    dlg.querySelectorAll("#daysSel input[type='checkbox']").forEach(c=>c.checked=(+c.value>=1&&+c.value<=5));
    toggleDays(); byId("habitTitle").textContent="Новая привычка"; dlg.showModal();
  }
  function toggleDays(){
    byId("daysSel").style.display =
      byId("dlgHabit").querySelector("input[name='mode']:checked").value==="days" ? "flex":"none";
  }
  function saveHabit(e){
    e.preventDefault();
    const id = byId("fId").value || Math.random().toString(36).slice(2,9);
    const name = byId("fName").value.trim(); if(!name) return;
    const mode = byId("dlgHabit").querySelector("input[name='mode']:checked").value;
    const days = Array.from(document.querySelectorAll("#daysSel input[type='checkbox']:checked")).map(c=>+c.value);
    const ex = state.habits.find(h=>h.id===id);
    if (ex){ ex.name=name; ex.mode=mode; ex.days=(mode==="days"?days:[]); }
    else { state.habits.push({id,name,mode,days:(mode==="days"?days:[]),createdAt:todayKey(),history:{},streak:0}); }
    save(); recalcXP(); renderAll(); byId("dlgHabit").close(); toast("Сохранено");
  }

  function isPlanned(h, dow){ return h.mode==="daily" ? true : (h.days||[]).includes(dow); }

  // бонусы XP
  function xpMultiplierFor(date){ return (state.event==="thu2" && date.getDay()===4) ? 2 : 1; }

  // корректировка «сегодня»
  function adjustToday(h, delta){
    const k = todayKey();
    const cur = h.history[k]||0;
    const next = Math.max(0, cur + delta);
    if (next===0) delete h.history[k]; else h.history[k]=next;
    h.streak = calcStreak(h);
    recalcXP(); save(); renderAll();
  }

  // серия
  function calcStreak(h){
    let s=0; const t=new Date();
    for(let i=0;i<400;i++){
      const d=new Date(t); d.setDate(d.getDate()-i);
      const k=keyOf(d);
      if((h.history[k]||0)>0) s++; else break;
    }
    return s;
  }

  // полный перерасчёт XP — «бетонно»
  function recalcXP(){
    let sum=0;
    state.habits.forEach(h=>{
      Object.entries(h.history).forEach(([k,c])=>{
        const d = new Date(k);
        sum += c * BASE_XP * xpMultiplierFor(d);
      });
    });
    state.xp = sum;
  }

  function deleteHabit(hid){
    state.habits = state.habits.filter(h=>h.id!==hid);
    recalcXP(); save(); renderAll(); toast("Удалено");
  }

  // ===== Рендер =====
  function renderAll(){ renderHome(); renderStats(); renderGuests(); }

  function renderHome(){
    byId("xpVal").textContent = state.xp;
    byId("habCount").textContent = state.habits.length;

    const k = todayKey();
    const done = state.habits.reduce((a,h)=>a+(h.history[k]||0),0);
    byId("doneToday").textContent = done;

    byId("weekBar").style.width = Math.min(100, weeklyPercent()) + "%";

    const list = byId("todayList"), empty = byId("todayEmpty");
    const dow = (new Date()).getDay();
    const todays = state.habits.filter(h=>isPlanned(h,dow));
    list.innerHTML="";
    if(!todays.length){ empty.style.display="block"; }
    else { empty.style.display="none"; todays.forEach(h=> list.append(habitCard(h,true))); }
  }

  function weeklyPercent(){
    const now=new Date();
    const day=now.getDay();
    const diff=(day-weekStart+7)%7;
    const start=new Date(now); start.setDate(now.getDate()-diff); start.setHours(0,0,0,0);
    const end=new Date(start); end.setDate(start.getDate()+6); end.setHours(23,59,59,999);
    let planned=0, done=0;
    for(let d=new Date(start); d<=end; d.setDate(d.getDate()+1)){
      const k=keyOf(d), di=d.getDay();
      state.habits.forEach(h=>{ if(isPlanned(h,di)) planned++; done += (h.history[k]||0); });
    }
    return planned ? Math.round(100*done/planned) : 0;
  }

  function habitCard(h, minimal){
    const k = todayKey(); const todayCount = h.history[k]||0;
    const item = el("div","habit");

    const left = el("div");
    left.append(el("div","name",h.name), el("div","meta", h.mode==="daily"?"Ежедневно":"По дням: "+(h.days||[]).sort().map(d=>DOW[d]).join(" ")));
    item.append(left);

    const ctr = el("div","counter");
    const minus = button("−",()=>adjustToday(h,-1));
    const val = el("span","val",todayCount);
    const plus  = button("+",()=>adjustToday(h,+1));
    ctr.append(minus,val,plus); item.append(ctr);

    const right = el("div","row");
    right.append(el("span","streak",`Стрик: ${h.streak||0}`));
    if(!minimal) right.append(buildMiniCalendar(h));
    right.append(button("История", ()=>openHistory(h)));
    right.append(button("Редакт.", ()=>openEdit(h)));
    right.append(button("Удалить", ()=>deleteHabit(h.id), "danger"));
    item.append(right);

    return item;
  }

  function buildMiniCalendar(h){
    const wrap = el("div","kal");
    const t = new Date();
    for(let i=13;i>=0;i--){
      const d=new Date(t); d.setDate(d.getDate()-i);
      const k=keyOf(d); const c=h.history[k]||0;
      const cell = el("div","day"+(c>0?" d":""), String(d.getDate()));
      if(c===0 && d<new Date(t.toDateString()) && isPlanned(h,d.getDay())) cell.classList.add("miss");
      cell.title = c ? `Выполнений: ${c}` : "0";
      wrap.append(cell);
    }
    return wrap;
  }

  function openEdit(h){
    byId("fId").value = h.id;
    byId("fName").value = h.name;
    const dlg = byId("dlgHabit");
    dlg.querySelector(`input[value='${h.mode}']`).checked = true;
    dlg.querySelectorAll("#daysSel input[type='checkbox']").forEach(c=>c.checked=h.days.includes(+c.value));
    toggleDays();
    byId("habitTitle").textContent = "Редактировать привычку";
    dlg.showModal();
  }

  // ===== История =====
  function openHistory(h){
    const dlg = byId("dlgHistory");
    byId("histHabitId").value = h.id;
    byId("histName").textContent = h.name;
    const now = new Date(); byId("histMonth").value = `${now.getFullYear()}-${pad(now.getMonth()+1)}`;
    buildCalendar(h);
    dlg.showModal();

    byId("histMonth").onchange = ()=> buildCalendar(h);
    byId("btnCancelHistory").onclick = ()=> dlg.close();
    byId("btnSaveHistory").onclick = (e)=>{
      e.preventDefault();
      const id = byId("histHabitId").value;
      const hh = state.habits.find(x=>x.id===id); if(!hh) return;
      const d = new Date(byId("histDate").value); if(isNaN(d)||d>new Date()) return alert("Выбери прошедшую дату");
      const cnt = Math.max(0, Math.floor(+byId("histCount").value||0));
      const k = keyOf(d); if(cnt===0) delete hh.history[k]; else hh.history[k]=cnt;
      hh.streak = calcStreak(hh); recalcXP(); save(); renderAll(); dlg.close(); toast("История сохранена");
    };
  }
  function buildCalendar(h){
    const cal = byId("calendar"); cal.innerHTML="";
    const [yy,mm] = (byId("histMonth").value||"").split("-");
    const year=+yy||new Date().getFullYear(), month=(+mm||1)-1;
    const first = new Date(year,month,1); const startIdx=(first.getDay()+6)%7; // Monday-based
    const daysIn = new Date(year,month+1,0).getDate();
    let day=1; const total=42;
    for(let i=0;i<total;i++){
      const cell = el("div","cell");
      const inMonth = i>=startIdx && day<=daysIn;
      if(inMonth){
        cell.textContent = day;
        const d = new Date(year,month,day); const k = keyOf(d); const cnt = h.history[k]||0;
        if(cnt>0) cell.classList.add("sel");
        cell.onclick = ()=>{
          byId("histDate").value = `${year}-${pad(month+1)}-${pad(day)}`;
          byId("histCount").value = String(cnt||1);
          cal.querySelectorAll(".cell").forEach(c=>c.classList.remove("sel")); cell.classList.add("sel");
        };
        day++;
      } else cell.classList.add("dim");
      cal.append(cell);
    }
    // дефолт
    const today = new Date();
    if (today.getFullYear()===year && today.getMonth()===month){
      byId("histDate").value = `${year}-${pad(month+1)}-${pad(today.getDate())}`;
      byId("histCount").value = String(h.history[keyOf(today)]||1);
    } else {
      byId("histDate").value = `${year}-${pad(month+1)}-01`;
      byId("histCount").value = "1";
    }
  }

  // ===== Статистика =====
  function renderStats(){
    byId("bestStreak").textContent = Math.max(0,...state.habits.map(h=>h.streak||0),0);
    const t=new Date(); let sum=0; const dowCount=new Array(7).fill(0), dowDone=new Array(7).fill(0);
    for(let i=13;i>=0;i--){
      const d=new Date(t); d.setDate(d.getDate()-i); const k=keyOf(d); const di=d.getDay();
      state.habits.forEach(h=>{ if(isPlanned(h,di)) dowCount[di]++; const c=(h.history[k]||0); sum+=c; dowDone[di]+=c; });
    }
    byId("sum14").textContent = sum;
    const best = dowDone.reduce((b,v,i)=> v>dowDone[b]?i:b,0);
    byId("bestDow").textContent = dowCount[best] ? ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"][best] : "—";

    const board = byId("historyBoard"); board.innerHTML="";
    if (!state.habits.length){ board.append(el("div","empty muted","Пока нет данных.")); return; }
    state.habits.forEach(h=>{ const row=el("div","habit"); row.append(el("div","name",h.name), buildMiniCalendar(h)); board.append(row); });
  }

  // ===== Галерея =====
  function renderGuests(){
    const box = byId("guestList"), empty = byId("guestEmpty");
    box.innerHTML="";
    if(!state.guests.length){ empty.style.display="block"; return; }
    empty.style.display="none";
    state.guests.forEach(g=>{
      const card = el("div","guest");
      const ava = el("div","", g.avatar || "👤"); ava.style.fontSize="20px";
      const title = el("div","name", g.name || "Гость");
      const meta = el("div","muted", `Привычек: ${Array.isArray(g.data?.h)?g.data.h.length:0}, XP: ${calcXPFromSnapshot(g.data)}`);
      const del = button("Удалить", ()=>{ state.guests = state.guests.filter(x=>x!==g); save(); renderGuests(); });
      card.append(ava,title,meta,del); box.append(card);
    });
  }
  function calcXPFromSnapshot(snap){
    try{
      const e = snap?.e || "thu2"; const mult = d => (e==="thu2" && d.getDay()===4) ? 2 : 1;
      let xp=0; (snap?.h||[]).forEach(h=>{ Object.entries(h.hi||{}).forEach(([k,c])=>{ xp += (c||0)*BASE_XP*mult(new Date(k)); }); });
      return xp;
    }catch{ return 0; }
  }

  // ===== Helpers =====
  function el(tag, cls, text){ const e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }
  function button(text, onClick, kind=""){ const b=document.createElement("button"); b.className=`btn ${kind}`.trim(); b.textContent=text; b.onclick=onClick; return b; }
  const toastEl = byId("toast");
  function toast(t){ toastEl.textContent=t; toastEl.classList.add("show"); clearTimeout(toast._t); toast._t=setTimeout(()=>toastEl.classList.remove("show"),2200); }
})();
