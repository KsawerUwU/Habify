/* Habify — cookie-only + offline. Теперь: многократные выполнения/день и бэкфилл дат */
(() => {
  const COOKIE_NAME = "habify";
  const COOKIE_DAYS = 365;

  // ===== env checks =====
  const isFile = location.protocol === "file:";
  const manifestLink = document.getElementById("manifestLink");
  if (isFile) {
    document.getElementById("envWarning").classList.remove("hidden");
    // отключим манифест, чтобы не было CORS-ошибок
    manifestLink && manifestLink.removeAttribute("href");
  }

  // ===== cookie utils =====
  function cookiesEnabled(){
    try{ document.cookie = "hab_test=1; SameSite=Lax; Path=/"; return document.cookie.includes("hab_test="); }
    catch{ return false; }
  }
  const COOKIES_OK = !isFile && cookiesEnabled();

  function setCookie(name, value, days) {
    if (!COOKIES_OK) return;
    const expires = new Date(Date.now() + days*864e5).toUTCString();
    const secure = (location.protocol === "https:") ? "; Secure" : "";
    document.cookie = `${name}=${encodeURIComponent(value)}; Expires=${expires}; Path=/; SameSite=Lax${secure}`;
  }
  function getCookie(name) {
    if (!COOKIES_OK) return "";
    const parts = document.cookie.split("; ").filter(Boolean);
    for (const p of parts){ const [k,v] = p.split("="); if (k===name) return decodeURIComponent(v); }
    return "";
  }
  function delCookie(name){ if (!COOKIES_OK) return; document.cookie = `${name}=; Expires=Thu, 01 Jan 1970 00:00:01 GMT; Path=/`; }

  // ===== helpers =====
  const pad = n => String(n).padStart(2, "0");
  const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const todayKey = () => keyOf(new Date());
  const uid = () => Math.random().toString(36).slice(2,9);
  const DOW = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];
  const weekNumber = d => { const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7; date.setUTCDate(date.getUTCDate()+4-dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
    return Math.ceil((((date-yearStart)/86400000)+1)/7); };

  // ===== state =====
  // history теперь: { 'yyyy-mm-dd': number } — количество выполнений в этот день
  const state = { theme:"auto", weekStart:1, xp:0, firstRun:true, habits:[] };

  function encode(){
    const minimal = { t:state.theme, w:state.weekStart, x:state.xp, f:state.firstRun,
      h:state.habits.map(h=>({i:h.id,n:h.name,m:h.mode,d:h.days,c:h.createdAt,r:h.streak,hi:h.history})) };
    return btoa(unescape(encodeURIComponent(JSON.stringify(minimal))));
  }
  function decode(b64){
    const obj = JSON.parse(decodeURIComponent(escape(atob(b64))));
    state.theme = obj.t ?? "auto";
    state.weekStart = obj.w ?? 1;
    state.xp = obj.x ?? 0;
    state.firstRun = obj.f ?? false;
    state.habits = (obj.h||[]).map(o=>({id:o.i,n:o.n,mode:o.m,days:o.d||[],createdAt:o.c,streak:o.r||0,history:o.hi||{}}));
  }
  function save(){ setCookie(COOKIE_NAME, encode(), COOKIE_DAYS); }
  function load(){ const c=getCookie(COOKIE_NAME); if(c){ decode(c); return true; } return false; }

  // ===== service worker (offline) =====
  if (!isFile && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(()=>{});
    });
  }

  // ===== refs =====
  const pages = {btnToday: byId("pageToday"), btnAll: byId("pageAll"), btnStats: byId("pageStats")};
  const statTotal = byId("statTotal"), statDone = byId("statDone"), statXP = byId("statXP");
  const weekLabel = byId("weekLabel"), weekProgress = byId("weekProgress"), todayQuick = byId("todayQuick");
  const weekStartSel = byId("weekStart"), themeSel = byId("theme");
  const listAll = byId("habitList"), emptyAll = byId("empty"), countAll = byId("countAll");
  const listToday = byId("todayList"), emptyToday = byId("todayEmpty");
  const dlg = byId("dlgHabit"), fId = byId("fId"), fName = byId("fName"), daysWrap = byId("daysSel");
  const dlgImport = byId("dlgImport"), importText = byId("importText");
  const dlgTutorial = byId("dlgTutorial"), dots = byId("dots");
  const dlgHistory = byId("dlgHistory"), histDate = byId("histDate"), histCount = byId("histCount"), histHabitId = byId("histHabitId");
  const toastEl = byId("toast");

  // ===== init =====
  const existed = load();
  if (!existed && COOKIES_OK) { state.firstRun = true; save(); } // создаём cookie, чтобы Экспорт сразу работал
  applyTheme();
  weekStartSel.value = state.weekStart; themeSel.value = state.theme || "auto";
  renderAll();
  maybeShowTutorial();

  // ===== navigation =====
  for (const id in pages) {
    byId(id).addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
      byId(id).classList.add("active");
      document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
      pages[id].classList.remove("hidden");
    });
  }

  // ===== handlers =====
  byId("btnAdd").onclick = openNew;
  byId("btnCancelHabit").onclick = () => dlg.close();
  byId("btnSaveHabit").onclick = saveHabit;

  byId("btnExport").onclick = () => {
    const str = getCookie(COOKIE_NAME);
    if (!str) return toast("Нет данных для экспорта. Проверь, что открыт http://, а не file://");
    navigator.clipboard.writeText(str).then(()=> toast("Экспортировано в буфер."),()=>prompt("Скопируй вручную:", str));
  };
  byId("btnImport").onclick = () => { importText.value=""; dlgImport.showModal(); };
  byId("btnDoImport").onclick = (e) => { e.preventDefault();
    const s=importText.value.trim(); if(!s) return;
    try{ decode(s); save(); renderAll(); dlgImport.close(); toast("Импорт выполнен."); } catch{ alert("Неверная строка импорта."); }
  };
  byId("btnCancelImport").onclick = () => dlgImport.close();

  byId("btnReset").onclick = () => {
    if (!confirm("Точно очистить все данные?")) return;
    delCookie(COOKIE_NAME);
    Object.assign(state, {theme:"auto",weekStart:1,xp:0,firstRun:true,habits:[]});
    if (COOKIES_OK) save();
    renderAll(); toast("Данные очищены.");
  };

  byId("btnTutorial").onclick = () => showTutorial(true);
  weekStartSel.onchange = () => { state.weekStart=+weekStartSel.value; if (COOKIES_OK) save(); renderAll(); };
  themeSel.onchange = () => { state.theme=themeSel.value; applyTheme(); if (COOKIES_OK) save(); };

  // история (бэкфилл)
  byId("btnCancelHistory").onclick = () => dlgHistory.close();
  byId("btnSaveHistory").onclick = (e) => {
    e.preventDefault();
    const id = histHabitId.value;
    const h = state.habits.find(x=>x.id===id);
    if (!h) return;
    const d = new Date(histDate.value);
    if (isNaN(d)) return alert("Выбери дату.");
    const k = keyOf(d);
    const cnt = Math.max(0, Math.floor(+histCount.value||0));
    if (cnt===0) delete h.history[k]; else h.history[k]=cnt;
    h.streak = recalcStreak(h);
    if (COOKIES_OK) save();
    dlgHistory.close(); renderAll(); toast("Сохранено в истории.");
  };

  // ===== core =====
  function applyTheme(){
    const root=document.documentElement; root.classList.remove("light");
    if (state.theme==="light") root.classList.add("light");
    if (state.theme==="auto"){ const mq=window.matchMedia("(prefers-color-scheme: light)"); if (mq.matches) root.classList.add("light"); }
  }
  function maybeShowTutorial(){ if (state.firstRun && COOKIES_OK) showTutorial(false); }
  function showTutorial(force){
    const steps = Array.from(dlgTutorial.querySelectorAll(".step")); let i=0;
    const prev = byId("prevStep"), next = byId("nextStep"), dont = byId("dontShow");
    function draw(){
      dots.innerHTML=""; steps.forEach((_,idx)=>{ const s=document.createElement("span"); if(idx===i) s.classList.add("active"); dots.append(s); });
      steps.forEach((s,idx)=> s.classList.toggle("active", idx===i));
      prev.disabled = (i===0); next.textContent = (i===steps.length-1)?"Готово":"Далее";
    }
    prev.onclick=()=>{ if(i>0){i--;draw();} };
    next.onclick=()=>{ if(i<steps.length-1){i++;draw();} else { dlgTutorial.close(); if (dont.checked || !force){ state.firstRun=false; if (COOKIES_OK) save(); } } };
    draw(); dlgTutorial.showModal();
  }

  function openNew(){
    fId.value=""; fName.value="";
    dlg.querySelector("input[value='daily']").checked=true;
    daysWrap.querySelectorAll("input[type='checkbox']").forEach(c=>c.checked=(c.value>=1&&c.value<=5));
    toggleDays(); dlg.showModal(); fName.focus(); byId("dlgTitle").textContent="Новая привычка";
  }
  function openEdit(h){
    fId.value=h.id; fName.value=h.name;
    dlg.querySelector(`input[value='${h.mode}']`).checked=true;
    daysWrap.querySelectorAll("input[type='checkbox']").forEach(c=>c.checked=h.days.includes(+c.value));
    toggleDays(); dlg.showModal(); byId("dlgTitle").textContent="Редактировать привычку";
  }
  dlg.addEventListener("change", e=>{ if(e.target.name==="mode") toggleDays(); });
  function toggleDays(){ daysWrap.style.display = dlg.querySelector("input[name='mode']:checked").value==="days" ? "flex":"none"; }

  function saveHabit(e){
    e.preventDefault();
    const id = fId.value || uid();
    const name = fName.value.trim(); if(!name) return;
    const mode = dlg.querySelector("input[name='mode']:checked").value;
    const days = Array.from(daysWrap.querySelectorAll("input[type='checkbox']:checked")).map(c=>+c.value);
    const ex = state.habits.find(h=>h.id===id);
    if (ex){ ex.name=name; ex.mode=mode; ex.days=(mode==="days"?days:[]); }
    else { state.habits.push({id,name,mode,days:(mode==="days"?days:[]),createdAt:todayKey(),history:{},streak:0}); }
    dlg.close(); if (COOKIES_OK) save(); renderAll(); toast("Сохранено.");
  }

  function renderAll(){ renderLists(); renderDashboard(); renderStats(); }

  function isPlanned(h, dow){ return h.mode==="daily" ? true : (h.days||[]).includes(dow); }

  // карточка с счётчиком
  function habitCard(h, minimal=false){
    const k = todayKey();
    const todayCount = h.history[k]||0;

    const item = el("div","habit");
    // левая часть — название и мета
    const left = el("div");
    left.append(el("div","name",h.name),
                el("div","meta", h.mode==="daily"?"Ежедневно":"По дням: "+(h.days||[]).sort().map(d=>DOW[d]).join(" ")));
    item.append(left);

    // центр — счётчик на сегодня
    const ctr = el("div","counter");
    const btnMinus = document.createElement("button"); btnMinus.textContent="−";
    const val = el("span","val", todayCount);
    const btnPlus = document.createElement("button"); btnPlus.textContent="+";
    btnMinus.onclick = ()=>{ adjustToday(h, -1); };
    btnPlus.onclick = ()=>{ adjustToday(h, +1); };
    ctr.append(btnMinus,val,btnPlus);
    item.append(ctr);

    // справа — действия
    const right = el("div","row");
    right.append(el("span","streak",`Стрик: ${h.streak||0}`));
    if (!minimal) right.append(buildMiniCalendar(h));
    const btnHist = button("История", ()=>openHistory(h));
    const btnE = button("Редакт.", ()=>openEdit(h));
    const btnD = button("Удалить", ()=>{ state.habits = state.habits.filter(x=>x.id!==h.id); if (COOKIES_OK) save(); renderAll(); }, "danger");
    right.append(btnHist, btnE, btnD);
    item.append(right);

    function adjustToday(habit, delta){
      const k = todayKey();
      const cur = habit.history[k]||0;
      const next = Math.max(0, cur + delta);
      if (next===0) delete habit.history[k]; else habit.history[k]=next;
      if (delta>0) state.xp += 5*delta;
      habit.streak = recalcStreak(habit);
      if (COOKIES_OK) save();
      renderAll();
    }

    return item;
  }

  function renderLists(){
    // все привычки
    listAll.innerHTML="";
    if (!state.habits.length){ emptyAll.style.display="block"; countAll.textContent="0"; }
    else {
      emptyAll.style.display="none"; countAll.textContent=state.habits.length;
      state.habits.forEach(h=> listAll.append(habitCard(h)));
    }

    // сегодня (минимальный вид)
    const dow = (new Date()).getDay();
    const todays = state.habits.filter(h=>isPlanned(h,dow));
    listToday.innerHTML="";
    if (!todays.length) { emptyToday.style.display="block"; }
    else { emptyToday.style.display="none"; todays.forEach(h=> listToday.append(habitCard(h, true))); }
  }

  function openHistory(h){
    histHabitId.value = h.id;
    histDate.valueAsDate = new Date();
    histCount.value = String(h.history[todayKey()]||0);
    dlgHistory.showModal();
  }

  function buildMiniCalendar(h){
    const kal = el("div","kal");
    const today = new Date();
    for (let i=13;i>=0;i--){
      const d=new Date(today); d.setDate(d.getDate()-i); const k=keyOf(d);
      const cnt=h.history[k]||0;
      const pill=el("div","day-pill"+(cnt>0?" d":""), String(d.getDate()));
      if (cnt===0 && d < new Date(today.toDateString()) && isPlanned(h,d.getDay())) pill.classList.add("miss");
      pill.title = cnt ? `Выполнений: ${cnt}` : "0";
      kal.append(pill);
    }
    return kal;
  }

  function recalcStreak(h){
    let s=0; const t = new Date();
    for (let i=0;i<400;i++){ const d=new Date(t); d.setDate(d.getDate()-i); const k=keyOf(d);
      if ((h.history[k]||0) > 0) s++; else break; }
    return s;
  }

  function renderDashboard(){
    const k = todayKey();
    const done = state.habits.reduce((acc,h)=>acc+(h.history[k]||0),0); // суммарные выполнения
    statTotal.textContent = state.habits.length;
    statDone.textContent = done;
    statXP.textContent = state.xp;
    weekLabel.textContent = weekNumber(new Date());

    // быстрые пилюли
    todayQuick.innerHTML="";
    todayQuick.append(el("span","pill", `Выполнений сегодня: ${done}`));

    // прогресс недели (ограничим 100%)
    const pct = Math.min(100, weeklyPercent());
    weekProgress.style.width = pct + "%";
  }

  function weeklyPercent(){
    const now=new Date(); const {start,end}=weekRange(now, state.weekStart);
    let planned=0, done=0;
    for (let d=new Date(start); d<=end; d.setDate(d.getDate()+1)){
      const k=keyOf(d); const di=d.getDay();
      state.habits.forEach(h=>{ if (isPlanned(h,di)) planned++; done += (h.history[k]||0); });
    }
    return planned ? Math.round(100*done/planned) : 0; // может быть >100, но мы ограничили в renderDashboard
  }
  function weekRange(date, weekStart){
    const d=new Date(date); const day=d.getDay(); const diff=(day - weekStart + 7)%7;
    const start=new Date(d); start.setDate(d.getDate()-diff); start.setHours(0,0,0,0);
    const end=new Date(start); end.setDate(start.getDate()+6); end.setHours(23,59,59,999);
    return {start,end};
  }

  function renderStats(){
    // лучшая серия
    byId("bestStreak").textContent = Math.max(0, ...state.habits.map(h=>h.streak||0), 0);
    // сумма выполнений за 14 дней + лучший день недели по эффективности
    const today=new Date(); let sum=0; const dowCount=new Array(7).fill(0), dowDone=new Array(7).fill(0);
    for (let i=13;i>=0;i--){
      const d=new Date(today); d.setDate(d.getDate()-i); const k=keyOf(d); const di=d.getDay();
      state.habits.forEach(h=>{ if (isPlanned(h,di)) dowCount[di]++; const c=(h.history[k]||0); sum+=c; dowDone[di]+=c; });
    }
    byId("sum14").textContent = sum;
    const bestIndex = dowDone.reduce((best, val, i)=> val > dowDone[best] ? i : best, 0);
    byId("bestDow").textContent = dowCount[bestIndex] ? DOW[bestIndex] : "—";

    const board = byId("historyBoard"); board.innerHTML="";
    state.habits.forEach(h=>{ const row=el("div","habit"); row.append(el("div","name",h.name), buildMiniCalendar(h)); board.append(row); });
  }

  // tiny helpers
  function byId(id){ return document.getElementById(id); }
  function el(tag, cls, text){ const e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }
  function button(text, onClick, kind=""){ const b=document.createElement("button"); b.className=`btn ${kind}`.trim(); b.textContent=text; b.onclick=onClick; return b; }

  // toasts
  let toastTimer=null;
  function toast(text){ toastEl.textContent=text; toastEl.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>toastEl.classList.remove("show"),2000); }
})();
