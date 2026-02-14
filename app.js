/* 통합형 TBM도우미: 지식(규정/작업카드) + TBM 회의록 작성/저장/출력 */
const app = document.getElementById('app');
const btnBack = document.getElementById('btnBack');
const btnHome = document.getElementById('btnHome');
const btnAction = document.getElementById('btnAction');
const pageTitle = document.getElementById('pageTitle');
const pageSub = document.getElementById('pageSub');

const KEY = "TBM_HELPER_INTEGRATED_V1";

function tpl(id){ return document.getElementById(id).content.cloneNode(true); }
function mount(node){ app.innerHTML=''; app.appendChild(node); }

function setTop(title, sub, {back=false, home=false, action=null}={}){
  pageTitle.textContent = title;
  pageSub.textContent = sub || '';
  btnBack.hidden = !back;
  btnHome.hidden = !home;
  if(action){
    btnAction.hidden = false;
    btnAction.textContent = action.label;
    btnAction.onclick = action.onClick;
  } else {
    btnAction.hidden = true;
    btnAction.onclick = null;
  }
}
btnBack.onclick = ()=>history.back();
btnHome.onclick = ()=>location.hash = '#/';

function loadAll(){
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
  catch { return []; }
}
function saveAll(arr){ localStorage.setItem(KEY, JSON.stringify(arr)); }

function upsert(tbm){
  const arr = loadAll();
  const i = arr.findIndex(x=>x.id===tbm.id);
  if(i>=0) arr[i]=tbm; else arr.unshift(tbm);
  saveAll(arr);
  return arr;
}
function removeOne(id){
  const arr = loadAll().filter(x=>x.id!==id);
  saveAll(arr);
  return arr;
}
function fmtDate(d){
  const pad=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function nowLocalInput(){
  const d = new Date();
  const tz = d.getTimezoneOffset()*60000;
  return new Date(d - tz).toISOString().slice(0,16);
}

// ---- Weather helpers ----
function qPM(v){
  if(v==null) return '-';
  if(v<=30) return '좋음';
  if(v<=80) return '보통';
  if(v<=150) return '나쁨';
  return '매우나쁨';
}
function iconFrom(code){
  if([0].includes(code)) return '☀️';
  if([1,2,3].includes(code)) return '⛅';
  if([45,48].includes(code)) return '🌫️';
  if([51,53,55,61,63,65].includes(code)) return '🌧️';
  if([71,73,75,77].includes(code)) return '❄️';
  if([95,96,99].includes(code)) return '⛈️';
  return '🌤️';
}

// ---- TBM editor state ----
let tbmState = null;

function blankTBM(){
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2),
    createdAt: new Date().toISOString(),
    jobName:"",
    location:"",
    datetime:"",
    template:"",
    workDesc:"",
    hazards:"",
    measures:"",
    attendees:"",
    memo:"",
    checks:{},
    signature:"",
    photos:[]
  };
}

function normalizeHaz(h){
  const keys = Object.keys(TBM_DATA.measureMap);
  for(const k of keys){ if(h.includes(k)) return k; }
  return null;
}

function genMeasuresFromHazards(hzText){
  const hzLines = (hzText||"").split("\n").map(s=>s.trim()).filter(Boolean);
  const ms = [];
  const used = new Set();
  hzLines.forEach(h=>{
    const k = normalizeHaz(h);
    if(k && !used.has(k)){
      used.add(k);
      TBM_DATA.measureMap[k].forEach(line=>ms.push(`- ${line}`));
    } else if(!k) {
      ms.push(`- [${h}] 위험요인에 대한 통제조치(출입통제/보호구/감시자/절차)를 현장 기준으로 설정`);
    }
  });
  if(hzLines.length){
    ms.push("- 작업 전 TBM 실시(작업순서·위험요인·대책 공유), 변경 시 재TBM");
    ms.push("- 이상 발생 시 즉시 작업중지 후 관리자 보고 및 조치");
  }
  return ms.join("\n");
}

function tbmApplyFromTask(task){
  // 작업명/위험요인/대책 자동 채움
  tbmState.jobName = task.title;
  const hzTitles = task.hazards.map(h=>h.title);
  tbmState.hazards = hzTitles.join("\n");
  // 대책은 카드 bullet을 우선 사용 + 자동생성 보완
  const lines = [];
  task.hazards.forEach(h=>{
    lines.push(`- [${h.title}]`);
    h.bullets.forEach(b=>lines.push(`  • ${b}`));
  });
  lines.push("");
  const auto = genMeasuresFromHazards(tbmState.hazards);
  tbmState.measures = lines.join("\n") + "\n" + auto;
}

// ---- Routes ----
function route(){
  const hash = location.hash || '#/';
  const parts = hash.split('/'); // ["#/tbm","new"]
  const r = (parts[1]||'').replace('#','');
  const a = parts[2] || '';
  const b = parts[3] || '';

  if(!r){
    setTop('TBM도우미','현장 TBM 회의록',{back:false,home:false});
    mount(tpl('tpl-home'));
    return;
  }

  if(r==='rules'){
    setTop('5대 안전지킴이','한국전력공사 안전수칙',{back:true,home:true});
    mount(tpl('tpl-rules'));
    return;
  }

  if(r==='weather'){
    setTop('현장 날씨·미세먼지','실시간 기상 정보',{back:true,home:true});
    const node = tpl('tpl-weather');
    mount(node);
    initWeather();
    return;
  }

  if(r==='tasks' && !a){
    setTop('단위작업 위험요인','Task Level',{back:true,home:true});
    const node = tpl('tpl-tasklist');
    const list = node.querySelector('#taskList');
    TBM_DATA.taskGroups.forEach(g=>{
      const link = document.createElement('a');
      link.className = 'card nav';
      link.href = `#/tasks/${g.id}`;
      link.innerHTML = `
        <div class="card-icon gear">⚠️</div>
        <div class="card-body">
          <div class="card-title">${g.title}</div>
          <div class="card-sub" style="color:#ef4444;font-weight:1000;margin-top:6px">위험요인 ${g.hazards}개</div>
        </div>
        <div class="card-arrow">›</div>
      `;
      list.appendChild(link);
    });
    mount(node);
    return;
  }

  if(r==='tasks' && a){
    const task = TBM_DATA.tasks[a];
    if(!task){ location.hash = '#/tasks'; return; }
    setTop(task.title,'',{back:true,home:true});
    const node = tpl('tpl-taskdetail');
    const cards = node.querySelector('#hazCards');
    const total = task.hazards.length;

    task.hazards.forEach(h=>{
      const card = document.createElement('div');
      card.className = 'hcard';
      card.innerHTML = `
        <div class="hhead">
          <div class="hicon">⚠️</div>
          <div class="htitle">${h.title}</div>
        </div>
        <div class="hbody">
          <div class="hlabel">안전대책</div>
          <ul>${h.bullets.map(x=>`<li>${x}</li>`).join('')}</ul>
        </div>
      `;
      cards.appendChild(card);
    });

    node.querySelector('#barText').textContent = `0/${total}`;
    node.querySelector('#barFill').style.width = `0%`;

    node.querySelector('#btnToTBM').onclick = ()=>{
      if(!tbmState) tbmState = blankTBM();
      tbmApplyFromTask(task);
      location.hash = '#/tbm/new';
    };

    mount(node);
    return;
  }

  if(r==='tbm' && (a==='new' || a==='edit')){
    setTop('TBM 회의록','작성/저장/출력',{back:true,home:true});
    const node = tpl('tpl-tbm');
    mount(node);
    initTBMEditor(a, b);
    return;
  }

  if(r==='tbm' && a==='list'){
    setTop('저장된 TBM','불러오기/삭제',{back:true,home:true, action:{label:'새로 작성', onClick:()=>location.hash='#/tbm/new'}});
    const node = tpl('tpl-tbm');
    mount(node);
    initTBMEditor('list','');
    return;
  }

  location.hash = '#/';
}

window.addEventListener('hashchange', route);
route();

/* ---------- Weather (Open-Meteo, keyless) ---------- */
async function initWeather(){
  const btnCity = document.getElementById('btnCity');
  const btnHere = document.getElementById('btnHere');

  const cityName = '안산시';
  const city = TBM_DATA.cities[cityName];

  btnCity.onclick = ()=>{
    btnCity.classList.add('active');
    btnHere.classList.remove('active');
    loadWeather(cityName, city.lat, city.lon);
  };
  btnHere.onclick = ()=>{
    btnHere.classList.add('active');
    btnCity.classList.remove('active');
    if(!navigator.geolocation){ alert('위치 권한을 사용할 수 없습니다.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos)=>loadWeather('현재 위치', pos.coords.latitude, pos.coords.longitude),
      ()=>alert('위치 권한이 필요합니다.')
    );
  };

  loadWeather(cityName, city.lat, city.lon);
}

async function loadWeather(label, lat, lon){
  const wxLoc = document.getElementById('wxLoc');
  const wxTime = document.getElementById('wxTime');
  const wxIcon = document.getElementById('wxIcon');
  const wxFeel = document.getElementById('wxFeel');
  const wxDesc = document.getElementById('wxDesc');
  const wxHum = document.getElementById('wxHum');
  const wxWind = document.getElementById('wxWind');
  const wxTemp = document.getElementById('wxTemp');
  const pm10 = document.getElementById('pm10');
  const pm25 = document.getElementById('pm25');
  const pm10q = document.getElementById('pm10q');
  const pm25q = document.getElementById('pm25q');
  const alertCold = document.getElementById('alertCold');
  const alertWind = document.getElementById('alertWind');

  wxLoc.textContent = label;
  wxTime.textContent = '불러오는 중...';

  const wurl = new URL('https://api.open-meteo.com/v1/forecast');
  wurl.searchParams.set('latitude', lat);
  wurl.searchParams.set('longitude', lon);
  wurl.searchParams.set('current', 'temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code');
  wurl.searchParams.set('timezone', 'Asia/Seoul');

  const aurl = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
  aurl.searchParams.set('latitude', lat);
  aurl.searchParams.set('longitude', lon);
  aurl.searchParams.set('current', 'pm10,pm2_5');
  aurl.searchParams.set('timezone', 'Asia/Seoul');

  const [wres, ares] = await Promise.all([fetch(wurl), fetch(aurl)]);
  const w = await wres.json();
  const a = await ares.json();

  const cur = w.current;
  const aq = a.current;

  const feel = Math.round(cur.apparent_temperature);
  const wind = cur.wind_speed_10m;
  const temp = Math.round(cur.temperature_2m);

  wxTime.textContent = `현재 ${cur.time.replace('T',' ')} 기준`;
  wxIcon.textContent = iconFrom(cur.weather_code);
  wxFeel.textContent = `체감 ${feel}°`;
  wxDesc.textContent = '실시간';
  wxHum.textContent = `${cur.relative_humidity_2m}%`;
  wxWind.textContent = `${wind.toFixed(1)} m/s`;
  wxTemp.textContent = `${temp}°`;

  const v10 = aq?.pm10;
  const v25 = aq?.pm2_5;
  pm10.textContent = v10==null ? '-' : Math.round(v10);
  pm25.textContent = v25==null ? '-' : Math.round(v25);
  pm10q.textContent = v10==null ? '-' : qPM(v10);
  pm25q.textContent = v25==null ? '-' : qPM(v25);

  alertCold.hidden = !(feel <= -10);
  alertWind.hidden = !(wind >= 10);
}

/* ---------- TBM editor ---------- */
function initTBMEditor(mode, id){
  // pick current state
  if(mode==='edit' && id){
    const found = loadAll().find(x=>x.id===id);
    tbmState = found ? found : blankTBM();
  } else if(!tbmState) {
    tbmState = blankTBM();
  }

  // header counters
  const todayEl = document.getElementById('tbmToday');
  const countEl = document.getElementById('tbmCount');
  todayEl.textContent = fmtDate(new Date());
  countEl.textContent = loadAll().length;

  // template select
  const tplSel = document.getElementById('template');
  tplSel.innerHTML = '<option value="">선택</option>';
  Object.keys(TBM_DATA.tbmTemplates).forEach(k=>{
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = k.replace('_',' ');
    tplSel.appendChild(opt);
  });

  // hazard select
  const hzSel = document.getElementById('hazardPick');
  hzSel.innerHTML = '<option value="">선택해서 추가</option>';
  TBM_DATA.hazards.forEach(h=>{
    const opt = document.createElement('option');
    opt.value = h.k;
    opt.textContent = `${h.k} · ${h.d}`;
    hzSel.appendChild(opt);
  });

  // checklist
  const cl = document.getElementById('checklist');
  cl.innerHTML = '';
  TBM_DATA.checklist.forEach(c=>{
    const div = document.createElement('div');
    div.className = 'citem';
    div.innerHTML = `
      <input type="checkbox" data-id="${c.id}" ${tbmState.checks?.[c.id] ? 'checked':''}>
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
          <div class="ctitle">${c.t}</div>
          <span class="ctag">${c.tag}</span>
        </div>
        <div class="cdesc">${c.d}</div>
      </div>
    `;
    cl.appendChild(div);
  });
  cl.querySelectorAll('input[type=checkbox]').forEach(cb=>{
    cb.addEventListener('change', ()=>{
      tbmState.checks = tbmState.checks || {};
      tbmState.checks[cb.dataset.id] = cb.checked;
    });
  });

  // bind inputs
  const jobName = document.getElementById('jobName');
  const locationEl = document.getElementById('location');
  const datetimeEl = document.getElementById('datetime');
  const workDesc = document.getElementById('workDesc');
  const hazards = document.getElementById('hazards');
  const measures = document.getElementById('measures');
  const attendees = document.getElementById('attendees');
  const memo = document.getElementById('memo');

  jobName.value = tbmState.jobName || '';
  locationEl.value = tbmState.location || '';
  datetimeEl.value = tbmState.datetime || nowLocalInput();
  tplSel.value = tbmState.template || '';
  workDesc.value = tbmState.workDesc || '';
  hazards.value = tbmState.hazards || '';
  measures.value = tbmState.measures || '';
  attendees.value = tbmState.attendees || '';
  memo.value = tbmState.memo || '';

  tplSel.addEventListener('change', ()=>{
    tbmState.template = tplSel.value;
    const defs = TBM_DATA.tbmTemplates[tplSel.value] || [];
    hazards.value = defs.join("\n");
    tbmState.hazards = hazards.value;
  });

  document.getElementById('btnAddHazard').onclick = ()=>{
    const pick = hzSel.value;
    const custom = (document.getElementById('hazardCustom').value||'').trim();
    const lines = (hazards.value||'').trim();
    const arr = lines ? lines.split("\n") : [];
    if(pick && !arr.includes(pick)) arr.push(pick);
    if(custom && !arr.includes(custom)) arr.push(custom);
    hazards.value = arr.join("\n");
    tbmState.hazards = hazards.value;
    hzSel.value = '';
    document.getElementById('hazardCustom').value = '';
  };

  document.getElementById('btnClearHaz').onclick = ()=>{
    hazards.value = '';
    measures.value = '';
    tbmState.hazards = '';
    tbmState.measures = '';
  };

  document.getElementById('btnGenMeasures').onclick = ()=>{
    tbmState.hazards = hazards.value;
    measures.value = genMeasuresFromHazards(hazards.value);
    tbmState.measures = measures.value;
  };

  // signature canvas
  const canvas = document.getElementById('sig');
  const ctx = canvas.getContext('2d');
  const resizeCanvas = ()=>{
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f172a";
  };
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  let drawing=false, last=null;
  const pos = (e)=>{
    const r = canvas.getBoundingClientRect();
    const x = (e.touches?e.touches[0].clientX:e.clientX) - r.left;
    const y = (e.touches?e.touches[0].clientY:e.clientY) - r.top;
    return {x,y};
  };
  const start=(e)=>{ drawing=true; last=pos(e); e.preventDefault(); };
  const move=(e)=>{
    if(!drawing) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.x,last.y);
    ctx.lineTo(p.x,p.y);
    ctx.stroke();
    last=p;
    e.preventDefault();
  };
  const end=()=>{ drawing=false; last=null; };

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, {passive:false});
  canvas.addEventListener('touchmove', move, {passive:false});
  canvas.addEventListener('touchend', end);

  const sigClear = ()=>{
    ctx.clearRect(0,0,canvas.width,canvas.height);
    tbmState.signature = "";
  };
  document.getElementById('btnSigClear').onclick = sigClear;

  // restore signature
  if(tbmState.signature){
    const img = new Image();
    img.onload = ()=>{
      ctx.drawImage(img, 0, 0, canvas.getBoundingClientRect().width, canvas.getBoundingClientRect().height);
    };
    img.src = tbmState.signature;
  }

  // photos
  const thumbs = document.getElementById('thumbs');
  const renderThumbs = ()=>{
    thumbs.innerHTML='';
    (tbmState.photos||[]).slice(0,6).forEach(src=>{
      const im = document.createElement('img');
      im.src = src;
      thumbs.appendChild(im);
    });
  };
  renderThumbs();

  document.getElementById('photos').addEventListener('change', async (e)=>{
    const files=[...e.target.files].slice(0,6);
    const reads = files.map(f=>new Promise((res,rej)=>{
      const r = new FileReader();
      r.onload=()=>res(r.result);
      r.onerror=rej;
      r.readAsDataURL(f);
    }));
    tbmState.photos = await Promise.all(reads);
    renderThumbs();
  });

  // save list
  const savedList = document.getElementById('savedList');
  const search = document.getElementById('search');
  const renderSavedList = ()=>{
    const q = (search.value||'').trim().toLowerCase();
    const arr = loadAll().filter(x=>{
      if(!q) return true;
      return (x.jobName||'').toLowerCase().includes(q) || (x.location||'').toLowerCase().includes(q);
    });
    savedList.innerHTML = '';
    if(!arr.length){
      const empty = document.createElement('div');
      empty.className = 'desc';
      empty.textContent = '저장된 TBM이 없습니다.';
      savedList.appendChild(empty);
      return;
    }
    arr.slice(0,50).forEach(x=>{
      const row = document.createElement('div');
      row.className = 'card';
      const dt = x.datetime ? new Date(x.datetime).toLocaleString() : new Date(x.createdAt).toLocaleString();
      row.innerHTML = `
        <div class="card-body">
          <div class="card-title">${escapeHtml(x.jobName||'(무제)')}</div>
          <div class="card-sub">${escapeHtml(x.location||'')} · ${dt}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="pill-btn" data-load="${x.id}">불러오기</button>
          <button class="pill-btn danger" data-del="${x.id}">삭제</button>
        </div>
      `;
      savedList.appendChild(row);
    });

    savedList.querySelectorAll('button[data-load]').forEach(b=>{
      b.onclick = ()=>{
        const x = loadAll().find(a=>a.id===b.dataset.load);
        if(!x) return;
        tbmState = x;
        initTBMEditor('edit', x.id);
        window.scrollTo(0,0);
      };
    });
    savedList.querySelectorAll('button[data-del]').forEach(b=>{
      b.onclick = ()=>{
        removeOne(b.dataset.del);
        countEl.textContent = loadAll().length;
        renderSavedList();
      };
    });
  };
  if(search) search.oninput = renderSavedList;
  renderSavedList();

  // pull UI to state helper
  const pullFromUI = ()=>{
    tbmState.jobName = jobName.value.trim();
    tbmState.location = locationEl.value.trim();
    tbmState.datetime = datetimeEl.value;
    tbmState.template = tplSel.value;
    tbmState.workDesc = workDesc.value.trim();
    tbmState.hazards = hazards.value.trim();
    tbmState.measures = measures.value.trim();
    tbmState.attendees = attendees.value.trim();
    tbmState.memo = memo.value.trim();
    // signature snapshot
    const data = canvas.toDataURL('image/png');
    // if canvas blank, keep empty
    tbmState.signature = data;
  };

  document.getElementById('btnSave').onclick = ()=>{
    pullFromUI();
    if(!tbmState.jobName){ alert('작업명을 입력하세요'); return; }
    if(!tbmState.location){ alert('장소를 입력하세요'); return; }
    upsert(tbmState);
    countEl.textContent = loadAll().length;
    renderSavedList();
    alert('저장했습니다');
  };

  document.getElementById('btnCopy').onclick = ()=>{
    const arr = loadAll();
    if(!arr.length){ alert('복사할 TBM이 없습니다'); return; }
    const latest = arr[0];
    const copied = JSON.parse(JSON.stringify(latest));
    copied.id = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
    copied.createdAt = new Date().toISOString();
    copied.datetime = nowLocalInput();
    tbmState = copied;
    initTBMEditor('edit', copied.id);
    window.scrollTo(0,0);
    alert('이전 TBM을 복사했습니다');
  };

  document.getElementById('btnPrint').onclick = ()=>{
    pullFromUI();
    if(!tbmState.jobName){ alert('작업명을 입력하세요'); return; }
    if(!tbmState.location){ alert('장소를 입력하세요'); return; }
    window.print();
  };
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}
