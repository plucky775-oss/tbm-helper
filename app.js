/* 통합형 TBM도우미: 지식(규정/작업카드) + TBM 회의록 작성/저장/출력 */
const app = document.getElementById('app');
const btnBack = document.getElementById('btnBack');
const btnHome = document.getElementById('btnHome');
const btnAction = document.getElementById('btnAction');
const pageTitle = document.getElementById('pageTitle');
const pageSub = document.getElementById('pageSub');



const CONTACTS_KEY = "TBM_HELPER_CONTACTS_V1";
const CONTACTS_FOLD_KEY = "TBM_HELPER_CONTACTS_FOLD_V1";

// ---- Invite code gate (초대코드) ----
// 정적 웹앱(예: GitHub Pages)에서도 쓸 수 있는 "간이" 접근제어입니다.
// 아래 INVITE_CODES에 원하는 코드를 넣으면 됩니다(여러 개 가능).
// ※ 코드를 바꾸면(문자 하나라도) 기존 기기 인증도 자동으로 무효화됩니다.
const INVITE_CODES = ['ansan']; // TODO: 원하는 초대코드로 변경(예: 'ANSAN-2026')
const INVITE_TOKEN_KEY = "TBM_HELPER_INVITE_TOKEN_V1";
const INVITE_PENDING_HASH_KEY = "TBM_HELPER_INVITE_PENDING_HASH_V1";

function fnv1aHex(str){
  let h = 0x811c9dc5;
  for(let i=0;i<str.length;i++){
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ('00000000' + (h >>> 0).toString(16)).slice(-8);
}
function normCode(s){
  return String(s||'').trim().toUpperCase();
}
function tokenForCode(code){
  return 'ok_' + fnv1aHex(normCode(code));
}
function storageGet(key){
  try{ return localStorage.getItem(key); }catch(e){}
  try{ return sessionStorage.getItem(key); }catch(e){}
  return null;
}
function storageSet(key, val){
  try{ localStorage.setItem(key, val); return; }catch(e){}
  try{ sessionStorage.setItem(key, val); }catch(e){}
}
function storageDel(key){
  try{ localStorage.removeItem(key); }catch(e){}
  try{ sessionStorage.removeItem(key); }catch(e){}
}

function isInviteAuthorized(){
  const t = storageGet(INVITE_TOKEN_KEY) || '';
  return INVITE_CODES.some(c => t === tokenForCode(c));
}
function rememberPendingHash(h){
  if(!h) return;
  storageSet(INVITE_PENDING_HASH_KEY, h);
}
function consumePendingHash(){
  const h = storageGet(INVITE_PENDING_HASH_KEY);
  if(h) storageDel(INVITE_PENDING_HASH_KEY);
  return h;
}

function renderInviteGate(){
  setTop('초대코드', '코드를 입력해야 앱을 사용할 수 있습니다.', {back:false, home:false});

  const frag = document.createDocumentFragment();
  const sec = document.createElement('section');
  sec.className = 'panel';
  sec.innerHTML = `
    <div class="desc">
      이 앱은 <b>초대코드</b> 입력 후 사용할 수 있습니다.<br/>
      <span class="muted small">코드가 없으면 관리자에게 문의하세요.사내번호:0344-231</span>
    </div>

    <div class="bigcard">
      <div class="card-title">초대코드 입력</div>
      <input id="inviteCode"
        type="password"
        placeholder="초대코드를 입력하세요"
        autocomplete="off"
        autocapitalize="characters"
        autocorrect="off"
        spellcheck="false"
        inputmode="text"
        enterkeyhint="done"
      />
      <div class="toolbar" style="margin-top:10px">
        <button class="pill-btn primary" id="inviteOk">확인</button>
        <button class="pill-btn" id="inviteClear">초기화</button>
      </div>
      <div id="inviteMsg" class="muted small" style="margin-top:10px"></div>
    </div>
  `;
  frag.appendChild(sec);
  mount(frag);

  const input = sec.querySelector('#inviteCode');
  const msg = sec.querySelector('#inviteMsg');
  const ok = sec.querySelector('#inviteOk');
  const clear = sec.querySelector('#inviteClear');

  const setMsg = (t, type)=>{
    msg.textContent = t || '';
    msg.className = type ? `alert ${type}` : 'muted small';
    msg.style.marginTop = '10px';
  };

  const tryUnlock = ()=>{
    const entered = normCode(input.value);
    if(!entered){
      setMsg('초대코드를 입력하세요.', 'warn');
      try{ input.focus(); }catch(e){}
      return;
    }
    const valid = INVITE_CODES.some(c => normCode(c) === entered);
    if(!valid){
      setMsg('초대코드가 올바르지 않습니다.', 'danger');
      try{ input.select(); input.focus(); }catch(e){}
      return;
    }

    // 승인 저장 (코드가 바뀌면 자동으로 무효화되도록 token 형태로 저장)
    storageSet(INVITE_TOKEN_KEY, tokenForCode(entered));

    setMsg('확인되었습니다. 앱으로 이동합니다...', '');
    const pending = consumePendingHash() || '#/';
    if(location.hash !== pending){
      location.hash = pending;
    } else {
      try{ route(); }catch(e){}
    }
  };

  ok.onclick = tryUnlock;
  clear.onclick = ()=>{
    input.value = '';
    setMsg('', '');
    try{ input.focus(); }catch(e){}
  };

  input.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter'){
      e.preventDefault();
      tryUnlock();
    }
  });

  setTimeout(()=>{ try{ input.focus(); }catch(e){} }, 60);
}

// ---- Return intent (e.g., after opening external navigation apps) ----
const RETURN_HASH_KEY = "TBM_HELPER_RETURN_HASH";
const RETURN_TS_KEY = "TBM_HELPER_RETURN_TS";

function setReturnHash(hash){
  try{
    sessionStorage.setItem(RETURN_HASH_KEY, hash);
    sessionStorage.setItem(RETURN_TS_KEY, String(Date.now()));
  }catch(e){}
}

function consumeReturnHash(){
  try{
    const h = sessionStorage.getItem(RETURN_HASH_KEY);
    const ts = Number(sessionStorage.getItem(RETURN_TS_KEY) || 0);
    // 유효기간(10분) — 오래된 값으로 엉뚱한 화면 이동 방지
    if(h && ts && (Date.now() - ts < 10*60*1000)){
      sessionStorage.removeItem(RETURN_HASH_KEY);
      sessionStorage.removeItem(RETURN_TS_KEY);
      return h;
    }
    // stale cleanup
    if(h) sessionStorage.removeItem(RETURN_HASH_KEY);
    if(ts) sessionStorage.removeItem(RETURN_TS_KEY);
  }catch(e){}
  return null;
}

function applyReturnHash(){
  const h = consumeReturnHash();
  if(!h) return;
  if(location.hash !== h){
    location.hash = h;
  } else {
    // hash가 이미 같으면 라우팅이 안 일어날 수 있어 강제로 한번 렌더
    try{ route(); }catch(e){}
  }
}

window.addEventListener('pageshow', applyReturnHash);
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) applyReturnHash(); });
window.addEventListener('focus', applyReturnHash);

/* ---------- Splash (first screen) ---------- */
const SPLASH_SHOWN_KEY = "TBM_HELPER_SPLASH_SHOWN_V1";

function initSplash(){
  const splash = document.getElementById('splash');
  if(!splash) return;

  // 외부 내비앱(티맵/카카오맵 등)에서 복귀하는 경우엔 스플래시를 띄우지 않음
  try{
    if(sessionStorage.getItem(RETURN_HASH_KEY)){
      document.body.classList.remove('splash-on');
      splash.remove();
      return;
    }
  }catch(e){}

  // 세션 중 1회만 표시 (내비앱 갔다가 돌아올 때 반복 표시 방지)
  try{
    if(sessionStorage.getItem(SPLASH_SHOWN_KEY)==='1'){
      document.body.classList.remove('splash-on');
      splash.remove();
      return;
    }
    sessionStorage.setItem(SPLASH_SHOWN_KEY,'1');
  }catch(e){}

  const FADE_MS = 900;
  const SHOW_MS = 2500; // 자연스럽게 보여주는 시간

  let dismissed = false;
  const dismiss = ()=>{
    if(dismissed) return;
    dismissed = true;
    splash.classList.add('hide');
    document.body.classList.remove('splash-on');
    setTimeout(()=>{ try{splash.remove();}catch(e){} }, FADE_MS+60);
  };

  // 사용자가 탭하면 바로 진입
  splash.addEventListener('click', dismiss, { once:true });

  setTimeout(dismiss, SHOW_MS);
}


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
function pm10Level(v){
  if(v==null) return {level:null, label:'-'};
  if(v<=30) return {level:'good', label:'좋음'};
  if(v<=80) return {level:'normal', label:'보통'};
  if(v<=150) return {level:'bad', label:'나쁨'};
  return {level:'verybad', label:'매우나쁨'};
}
function pm25Level(v){
  if(v==null) return {level:null, label:'-'};
  if(v<=15) return {level:'good', label:'좋음'};
  if(v<=35) return {level:'normal', label:'보통'};
  if(v<=75) return {level:'bad', label:'나쁨'};
  return {level:'verybad', label:'매우나쁨'};
}
function wxDescKo(code){
  if([0].includes(code)) return '맑음';
  if([1,2,3].includes(code)) return '구름';
  if([45,48].includes(code)) return '안개';
  if([51,53,55].includes(code)) return '이슬비';
  if([61,63,65].includes(code)) return '비';
  if([71,73,75,77].includes(code)) return '눈';
  if([95,96,99].includes(code)) return '뇌우';
  return '흐림';
}
function fmtKoTime(iso){
  try{
    const d = new Date(iso);
    const hh = d.getHours();
    const mm = String(d.getMinutes()).padStart(2,'0');
    const ap = (hh < 12) ? '오전' : '오후';
    const h12 = hh % 12 || 12;
    return `${ap} ${h12}:${mm} 기준`;
  }catch(e){
    return '-';
  }
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

// ---- References ----
const GOLDEN11_PLAYLIST = 'https://www.youtube.com/playlist?list=PLsCARcEUpLurFMk97vCZHbFzlWkoQxdoA';
const GOLDEN11_CHANNEL = 'https://www.youtube.com/@safetykepco/videos';
const TBM_GUIDE_URL = 'https://youtu.be/bSPAXI65Nmg?si=wCemX22OufMnK4LC';

// ---- Trades: 공종별 위험요인/안전대책 ----
// ※ 현장/사업소/도급사 기준에 따라 용어·절차가 다를 수 있으니, 기본 체크리스트로 활용하세요.
const TRADE_CATALOG = [
  // =========================
  // 가공 배전공사 (Overhead)
  // =========================
  {
    id: 'oh_foundation',
    kind: 'overhead',
    img: 'assets/trades/oh_foundation.png',
    title: '전주 굴착·근입·기초',
    process: '굴착 → 근입 → 되메우기·다짐 → 주변 정리',
    items: [
      { h: '굴착부 붕괴·매몰', m: [
        '굴착면 경사 확보 또는 흙막이 설치(토질/심도 고려)',
        '굴착부 주변 출입통제(바리케이드/표지) 및 감시자 배치',
        '굴착부 가장자리 적치물·장비 접근 제한(붕괴 방지)'
      ]},
      { h: '지하매설물(가스/상수/통신) 파손', m: [
        '굴착 전 매설물 탐지/도면 확인, 필요 시 수작업 병행',
        '관로·케이블 노출 시 보호(보호판/완충재) 및 작업속도 조절',
        '누출/파손 발생 시 즉시 작업중지 및 관계기관 연락'
      ]},
      { h: '중장비 협착·접촉', m: [
        '장비 작업반경 출입통제 및 전담 유도자(신호수) 배치',
        '후진·회전 시 사각지대 확인(경광등/경보장치 점검)',
        '작업자-장비 간 안전거리 유지, 무전/수신호 체계 통일'
      ]},
      { h: '도로 작업 교통사고', m: [
        '교통통제 계획 수립(콘/표지/차선유도) 및 야간 조명 확보',
        '작업구간과 통행 동선 분리, 필요 시 경찰/지자체 협의',
        '유도요원 배치, 반사조끼·라바콘·안전표지 설치'
      ]},
      { h: '전도(전주/장비) 위험', m: [
        '지반 상태 확인 후 아웃트리거·받침목 설치, 수평 확인',
        '근입 깊이/다짐 상태 확인, 임시 지지(지선) 적용',
        '정격하중/인양각 준수, 무리한 인양·급조작 금지'
      ]}
    ]
  },
  {
    id: 'oh_pole_set',
    kind: 'overhead',
    img: 'assets/trades/oh_pole_set.png',
    title: '전주 건주·교체·이설',
    process: '작업반경 통제 → 인양/건주 → 정렬/고정 → 부속 설치',
    items: [
      { h: '인양물 낙하·전주 전도', m: [
        '슬링/샤클/훅 등 결속 상태 점검 및 신호수 지정',
        '하부 출입금지 구역 설정(바리케이드/표지)',
        '인양 중 급회전·급정지 금지, 유도 로프 사용'
      ]},
      { h: '장비 전도(크레인·고소작업차)', m: [
        '지반 지지력 확인 후 아웃트리거 완전 전개',
        '받침목/깔판 사용, 작업반경 내 과적·무리한 동작 금지',
        '풍속·노면 상태 고려(강풍/결빙 시 작업 중지/조정)'
      ]},
      { h: '협착·끼임(전주/자재)', m: [
        '전주 세움·정렬 중 손·발 끼임 구간 지정 및 접근 금지',
        '작업자 위치 고정(지휘자 1명), 동시작업 최소화',
        '장갑/안전화 착용, 지면 미끄럼 방지'
      ]},
      { h: '추락(승주/고소작업)', m: [
        '안전대·랜야드 체결 상태 확인, 체결 지점 확보',
        '2인1조, 하부 감시자 배치 및 출입 통제',
        '작업발판/난간/버킷 상태 점검'
      ]},
      { h: '감전(충전부 인접)', m: [
        '정전·검전·접지 절차 준수(필요 시 운영 협의)',
        '절연거리 확보 및 활선방호구 설치',
        '절연장갑/절연매트 등 절연보호구 상태 점검'
      ]}
    ]
  },
  {
    id: 'oh_guywire',
    kind: 'overhead',
    img: 'assets/trades/oh_guywire.png',
    title: '전도방지(지선·앵커) 시공',
    process: '앵커 시공 → 지선 설치 → 장력 조정 → 고정/점검',
    items: [
      { h: '지선 장력 반동·파단', m: [
        '장력 조정은 서서히 수행(급조임 금지), 보호안경 착용',
        '작업자 위치를 반동 경로에서 벗어나게 배치',
        '부식/손상 자재 사용 금지, 클램프 체결 토크 확인'
      ]},
      { h: '굴착부 붕괴(앵커 굴착)', m: [
        '필요 시 흙막이/경사면 확보, 출입 통제',
        '굴착부 가장자리 적치 제한, 장비 접근 제한',
        '되메우기·다짐 철저, 앵커 위치 확인'
      ]},
      { h: '추락(승주 작업)', m: [
        '안전대/로프 체결 상태 점검, 2인1조',
        '승주 장비 이상 유무 확인(스파이크 등)',
        '하부 감시자 배치 및 낙하물 통제'
      ]},
      { h: '교통사고(도로변 지선)', m: [
        '차량 유도자 배치, 작업구간 콘/표지 설치',
        '야간 조명·반사장비 착용, 동선 분리',
        '지선 설치 위치 주변 보행자 통제'
      ]},
      { h: '감전(전선 근접)', m: [
        '절연거리 확보, 필요 시 활선방호구 설치',
        '금속 공구 사용 시 충전부 접촉 방지',
        '작업 전 위험구간 공유(TBM) 및 접근 통제'
      ]}
    ]
  },
  {
    id: 'oh_hardware',
    kind: 'overhead',
    img: 'assets/trades/oh_hardware.png',
    title: '철금구·완철·애자 설치',
    process: '자재 인양 → 조립/체결 → 위치/토크 확인',
    items: [
      { h: '추락(고소 작업)', m: [
        '안전대·랜야드 체결, 체결점 확보',
        '버킷/작업발판 상태 점검(문턱, 난간 등)',
        '2인1조, 하부 감시자 배치'
      ]},
      { h: '낙하물(공구·부자재)', m: [
        '공구 랜야드 적용, 자재 임시 적치 금지',
        '하부 출입통제(바리케이드/표지)',
        '작업 중 “낙하 위험” 구역 표시 및 통제'
      ]},
      { h: '감전(충전부 인접)', m: [
        '정전·검전·접지 또는 활선방호 조치 후 작업',
        '절연보호구 착용(절연장갑/절연매트)',
        '금속부 접근 시 절연거리 유지 및 감시자 배치'
      ]},
      { h: '협착·베임(조립/체결)', m: [
        '손 끼임 구간 사전 지정, 체결 시 손 위치 관리',
        '절단/날카로운 부품 취급 시 절단방지 장갑 착용',
        '체결 토크 준수, 임시 고정 후 최종 체결'
      ]},
      { h: '근골격 부담(중량물 취급)', m: [
        '중량물은 인양장비/보조도구 사용(무리한 수작업 금지)',
        '작업 자세 교대, 휴식 확보',
        '자재 적치 위치를 작업자 동선에 맞게 배치'
      ]}
    ]
  },
  {
    id: 'oh_stringing',
    kind: 'overhead',
    img: 'assets/trades/oh_stringing.png',
    title: '가선·장력조정·점퍼 결선',
    process: '전선 풀림 → 장력/처짐 관리 → 결속/점퍼 → 점검',
    items: [
      { h: '협착·말림(윈치/퍼서/롤러)', m: [
        '회전부·로프 접근 금지, 보호커버 확인',
        '유도자 배치, 수신호/무전 체계 통일',
        '작업자 손 끼임 방지(장갑/안전거리)'
      ]},
      { h: '전선 장력 반동·낙하', m: [
        '장력 조정은 서서히 수행, 반동 경로 접근 금지',
        '하부 출입 통제, 유도 로프 사용',
        '전선/클램프/결속자재 상태 점검'
      ]},
      { h: '교통사고(도로 횡단 가선)', m: [
        '교통통제 계획 수립(차량 통제/우회) 및 유도요원 배치',
        '가선 구간 하부 출입 금지(콘/표지)',
        '야간 조명 확보, 반사장비 착용'
      ]},
      { h: '감전(기존 충전부/근접선)', m: [
        '절연거리 확보, 활선방호구 설치',
        '정전·검전·접지 절차 준수(전환/절체 포함)',
        '절연보호구 착용 및 확인자 지정'
      ]},
      { h: '추락(고소/승주 작업)', m: [
        '안전대 체결, 작업발판/버킷 점검',
        '2인1조, 하부 감시자 배치',
        '기상(강풍·우천) 시 작업중지 기준 공유'
      ]}
    ]
  },
  {
    id: 'oh_pole_equipment',
    kind: 'overhead',
    img: 'assets/trades/oh_pole_equipment.png',
    title: '주상기기 설치·결선(개폐/보호 등)',
    process: '기기 인양 → 설치/체결 → 결선 → 기능 점검',
    items: [
      { h: '감전·아크(결선/전환)', m: [
        '운영 협의 후 정전·검전·접지 절차 준수',
        '충전부 방호 및 절연거리 확보, 확인자 지정',
        '작업구간 출입 통제 및 경고 표지'
      ]},
      { h: '중량물 인양·낙하', m: [
        '슬링/샤클/훅 점검, 신호수 지정',
        '하부 출입 통제, 유도 로프 사용',
        '정격하중 준수, 급조작 금지'
      ]},
      { h: '추락(고소 작업)', m: [
        '안전대 체결, 버킷/작업발판 점검',
        '공구 랜야드 적용, 낙하물 통제',
        '2인1조 및 감시자 배치'
      ]},
      { h: '낙하물(공구·부자재)', m: [
        '공구/자재 낙하방지, 임시 적치 금지',
        '하부 출입 금지 구역 운영',
        '작업 종료 전 체결 상태 재확인'
      ]},
      { h: '오조작·오결선', m: [
        '작업 전 결선도면/상확인, 단계별 체크리스트 사용',
        '체결 토크·단자 상태 확인(이중 확인)',
        '작업 중 변경 발생 시 재TBM/승인 후 진행'
      ]}
    ]
  },
  {
    id: 'oh_grounding_protect',
    kind: 'overhead',
    img: 'assets/trades/oh_grounding_protect.png',
    title: '접지·활선방호·표지/안전설비',
    process: '접지 시공 → 연속성 확인 → 방호/표지 설치 → 점검',
    items: [
      { h: '감전(접지 불량/누락)', m: [
        '접지선 연결부 체결 상태 확인 및 연속성 점검',
        '검전 후 접지, 절차 준수 및 확인자 지정',
        '젖은 환경에서는 절연보호구 강화'
      ]},
      { h: '충전부 노출로 인한 접근 위험', m: [
        '활선방호구(절연커버/방호판) 설치',
        '접근 금지 표지/차단 설치, 작업반경 통제',
        '작업 종료 전 방호구 누락 여부 확인'
      ]},
      { h: '추락·낙하(고소 작업)', m: [
        '안전대 체결, 공구 랜야드 적용',
        '하부 출입 통제, 감시자 배치',
        '작업발판/사다리 상태 점검'
      ]},
      { h: '교통사고(표지/차단 설치)', m: [
        '차량·보행 동선 분리, 유도자 배치',
        '야간 조명/반사장비 적용',
        '시설물 설치 위치 안전성 확인'
      ]},
      { h: '열화·파손(절연커버/표지)', m: [
        '절연커버 손상/오염 점검 후 사용',
        '기상(강풍) 시 이탈 방지 결속',
        '정기 점검 및 교체 주기 준수'
      ]}
    ]
  },

  // =========================
  // 지중 배전공사 (Underground)
  // =========================
  {
    id: 'ug_excavation',
    kind: 'underground',
    img: 'assets/trades/ug_excavation.png',
    title: '굴착·가시설(흙막이/교통통제)',
    process: '인허가/통제 → 굴착 → 흙막이/가시설 → 배수/정리',
    items: [
      { h: '굴착부 붕괴·매몰', m: [
        '심도/토질에 맞는 흙막이 또는 경사면 확보',
        '굴착부 주변 출입통제, 안전통로 확보',
        '적치물/장비를 가장자리에서 이격'
      ]},
      { h: '지하매설물 파손(가스/상수/통신)', m: [
        '굴착 전 탐사(탐지기/도면) 및 관계기관 협의',
        '근접 구간은 수작업 병행, 보호판 설치',
        '누출·파손 시 즉시 작업중지 및 긴급조치'
      ]},
      { h: '중장비 협착·접촉', m: [
        '작업반경 통제, 전담 유도자 배치',
        '후진/회전 시 사각지대 확인, 신호체계 통일',
        '작업자-장비 안전거리 유지'
      ]},
      { h: '교통사고·비산먼지', m: [
        '교통통제 계획 수립(차선 유도/속도 저감) 및 유도요원',
        '분진 억제(살수) 및 방진마스크 착용',
        '야간 조명·반사장비 적용'
      ]},
      { h: '침수·우천 시 안전사고', m: [
        '배수 계획(펌프/배수로) 수립, 우천 시 작업중지 기준 공유',
        '미끄럼 방지(논슬립), 전기장비 방수/절연 확인',
        '침수 발생 시 즉시 퇴피 및 차단'
      ]}
    ]
  },
  {
    id: 'ug_duct',
    kind: 'underground',
    img: 'assets/trades/ug_duct.png',
    title: '관로(덕트) 포설·덕트뱅크',
    process: '덕트 배치 → 연결/고정 → 콘크리트/모래 포설 → 정리',
    items: [
      { h: '협착·끼임(덕트 배치)', m: [
        '손 끼임 구간 지정, 덕트 이동 시 구호/신호 통일',
        '중량물은 보조도구 사용, 무리한 수작업 금지',
        '장갑/안전화 착용'
      ]},
      { h: '절단·베임(절단 공구)', m: [
        '절단방지 장갑/보안경 착용',
        '절단기 안전커버/날 상태 점검',
        '작업대 확보 및 절단 방향 관리'
      ]},
      { h: '굴착부 붕괴/낙하', m: [
        '흙막이/경사면 유지, 작업자 출입 통제',
        '덕트 하역/인양 시 하부 통제 및 신호수 배치',
        '적치물 정리, 통로 확보'
      ]},
      { h: '교통·민원(도로 점용)', m: [
        '점용 구간 표지/차단, 통행 동선 확보',
        '야간 조명/안내표지, 소음·분진 관리',
        '민원 대응 창구/연락 체계 운영'
      ]},
      { h: '품질 불량(관로 변형/침하)', m: [
        '덕트 정렬/기울기 관리, 연결부 이탈 방지',
        '되메우기 층다짐 준수, 침하 방지',
        '매설표지/테이프 설치'
      ]}
    ]
  },
  {
    id: 'ug_manhole',
    kind: 'underground',
    img: 'assets/trades/ug_manhole.png',
    title: '맨홀·핸드홀 작업(밀폐공간 포함)',
    process: '개구부 개방 → 가스측정/환기 → 작업/감시 → 복구',
    items: [
      { h: '질식·유해가스(밀폐공간)', m: [
        '작업 전 산소/유해가스 측정(연속 측정 권장)',
        '송풍기 등으로 환기, 감시자 상시 배치',
        '구조장비(삼각대/구명줄) 및 비상연락망 확보'
      ]},
      { h: '추락(개구부)', m: [
        '개구부 가드/난간 설치, 출입 통제',
        '출입 시 3점 지지, 미끄럼 방지',
        '작업자 PPE(안전모/안전화) 착용'
      ]},
      { h: '감전(기존 케이블/단자)', m: [
        '정전·검전·접지 또는 방호 조치 후 작업',
        '절연장갑/절연매트 적용, 젖은 환경 주의',
        '금속공구 접촉 방지 및 확인자 지정'
      ]},
      { h: '침수·저체온', m: [
        '배수(펌프) 준비, 우천/침수 시 작업중지',
        '젖은 환경에서 절연보호구 강화',
        '작업 시간 관리 및 보온/휴식 제공'
      ]},
      { h: '화재(가연성 가스/용제)', m: [
        '가연성 가스 측정, 화기 사용 금지 구역 설정',
        '소화기 비치, 불티 감시',
        '용제/수지 사용 시 환기 및 보관 관리'
      ]}
    ]
  },
  {
    id: 'ug_cable_pull',
    kind: 'underground',
    img: 'assets/trades/ug_cable_pull.png',
    title: '케이블 포설(드럼·로핑·인입)',
    process: '드럼 배치 → 로핑 → 케이블 인입 → 굽힘반경/장력 관리',
    items: [
      { h: '협착·말림(윈치/로프/롤러)', m: [
        '회전부·로프 접근 금지, 보호장치 확인',
        '유도자 배치, 무전/수신호 체계 통일',
        '손 끼임 방지(안전거리/장갑)'
      ]},
      { h: '케이블 장력 반동·파단', m: [
        '장력/속도 서서히 조절, 반동 경로 출입 금지',
        '로프/샤클 등 연결부 점검, 정격하중 준수',
        '작업반경 통제 및 하부 출입 금지'
      ]},
      { h: '근골격 부담(중량/자세)', m: [
        '로라/가이드 사용, 인력 운반 최소화',
        '작업자 교대, 휴식 확보',
        '케이블 이동 경로 정리(걸림/전도 방지)'
      ]},
      { h: '감전(기존 케이블/설비)', m: [
        '정전·검전·접지 절차 확인, 표시/차단',
        '작업구역 구분(활선/정전) 및 표지',
        '절연보호구 착용'
      ]},
      { h: '미끄럼·넘어짐(맨홀 주변)', m: [
        '바닥 정리, 미끄럼 방지 매트 적용',
        '케이블 적치 정리정돈, 통로 확보',
        '야간 조명 확보'
      ]}
    ]
  },
  {
    id: 'ug_joint',
    kind: 'underground',
    img: 'assets/trades/ug_joint.png',
    title: '접속(조인트) 시공',
    process: '케이블 준비 → 절연/차폐 처리 → 접속 → 품질 점검',
    items: [
      { h: '감전·아크(오결선/잔류전하)', m: [
        '정전·검전·접지 확인 후 작업, 확인자 지정',
        '작업 전 상/도통 확인, 도면 대조',
        '방호구·절연보호구 착용'
      ]},
      { h: '품질 불량(절연/차폐 처리 미흡)', m: [
        '제조사 공법/절차서 준수, 단계별 체크리스트',
        '청결 유지(수분/먼지/오염 제거), 온도/습도 관리',
        '작업 완료 후 외관·치수·토크 재확인(이중 확인)'
      ]},
      { h: '화재·열(가열 공정/수축튜브)', m: [
        '화기 사용 시 가연물 제거 및 소화기 비치',
        '불티 감시자 배치, 작업 종료 후 잔열 확인',
        '가연성 가스 존재 시 화기 금지'
      ]},
      { h: '유해물질(수지/용제) 노출', m: [
        '보호장갑/보안경/필요 시 방독마스크 착용',
        '환기 확보, 피부 접촉 최소화',
        'MSDS 확인 및 폐기물 분리 처리'
      ]},
      { h: '밀폐공간 위험(맨홀 내)', m: [
        '산소/가스 측정 및 환기, 감시자 배치',
        '구조장비/비상연락망 확보',
        '침수·우천 시 작업 중지'
      ]}
    ]
  },
  {
    id: 'ug_termination',
    kind: 'underground',
    img: 'assets/trades/ug_termination.png',
    title: '종단(터미네이션)·기기 결선',
    process: '종단 준비 → 절연/차폐 처리 → 단자 체결 → 상/도통 확인',
    items: [
      { h: '감전·아크(결선/전환)', m: [
        '운영 협의 후 정전·검전·접지 절차 준수',
        '작업구역 출입 통제 및 경고 표지',
        '절연보호구 착용, 확인자 지정'
      ]},
      { h: '오결선·상 오류', m: [
        '결선도면/표찰 확인, 상확인 절차 수행',
        '단계별 체크리스트로 이중 확인',
        '변경 발생 시 승인 후 재TBM'
      ]},
      { h: '체결 불량(과·미체결)', m: [
        '토크렌치 사용(규정 토크 준수)',
        '단자/러그 상태 점검(열화/오염)',
        '작업 후 재점검 및 열화 흔적 확인'
      ]},
      { h: '낙하·추락(기기실/작업발판)', m: [
        '개구부/고소 작업 시 추락방지(난간/안전대)',
        '공구 랜야드 적용, 하부 통제',
        '작업발판/사다리 상태 점검'
      ]},
      { h: '화재(단락/누설)', m: [
        '절연·차폐 처리 품질 확보, 청결 유지',
        '시험 후 이상(발열/냄새) 발생 시 즉시 차단 및 점검',
        '소화기 비치, 비상대응 절차 공유'
      ]}
    ]
  },
  {
    id: 'ug_shield_ground',
    kind: 'underground',
    img: 'assets/trades/ug_shield_ground.png',
    title: '차폐·접지(케이블/맨홀)',
    process: '차폐 접속 → 접지선 결선 → 연속성/저항 확인',
    items: [
      { h: '감전(접지 누락/불량)', m: [
        '접지 결선 상태 점검 및 연속성 확인(측정)',
        '정전·검전·접지 절차 준수, 확인자 지정',
        '젖은 환경에서는 절연보호구 강화'
      ]},
      { h: '단락·사고(차폐 처리 오류)', m: [
        '차폐 처리 공법 준수(단측/양측 등 운전 방식 확인)',
        '금속 차폐부 노출 방지 및 절연 처리',
        '표찰/색상 표시로 결선 오류 방지'
      ]},
      { h: '밀폐공간 위험(맨홀)', m: [
        '가스측정/환기, 감시자 배치',
        '구조장비 및 비상연락망 확보',
        '침수 시 작업 중지'
      ]},
      { h: '근골격 부담(자세/공간)', m: [
        '작업자 교대 및 휴식, 조명 확보',
        '공구/자재 정리정돈으로 작업 공간 확보',
        '무리한 자세 작업 최소화'
      ]},
      { h: '품질 저하(부식/이완)', m: [
        '방청/방수 처리, 체결 토크 준수',
        '점검구/맨홀 내 정리 및 표찰 부착',
        '준공 전 사진/체크리스트로 기록'
      ]}
    ]
  },
  {
    id: 'ug_restore',
    kind: 'underground',
    img: 'assets/trades/ug_restore.png',
    title: '되메우기·포장/원상복구',
    process: '되메우기 → 층다짐 → 포장 → 차선/표지 복구',
    items: [
      { h: '중장비 협착·접촉', m: [
        '장비 작업반경 출입통제, 유도자 배치',
        '후진 시 전담 유도자, 사각지대 확인',
        '작업자-장비 안전거리 확보'
      ]},
      { h: '교통사고(차로 복구 중)', m: [
        '교통통제 유지(콘/표지/차선유도), 야간 조명',
        '보행자 동선 확보, 유도요원 배치',
        '작업 시간 조정(혼잡 시간 회피)'
      ]},
      { h: '화상·열(아스팔트)', m: [
        '내열 장갑/보호구 착용, 고온 자재 취급 주의',
        '작업 구역 통제, 화상 응급조치 안내',
        '가연물 관리 및 소화기 비치'
      ]},
      { h: '분진·소음', m: [
        '살수 등 분진 억제, 방진마스크 착용',
        '민원 대응(작업시간 안내/차단벽 등)',
        '청력 보호구 착용(필요 시)'
      ]},
      { h: '침하(품질/민원)', m: [
        '층다짐 기준 준수, 재료 품질 관리',
        '복구 후 침하·균열 점검 및 보수',
        '매설표지/기록 정리'
      ]}
    ]
  },
  {
    id: 'ug_test_switch',
    kind: 'underground',
    img: 'assets/trades/ug_test_switch.png',
    title: '시험·점검·전환(절체)',
    process: '시험 준비 → 절연/도통/상 확인 → 전환 → 최종 점검',
    items: [
      { h: '감전·아크(시험/전환)', m: [
        '운영팀 협의 후 정전·검전·접지 절차 준수',
        '시험 중 작업구간 출입 통제 및 경고 표지',
        '보호구(절연/아크 등급) 착용'
      ]},
      { h: '오조작·오전환', m: [
        '절차서 기반 단계별 확인(지휘자 1명)',
        '장치 조작 전·후 상태 기록/교차 확인',
        '변경 발생 시 즉시 중지 후 재TBM'
      ]},
      { h: '주변 인원 위험(통제 미흡)', m: [
        '작업반경 통제, 불필요 인원 퇴장',
        '대기 인원 역할 분담 및 안전거리 유지',
        '무전/수신호 체계 통일'
      ]},
      { h: '시험장비 취급 부주의', m: [
        '장비 접지/연결 상태 점검, 케이블 정리',
        '절연장갑 착용, 젖은 환경 회피',
        '장비 사용법 숙지 및 점검표 활용'
      ]},
      { h: '비상상황 대응 미흡', m: [
        '119/연락망, AED/구급함 위치 공유',
        '사고 시 작업중지·퇴피 기준 공유',
        '응급조치 담당자 지정'
      ]}
    ]
  }
];

function getTrade(id){
  return TRADE_CATALOG.find(t => t.id === id);
}

function tradeKindName(kind){
  return (kind === 'overhead') ? '가공 배전공사' : '지중 배전공사';
}

function tradeIcon(kind){
  return (kind === 'overhead') ? '🪜' : '🕳️';
}

function ensureTradeIconStyles(){
  if(document.getElementById('trade-icons-style')) return;
  const st = document.createElement('style');
  st.id = 'trade-icons-style';
  st.textContent = `
    .card.trade-item .card-icon{width:56px;height:56px;border-radius:16px;}
    .card-icon.tradeimg{background:#fff;border:1px solid var(--stroke);overflow:hidden;}
    .card-icon.tradeimg img{width:100%;height:100%;object-fit:cover;display:block;}
    #tradeMeta .trade-header{display:flex;gap:12px;align-items:center;}
    #tradeMeta .trade-hero{width:64px;height:64px;border-radius:16px;border:1px solid var(--stroke);overflow:hidden;flex:0 0 auto;background:#fff;}
    #tradeMeta .trade-hero img{width:100%;height:100%;object-fit:cover;display:block;}
    #tradeMeta .trade-title{font-weight:1100;font-size:16px;margin-bottom:2px;color:var(--text);}
    #tradeMeta .trade-meta{color:var(--muted);font-size:12px;line-height:1.35;}
  `;
  document.head.appendChild(st);
}


function renderTradeList(){
  ensureTradeIconStyles();

  const over = document.getElementById('overTradeList');
  const und = document.getElementById('undTradeList');
  if(over) over.innerHTML = '';
  if(und) und.innerHTML = '';

  TRADE_CATALOG.forEach(t=>{
    const a = document.createElement('a');
    a.className = 'card nav trade-item';
    a.href = `#/trades/${t.id}`;

    const hasImg = !!t.img;
    const iconCls = hasImg ? 'tradeimg' : ((t.kind === 'overhead') ? 'ok' : 'folder');
    const iconHtml = hasImg
      ? `<img src="${t.img}" alt=""/>`
      : `${tradeIcon(t.kind)}`;

    a.innerHTML = `
      <div class="card-icon ${iconCls}">${iconHtml}</div>
      <div class="card-body">
        <div class="card-title">${escapeHtml(t.title)}</div>
        <div class="card-sub">${escapeHtml(t.process)}</div>
      </div>
      <div class="card-arrow">›</div>
    `;

    if(t.kind === 'overhead'){
      over && over.appendChild(a);
    } else {
      und && und.appendChild(a);
    }
  });
}

function renderTradeDetail(trade){
  const meta = document.getElementById('tradeMeta');
  if(meta){
    ensureTradeIconStyles();
    const imgHtml = trade.img
      ? `<div class="trade-hero"><img src="${trade.img}" alt=""/></div>`
      : '';
    meta.innerHTML = `
      <div class="trade-header">
        ${imgHtml}
        <div>
          <div class="trade-title">${escapeHtml(trade.title)}</div>
          <div class="trade-meta">분류: <b>${tradeKindName(trade.kind)}</b></div>
          <div class="trade-meta">주요 공정: ${escapeHtml(trade.process)}</div>
        </div>
      </div>
    `;
  }

  const tbody = document.getElementById('tradeTableBody');
  if(!tbody) return;
  tbody.innerHTML = '';

  (trade.items || []).forEach((it, idx)=>{
    const tr = document.createElement('tr');

    const isLast = idx === (trade.items.length - 1);
    const border = isLast ? 'none' : '1px solid var(--stroke)';

    const measures = (it.m || []).map(x => `<li style="margin:6px 0; font-size:13px;">${escapeHtml(x)}</li>`).join('');

    tr.innerHTML = `
      <td style="vertical-align:top; padding:12px; border-bottom:${border}; font-weight:1100;">
        ${escapeHtml(it.h || '')}
      </td>
      <td style="vertical-align:top; padding:12px; border-bottom:${border};">
        <ul style="margin:0 0 0 18px; padding:0; color:#334155;">
          ${measures}
        </ul>
      </td>
    `;
    tbody.appendChild(tr);
  });
}



function goldenSearchUrl(q){
  // 채널 내 검색(유튜브 기본 기능). 특정 Rule 영상이 이동/비공개가 되더라도 찾을 수 있게 백업 링크로 사용합니다.
  return 'https://www.youtube.com/@safetykepco/search?query=' + encodeURIComponent(q || '');
}

function ytVideoId(url){
  try{
    const u = new URL(url);
    // youtu.be/<id>
    if(u.hostname.includes('youtu.be')){
      const id = u.pathname.split('/').filter(Boolean)[0];
      return id || null;
    }
    // youtube.com/watch?v=<id>
    if(u.searchParams.get('v')) return u.searchParams.get('v');
    // /shorts/<id>
    const m = u.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{6,})/);
    if(m) return m[1];
    return null;
  }catch(e){
    // URL 생성이 실패하는 경우(상대경로 등)
    const m = String(url||'').match(/(?:youtu\.be\/|v=)([a-zA-Z0-9_-]{6,})/);
    return m ? m[1] : null;
  }
}

function ytEmbedUrlFromVideo(url){
  const id = ytVideoId(url);
  if(!id) return '';
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`;
}

function ytEmbedUrlFromPlaylist(playlistUrl, index){
  try{
    const u = new URL(playlistUrl);
    const list = u.searchParams.get('list');
    if(!list) return '';
    const idx = Number.isFinite(index) ? Math.max(0, index) : 0;
    return `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(list)}&index=${idx}&rel=0&modestbranding=1&playsinline=1`;
  }catch(e){
    // URL 파싱 실패 시, 그냥 전체 링크에서 list= 추출 시도
    const m = String(playlistUrl||'').match(/[?&]list=([^&]+)/);
    const list = m ? m[1] : '';
    const idx = Number.isFinite(index) ? Math.max(0, index) : 0;
    return list ? `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(list)}&index=${idx}&rel=0&modestbranding=1&playsinline=1` : '';
  }
}

function ensureRefsHasTbmGuide(){
  // index.html이 업데이트되지 않았거나 캐시로 옛 템플릿이 떠도,
  // 안전수칙 화면에 'TBM 가이드' 메뉴를 강제로 표시합니다.
  try{
    const list = app.querySelector('#refsList') || app.querySelector('section.panel .list') || app.querySelector('.list');
    if(!list) return;

    const has = Array.from(list.querySelectorAll('.card-title')).some(el => (el.textContent||'').trim() === 'TBM 가이드');
    if(has) return;

    const link = document.createElement('a');
    link.className = 'card nav';
    link.href = '#/refs/tbmguide';
    link.innerHTML = `
      <div class="card-icon cloud">🎥</div>
      <div class="card-body">
        <div class="card-title">TBM 가이드</div>
        <div class="card-sub">유튜브 영상으로 TBM 작성 방법 보기</div>
      </div>
      <div class="card-arrow">›</div>
    `;

    const first = list.querySelector('a.card.nav');
    if(first){
      first.insertAdjacentElement('afterend', link);
    } else {
      list.appendChild(link);
    }
  }catch(e){ /* noop */ }
}


const GOLDEN11 = [
  {
    no: 1,
    title: '개인 안전장구 착용',
    desc: '작업에 맞는 개인보호구(안전모/안전화/절연장갑 등) 착용 상태를 작업 전 확인합니다.',
    video: 'https://www.youtube.com/watch?v=9TUjmVgblRk',
    search: '[Golden-Rules 11] Rule.1 개인 안전장구 착용'
  },
  {
    no: 2,
    title: '작업계획서 작성 필수 · 공법 임의변경 금지',
    desc: '작업계획(통보)서 작성·승인 후 작업하며, 공법/절차는 임의변경하지 않습니다(변경 시 작업중지 → 재TBM).',
    video: 'https://www.youtube.com/watch?v=JOQrkSmEAMg',
    search: '[Golden-Rules 11] Rule.2 작업계획서 작성 필수 공법 임의변경 금지'
  },
  {
    no: 3,
    title: '작업차량 전도방지 조치 철저',
    desc: '지반 확인 후 아웃트리거/받침목 설치, 수평·하중·작업반경을 확인해 전도사고를 예방합니다.',
    video: 'https://www.youtube.com/watch?v=GTKWo-l1uQ8',
    search: '[Golden-Rules 11] Rule.3 작업차량 전도방지'
  },
  {
    no: 4,
    title: '고소작업 안전대 착용 · 안전고리 체결',
    desc: '고소작업 전 안전대·랜야드 체결 상태를 확인하고, 안전고리는 확실한 지점에 체결합니다.',
    video: 'https://www.youtube.com/watch?v=Kq0q_6hWV3w',
    search: '[Golden-Rules 11] Rule.4 고소작업 안전대 안전고리 체결'
  },
  {
    no: 5,
    title: '작업반경 출입금지 · 후진 시 전담 유도자',
    desc: '작업차량/중장비 작업반경은 출입통제하고, 후진/진입 시 전담 유도자를 배치합니다.',
    video: 'https://www.youtube.com/watch?v=tMqYKZVFeG0',
    search: '[Golden-Rules 11] Rule.5 작업반경 출입금지 후진 유도자'
  },
  {
    no: 6,
    title: '인양물 고정장치 확인 · 하부출입 금지',
    desc: '인양 전 슬링·샤클·훅·고정장치를 점검하고, 작업 중 인양물 하부 출입을 금지합니다.',
    video: 'https://www.youtube.com/watch?v=3ZVCMnpV3fY',
    search: '[Golden-Rules 11] Rule.6 인양물 고정장치 하부출입 금지'
  },
  {
    no: 7,
    title: '맨홀내 작업시 작업반경 내 출입금지',
    desc: '안내말씀 : 7번에 대한 영상은 없습니다. 양해 바랍니다.',
    // Rule.7 개별 Shorts 링크를 찾지 못할 때 대비해 채널 검색 링크로 연결합니다.
    video: null,
    search: '[Golden-Rules 11] Rule.7'
  },
  {
    no: 8,
    title: '작업차량 고임목 4개 이상 설치',
    desc: '작업계획서에 명시된 차량에 고임목을 4개 이상 설치하고 주차브레이크·수평을 확인합니다.',
    video: 'https://www.youtube.com/watch?v=a_uVHM-NMBY',
    search: '[Golden-Rules 11] Rule.8 고임목 4개 이상'
  },
  {
    no: 9,
    title: '전기작업 검전·접지 · 충전부 방호 철저',
    desc: '정전·검전·접지 절차를 준수하고, 충전부 방호 및 절연거리 확보로 감전사고를 예방합니다.',
    video: 'https://www.youtube.com/watch?v=Jx5QParwniY',
    search: '[Golden-Rules 11] Rule.9 검전 접지 충전부 방호'
  },
  {
    no: 10,
    title: '밀폐공간 출입 시 작업허가절차 준수',
    desc: '밀폐공간 출입 전 작업허가 절차를 준수하고, 산소/유해가스 측정·환기·감시자 배치를 합니다.',
    video: 'https://www.youtube.com/watch?v=bizwlOEmUhc',
    search: '[Golden-Rules 11] Rule.10 밀폐공간 작업허가절차'
  },
  {
    no: 11,
    title: '배전분야 COS·지상기기 조작 시 적정공구 사용',
    desc: 'COS 투개방/지상기기 조작 시 적정공구(절연공구 등)를 사용하고 무리한 조작을 금지합니다.',
    video: 'https://www.youtube.com/watch?v=oxhOhMVVnKs',
    search: '[Golden-Rules 11] Rule.11 COS 투개방 적정공구'
  }
];

function getGoldenRule(no){
  return GOLDEN11.find(x=>x.no===no);
}

function renderGolden11List(){
  const list = document.getElementById('golden11List');
  if(!list) return;

  const btnPL = document.getElementById('g11Playlist');
  const btnCH = document.getElementById('g11Channel');
  if(btnPL){ btnPL.href = GOLDEN11_PLAYLIST; btnPL.style.display = 'none'; }
  if(btnCH) btnCH.href = GOLDEN11_CHANNEL;

  list.innerHTML = '';

  const colors = ['red','orange','yellow','gold','green'];
  GOLDEN11.forEach((r, idx)=>{
    const card = document.createElement('div');
    const color = colors[idx % colors.length];
    card.className = `rule ${color}`;
    card.style.cursor = 'pointer';
    card.setAttribute('role','button');
    card.tabIndex = 0;

    card.innerHTML = `
      <div class="rule-badge">${r.no}</div>
      <div class="rule-body">
        <div class="rule-title">${escapeHtml(r.title)}</div>
        <div class="rule-sub">${escapeHtml(r.desc || '')}</div>
        <div class="muted small" style="margin-top:8px">영상 링크 보기 ›</div>
      </div>
    `;

    const go = ()=>{ location.hash = `#/refs/golden11/${r.no}`; };
    card.addEventListener('click', go);
    card.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter' || e.key === ' '){
        e.preventDefault();
        go();
      }
    });

    list.appendChild(card);
  });
}

function renderGolden11Detail(ruleNo){
  const rule = getGoldenRule(ruleNo);
  if(!rule) return;

  const noEl = document.getElementById('g11No');
  const titleEl = document.getElementById('g11Title');
  const descEl = document.getElementById('g11Desc');

  if(noEl) noEl.textContent = `Rule.${rule.no}`;
  if(titleEl) titleEl.textContent = rule.title;
  if(descEl) descEl.textContent = rule.desc || '';

  const searchUrl = goldenSearchUrl(rule.search || `Golden-Rules 11 Rule.${rule.no}`);
  const videoUrl = rule.video || '';
  const embedSrc = videoUrl
    ? ytEmbedUrlFromVideo(videoUrl)
    : ytEmbedUrlFromPlaylist(GOLDEN11_PLAYLIST, (rule.no||1) - 1);

  // (신규 UI) 인앱 재생 iframe
  let frame = document.getElementById('g11Frame');
  if(!frame){
    // index.html이 구버전이라 iframe이 없을 때도 동작하도록 동적 생성
    const card = document.querySelector('.bigcard');
    if(card){
      const wrap = document.createElement('div');
      wrap.className = 'video-wrap';
      wrap.style.marginTop = '12px';
      wrap.innerHTML = `
        <iframe id="g11Frame" class="video-frame"
          src=""
          title="Golden Rules 11"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen
          referrerpolicy="strict-origin-when-cross-origin"></iframe>
      `;
      // 버튼 영역(있는 경우) 위에 삽입
      const mini = card.querySelector('.mini-row');
      if(mini) mini.insertAdjacentElement('beforebegin', wrap);
      else card.appendChild(wrap);
      frame = wrap.querySelector('#g11Frame');
    }
  }
  if(frame) frame.src = embedSrc;

  // (신규 UI) 버튼들
  const aOpen = document.getElementById('g11Open');
  const aPlaylist = document.getElementById('g11Playlist2');
  const aSearch = document.getElementById('g11Search');

  if(aOpen){
    aOpen.href = videoUrl || GOLDEN11_PLAYLIST;
    aOpen.textContent = videoUrl ? '유튜브에서 열기' : '플레이리스트에서 보기';
  }
  if(aPlaylist) aPlaylist.href = GOLDEN11_PLAYLIST;
  if(aSearch) aSearch.href = searchUrl;

  // (구버전 UI 호환) 외부링크 버튼만 존재할 때
  const aVideoOld = document.getElementById('g11Video');
  if(aVideoOld){
    aVideoOld.href = videoUrl || searchUrl;
    aVideoOld.textContent = videoUrl ? '유튜브 영상 보기' : '유튜브에서 찾기';
  }
}

function renderTBMGuide(){
  const frame = document.getElementById('tbmGuideFrame');
  const open = document.getElementById('tbmGuideOpen');
  const src = ytEmbedUrlFromVideo(TBM_GUIDE_URL);
  if(frame) frame.src = src;
  if(open) open.href = TBM_GUIDE_URL;
}


// ---- Routes ----
function route(){
  const hash = location.hash || '#/';
  const parts = hash.split('/'); // ["#/tbm","new"]
  const r = (parts[1]||'').replace('#','');
  const a = parts[2] || '';
  const b = parts[3] || '';


// 초대코드 미인증이면 모든 화면 접근을 막고, 코드 입력 화면을 먼저 표시
if(!isInviteAuthorized()){
  rememberPendingHash(hash);
  renderInviteGate();
  return;
}

  if(!r){
    setTop('TBM도우미','안산지사 전력공급부',{back:false,home:false});
    mount(tpl('tpl-home'));
    return;
  }

  if(r==='refs' && !a){
    setTop('안전수칙','현장 안전수칙',{back:true,home:true});
    mount(tpl('tpl-refs'));
   // ensureRefsHasTbmGuide();
    return;
  }

  
  if(r==='refs' && a==='tbmguide'){
    setTop('TBM 가이드','영상으로 TBM 작성 방법',{back:true,home:true});

    // index.html이 구버전이어도 동작하도록 템플릿이 없으면 동적으로 구성
    const t = document.getElementById('tpl-tbmguide');
    if(t){
      mount(tpl('tpl-tbmguide'));
    } else {
      const frag = document.createDocumentFragment();
      const sec = document.createElement('section');
      sec.className = 'panel';
      sec.innerHTML = `
        <div class="desc">
          TBM 작성 방법을 영상으로 확인합니다.<br/>
          <span class="muted small">※ 재생이 안 되면 “유튜브에서 열기”를 사용하세요.</span>
        </div>
        <div class="bigcard">
          <div class="card-title">TBM 가이드</div>
          <div class="video-wrap">
            <iframe id="tbmGuideFrame" class="video-frame"
              src=""
              title="TBM 가이드"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowfullscreen
              referrerpolicy="strict-origin-when-cross-origin"></iframe>
          </div>
          <div class="mini-row" style="margin-top:10px">
            <a class="mini-btn primary" id="tbmGuideOpen" href="#" target="_blank" rel="noopener">유튜브에서 열기</a>
          </div>
        </div>
      `;
      frag.appendChild(sec);
      mount(frag);
    }

    renderTBMGuide();
    return;
  }

if(r==='refs' && a==='golden11' && b){
    const n = parseInt(b, 10);
    const rule = Number.isFinite(n) ? getGoldenRule(n) : null;
    if(!rule){ location.hash = '#/refs/golden11'; return; }
    setTop('골든룰 11', `Rule.${rule.no} · ${rule.title}`, {back:true,home:true});
    const node = tpl('tpl-golden11-detail');
    mount(node);
    renderGolden11Detail(rule.no);
    return;
  }

  if(r==='refs' && a==='golden11'){
    setTop('골든룰 11','유튜브 공식 영상',{back:true,home:true});
    const node = tpl('tpl-golden11');
    mount(node);
    renderGolden11List();
    return;
  }

  if(r==='refs' && a==='safety5'){
    setTop('5대 안전지킴이','한국전력공사 안전수칙',{back:true,home:true});
    mount(tpl('tpl-rules'));
    return;
  }


  if(r==='trades' && !a){
    setTop('공종별 위험요인 및 안전대책','공종 선택 → 표로 확인',{back:true,home:true});
    mount(tpl('tpl-trades'));
    renderTradeList();
    return;
  }

  if(r==='trades' && a){
    const trade = getTrade(a);
    if(!trade){ location.hash = '#/trades'; return; }
    setTop(trade.title,'위험요인 및 안전대책',{back:true,home:true});
    mount(tpl('tpl-trade-detail'));
    renderTradeDetail(trade);
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


  

  if(r==='contacts'){
    setTop('비상 연락망','저장/바로전화',{back:true,home:true});
    const node = tpl('tpl-contacts');
    mount(node);
    initContacts();
    return;
  }

  location.hash = '#/';
}

window.addEventListener('hashchange', route);
route();
initSplash();

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
  const wxNow = document.getElementById('wxNow');
  const wxTime = document.getElementById('wxTime');
  const wxIcon = document.getElementById('wxIcon');
  const wxFeel = document.getElementById('wxFeel');
  const wxHum = document.getElementById('wxHum');
  const wxWind = document.getElementById('wxWind');
  const wxTemp = document.getElementById('wxTemp');

  const warnWrap = document.getElementById('wxWarnWrap');
  const warnList = document.getElementById('wxWarnList');

  const pm10 = document.getElementById('pm10');
  const pm25 = document.getElementById('pm25');
  const pm10q = document.getElementById('pm10q');
  const pm25q = document.getElementById('pm25q');
  const aq10Box = document.getElementById('aq10Box');
  const aq25Box = document.getElementById('aq25Box');

  wxLoc.textContent = label;
  if(label==='현재 위치'){
    // 지역명 표시
    reverseGeocode(lat, lon).then(name=>{ wxLoc.textContent = name; }).catch(()=>{});
  }
  wxTime.textContent = '불러오는 중...';
  if(wxNow) wxNow.textContent = '현재 -° · -';

  const wurl = new URL('https://api.open-meteo.com/v1/forecast');
  wurl.searchParams.set('latitude', lat);
  wurl.searchParams.set('longitude', lon);
  wurl.searchParams.set('current', 'temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code');
  wurl.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max');
  wurl.searchParams.set('timezone', 'Asia/Seoul');
  wurl.searchParams.set('wind_speed_unit', 'ms'); // 풍속 단위: m/s

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

  const feelRaw = cur.apparent_temperature;
  const feel = Math.round(feelRaw);
  const wind = Number(cur.wind_speed_10m);
  const temp = Math.round(cur.temperature_2m);
  const hum = Number(cur.relative_humidity_2m);
  const code = cur.weather_code;

  wxTime.textContent = fmtKoTime(cur.time);
  wxIcon.textContent = iconFrom(code);
  wxFeel.textContent = `체감 ${feel}°`;
  if(wxNow) wxNow.textContent = `현재 ${temp}° · ${wxDescKo(code)}`;
  wxHum.textContent = `${hum}%`;
  wxWind.textContent = `${wind.toFixed(1)}m/s`;
  wxTemp.textContent = `${temp}°`;

  // ---- 대기질 ----
  const v10 = aq?.pm10;
  const v25 = aq?.pm2_5;

  const pm10Num = v10==null ? null : Math.round(v10);
  const pm25Num = v25==null ? null : Math.round(v25);

  pm10.textContent = pm10Num==null ? '-' : pm10Num;
  pm25.textContent = pm25Num==null ? '-' : pm25Num;

  const lv10 = pm10Level(v10);
  const lv25 = pm25Level(v25);

  pm10q.textContent = lv10.label;
  pm25q.textContent = lv25.label;

  if(aq10Box){
    aq10Box.className = 'aq-box' + (lv10.level ? ` ${lv10.level}` : '');
  }
  if(aq25Box){
    aq25Box.className = 'aq-box' + (lv25.level ? ` ${lv25.level}` : '');
  }

  // ---- 작업 안전 경고(표현: 스샷 스타일) ----
  const warnings = [];
  const addWarn = (level, badge, text)=>{
    warnings.push({level, badge, text});
  };

  // [온열] 체감온도 기준(요약): 31/33/35/38℃
  if(feelRaw >= 31){
    if(feelRaw >= 38){
      addWarn('danger','위험',`체감온도 ${feel}°C — 폭염(38℃↑): 매시간 15분 휴식, 14~17시 긴급작업 외 옥외작업 중지 권고 (고용노동부 온열질환 예방가이드)`);
    } else if(feelRaw >= 35){
      addWarn('warning','경고',`체감온도 ${feel}°C — 폭염(35℃↑): 매시간 15분 휴식, 14~17시 옥외작업 중지/시간조정 권고 (고용노동부 온열질환 예방가이드)`);
    } else if(feelRaw >= 33){
      addWarn('caution','주의',`체감온도 ${feel}°C — 폭염(33℃↑): 작업시간대 조정, 2시간마다 20분(또는 1시간 10분) 휴식 권고 (고용노동부 온열질환 예방가이드)`);
    } else {
      addWarn('manage','관리',`체감온도 ${feel}°C — 물·그늘 준비, 민감군 건강상태 확인 (고용노동부 온열질환 예방가이드)`);
    }
  } else if(feelRaw <= 5){
    // [한랭] 체감온도 기준(요약): -3.2 / -10.5 / -15.4℃
    if(feelRaw < -15.4){
      addWarn('danger','위험',`체감온도 ${feel}°C — 한랭(-15.4℃↓): 저체온증·동상 위험, 장시간 옥외작업 자제/중지 검토 (고용노동부 한랭질환 예방가이드)`);
    } else if(feelRaw < -10.5){
      addWarn('warning','경고',`체감온도 ${feel}°C — 한랭(-10.5℃↓): 노출피부 최소화, 방풍겉옷+겹겹이, 젖은 옷 즉시 교체 (고용노동부 한랭질환 예방가이드)`);
    } else if(feelRaw < -3.2){
      addWarn('caution','주의',`체감온도 ${feel}°C — 한랭(-3.2℃↓): 방한모·장갑·목도리 착용, 따뜻한 휴식/음료 제공 (고용노동부 한랭질환 예방가이드)`);
    } else {
      addWarn('manage','관리',`체감온도 ${feel}°C — 따뜻한 시간대 작업 배치, 보온장구 착용, 따뜻한 음료 제공 (고용노동부 한랭질환 예방가이드)`);
    }
  }

  // [풍속] 고소작업차/고소작업대 참고: 10m/s(주의), 12.5m/s(중지) — 장비 매뉴얼 우선
  if(wind >= 12.5){
    addWarn('danger','위험',`풍속 ${wind.toFixed(1)}m/s — 고소작업차(고소작업대) 상승 금지, 즉시 하강·작업중지 (장비 매뉴얼 우선)`);
  } else if(wind >= 10){
    addWarn('caution','주의',`풍속 ${wind.toFixed(1)}m/s — 강풍: 고소작업차 사용 제한, 비산물 결박·작업반경 통제 (장비 매뉴얼 우선)`);
  }

  // [습도] 고습도 경고(절연성능/미끄럼)
  if(!Number.isNaN(hum) && hum >= 95){
    addWarn('caution','주의',`고습도 — 절연성능 저하·미끄럼 주의 (절연보호구 건조/점검, 통로 정리정돈)`);
  }

  // [대기질] 초미세먼지/미세먼지
  if(lv25.level === 'bad'){
    addWarn('warning','경고',`초미세먼지 나쁨 — 방진마스크 착용 권고, 민감군·장시간 옥외작업 최소화`);
  } else if(lv25.level === 'verybad'){
    addWarn('danger','위험',`초미세먼지 매우나쁨 — 옥외 장시간 작업 최소화/중지 검토, 호흡보호구(KF94 등) 착용 권고`);
  }

  if(lv10.level === 'bad'){
    addWarn('caution','주의',`미세먼지 나쁨 — 마스크 착용 권고, 작업자 호흡기 증상 모니터링`);
  } else if(lv10.level === 'verybad'){
    addWarn('warning','경고',`미세먼지 매우나쁨 — 옥외 작업시간 최소화, 방진마스크 착용 권고`);
  }

  if(warnWrap && warnList){
    warnList.innerHTML = '';
    if(warnings.length){
      warnWrap.hidden = false;
      warnings.forEach(wi=>{
        const row = document.createElement('div');
        row.className = `wx-warn-item ${wi.level}`;
        row.innerHTML = `
          <div class="wx-warn-badge">${escapeHtml(wi.badge)}</div>
          <div class="wx-warn-text">${escapeHtml(wi.text)}</div>
        `;
        warnList.appendChild(row);
      });
    } else {
      // 경고가 없으면 숨김(화면 깔끔)
      warnWrap.hidden = true;
    }
  }

  // 주간 날씨 렌더
  renderWeekly(w, document.getElementById('weeklyList'));
}


function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}


/* ---------- Emergency facilities (maps deep links) ---------- */
function fetchWorkerJson(url){
  const u = url + (url.includes('?') ? '&' : '?') + '_ts=' + Date.now();
  return fetch(u, { method:'GET', mode:'cors', credentials:'omit', cache:'no-store' }).then(r=>r.json());
}

function haversineKm(lat1, lon1, lat2, lon2){
  const R = 6371;
  const toRad = (d)=>d*Math.PI/180;
  const dLat = toRad(lat2-lat1);
  const dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

function initEmergency(){
  const emgLoc = document.getElementById('emgLoc');
  const emgCoord = document.getElementById('emgCoord');
  const btnGetLoc = document.getElementById('btnGetLoc');
  const btnCopy = document.getElementById('btnCopyCoord');
  const emgStatus = document.getElementById('emgStatus');
  const emgResults = document.getElementById('emgResults');

  const linkGoogle = document.getElementById('linkGoogle');
  const linkNaver  = document.getElementById('linkNaver');
  const linkKakao  = document.getElementById('linkKakao');
  const linkEgen   = document.getElementById('linkEgen');

  const WORKER = 'https://tbm-emergency.plucky775.workers.dev';

  // 기본 링크
  if(linkGoogle) linkGoogle.href = 'https://www.google.com/maps/search/응급실';
  if(linkNaver)  linkNaver.href  = 'https://m.map.naver.com/search2/search.naver?query=응급실';
  if(linkKakao)  linkKakao.href  = 'https://m.map.kakao.com/actions/searchView?q=응급실';
  if(linkEgen)   linkEgen.href   = 'https://www.e-gen.or.kr/egen/search.do';

  const fmt = (n)=> (Math.round(n*1000000)/1000000).toFixed(6);

  const setLinks = (lat, lon)=>{
    const z = 14;
    if(linkGoogle) linkGoogle.href = `https://www.google.com/maps/search/응급실/@${lat},${lon},${z}z`;
    if(linkNaver)  linkNaver.href  = `https://m.map.naver.com/search2/search.naver?query=응급실&sm=hty&style=v5&x=${lon}&y=${lat}`;
    if(linkKakao)  linkKakao.href  = `https://m.map.kakao.com/actions/searchView?q=응급실`;
  };

  const clsOf = (it)=> String(it?.dutyEmclsName || it?.dutyemclsname || '');
  const isEmergencyOnly = (it)=> clsOf(it).indexOf('응급') !== -1; // ✅ Chrome/Safari 안전

  const pick = (it)=>{
    const name = it?.dutyName || it?.dutyname || '응급의료기관';
    const addr = it?.dutyAddr || it?.dutyaddr || '';
    const tel  = it?.dutyTel3 || it?.dutytel3 || it?.dutyTel1 || it?.dutytel1 || '';
    const cls  = clsOf(it);
    const lat2 = Number(it?.wgs84Lat ?? it?.wgs84lat ?? 0);
    const lon2 = Number(it?.wgs84Lon ?? it?.wgs84lon ?? 0);
    return {name, addr, tel, cls, lat:lat2, lon:lon2};
  };

  const render = (items, myLat, myLon)=>{
    if(!emgResults) return;
    emgResults.innerHTML = '';

    if(!items.length){
      if(emgStatus) emgStatus.textContent = '표시할 응급(분류) 기관이 없습니다.';
      return;
    }

    const mapped = items.map(it=>{
      const f = pick(it);
      const dist = (f.lat && f.lon) ? haversineKm(myLat, myLon, f.lat, f.lon) : null;
      return {f, dist};
    }).sort((a,b)=>{
      if(a.dist!=null && b.dist!=null) return a.dist-b.dist;
      if(a.dist!=null) return -1;
      if(b.dist!=null) return 1;
      return a.f.name.localeCompare(b.f.name);
    }).slice(0,7);

    if(emgStatus) emgStatus.textContent = `가까운 순으로 ${mapped.length}개 표시 (공공데이터·'응급' 분류만)`;

    mapped.forEach(({f, dist}, idx)=>{
      const distText = dist==null ? '' : (dist < 1 ? `${Math.round(dist*1000)}m` : `${dist.toFixed(1)}km`);
      const safePhone = (f.tel||'').replace(/\s+/g,'');
      const naverDir = (f.lat && f.lon)
        ? `nmap://navigation?dlat=${f.lat}&dlng=${f.lon}&dname=${encodeURIComponent(f.name)}&appname=${encodeURIComponent(location.href)}`
        : `https://m.map.naver.com/search2/search.naver?query=${encodeURIComponent(f.name)}`;

      const kakaoDir = (f.lat && f.lon)
        ? `https://map.kakao.com/link/to/${encodeURIComponent(f.name)},${f.lat},${f.lon}`
        : `https://m.map.kakao.com/actions/searchView?q=${encodeURIComponent(f.name)}`;
      const tmapDir = (f.lat && f.lon)
        ? `tmap://route?goalx=${f.lon}&goaly=${f.lat}&goalname=${encodeURIComponent(f.name)}&rGoName=${encodeURIComponent(f.name)}&rGoX=${f.lon}&rGoY=${f.lat}`
        : null;

      const card = document.createElement('div');
      card.className = (idx===0) ? 'hcard nearest' : 'hcard';
      card.innerHTML = `
        <div class="hhead">
          <div class="hicon">🏥</div>
          <div style="flex:1;min-width:0">
            <div class="htitle">${escapeHtml(f.name)} ${distText?`<span class="muted small">· ${distText}</span>`:''}</div>
            <div class="muted small" style="margin-top:6px">${escapeHtml(f.addr || '주소 정보 없음')}</div>
            <div class="muted small" style="margin-top:6px">분류: ${escapeHtml(f.cls || '-')}</div>
            ${safePhone ? `<div class="muted small" style="margin-top:6px">☎ ${escapeHtml(f.tel)}</div>`:''}
          </div>
        </div>
        <div class="mini-row" style="margin-top:10px">
          <a class="mini-btn primary" href="${naverDir}" rel="noopener">네이버 길찾기</a>
          <a class="mini-btn" href="${kakaoDir}" target="_blank" rel="noopener">카카오 길찾기</a>
          ${tmapDir ? `<a class="mini-btn" href="${tmapDir}">티맵 길찾기</a>` : ``}
          ${safePhone ? `<a class="mini-btn" href="tel:${safePhone}">전화</a>` : `<span class="mini-btn danger">전화정보 없음</span>`}
        </div>
      `;
      emgResults.appendChild(card);
    });
  };

  async function apply(lat, lon){
    if(emgCoord) emgCoord.textContent = `${fmt(lat)}, ${fmt(lon)}`;
    setLinks(lat, lon);
    if(emgStatus) emgStatus.textContent = '공공데이터 조회 중...';

    const url = `${WORKER}/?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&numOfRows=200&pageNo=1`;

    try{
      const data = await fetchWorkerJson(url);
      const region = data?.region || {};
      if(emgLoc) emgLoc.textContent = (region.stage1 && region.stage2) ? `${region.stage1} ${region.stage2}` : '현재 위치';

      let rawItems = Array.isArray(data?.items) ? data.items : [];
let items = rawItems.filter(isEmergencyOnly);

// ✅ 1) 응급만 필터했는데 0개면, 일단 전체라도 보여주기(의왕시 같은 케이스)
if (!items.length && rawItems.length) {
  items = rawItems;
}

// ✅ 2) 워커 자체가 행정구역 제한으로 0개면(=rawItems도 0개), 20km 반경 OSM로 재검색
if (!rawItems.length) {
  const osm = await fetchOverpassEmergency(lat, lon, 20000); // 20km
  // osm 결과는 이미 '병원/의원' 위주라 그대로 사용
  items = Array.isArray(osm) ? osm : [];
}

render(items, lat, lon);
    }catch(e){
      if(emgLoc) emgLoc.textContent = '현재 위치';
      if(emgStatus) emgStatus.textContent = '불러오기 실패 — ' + (e && e.message ? e.message : e);
      if(emgResults) emgResults.innerHTML = '';
    }
  }

  const getLoc = ()=>{
    if(!navigator.geolocation){
      alert('이 기기에서 위치 기능을 사용할 수 없습니다.');
      return;
    }
    if(emgLoc) emgLoc.textContent = '위치 확인 중...';
    if(emgStatus) emgStatus.textContent = '위치 확인 중...';
    navigator.geolocation.getCurrentPosition(
      (pos)=>apply(pos.coords.latitude, pos.coords.longitude),
      ()=>{
        if(emgLoc) emgLoc.textContent='미확인';
        if(emgStatus) emgStatus.textContent='위치 권한이 필요합니다.';
      },
      { enableHighAccuracy:true, timeout:12000, maximumAge:300000 }
    );
  };

  if(btnGetLoc) btnGetLoc.onclick = getLoc;

  if(btnCopy) btnCopy.onclick = async ()=>{
    const txt = emgCoord ? emgCoord.textContent : '';
    if(!txt || txt==='-'){ alert('먼저 위치를 가져오세요.'); return; }
    try{ await navigator.clipboard.writeText(txt); alert('좌표를 복사했습니다.'); }
    catch{
      const ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); ta.remove(); alert('좌표를 복사했습니다.');
    }
  };

  setTimeout(getLoc, 200);
}



async function fetchOverpassEmergency(lat, lon, statusEl, resultsEl){
  if(statusEl) statusEl.textContent = '주변 응급의료시설 검색 중...';
  if(resultsEl) resultsEl.innerHTML = '';

  // Overpass QL: hospitals + emergency
  const radius = 20000; // 20km
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


function parseLatLon(text){
  const m = String(text||'').trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if(!m) return null;
  const lat = Number(m[1]), lon = Number(m[2]);
  if(!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if(Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return {lat, lon};
}

async function geocodeAddress(query){
  const q = String(query||'').trim();
  if(!q) return null;
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format','jsonv2');
  url.searchParams.set('limit','1');
  url.searchParams.set('accept-language','ko');
  url.searchParams.set('countrycodes','kr');
  url.searchParams.set('q', q);

  const res = await fetch(url.toString(), { headers:{'Accept':'application/json'} });
  if(!res.ok) return null;
  const arr = await res.json();
  if(!Array.isArray(arr) || !arr.length) return null;

  const it = arr[0] || {};
  const lat = Number(it.lat);
  const lon = Number(it.lon);
  if(!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return {lat, lon, name: it.display_name || q};
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

  const addrInput = document.getElementById('svAddr');
  const addrStatus = document.getElementById('svAddrStatus');
  const btnKakaoNavi = document.getElementById('btnKakaoNavi');
  const btnTmapNavi  = document.getElementById('btnTmapNavi');

  const fmt = (n)=> (Math.round(n*1000000)/1000000).toFixed(6);
  let target = null; // {lat, lon, name}
  let myPos = null; // {lat, lon} 현재 위치(길찾기 출발지)

  const setStatus = (t)=>{ if(addrStatus) addrStatus.textContent = t || ''; };

  const parseLatLon = (text)=>{
    const m = String(text||'').match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if(!m) return null;
    const lat = Number(m[1]), lon = Number(m[2]);
    if(!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if(Math.abs(lat)>90 || Math.abs(lon)>180) return null;
    return {lat, lon};
  };

  async function geocodeAddress(query){
    const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=ko&countrycodes=kr&q=${encodeURIComponent(query)}`;
    const res = await fetch(u, { headers: { 'Accept': 'application/json' }});
    if(!res.ok) throw new Error('geocode failed');
    const arr = await res.json();
    if(!Array.isArray(arr) || !arr.length) return null;
    return {lat:Number(arr[0].lat), lon:Number(arr[0].lon), name:arr[0].display_name || query};
  }

  function openWithFallback(schemeUrl, webFallbackUrl){
    const t0 = Date.now();
    let hidden = false;

    const onVis = ()=>{
      // 앱이 열리면(성공) 브라우저 탭이 보통 hidden 상태가 됩니다.
      if(document.hidden) hidden = true;
    };
    document.addEventListener('visibilitychange', onVis);

    window.location.href = schemeUrl;

    // 기기/런처에 따라 전환이 느릴 수 있어 약간 여유를 둡니다.
    setTimeout(()=>{
      document.removeEventListener('visibilitychange', onVis);
      if(!hidden && Date.now() - t0 < 2200){
        window.location.href = webFallbackUrl;
      }
    }, 1500);
  }

  // iOS에서 URL Scheme을 window.location으로 바로 이동시키면,
  // (특히 "열기" 확인창에서 사용자가 조금 늦게 누를 때)
  // 폴백 URL로 이동해버려 돌아왔을 때 "페이지를 찾을 수 없습니다" 화면이 남는 경우가 있습니다.
  // 응급의료시설 페이지처럼 <a href="tmap://..."> 방식으로 호출하면 이 현상이 거의 없어
  // 동일한 방식(임시 앵커 클릭)으로 스킴을 실행합니다.
  function openScheme(schemeUrl){
    try{
      const a = document.createElement('a');
      a.href = schemeUrl;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>a.remove(), 0);
    }catch(e){
      // 마지막 수단
      window.location.href = schemeUrl;
    }
  }

  // ---- KakaoMap(카카오맵) URL Scheme: route/search (앱) + 모바일웹 스킴 폴백 ----
  // 공식 문서(카카오맵 URL Scheme): kakaomap://route , kakaomap://search, 모바일웹: http://m.map.kakao.com/scheme/...
  function kakaoRouteApp(destLat, destLon, by){
    const mode = by || 'car';
    const parts = [];
    if(myPos && Number.isFinite(myPos.lat) && Number.isFinite(myPos.lon)){
      parts.push(`sp=${myPos.lat},${myPos.lon}`);
    }
    parts.push(`ep=${destLat},${destLon}`);
    parts.push(`by=${encodeURIComponent(mode)}`);
    return `kakaomap://route?${parts.join('&')}`;
  }

  function kakaoRouteWeb(destLat, destLon, by){
    const mode = by || 'car';
    const parts = [];
    if(myPos && Number.isFinite(myPos.lat) && Number.isFinite(myPos.lon)){
      parts.push(`sp=${myPos.lat},${myPos.lon}`);
    }
    parts.push(`ep=${destLat},${destLon}`);
    parts.push(`by=${encodeURIComponent(mode)}`);
    return `http://m.map.kakao.com/scheme/route?${parts.join('&')}`;
  }

  function kakaoSearchApp(query){
    const q = encodeURIComponent(query || '');
    const parts = [`q=${q}`];
    if(myPos && Number.isFinite(myPos.lat) && Number.isFinite(myPos.lon)){
      parts.push(`p=${myPos.lat},${myPos.lon}`);
    }
    return `kakaomap://search?${parts.join('&')}`;
  }

  function kakaoSearchWeb(query){
    const q = encodeURIComponent(query || '');
    const parts = [`q=${q}`];
    if(myPos && Number.isFinite(myPos.lat) && Number.isFinite(myPos.lon)){
      parts.push(`p=${myPos.lat},${myPos.lon}`);
    }
    return `http://m.map.kakao.com/scheme/search?${parts.join('&')}`;
  }

  function tmapRoute(lat, lon, name){
    const n = encodeURIComponent(name || '목적지');
    const x = encodeURIComponent(lon);
    const y = encodeURIComponent(lat);
    // goal* 파라미터(최근) + rGo* 파라미터(구버전 호환) 함께 전달
    return `tmap://route?goalname=${n}&goalx=${x}&goaly=${y}&rGoName=${n}&rGoX=${x}&rGoY=${y}`;
  }

  function tmapWebFallback(keyword){
    return `https://m.tmap.co.kr/search?keyword=${encodeURIComponent(keyword || '목적지')}`;
  }

  const renderLinks = (lat, lon, placeName)=>{
    if(!links) return;
    links.innerHTML = '';
    const googlePano = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}`;
    const googleMap = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
  //  const naverRoad = `https://m.map.naver.com/panorama/${lon},${lat}`;
    const kakaoRoad = `https://map.kakao.com/link/roadview/${lat},${lon}`;
    const naverSearch = `https://m.map.naver.com/search2/search.naver?query=${encodeURIComponent(placeName||'현장')}&x=${lon}&y=${lat}`;
    const kakaoSearch = `https://m.map.kakao.com/actions/searchView?q=${encodeURIComponent(placeName||'현장')}`;

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
//    links.appendChild(make('네이버 파노라마', '가능 시 로드뷰 열기', naverRoad, '🧭'));
    links.appendChild(make('카카오 로드뷰', '가능 시 로드뷰 열기', kakaoRoad, '📍'));
    links.appendChild(make('네이버 검색', '현장 주변 검색', naverSearch, '🔎'));
    links.appendChild(make('카카오 검색', '현장 주변 검색', kakaoSearch, '🔎'));
  };

  const apply = async (lat, lon)=>{
    // 현재 위치(출발지) 저장
    myPos = {lat, lon};

    const name = await reverseGeocode(lat, lon);
    if(svLoc) svLoc.textContent = name;
    if(svCoord) svCoord.textContent = `${fmt(lat)}, ${fmt(lon)}`;
    renderLinks(lat, lon, name);
  };

  const getLoc = ()=>{
    if(!navigator.geolocation){ alert('이 기기에서 위치 기능을 사용할 수 없습니다.'); return; }
    if(svLoc) svLoc.textContent = '위치 확인 중...';
    navigator.geolocation.getCurrentPosition(
      (pos)=>apply(pos.coords.latitude, pos.coords.longitude),
      ()=>{ if(svLoc) svLoc.textContent = '미확인'; alert('위치 권한이 필요합니다.'); },
      { enableHighAccuracy:true, timeout:12000, maximumAge:300000 }
    );
  };

  if(btn) btn.onclick = getLoc;

  if(btnCopy) btnCopy.onclick = async ()=>{
    const txt = svCoord ? svCoord.textContent : '';
    if(!txt || txt==='-'){ alert('먼저 위치를 가져오세요.'); return; }
    try{ await navigator.clipboard.writeText(txt); alert('좌표를 복사했습니다.'); }
    catch{
      const ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); ta.remove(); alert('좌표를 복사했습니다.');
    }
  };

  async function resolveTarget(){
    const q = (addrInput?.value || '').trim();
    if(!q){ alert('주소를 입력하세요.'); return null; }
    setStatus('주소 검색 중...');
    const ll = parseLatLon(q);
    if(ll){
      const nm = `좌표(${ll.lat.toFixed(5)}, ${ll.lon.toFixed(5)})`;
      target = {lat: ll.lat, lon: ll.lon, name: nm};
      setStatus('좌표로 인식됨');
      return target;
    }
    try{
      const hit = await geocodeAddress(q);
      if(!hit){ setStatus('검색 결과 없음'); return null; }
      target = hit;
      setStatus('검색 완료');
      return target;
    }catch(e){
      setStatus('주소 검색 실패');
      return null;
    }
  }

  if(addrInput){
    addrInput.addEventListener('keydown', async (e)=>{
      if(e.key !== 'Enter') return;
      e.preventDefault();
      const t = await resolveTarget();
      if(!t) return;
      const scheme = `nmap://place?lat=${t.lat}&lng=${t.lon}&name=${encodeURIComponent(t.name)}&appname=${encodeURIComponent(location.href)}`;
      const fallback = `https://m.map.naver.com/search2/search.naver?query=${encodeURIComponent(t.name)}&x=${t.lon}&y=${t.lat}`;
      openWithFallback(scheme, fallback);
    });
  }

  if(btnKakaoNavi){
    btnKakaoNavi.onclick = async ()=>{
      const q = (addrInput?.value || '').trim();
      const t = await resolveTarget();

      // 1) 좌표 확보 성공 → 카카오맵 앱 길찾기(자동차)로 바로 연결
      if(t && Number.isFinite(t.lat) && Number.isFinite(t.lon)){
        openWithFallback(
          kakaoRouteApp(t.lat, t.lon, 'car'),
          kakaoRouteWeb(t.lat, t.lon, 'car')
        );
        return;
      }

      // 2) 좌표 실패 → 카카오맵 '검색' 화면으로 연결(주소/장소명 검색)
      if(q){
        openWithFallback(
          kakaoSearchApp(q),
          kakaoSearchWeb(q)
        );
        return;
      }

      alert('주소를 입력하세요.');
    };
  }
  if(btnTmapNavi){
    btnTmapNavi.onclick = async ()=>{
      const q = (addrInput?.value || '').trim();
      const t = await resolveTarget();

      // 1) 좌표 확보 성공 → 티맵 앱 길찾기
      if(t && Number.isFinite(t.lat) && Number.isFinite(t.lon)){
        // ✅ 티맵 실행 후 다시 돌아오면 "로드뷰(거리뷰)" 화면으로 자동 복귀
        setReturnHash('#/streetview');

        // ✅ "스킴만" 호출(자동 폴백 이동 없음)
        //    → 티맵 실행 후 돌아왔을 때 웹(404) 화면이 남는 문제 방지
        openScheme(tmapRoute(t.lat, t.lon, t.name || q));
        setStatus('티맵 실행 중... (돌아오면 로드뷰 화면으로 복귀됩니다)');
        return;
      }

      // 2) 좌표 실패 → 웹으로 이동하지 않고 안내만 표시(404 방지)
      if(q){
        setStatus('주소를 찾을 수 없습니다. 다른 주소로 입력하거나 "위도,경도" 형식으로 입력해보세요.');
        alert('주소를 찾을 수 없습니다.\n\n- 다른 주소(도로명/지번)로 다시 입력하거나\n- "위도,경도" 형식으로 입력해보세요.');
        return;
      }

      alert('주소를 입력하세요.');
    };
  }setTimeout(getLoc, 200);
}
// ---- Emergency Contacts (비상 연락망) ----
function loadContacts(){
  try{
    const v = JSON.parse(localStorage.getItem(CONTACTS_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  }catch(e){
    return [];
  }
}
function saveContacts(list){
  try{
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(list));
  }catch(e){
    // storage full / blocked
  }
}
function telHref(phone){
  const digits = String(phone || '').replace(/[^\d+#*+]/g, '');
  return digits ? `tel:${digits}` : '';
}

function initContacts(){
  const cCompany = document.getElementById('cCompany');
  const cName = document.getElementById('cName');
  const cPhone = document.getElementById('cPhone');
  const cAdd = document.getElementById('cAdd');
  const cClear = document.getElementById('cClear');
  const cList = document.getElementById('cList');

  let editIndex = null; // 원본 배열 인덱스(수정 모드)

  const normCompany = (s)=>{
    const t = String(s||'').replace(/\s+/g,' ').trim();
    return t || '미지정';
  };
  // 회사별 접기/펼치기 상태 저장
  const loadFolds = ()=>{
    try{ return JSON.parse(localStorage.getItem(CONTACTS_FOLD_KEY) || '{}') || {}; }
    catch(e){ return {}; }
  };
  const saveFolds = (obj)=>{
    try{ localStorage.setItem(CONTACTS_FOLD_KEY, JSON.stringify(obj || {})); }catch(e){}
  };
  let folds = loadFolds();


  const setMode = (idx)=>{
    editIndex = (Number.isInteger(idx) ? idx : null);
    if(cAdd) cAdd.textContent = (editIndex==null) ? '저장' : '수정 저장';
    if(cClear) cClear.textContent = (editIndex==null) ? '입력 초기화' : '취소';
  };
  // 초기 모드
  setMode(null);

  const fillForm = (item)=>{
    if(!item) return;
    if(cCompany) cCompany.value = item.company || '';
    if(cName) cName.value = item.name || '';
    if(cPhone) cPhone.value = item.phone || '';
    try{ (cName || cCompany || cPhone).focus(); }catch(e){}
  };

  const clearForm = ()=>{
    if(cCompany) cCompany.value = '';
    if(cName) cName.value = '';
    if(cPhone) cPhone.value = '';
  };

  const render = ()=>{
    if(!cList) return;
    const arr = loadContacts();
    cList.innerHTML = '';

    if(!arr.length){
      const empty = document.createElement('div');
      empty.className = 'muted small';
      empty.textContent = '저장된 연락처가 없습니다.';
      cList.appendChild(empty);
      return;
    }

    // 회사명 기준 그룹핑 (표시는 최대 200명까지)
    const groups = new Map(); // key -> { company, key, rows: [{x, idx}] }
    arr.slice(0, 200).forEach((x, idx)=>{
      const company = normCompany(x.company);
      const key = company.toLowerCase();
      if(!groups.has(key)) groups.set(key, { company, key, rows: [] });
      groups.get(key).rows.push({ x, idx });
    });

    // 회사명 정렬(가나다)
    const ordered = Array.from(groups.values()).sort((a,b)=>a.company.localeCompare(b.company,'ko'));

    ordered.forEach((g)=>{
      const wrap = document.createElement('div');
      wrap.className = 'bigcard';
      wrap.style.padding = '14px';

      const isCollapsed = !!folds[g.key];

      // 회사 헤더(클릭하면 접기/펼치기)
      const headBtn = document.createElement('button');
      headBtn.type = 'button';
      headBtn.setAttribute('aria-expanded', String(!isCollapsed));
      headBtn.style.cssText = 'width:100%;background:transparent;border:0;padding:0;text-align:left;cursor:pointer;';
      headBtn.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px">
          <div style="font-size:20px;line-height:1">🏢</div>
          <div style="font-size:18px;font-weight:900;color:var(--text);">${escapeHtml(g.company)}</div>
          <div style="margin-left:auto;display:flex;align-items:center;gap:10px">
            <div style="color:var(--muted);font-size:12px;">${g.rows.length}명</div>
            <div class="fold-arrow" style="font-size:18px;line-height:1;color:var(--muted);">${isCollapsed ? '▸' : '▾'}</div>
          </div>
        </div>
      `;
      wrap.appendChild(headBtn);

      const sep = document.createElement('div');
      sep.className = 'hr';
      sep.style.margin = '10px 0';
      wrap.appendChild(sep);

      const body = document.createElement('div');
      body.style.display = isCollapsed ? 'none' : '';
      wrap.appendChild(body);

      // 사람 목록
      g.rows.forEach((row, pos)=>{
        const x = row.x || {};
        const idx = row.idx;

        const name = String(x.name || '').trim();
        const phone = String(x.phone || '').trim();
        const href = telHref(phone);

        const item = document.createElement('div');
        item.style.padding = '10px 0';
        if(pos !== g.rows.length - 1){
          item.style.borderBottom = '1px solid var(--stroke)';
        }

        item.innerHTML = `
          <div style="display:flex;gap:12px;align-items:flex-start">
            <div style="font-size:18px;line-height:1;margin-top:2px">👤</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:15px;font-weight:800;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${escapeHtml(name || '-')}
              </div>
              <div class="muted small" style="margin-top:4px">${escapeHtml(phone || '-')}</div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;flex:0 0 auto">
              ${href ? `<a class="pill-btn primary" style="text-decoration:none;min-width:56px;display:flex;justify-content:flex-end;align-items:center" href="${href}" aria-label="전화">📞</a>` : `<span class="pill-btn danger">번호 없음</span>`}
              <button class="pill-btn primary" type="button" data-edit="${idx}" style="min-width:56px;display:flex;justify-content:flex-end;align-items:center;font-weight:900" aria-label="수정">✏️</button>
              <button class="pill-btn danger" type="button" data-del="${idx}">삭제</button>
            </div>
          </div>
        `;
        body.appendChild(item);
      });

      // 토글 동작
      headBtn.onclick = ()=>{
        const nowCollapsed = !folds[g.key];
        folds[g.key] = nowCollapsed;
        saveFolds(folds);
        body.style.display = nowCollapsed ? 'none' : '';
        headBtn.setAttribute('aria-expanded', String(!nowCollapsed));
        const a = headBtn.querySelector('.fold-arrow');
        if(a) a.textContent = nowCollapsed ? '▸' : '▾';
      };

      cList.appendChild(wrap);
    });

    // 수정
    cList.querySelectorAll('button[data-edit]').forEach(btn=>{
      btn.onclick = ()=>{
        const idx = Number(btn.dataset.edit);
        const arr = loadContacts();
        const item = arr[idx];
        if(!item) return;
        setMode(idx);
        fillForm(item);
        try{ window.scrollTo({top:0, behavior:'smooth'}); }catch(e){ window.scrollTo(0,0); }
      };
    });

    // 삭제(안전장치)
    cList.querySelectorAll('button[data-del]').forEach(btn=>{
      btn.onclick = ()=>{
        const idx = Number(btn.dataset.del);
        const arr = loadContacts();
        const item = arr[idx];
        const label = item ? `${(item.company||'').trim()} ${(item.name||'').trim()} ${(item.phone||'').trim()}`.trim() : '선택한 연락처';
        if(!confirm(`${label}\n\n정말 삭제할까요?`)) return;
        arr.splice(idx, 1);
        saveContacts(arr);
        // 삭제 후 인덱스가 바뀔 수 있으니 수정모드 해제
        setMode(null);
        clearForm();
        render();
      };
    });
  };

  const clearOrCancel = ()=>{
    clearForm();
    setMode(null);
    try{ cCompany && cCompany.focus(); }catch(e){}
  };

  if(cAdd) cAdd.onclick = ()=>{
    const company = (cCompany?.value || '').trim();
    const name = (cName?.value || '').trim();
    const phone = (cPhone?.value || '').trim();

    if(!company){
      alert('회사명을 입력하세요.');
      return;
    }
    if(!name){
      alert('이름을 입력하세요.');
      return;
    }
    if(!phone){
      alert('전화번호를 입력하세요.');
      return;
    }

    const arr = loadContacts();

    if(editIndex != null){
      // 수정 저장
      arr[editIndex] = { ...arr[editIndex], company, name, phone, updatedAt: new Date().toISOString() };
      saveContacts(arr);
      setMode(null);
      clearForm();
      render();
      alert('수정했습니다.');
      return;
    }

    // 신규 저장
    arr.unshift({ company, name, phone, createdAt: new Date().toISOString() });
    saveContacts(arr);
    clearForm();
    render();
    alert('저장했습니다.');
  };

  if(cClear) cClear.onclick = clearOrCancel;

  setMode(null);
  render();
}



// --- 클릭 사운드 ---
const clickSound = new Audio('assets/click.mp3');
clickSound.volume = 0.4; // 0~1 사이

document.addEventListener('click', function(e){
  if(e.target.closest('button, .card, .mini-btn, .pill-btn')){
    clickSound.currentTime = 0;
    clickSound.play().catch(()=>{});
  }
});