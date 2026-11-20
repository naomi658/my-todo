/* 나만의 투두 · PWA 앱 셸 (개인 데이터 없음 — 기록·루틴은 사용자가 불러온 뒤 이 기기의 localStorage에만 저장) */
'use strict';

var STORE = 'mytodo-v2';
var CAT = {R:{name:'루틴 · 출퇴근/업무', short:'루틴', color:'var(--work)'}, T:{name:'할 일', short:'할 일', color:'var(--todo)'}, E:{name:'운동', short:'운동', color:'var(--ex)'}};
var CAT_ORDER = ['R','T','E'];
var DOW = ['일','월','화','수','목','금','토'];
var DOW_LABEL_ORDER = [1,2,3,4,5,6,0];   // 화면 표기 순서(월~일)

var state = null;
var selDate = null;
var viewYear = 0, viewMonth = 0;
var view = 'todo';
var editingRoutineId = null;
var pickedDays = {};

/* ---------- 작은 도우미 ---------- */
function pad2(n){ return String(n).padStart(2,'0'); }
function fmt(d){ return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); }
function todayStr(){ return fmt(new Date()); }
function parseDate(s){ var p = String(s).split('-').map(Number); return new Date(p[0], p[1]-1, p[2]); }
function isDateKey(k){ return typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k); }
function uid(){ return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function el(tag, cls, text){
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/* ---------- 루틴 기본값 ---------- */
function defaultRoutines(){
  return [
    {id:'d1', t:'출근', c:'R', tm:'08:30', days:[1,2,3,4,5], on:true},
    {id:'d2', t:'일일 업무보고', c:'R', tm:'', days:[1,2,3,4,5], on:true},
    {id:'d3', t:'퇴근', c:'R', tm:'17:30', days:[1,2,3,4,5], on:true},
    {id:'d4', t:'주간업무보고', c:'R', tm:'17:00', days:[4], on:true},
    {id:'d5', t:'집 가기', c:'T', tm:'', days:[1,2,3,4,5], on:true}
  ];
}

function normCat(cat, category){
  var c = String(cat == null ? '' : cat).trim().toUpperCase();
  if (c === 'R' || c === 'T' || c === 'E') return c;
  var s = String(category == null ? '' : category);
  if (s.indexOf('루틴') >= 0) return 'R';
  if (s.indexOf('운동') >= 0) return 'E';
  return 'T';
}

function normalizeRoutine(r){
  if (!r || typeof r !== 'object') return null;
  var t = String((r.t != null ? r.t : (r.title != null ? r.title : ''))).trim();
  if (!t) return null;
  var days = (Array.isArray(r.days) ? r.days : []).map(Number).filter(function(d){ return d >= 0 && d <= 6 && d % 1 === 0; });
  var uniq = [];
  days.forEach(function(d){ if (uniq.indexOf(d) < 0) uniq.push(d); });
  if (!uniq.length) return null;
  uniq.sort(function(a,b){ return a-b; });
  return {
    id: (typeof r.id === 'string' && r.id) ? r.id : uid(),
    t: t,
    c: normCat(r.c != null ? r.c : r.cat, r.category),
    tm: String(r.tm != null ? r.tm : (r.time != null ? r.time : '')) || '',
    days: uniq,
    on: r.on !== false
  };
}

function parseRoutines(obj){
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.routines)) return null;
  var out = [];
  obj.routines.forEach(function(r){
    var n = normalizeRoutine(r);
    if (n) out.push(n);
  });
  return out;
}

/* ---------- 불러오기 파서 (외부 형식 호환) ----------
   1) 투두메이트 내보내기: {records:[{date:"YYYY-MM-DD", items:[{title,category,cat,done,time}]}]}
   2) 이 앱/기존 my-todo.html 내보내기: {v:2, items:{"YYYY-MM-DD":[{t,c,d,tm}]}, routines:[...]}
   3) 날짜 → 배열 맵: {"YYYY-MM-DD":[["제목","T",1,""]]}
   4) 위 1) 형식의 최상위 배열
*/
function parseImportObject(obj){
  if (!obj || typeof obj !== 'object') throw new Error('JSON 형식이 아니에요');
  var out = {}, count = 0, skipped = 0, source = 'unknown';

  function push(date, it){
    if (!isDateKey(date) || !it) { skipped++; return; }
    var rawTitle = (it.t != null) ? it.t : (it.title != null ? it.title : it.name);
    if (typeof rawTitle !== 'string' || !rawTitle.trim()) { skipped++; return; }
    var c = normCat((it.c != null ? it.c : it.cat), it.category);
    var d = (it.d != null) ? !!it.d : !!it.done;
    var tm = (it.tm != null) ? it.tm : (it.time != null ? it.time : '');
    if (!out[date]) out[date] = [];
    out[date].push({t: rawTitle.trim(), c: c, d: d, tm: String(tm || '')});
    count++;
  }
  function pushRecordArray(arr){
    for (var i = 0; i < arr.length; i++){
      var rec = arr[i];
      if (!rec || !isDateKey(rec.date) || !Array.isArray(rec.items)) { skipped++; continue; }
      for (var j = 0; j < rec.items.length; j++) push(rec.date, rec.items[j]);
    }
  }
  function pushMap(map){
    var keys = Object.keys(map), used = 0;
    for (var i = 0; i < keys.length; i++){
      var date = keys[i], list = map[date];
      if (!isDateKey(date) || !Array.isArray(list)) { skipped++; continue; }
      used++;
      for (var j = 0; j < list.length; j++){
        var it = list[j];
        if (Array.isArray(it)) push(date, {t: it[0], c: it[1], d: it[2], tm: it[3]});
        else push(date, it);
      }
    }
    return used;
  }

  if (Array.isArray(obj.records)) {
    source = 'todomate-records';
    pushRecordArray(obj.records);
  } else if (Array.isArray(obj)) {
    source = 'records-array';
    pushRecordArray(obj);
  } else if (Array.isArray(obj.items)) {
    source = 'records-array';
    pushRecordArray(obj.items);
  } else if (obj.items && typeof obj.items === 'object') {
    source = 'app-export';
    if (!pushMap(obj.items)) throw new Error('투두 기록 형식을 찾지 못했어요');
  } else {
    source = 'date-map';
    if (!pushMap(obj)) throw new Error('투두 기록 형식을 찾지 못했어요');
  }

  var dates = Object.keys(out).length;
  if (!count) throw new Error('불러올 항목이 없어요');
  return {items: out, count: count, dates: dates, skipped: skipped, source: source};
}

/* 같은 날 · 같은 제목 · 같은 분류는 중복으로 보고 새로 넣지 않되,
   이미 있는 항목이 미완료이고 불러온 기록이 완료면 완료로 맞춰 줌 */
function mergeItems(target, incoming){
  var added = 0, fixed = 0;
  Object.keys(incoming).forEach(function(date){
    if (!target[date]) target[date] = [];
    var seen = {};
    target[date].forEach(function(x){ seen[x.t + '|' + x.c] = x; });
    incoming[date].forEach(function(it){
      var k = it.t + '|' + it.c;
      var have = seen[k];
      if (have){
        var changed = false;
        if (it.d && !have.d){ have.d = true; changed = true; }
        if (!have.tm && it.tm){ have.tm = it.tm; changed = true; }
        if (changed) fixed++;
        return;
      }
      seen[k] = it;
      target[date].push(it);
      added++;
    });
  });
  return {added: added, fixed: fixed};
}

/* ---------- 저장/불러오기 ---------- */
function emptyState(){
  return {v:3, items:{}, routines:defaultRoutines(), importedAt:null, bannerDismissed:false, autoFill:true};
}

function seed(){ return emptyState(); }

function load(){
  try{
    var raw = localStorage.getItem(STORE);
    if (!raw) return seed();
    var s = JSON.parse(raw);
    if (!s || !s.items || typeof s.items !== 'object') return seed();
    if (!Array.isArray(s.routines)){
      // 이전 버전(v2)에 저장된 기록은 그대로 두고 기본 루틴만 채워 넣음
      s.routines = defaultRoutines();
    }else{
      var fixed = [];
      s.routines.forEach(function(r){ var n = normalizeRoutine(r); if (n) fixed.push(n); });
      s.routines = fixed;
    }
    return s;
  }catch(e){ return seed(); }
}

function save(){
  try{ localStorage.setItem(STORE, JSON.stringify(state)); }
  catch(e){ toast('저장 공간이 부족해요'); }
}

function itemsOf(date){ return (state.items && state.items[date]) || []; }
function ensure(date){ if (!state.items[date]) state.items[date] = []; return state.items[date]; }

function toast(msg){
  var box = document.getElementById('toast');
  box.textContent = msg; box.classList.add('show');
  clearTimeout(box._t); box._t = setTimeout(function(){ box.classList.remove('show'); }, 2200);
}

/* ---------- 달력 ---------- */
function renderCalendar(){
  document.getElementById('monthTitle').textContent = viewYear + '년 ' + (viewMonth + 1) + '월';
  var cal = document.getElementById('cal');
  cal.innerHTML = '';
  DOW.forEach(function(d, i){
    var c = el('div', 'dow' + (i === 0 ? ' sun' : (i === 6 ? ' sat' : '')), d);
    cal.appendChild(c);
  });
  var startDow = new Date(viewYear, viewMonth, 1).getDay();
  var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  var prevDays = new Date(viewYear, viewMonth, 0).getDate();
  var cells = [], i;
  for (i = startDow - 1; i >= 0; i--) cells.push({d: new Date(viewYear, viewMonth - 1, prevDays - i), other: true});
  for (var d = 1; d <= daysInMonth; d++) cells.push({d: new Date(viewYear, viewMonth, d), other: false});
  while (cells.length % 7 !== 0) cells.push({d: new Date(viewYear, viewMonth + 1, cells.length - startDow - daysInMonth + 1), other: true});

  cells.forEach(function(c){
    var ds = fmt(c.d), list = itemsOf(ds);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cell' + (c.other ? ' other' : '') + (c.d.getDay() === 0 ? ' sun' : '') + (c.d.getDay() === 6 ? ' sat' : '');
    if (ds === todayStr()) btn.classList.add('today');
    if (ds === selDate) btn.classList.add('sel');
    var num = el('span', 'num', c.d.getDate());
    btn.appendChild(num);
    var dots = el('div', 'dots');
    var done = list.filter(function(x){ return x.d; }).length;
    var total = list.length;
    if (total > 0){
      var n = Math.min(3, Math.ceil(total / 3));
      for (var k = 0; k < n; k++){
        dots.appendChild(el('span', 'dot' + (k < Math.round(done / Math.max(total, 1) * n) ? ' done' : '')));
      }
    }
    btn.appendChild(dots);
    btn.onclick = function(){
      selDate = ds;
      if (c.other){ viewYear = c.d.getFullYear(); viewMonth = c.d.getMonth(); }
      renderCalendar(); renderDay();
    };
    cal.appendChild(btn);
  });
}

/* ---------- 하루 화면 ---------- */
function renderDay(){
  var d = parseDate(selDate);
  document.getElementById('dayTitle').textContent = (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + DOW[d.getDay()] + '요일';
  var list = itemsOf(selDate);
  var done = list.filter(function(x){ return x.d; }).length;
  document.getElementById('dayProg').textContent = list.length ? (done + ' / ' + list.length + ' 완료') : '';

  var quick = document.getElementById('quick');
  quick.innerHTML = '';
  function mk(label, cls, fn){
    var b = el('button', 'chip ' + cls, label);
    b.type = 'button'; b.onclick = fn;
    quick.appendChild(b);
  }
  mk('+ 오늘 루틴', 'solid', function(){ fillRoutine(false); });
  mk('+ 운동(상체)', '', function(){ addItem('운동(상체)', 'E', '19:30'); });
  mk('+ 운동(하체)', '', function(){ addItem('운동(하체)', 'E', '20:00'); });
  mk('+ 유산소', '', function(){ addItem('유산소', 'E', ''); });
  mk('+ 집 가기', '', function(){ addItem('집 가기', 'T', ''); });

  var groups = document.getElementById('groups');
  groups.innerHTML = '';
  if (!list.length){
    groups.appendChild(el('div', 'empty', '이 날의 기록이 없어요. 위 버튼으로 루틴을 채우거나 아래에서 추가해 보세요.'));
  }
  CAT_ORDER.forEach(function(cat){
    var arr = list.map(function(x, i){ return {x: x, i: i}; }).filter(function(o){ return o.x.c === cat; });
    if (!arr.length) return;
    var g = el('div', 'group');
    var h = el('div', 'ghead');
    h.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:' + CAT[cat].color +
      ';display:inline-block"></span>' + CAT[cat].name + ' <span class="n">' +
      arr.filter(function(o){ return o.x.d; }).length + '/' + arr.length + '</span>';
    g.appendChild(h);
    var ul = el('ul', 'items');
    arr.forEach(function(o){
      var x = o.x, i = o.i;
      var li = el('li');
      if (x.d) li.classList.add('done');
      var box = el('div', 'box', x.d ? '✓' : '');
      box.onclick = function(){ x.d = !x.d; save(); renderDay(); renderCalendar(); };
      var title = el('div', 'title', x.t);
      title.onclick = function(){ editTitle(title, i); };
      li.appendChild(box); li.appendChild(title);
      if (x.tm) li.appendChild(el('span', 'time', x.tm));
      var del = el('button', 'del', '×');
      del.type = 'button'; del.setAttribute('aria-label', '삭제');
      del.onclick = function(){
        if (confirm('이 항목을 지울까요?\n' + x.t)){ list.splice(i, 1); save(); renderDay(); renderCalendar(); }
      };
      li.appendChild(del);
      ul.appendChild(li);
    });
    g.appendChild(ul);
    groups.appendChild(g);
  });
  document.getElementById('mStat').textContent = monthStat();
  document.getElementById('aStat').textContent = allStat();
}

function editTitle(node, index){
  var arr = ensure(selDate);
  var cur = arr[index].t;
  var input = el('input');
  input.type = 'text'; input.value = cur; input.maxLength = 80;
  node.textContent = ''; node.appendChild(input); input.focus(); input.select();
  var commit = function(){
    var v = input.value.trim();
    if (v){ arr[index].t = v; save(); }
    renderDay();
  };
  input.onblur = commit;
  input.onkeydown = function(e){
    if (e.key === 'Enter'){ e.preventDefault(); input.blur(); }
    if (e.key === 'Escape'){ input.onblur = null; renderDay(); }
  };
}

function addItem(title, cat, time){
  var arr = ensure(selDate);
  if (arr.some(function(x){ return x.t === title && x.c === cat; })){ toast('이미 있어요'); return; }
  arr.push({t: title, c: cat, d: false, tm: time || ''});
  save(); renderDay(); renderCalendar();
}

/* ---------- 루틴 적용 ---------- */
function routinesFor(dateStr){
  var dow = parseDate(dateStr).getDay();
  return (state.routines || []).filter(function(r){ return r.on !== false && r.days.indexOf(dow) >= 0; });
}

function fillRoutine(silent){
  var set = routinesFor(selDate);
  if (!set.length){
    if (!silent) toast('이 요일에 맞는 루틴이 없어요 · 루틴 화면에서 등록해 보세요');
    return;
  }
  var arr = ensure(selDate), added = 0;
  set.forEach(function(r){
    if (!arr.some(function(x){ return x.t === r.t && x.c === r.c; })){ arr.push({t: r.t, c: r.c, d: false, tm: r.tm || ''}); added++; }
  });
  save(); renderDay(); renderCalendar();
  if (!silent) toast(added ? added + '개 루틴을 채웠어요' : '이미 루틴이 다 있어요');
}

function monthStat(){
  var pre = viewYear + '-' + pad2(viewMonth + 1);
  var done = 0, total = 0;
  Object.keys(state.items).forEach(function(d){
    if (d.indexOf(pre) !== 0) return;
    var arr = state.items[d] || [];
    total += arr.length; done += arr.filter(function(x){ return x.d; }).length;
  });
  return done + ' / ' + total;
}
function allStat(){
  var total = 0, dates = 0;
  Object.keys(state.items).forEach(function(d){ var a = state.items[d] || []; if (a.length) dates++; total += a.length; });
  return total + '건 · ' + dates + '일';
}

/* ---------- 루틴 관리 화면 ---------- */
function dayLabel(days){
  var s = days.slice().sort(function(a,b){ return a-b; });
  if (s.length === 7) return '매일';
  if (s.join(',') === '1,2,3,4,5') return '평일';
  if (s.join(',') === '0,6') return '주말';
  return s.map(function(d){ return DOW[d]; }).join('·');
}

function renderRoutines(){
  var host = document.getElementById('routineList');
  host.innerHTML = '';
  var list = state.routines || [];
  var onCount = list.filter(function(r){ return r.on !== false; }).length;
  document.getElementById('routineCount').textContent = list.length ? (onCount + ' / ' + list.length + '개 켜짐') : '';

  if (!list.length){
    var e = el('div', 'empty', '아직 등록된 루틴이 없어요. 위에서 첫 루틴을 등록해 보세요.');
    host.appendChild(e);
    var back = el('button', 'rbtn', '기본 루틴 다시 넣기');
    back.type = 'button';
    back.style.marginTop = '10px';
    back.onclick = function(){
      state.routines = defaultRoutines(); save(); renderRoutines();
      toast('기본 루틴을 넣었어요');
    };
    host.appendChild(back);
    return;
  }

  list.forEach(function(r){
    var card = el('div', 'ritem' + (r.on === false ? ' off' : ''));
    var row1 = el('div', 'r1');
    var dot = el('span', 'rdot');
    dot.style.background = CAT[r.c].color;
    row1.appendChild(dot);
    row1.appendChild(el('div', 'rtitle', r.t));
    if (r.tm) row1.appendChild(el('span', 'rtime', r.tm));
    card.appendChild(row1);

    var row2 = el('div', 'r2');
    row2.appendChild(el('div', 'rdays', CAT[r.c].short + ' · ' + dayLabel(r.days)));

    var sw = el('button', 'sw' + (r.on !== false ? ' on' : ''));
    sw.type = 'button';
    sw.setAttribute('aria-label', '이 루틴 켜기/끄기');
    sw.onclick = function(){
      r.on = (r.on === false);
      save(); renderRoutines();
      toast(r.on ? '루틴을 켰어요' : '루틴을 껐어요');
    };
    row2.appendChild(sw);

    var edit = el('button', 'rbtn', '수정');
    edit.type = 'button';
    edit.onclick = function(){ startEditRoutine(r.id); };
    row2.appendChild(edit);

    var del = el('button', 'rbtn', '삭제');
    del.type = 'button';
    del.onclick = function(){
      if (!confirm('이 루틴을 지울까요?\n' + r.t)) return;
      state.routines = state.routines.filter(function(x){ return x.id !== r.id; });
      save(); renderRoutines();
      if (editingRoutineId === r.id) resetRoutineForm();
      toast('루틴을 지웠어요');
    };
    row2.appendChild(del);

    card.appendChild(row2);
    host.appendChild(card);
  });
}

function syncDayChips(){
  var chips = document.getElementById('rtDays').children;
  for (var i = 0; i < chips.length; i++){
    var d = Number(chips[i].getAttribute('data-day'));
    if (pickedDays[d]) chips[i].classList.add('on');
    else chips[i].classList.remove('on');
  }
}

function setPickedDays(days){
  pickedDays = {};
  (days || []).forEach(function(d){ pickedDays[d] = true; });
  syncDayChips();
}

function resetRoutineForm(){
  editingRoutineId = null;
  document.getElementById('rtFormHead').textContent = '새 루틴 등록';
  document.getElementById('rtSubmit').textContent = '루틴 추가';
  document.getElementById('rtCancel').hidden = true;
  document.getElementById('rtTitle').value = '';
  document.getElementById('rtCat').value = 'R';
  document.getElementById('rtTime').value = '';
  setPickedDays([]);
}

function startEditRoutine(id){
  var r = (state.routines || []).filter(function(x){ return x.id === id; })[0];
  if (!r) return;
  editingRoutineId = id;
  document.getElementById('rtFormHead').textContent = '루틴 수정';
  document.getElementById('rtSubmit').textContent = '저장';
  document.getElementById('rtCancel').hidden = false;
  document.getElementById('rtTitle').value = r.t;
  document.getElementById('rtCat').value = r.c;
  document.getElementById('rtTime').value = r.tm || '';
  setPickedDays(r.days);
  var form = document.getElementById('routineForm');
  if (form.scrollIntoView) form.scrollIntoView({behavior:'smooth', block:'center'});
  else form.scrollIntoView();
}

function submitRoutine(){
  var t = document.getElementById('rtTitle').value.trim();
  if (!t){ toast('루틴 이름을 입력해 주세요'); return; }
  var days = Object.keys(pickedDays).filter(function(k){ return pickedDays[k]; }).map(Number);
  if (!days.length){ toast('반복 요일을 하나 이상 골라 주세요'); return; }
  days.sort(function(a,b){ return a-b; });
  var c = document.getElementById('rtCat').value;
  var tm = document.getElementById('rtTime').value || '';

  if (editingRoutineId){
    var r = (state.routines || []).filter(function(x){ return x.id === editingRoutineId; })[0];
    if (r){ r.t = t; r.c = c; r.tm = tm; r.days = days; }
    save(); resetRoutineForm(); renderRoutines();
    toast('루틴을 수정했어요');
  }else{
    state.routines.push({id: uid(), t: t, c: c, tm: tm, days: days, on: true});
    save(); resetRoutineForm(); renderRoutines();
    toast('루틴을 등록했어요');
  }
}

/* ---------- 화면 전환 ---------- */
function setView(v){
  view = v;
  var todo = document.getElementById('view-todo');
  var routines = document.getElementById('view-routines');
  todo.hidden = (v !== 'todo');
  routines.hidden = (v !== 'routines');
  document.getElementById('calHeader').style.display = (v === 'todo') ? '' : 'none';
  var t1 = document.getElementById('tabTodo'), t2 = document.getElementById('tabRoutines');
  if (v === 'todo'){ t1.classList.add('active'); t2.classList.remove('active'); }
  else { t2.classList.add('active'); t1.classList.remove('active'); }
  if (v === 'routines') renderRoutines();
  if (window.scrollTo) window.scrollTo(0, 0);
}

/* ---------- 안내 배너 ---------- */
function renderBanner(){
  var b = document.getElementById('banner');
  if (state.importedAt || state.bannerDismissed){ b.hidden = true; return; }
  b.hidden = false;
}
function dismissBanner(){
  state.bannerDismissed = true; save(); renderBanner();
}

/* ---------- 백업 ---------- */
function exportJson(){
  var data = JSON.stringify(state, null, 0);
  var blob = new Blob([data], {type: 'application/json'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'my-todo-backup-' + todayStr() + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 2000);
  toast('백업 파일을 내려받았어요 (루틴 포함)');
}

function importJson(file){
  var r = new FileReader();
  r.onerror = function(){ toast('파일을 읽지 못했어요'); };
  r.onload = function(){
    var obj, parsed, incomingRoutines;
    try{
      obj = JSON.parse(r.result);
      parsed = parseImportObject(obj);
      incomingRoutines = parseRoutines(obj);
    }catch(e){
      toast('불러오지 못했어요: ' + (e && e.message ? e.message : '형식 확인 필요'));
      return;
    }
    var res = mergeItems(state.items, parsed.items);
    var routineMsg = '';
    if (incomingRoutines && incomingRoutines.length){
      state.routines = incomingRoutines;
      routineMsg = ' · 루틴 ' + incomingRoutines.length + '개도 함께';
      renderRoutines();
    }
    state.importedAt = new Date().toISOString();
    state.bannerDismissed = true;
    save(); renderBanner(); renderCalendar(); renderDay();
    var totalMsg = ' · 총 ' + allStat().replace('건 ·', '건,');
    if (res.added === 0 && res.fixed === 0){
      toast('이미 모두 들어 있어요 (' + parsed.count.toLocaleString() + '건 확인)' + routineMsg);
    }else if (res.added === 0){
      toast(res.fixed.toLocaleString() + '건의 완료 표시를 기록에 맞췄어요' + totalMsg + routineMsg);
    }else{
      var msg = res.added.toLocaleString() + '건을 불러왔어요';
      if (res.fixed) msg += ' (' + res.fixed.toLocaleString() + '건 완료 표시 정리)';
      toast(msg + totalMsg + routineMsg);
    }
  };
  r.readAsText(file);
}

/* ---------- 시작 ---------- */
function boot(){
  state = load();
  var now = new Date();
  viewYear = now.getFullYear(); viewMonth = now.getMonth();
  selDate = todayStr();

  if (state.autoFill !== false && itemsOf(selDate).length === 0) fillRoutine(true);

  renderCalendar();
  renderDay();
  renderBanner();
  updateAutoBtn();
  setPickedDays([]);
  renderRoutines();
  setView('todo');

  document.getElementById('prevMonth').onclick = function(){
    viewMonth--; if (viewMonth < 0){ viewMonth = 11; viewYear--; } renderCalendar();
  };
  document.getElementById('nextMonth').onclick = function(){
    viewMonth++; if (viewMonth > 11){ viewMonth = 0; viewYear++; } renderCalendar();
  };
  document.getElementById('todayBtn').onclick = function(){
    var d = new Date(); viewYear = d.getFullYear(); viewMonth = d.getMonth();
    selDate = todayStr(); renderCalendar(); renderDay();
  };
  document.getElementById('addForm').onsubmit = function(e){
    e.preventDefault();
    var t = document.getElementById('newTitle').value.trim();
    if (!t) return;
    var c = document.getElementById('newCat').value;
    var tm = document.getElementById('newTime').value;
    ensure(selDate).push({t: t, c: c, d: false, tm: tm});
    document.getElementById('newTitle').value = '';
    save(); renderDay(); renderCalendar();
  };
  document.getElementById('clearTime').onclick = function(){ document.getElementById('newTime').value = ''; };
  document.getElementById('autoBtn').onclick = function(){
    state.autoFill = !(state.autoFill !== false);
    save(); updateAutoBtn();
    toast(state.autoFill ? '매일 아침 오늘 루틴을 채워요' : '자동 채우기를 껐어요');
  };
  document.getElementById('exportBtn').onclick = exportJson;
  document.getElementById('exportBtn2').onclick = exportJson;
  document.getElementById('importFile').onchange = function(e){
    if (e.target.files[0]) importJson(e.target.files[0]);
    e.target.value = '';
  };
  document.getElementById('bannerImport').onclick = function(){ document.getElementById('importFile').click(); };
  document.getElementById('bannerClose').onclick = dismissBanner;
  document.getElementById('bannerLater').onclick = dismissBanner;

  // 탭
  document.getElementById('tabTodo').onclick = function(){ setView('todo'); };
  document.getElementById('tabRoutines').onclick = function(){ setView('routines'); };

  // 루틴 요일 선택
  var chips = document.getElementById('rtDays').children;
  for (var i = 0; i < chips.length; i++){
    (function(btn){
      btn.onclick = function(){
        var d = Number(btn.getAttribute('data-day'));
        pickedDays[d] = !pickedDays[d];
        syncDayChips();
      };
    })(chips[i]);
  }
  document.getElementById('rtEvery').onclick = function(){ setPickedDays([0,1,2,3,4,5,6]); };
  document.getElementById('rtWeekday').onclick = function(){ setPickedDays([1,2,3,4,5]); };
  document.getElementById('rtWeekend').onclick = function(){ setPickedDays([0,6]); };
  document.getElementById('routineForm').onsubmit = function(e){ e.preventDefault(); submitRoutine(); };
  document.getElementById('rtCancel').onclick = function(){ resetRoutineForm(); };

  if (!localStorage.getItem(STORE)) save();
}

function updateAutoBtn(){
  var on = state.autoFill !== false;
  var b = document.getElementById('autoBtn');
  if (b) b.textContent = '오늘 루틴 자동 채우기: ' + (on ? '켜짐' : '꺼짐');
}

/* 서비스 워커 (오프라인 앱 셸) */
if (typeof window !== 'undefined' && 'serviceWorker' in navigator &&
    (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')){
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('sw.js', {updateViaCache:'none'}).catch(function(){});
  });
}

if (typeof document !== 'undefined') boot();

/* Node 테스트용 노출 */
if (typeof module !== 'undefined' && module.exports){
  module.exports = {
    parseImportObject: parseImportObject, mergeItems: mergeItems, normCat: normCat, emptyState: emptyState,
    normalizeRoutine: normalizeRoutine, parseRoutines: parseRoutines, defaultRoutines: defaultRoutines, dayLabel: dayLabel
  };
}
