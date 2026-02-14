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

  if(r==='streetview'){
    setTop('거리뷰(현장 확인)','위치기반 바로가기',{back:true,home:true});
    const node = tpl('tpl-streetview');
    mount(node);
    initStreetView();
    return;
  }


  if(r==='emergency'){
    setTop('응급의료시설','위치기반 바로가기',{back:true,home:true});
    const node = tpl('tpl-emergency');
    mount(node);
    initEmergency();
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
  if(label==='현재 위치'){
    // 지역명 표시
    reverseGeocode(lat, lon).then(name=>{ wxLoc.textContent = name; }).catch(()=>{});
  }
  wxTime.textContent = '불러오는 중...';

  const wurl = new URL('https://api.open-meteo.com/v1/forecast');
  wurl.searchParams.set('latitude', lat);
  wurl.searchParams.set('longitude', lon);
  wurl.searchParams.set('current', 'temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code');
  wurl.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max');
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

  // 주간 날씨 렌더
  renderWeekly(w, document.getElementById('weeklyList'));

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


/* ---------- Emergency facilities (maps deep links) ---------- */
function initEmergency(){
  const emgLoc = document.getElementById('emgLoc');
  const emgCoord = document.getElementById('emgCoord');
  const btnGetLoc = document.getElementById('btnGetLoc');
  const btnCopy = document.getElementById('btnCopyCoord');
  const emgStatus = document.getElementById('emgStatus');
  const emgResults = document.getElementById('emgResults');

  const linkGoogle = document.getElementById('linkGoogle');
  const linkNaver = document.getElementById('linkNaver');
  const linkKakao = document.getElementById('linkKakao');
  const linkEgen = document.getElementById('linkEgen');

  // Defaults (no coord): generic search
  linkGoogle.href = 'https://www.google.com/maps/search/%EC%9D%91%EA%B8%89%EC%8B%A4';
  linkNaver.href = 'https://m.map.naver.com/search2/search.naver?query=%EC%9D%91%EA%B8%89%EC%8B%A4';
  linkKakao.href = 'https://m.map.kakao.com/actions/searchView?q=%EC%9D%91%EA%B8%89%EC%8B%A4';
  linkEgen.href = 'https://www.e-gen.or.kr/egen/search.do';

  const setLinks = (lat, lon)=>{
    const z = 14;
    linkGoogle.href = `https://www.google.com/maps/search/%EC%9D%91%EA%B8%89%EC%8B%A4/@${lat},${lon},${z}z`;
    // Naver mobile map supports x(lon), y(lat) params in many cases
    linkNaver.href = `https://m.map.naver.com/search2/search.naver?query=%EC%9D%91%EA%B8%89%EC%8B%A4&sm=hty&style=v5&x=${lon}&y=${lat}`;
    // Kakao doesn't reliably take coords for search; still provide query
    linkKakao.href = `https://m.map.kakao.com/actions/searchView?q=%EC%9D%91%EA%B8%89%EC%8B%A4`;
    // E-GEN general entry (user can search)
    linkEgen.href = 'https://www.e-gen.or.kr/egen/search.do';
  };

  const fmt = (n)=> (Math.round(n*1000000)/1000000).toFixed(6);

  const apply = (lat, lon)=>{
    emgLoc.textContent = '현재 위치';
    emgCoord.textContent = `${fmt(lat)}, ${fmt(lon)}`;
    setLinks(lat, lon);
    fetchOverpassEmergency(lat, lon, emgStatus, emgResults);
  };

  const getLoc = ()=>{
    if(!navigator.geolocation){
      alert('이 기기에서 위치 기능을 사용할 수 없습니다.');
      return;
    }
    emgLoc.textContent = '위치 확인 중...';
    navigator.geolocation.getCurrentPosition(
      (pos)=>apply(pos.coords.latitude, pos.coords.longitude),
      (err)=>{
        emgLoc.textContent = '미확인';
        if(emgStatus) emgStatus.textContent = '위치 권한이 필요합니다.';
        if(emgResults) emgResults.innerHTML = '';
        alert('위치 권한이 필요합니다. iOS 설정 > Safari > 위치에서 허용해주세요.');
      },
      { enableHighAccuracy:true, timeout:12000, maximumAge: 300000 }
    );
  };

  btnGetLoc.onclick = getLoc;
  btnCopy.onclick = async ()=>{
    const txt = emgCoord.textContent;
    if(!txt || txt==='-'){ alert('먼저 위치를 가져오세요.'); return; }
    try{
      await navigator.clipboard.writeText(txt);
      alert('좌표를 복사했습니다.');
    }catch{
      // fallback
      const ta = document.createElement('textarea');
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      alert('좌표를 복사했습니다.');
    }
  };

  // auto try once
  setTimeout(getLoc, 200);
}


/* ---------- Overpass: nearest emergency facilities (keyless) ---------- */
function haversineKm(lat1, lon1, lat2, lon2){
  const R = 6371;
  const toRad = (d)=>d*Math.PI/180;
  const dLat = toRad(lat2-lat1);
  const dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

async function fetchOverpassEmergency(lat, lon, statusEl, resultsEl){
  if(statusEl) statusEl.textContent = '주변 응급의료시설 검색 중...';
  if(resultsEl) resultsEl.innerHTML = '';

  // Overpass QL: hospitals + emergency
  const radius = 8000; // 8km
  const query = `
  [out:json][timeout:25];
  (
    node(around:${radius},${lat},${lon})["amenity"="hospital"];
    way(around:${radius},${lat},${lon})["amenity"="hospital"];
    relation(around:${radius},${lat},${lon})["amenity"="hospital"];

    node(around:${radius},${lat},${lon})["emergency"="yes"];
    way(around:${radius},${lat},${lon})["emergency"="yes"];
    relation(around:${radius},${lat},${lon})["emergency"="yes"];

    node(around:${radius},${lat},${lon})["healthcare"="hospital"];
    way(around:${radius},${lat},${lon})["healthcare"="hospital"];
    relation(around:${radius},${lat},${lon})["healthcare"="hospital"];
  );
  out center tags;
  `;

  try{
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=UTF-8'},
      body: query
    });
    if(!res.ok) throw new Error('Overpass error');
    const data = await res.json();

    const items = (data.elements||[]).map(el=>{
      const t = el.tags || {};
      const name = t.name || t['name:ko'] || t.operator || '의료시설';
      const phone = t.phone || t['contact:phone'] || t['phone:mobile'] || '';
      const addr = t['addr:full'] || [t['addr:city'], t['addr:district'], t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ') || '';
      const lat2 = el.lat ?? el.center?.lat;
      const lon2 = el.lon ?? el.center?.lon;
      const dist = (lat2!=null && lon2!=null) ? haversineKm(lat, lon, lat2, lon2) : 9999;
      return {name, phone, addr, lat:lat2, lon:lon2, dist};
    }).filter(x=>x.lat!=null && x.lon!=null);

    // Deduplicate by name+coords
    const seen = new Set();
    const uniq = [];
    for(const it of items){
      const key = `${it.name}|${it.lat.toFixed(5)}|${it.lon.toFixed(5)}`;
      if(seen.has(key)) continue;
      seen.add(key);
      uniq.push(it);
    }

    uniq.sort((a,b)=>a.dist-b.dist);

    const top = uniq.slice(0, 7);
    if(!top.length){
      if(statusEl) statusEl.textContent = '주변에서 시설을 찾지 못했습니다. 아래 지도 검색을 사용하세요.';
      return;
    }

    if(statusEl) statusEl.textContent = `가까운 순서로 ${top.length}개 표시 (반경 ${radius/1000}km)`;

    if(resultsEl){
      top.forEach(it=>{
        const card = document.createElement('div');
        card.className = 'hcard';
        const distText = it.dist < 1 ? `${Math.round(it.dist*1000)}m` : `${it.dist.toFixed(1)}km`;
        const safePhone = (it.phone||'').replace(/\s+/g,'');
        const gdir = `https://www.google.com/maps/dir/?api=1&destination=${it.lat},${it.lon}`;
        const gview = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(it.name)}&query_place_id=`;
        card.innerHTML = `
          <div class="hhead">
            <div class="hicon">🏥</div>
            <div style="flex:1;min-width:0">
              <div class="htitle">${escapeHtml(it.name)} <span class="muted small">· ${distText}</span></div>
              <div class="muted small" style="margin-top:4px">${escapeHtml(it.addr||'주소 정보 없음')}</div>
              ${safePhone ? `<div class="muted small" style="margin-top:4px">☎ ${escapeHtml(it.phone)}</div>` : ``}
            </div>
          </div>
          <div class="mini-row">
            <a class="mini-btn primary" href="${gdir}" target="_blank" rel="noopener">길찾기</a>
            ${safePhone ? `<a class="mini-btn" href="tel:${safePhone}">전화</a>` : `<span class="mini-btn danger">전화정보 없음</span>`}
            <a class="mini-btn" href="https://m.map.naver.com/search2/search.naver?query=${encodeURIComponent(it.name)}" target="_blank" rel="noopener">네이버</a>
            <a class="mini-btn" href="https://m.map.kakao.com/actions/searchView?q=${encodeURIComponent(it.name)}" target="_blank" rel="noopener">카카오</a>
          </div>
        `;
        resultsEl.appendChild(card);
      });
    }
  }catch(e){
    if(statusEl) statusEl.textContent = '검색에 실패했습니다(네트워크/제한). 아래 지도 검색을 사용하세요.';
  }
}


/* ---------- Reverse geocoding (OSM Nominatim, keyless) ---------- */
async function reverseGeocode(lat, lon){
  // Nominatim usage: add user-agent via fetch headers
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=ko`;
  try{
    const res = await fetch(url, {headers:{'Accept':'application/json'}});
    if(!res.ok) throw new Error('reverse failed');
    const j = await res.json();
    const a = j.address || {};
    // pick best name
    return a.city || a.town || a.village || a.county || a.state || j.name || '현재 위치';
  }catch(e){
    return '현재 위치';
  }
}


/* ---------- Weekly forecast rendering ---------- */
function renderWeekly(wjson, container){
  if(!container) return;
  container.innerHTML = '';
  const d = wjson.daily;
  if(!d || !d.time) {
    container.innerHTML = '<div class="muted small">주간 예보를 불러오지 못했습니다.</div>';
    return;
  }
  const times = d.time;
  const tmax = d.temperature_2m_max || [];
  const tmin = d.temperature_2m_min || [];
  const wcode = d.weather_code || [];
  const pop = d.precipitation_probability_max || [];
  const daysKo = ['일','월','화','수','목','금','토'];

  for(let i=0;i<Math.min(times.length, 7);i++){
    const dt = new Date(times[i] + 'T00:00:00');
    const day = daysKo[dt.getDay()];
    const mm = String(dt.getMonth()+1).padStart(2,'0');
    const dd = String(dt.getDate()).padStart(2,'0');
    const icon = iconFrom(wcode[i]);
    const hi = (tmax[i]!=null) ? Math.round(tmax[i]) : '-';
    const lo = (tmin[i]!=null) ? Math.round(tmin[i]) : '-';
    const p = (pop[i]!=null) ? `${Math.round(pop[i])}%` : '-';
    const row = document.createElement('div');
    row.className = 'wrow';
    row.innerHTML = `
      <div class="wleft">
        <div class="wday">${day} ${mm}/${dd}</div>
        <div class="wicon">${icon}</div>
        <div class="wdesc">최저/최고</div>
      </div>
      <div class="wright">
        <div class="whilo">${lo}° / ${hi}°</div>
        <div class="wpop">${p}</div>
      </div>
    `;
    container.appendChild(row);
  }
}


/* ---------- Street View / Road View links ---------- */
function initStreetView(){
  const svLoc = document.getElementById('svLoc');
  const svCoord = document.getElementById('svCoord');
  const btn = document.getElementById('btnSvGetLoc');
  const btnCopy = document.getElementById('btnSvCopy');
  const links = document.getElementById('svLinks');

  const fmt = (n)=> (Math.round(n*1000000)/1000000).toFixed(6);

  const renderLinks = (lat, lon, placeName)=>{
    links.innerHTML = '';
    const googlePano = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}`;
    const googleMap = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
    const naverRoad = `https://m.map.naver.com/panorama/${lon},${lat}`; // may open roadview when available
    const naverSearch = `https://m.map.naver.com/search2/search.naver?query=${encodeURIComponent(placeName||'현장')}&x=${lon}&y=${lat}`;
    const kakaoRoad = `https://map.kakao.com/link/roadview/${lat},${lon}`; // opens roadview if available
    const kakaoMap = `https://map.kakao.com/link/map/${encodeURIComponent(placeName||'현장')},${lat},${lon}`;

    const make = (title, sub, href, icon)=>{
      const a = document.createElement('a');
      a.className = 'card nav';
      a.target = '_blank';
      a.rel = 'noopener';
      a.href = href;
      a.innerHTML = `
        <div class="card-icon cloud">${icon}</div>
        <div class="card-body">
          <div class="card-title">${title}</div>
          <div class="card-sub">${sub}</div>
        </div>
        <div class="card-arrow">›</div>
      `;
      return a;
    };

    links.appendChild(make('Google 거리뷰', 'Street View(가능 시) 바로 열기', googlePano, '👁️'));
    links.appendChild(make('Google 지도', '현재 좌표 지도 보기', googleMap, '🗺️'));
    links.appendChild(make('네이버 파노라마', '가능 시 로드뷰 열기', naverRoad, '🧭'));
    links.appendChild(make('카카오 로드뷰', '가능 시 로드뷰 열기', kakaoRoad, '📍'));
    links.appendChild(make('네이버 검색', '현장 주변 검색', naverSearch, '🔎'));
    links.appendChild(make('카카오 지도', '현장 지도 보기', kakaoMap, '🗺️'));
  };

  const apply = async (lat, lon)=>{
    const name = await reverseGeocode(lat, lon);
    svLoc.textContent = name;
    svCoord.textContent = `${fmt(lat)}, ${fmt(lon)}`;
    renderLinks(lat, lon, name);
  };

  const getLoc = ()=>{
    if(!navigator.geolocation){ alert('이 기기에서 위치 기능을 사용할 수 없습니다.'); return; }
    svLoc.textContent = '위치 확인 중...';
    navigator.geolocation.getCurrentPosition(
      (pos)=>apply(pos.coords.latitude, pos.coords.longitude),
      ()=>{ svLoc.textContent = '미확인'; alert('위치 권한이 필요합니다.'); },
      { enableHighAccuracy:true, timeout:12000, maximumAge:300000 }
    );
  };

  btn.onclick = getLoc;
  btnCopy.onclick = async ()=>{
    const txt = svCoord.textContent;
    if(!txt || txt==='-'){ alert('먼저 위치를 가져오세요.'); return; }
    try{ await navigator.clipboard.writeText(txt); alert('좌표를 복사했습니다.'); }
    catch{
      const ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); ta.remove(); alert('좌표를 복사했습니다.');
    }
  };

  setTimeout(getLoc, 200);
}

// --- 응급의료시설(공공데이터포털/응급실 실시간 가용정보) ---
// ⚠️ GitHub Pages에서는 serviceKey를 프론트에 넣으면 공개됩니다.
// 따라서 Cloudflare Worker(또는 서버리스 프록시)에 SERVICE_KEY를 저장하고,
// 여기서는 Worker URL만 호출하세요.
async function loadEmergencyFacilities() {
  const ul = document.getElementById("emergencyList");
  if (!ul) return;

  ul.innerHTML = "불러오는 중...";

  // ✅ 여기를 주인님 Worker 배포 URL로 교체하세요 (키는 Worker에만!)
  // 예: https://xxxxxx.workers.dev/?STAGE1=경기도&STAGE2=안산시&numOfRows=200
  const proxyUrl = "https://YOUR-WORKER.workers.dev/?STAGE1=경기도&STAGE2=안산시&numOfRows=200";

  try {
    const res = await fetch(proxyUrl, { cache: "no-store" });
    if (!res.ok) throw new Error("API 응답 오류: " + res.status);
    const data = await res.json();

    const items = data?.response?.body?.items?.item || [];

    // ✅ 응급실 병상(hvec) 보유(>0)만 최대 7개
    const filtered = items
      .filter(it => Number(it?.hvec || 0) > 0)
      .slice(0, 7);

    ul.innerHTML = "";

    if (filtered.length === 0) {
      ul.innerHTML = "<li>표시할 응급의료시설이 없습니다.</li>";
      return;
    }

    filtered.forEach(it => {
      const name = it?.dutyname || "응급의료기관";
      const addr = it?.dutyaddr || "";
      const tel = it?.dutytel3 ? ` / ${it.dutytel3}` : "";
      const li = document.createElement("li");
      li.innerHTML = `<strong>${name}</strong>${tel}<br>${addr}`;
      ul.appendChild(li);
    });
  } catch (e) {
    ul.innerHTML = `<li>응급의료시설을 불러오지 못했습니다. (프록시 URL 확인 필요)</li>`;
    console.error(e);
  }
}

document.addEventListener("DOMContentLoaded", loadEmergencyFacilities);
