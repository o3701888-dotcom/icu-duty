(() => {
  const SHIFT_LABELS = { day: '白班', evening: '小夜', night: '大夜', admin: '行政', off: '休假', other: '其他' };
  const SHIFT_ORDER = ['day','evening','night'];
  const DEFAULT_DUTIES = [
    {id:'leader', code:'△1', name:'Leader', shifts:['day','evening','night'], countInTotal:true, supportCompatible:false, enabled:true},
    {id:'runner', code:'△', name:'跑999＋點冰箱', shifts:['day','evening','night'], countInTotal:true, supportCompatible:false, enabled:true},
    {id:'a', code:'A', name:'點A點班本', shifts:['day'], countInTotal:true, supportCompatible:true, enabled:true},
    {id:'b', code:'B', name:'點B點班本', shifts:['day','evening','night'], countInTotal:true, supportCompatible:true, enabled:true},
    {id:'duty', code:'*', name:'值日生', shifts:['day','evening','night'], countInTotal:true, supportCompatible:true, enabled:true},
    {id:'emergency', code:'急', name:'急救車', shifts:['day','evening','night'], countInTotal:true, supportCompatible:true, enabled:true},
    {id:'w', code:'W', name:'假日白班工作', shifts:['day'], countInTotal:true, supportCompatible:true, holidayOnly:true, enabled:true},
    {id:'support', code:'支', name:'支援', shifts:['day','evening','night'], countInTotal:false, supportCompatible:true, enabled:true, special:'support'}
  ];
  const DEFAULT_SOFT = [
    {id:'totalFair', name:'每月總點班次數平均', stars:5, enabled:true},
    {id:'dutyFair', name:'每種點班項目各自平均', stars:5, enabled:true},
    {id:'leaderFair', name:'△1 次數公平', stars:5, enabled:true},
    {id:'supportFair', name:'支援次數公平', stars:5, enabled:true},
    {id:'leaderContinuity', name:'△1 Leader 連續性', stars:4, enabled:true},
    {id:'supportEdge', name:'支援優先連續工作區段第一／最後一天', stars:4, enabled:true},
    {id:'supportNoDuty', name:'支援優先當天沒有其他點班者', stars:4, enabled:true},
    {id:'avoidSupportOffSupport', name:'避免「支－休－支」', stars:3, enabled:true}
  ];
  const DEFAULT_HARD = [
    {id:'qualified', name:'工作資格限制', desc:'每個點班項目只能由該項目已勾選資格的人員負責。', enabled:true},
    {id:'aDayOnly', name:'A 僅白班', desc:'A 點班本只在白班出現。', enabled:true},
    {id:'oneDuty', name:'一般點班每日最多一項', desc:'同一人同一天不可同時負責兩個一般點班。', enabled:true},
    {id:'supportNoLeader', name:'支援與 △／△1 互斥', desc:'支援可與 A/B/*/急併存，但不可與 △ 或 △1 同時出現。', enabled:true},
    {id:'managerPriority', name:'白班護理長優先 △1', desc:'護理長當日有上白班時，白班 △1 必須由護理長擔任。', enabled:true},
    {id:'excluded', name:'不參與點班者排除', desc:'人員後台勾選「不參與點班」後，不會被排入點班或支援。', enabled:true},
    {id:'supportEveryShift', name:'每班固定安排支援', desc:'白班、小夜、大夜每天都各安排一名支援。', enabled:true}
  ];

  let state = loadState() || makeInitialState(window.SAMPLE_SCHEDULE);
  migrateState();
  let activeView = 'home';
  let resultShiftFilter = 'all';
  let fairnessFocus = 'total';
  let balanceSuggestions = [];

  function makeInitialState(sample){
    const people = sample.staff.map((s,i) => ({
      id:'p'+(i+1), name:s.name, baseShift:s.baseShift || '', active:true, excluded:false, manager:false,
      qualifications:Object.fromEntries(DEFAULT_DUTIES.map(d=>[d.id,true]))
    }));
    return {
      year:sample.year, month:sample.month, sourceName:sample.sourceName,
      schedule:sample.staff.map((s,i)=>({personId:'p'+(i+1), shifts:{...s.shifts}})),
      shiftCodes:{...sample.shiftCodes}, people, duties:structuredClone(DEFAULT_DUTIES),
      softRules:structuredClone(DEFAULT_SOFT), hardRules:structuredClone(DEFAULT_HARD),
      assignments:{}, locks:{}, importedAt:null, history:[], holidays:[]
    };
  }

  function migrateState(){
    state.history ||= [];
    state.holidays ||= [];
    state.personProfiles ||= {};
    state.people=state.people.filter(p=>p.name!=='RCC');
    state.people.forEach(p=>delete p.rcc);
    if(!state.duties.some(d=>d.id==='w')){
      state.duties.splice(Math.max(0,state.duties.findIndex(d=>d.id==='support')),0,{id:'w',code:'W',name:'假日白班工作',shifts:['day'],countInTotal:true,supportCompatible:true,holidayOnly:true,enabled:true});
      state.people.forEach(p=>p.qualifications.w=true);
    }
    syncPersonProfiles();
  }

  function syncPersonProfiles(){
    state.personProfiles ||= {};
    state.people.forEach(p=>state.personProfiles[p.name]={id:p.id,name:p.name,baseShift:p.baseShift||'',active:p.active!==false,excluded:!!p.excluded,manager:!!p.manager,qualifications:{...(p.qualifications||{})}});
  }
  function save(){ syncPersonProfiles(); localStorage.setItem('icuDutyPrototypeV01', JSON.stringify(state)); }
  function loadState(){ try{return JSON.parse(localStorage.getItem('icuDutyPrototypeV01'));}catch{return null;} }
  function reset(){ state=makeInitialState(window.SAMPLE_SCHEDULE); migrateState(); save(); renderAll(); toast('已重設為範例資料'); }
  function personById(id){ return state.people.find(p=>p.id===id); }
  function dutyById(id){ return state.duties.find(d=>d.id===id); }
  function soft(id){ return state.softRules.find(r=>r.id===id); }
  function hardEnabled(id){ return state.hardRules.find(r=>r.id===id)?.enabled !== false; }
  function daysInMonth(){ return new Date(state.year, state.month, 0).getDate(); }
  function key(day,shift,duty){ return `${day}|${shift}|${duty}`; }
  function lockKey(day,shift,duty){ return key(day,shift,duty); }
  function getPersonShift(personId, day){ const row=state.schedule.find(r=>r.personId===personId); return row?.shifts?.[String(day)] || ''; }
  function normalizedShift(code){ return state.shiftCodes[String(code).trim()] || (['05','92','95','46','00'].includes(String(code).trim()) ? {05:'day',92:'evening',95:'night',46:'admin',00:'off'}[String(code).trim()] : 'other'); }
  function workingPeople(day, shift){
    return state.people.filter(p=>p.active && normalizedShift(getPersonShift(p.id, day))===shift);
  }
  function dateKey(day){return `${state.year}-${String(state.month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;}
  function isHoliday(day){const dow=new Date(state.year,state.month-1,day).getDay();return dow===0||dow===6||state.holidays.some(h=>(typeof h==='string'?h:h.date)===dateKey(day));}
  function dutyApplies(d,day,shift){return d.enabled&&d.shifts.includes(shift)&&(!d.holidayOnly||isHoliday(day));}
  function isWorkDay(personId, day){ return SHIFT_ORDER.includes(normalizedShift(getPersonShift(personId, day))); }
  function isOff(personId, day){ return normalizedShift(getPersonShift(personId, day))==='off'; }
  function isEdgeWorkDay(personId, day){
    if(!isWorkDay(personId,day)) return false;
    const prev = day<=1 ? false : isWorkDay(personId,day-1);
    const next = day>=daysInMonth() ? false : isWorkDay(personId,day+1);
    return !prev || !next;
  }
  function hasSupportOffSupport(personId, day){
    if(day<=2) return false;
    const had = Object.entries(state.assignments).some(([k,v])=>{
      const [d,s,du]=k.split('|'); return +d===day-2 && du==='support' && v===personId;
    });
    return had && isOff(personId,day-1);
  }
  function todayRegularAssignment(personId, day){
    return Object.entries(state.assignments).find(([k,v])=>{
      const [d,,du]=k.split('|'); return +d===day && du!=='support' && v===personId;
    });
  }
  function counts(includeHistory=false){
    const out={}; state.people.forEach(p=>out[p.id]={total:0,support:0,byDuty:{}});
    if(includeHistory){
      const byName=Object.fromEntries(state.people.map(p=>[p.name,p.id]));
      const currentPeriod=`${state.year}-${String(state.month).padStart(2,'0')}`;
      state.history.filter(record=>record.period!==currentPeriod).forEach(record=>Object.entries(record.people||{}).forEach(([name,c])=>{
        const pid=byName[name];if(!pid||!out[pid])return;
        out[pid].total+=(c.total||0);out[pid].support+=(c.support||0);
        Object.entries(c.byDuty||{}).forEach(([did,n])=>out[pid].byDuty[did]=(out[pid].byDuty[did]||0)+n);
      }));
    }
    Object.entries(state.assignments).forEach(([k,pid])=>{
      if(!pid || !out[pid]) return; const [, , did]=k.split('|');
      if(did==='support') out[pid].support++;
      else {out[pid].byDuty[did]=(out[pid].byDuty[did]||0)+1; if(dutyById(did)?.countInTotal) out[pid].total++;}
    });
    return out;
  }
  function candidateEligible(p, day, shift, dutyId){
    if(!p.active || p.excluded) return false;
    if(normalizedShift(getPersonShift(p.id, day))!==shift) return false;
    if(hardEnabled('qualified') && !p.qualifications?.[dutyId]) return false;
    if(dutyId==='support'){
      if(hardEnabled('supportNoLeader')){
        const reg=todayRegularAssignment(p.id,day);
        if(reg){ const du=reg[0].split('|')[2]; if(['leader','runner'].includes(du)) return false; }
      }
      return true;
    }
    if(hardEnabled('oneDuty') && todayRegularAssignment(p.id,day)) return false;
    if(['leader','runner'].includes(dutyId)){
      const supportAssigned = Object.entries(state.assignments).some(([k,v])=>{
        const [d,,du]=k.split('|'); return +d===day && du==='support' && v===p.id;
      });
      if(hardEnabled('supportNoLeader') && supportAssigned) return false;
    }
    return true;
  }
  function leaderWasYesterday(p, day){
    if(day<=1) return false;
    return Object.entries(state.assignments).some(([k,v])=>{
      const [d,,du]=k.split('|'); return +d===day-1 && du==='leader' && v===p.id;
    });
  }
  function scoreCandidate(p, day, shift, dutyId, cnt){
    let score=0;
    const stars=id => (soft(id)?.enabled ? soft(id).stars : 0);
    if(dutyId==='support'){
      score += stars('supportFair') * (cnt[p.id].support * 100);
      if(isEdgeWorkDay(p.id,day)) score -= stars('supportEdge')*22;
      if(!todayRegularAssignment(p.id,day)) score -= stars('supportNoDuty')*18;
      if(hasSupportOffSupport(p.id,day)) score += stars('avoidSupportOffSupport')*26;
      return score;
    }
    // 總點班是第一層公平門檻：一個總次數的差距必須大於
    // 單一點班本與連續性偏好的全部加總，才不會月底越排越失衡。
    score += stars('totalFair') * cnt[p.id].total * 10000;
    // 總次數相同或接近時，再讓每一本各自平均。
    score += stars('dutyFair') * (cnt[p.id].byDuty[dutyId]||0) * 500;
    if(dutyId==='leader'){
      score += stars('leaderFair') * (cnt[p.id].byDuty.leader||0) * 650;
      if(leaderWasYesterday(p,day)) score -= stars('leaderContinuity')*120;
    }
    return score;
  }
  function chooseCandidate(day,shift,dutyId){
    const cnt=counts(true);
    let candidates=workingPeople(day,shift).filter(p=>candidateEligible(p,day,shift,dutyId));
    if(dutyId==='leader' && shift==='day' && hardEnabled('managerPriority')){
      const managers=candidates.filter(p=>p.manager);
      if(managers.length) candidates=managers;
    }
    candidates.sort((a,b)=>scoreCandidate(a,day,shift,dutyId,cnt)-scoreCandidate(b,day,shift,dutyId,cnt) || a.name.localeCompare(b.name,'zh-Hant'));
    return candidates[0]?.id || '';
  }
  function generate(reoptimize=false){
    if(!reoptimize){ state.assignments={}; state.locks={}; }
    else {
      Object.keys(state.assignments).forEach(k=>{ if(!state.locks[k]) delete state.assignments[k]; });
    }
    for(let day=1;day<=daysInMonth();day++){
      for(const shift of SHIFT_ORDER){
        const regular = state.duties.filter(d=>d.id!=='support' && dutyApplies(d,day,shift));
        for(const d of regular){
          const k=key(day,shift,d.id); if(state.locks[k] && state.assignments[k]) continue;
          const pick=chooseCandidate(day,shift,d.id); if(pick) state.assignments[k]=pick;
        }
        const supportDuty=state.duties.find(d=>d.id==='support'&&d.enabled&&d.shifts.includes(shift));
        if(supportDuty){
          const k=key(day,shift,'support'); if(!(state.locks[k] && state.assignments[k])){ const pick=chooseCandidate(day,shift,'support'); if(pick) state.assignments[k]=pick; }
        }
      }
    }
    save(); renderAll(); showView('results'); toast(reoptimize?'已重新最佳化未鎖定項目':'已完成自動排點班');
  }

  function renderAll(){ renderHome(); renderImport(); renderPeople(); renderDuties(); renderHolidays(); renderHardRules(); renderSoftRules(); renderResults(); renderBalance(); renderFairness(); renderConfirmExport(); renderHistory(); }
  function renderHome(){
    const el=document.querySelector('#view-home'); const assigned=Object.keys(state.assignments).length; const unknown=countUnknownCodes();
    el.innerHTML=`
      <div class="grid kpis">
        ${kpi('目前月份',`${state.year}/${String(state.month).padStart(2,'0')}`,'可由 Excel 匯入更新')}
        ${kpi('有效人員',state.people.filter(p=>p.active).length,`${state.people.filter(p=>p.excluded).length} 人設定不參與點班`)}
        ${kpi('點班項目',state.duties.filter(d=>d.enabled).length,'含獨立統計的支援')}
        ${kpi('已產生指派',assigned,assigned?'可進入點班結果檢視':'尚未執行自動排班')}
      </div>
      <div class="split">
        <div class="card"><h2>目前班表</h2><div class="status-list">
          <div class="status-item"><span>來源</span><strong>${escapeHtml(state.sourceName||'範例資料')}</strong></div>
          <div class="status-item"><span>班別代碼</span><span><span class="tag good">05 白班</span> <span class="tag">92 小夜</span> <span class="tag">95 大夜</span> <span class="tag">46 行政不納入</span> <span class="tag">00 休假</span></span></div>
          <div class="status-item"><span>未知班別代碼</span><strong class="${unknown?'':'muted'}">${unknown} 筆</strong></div>
        </div></div>
        <div class="card"><h2>排班核心原則</h2><div class="status-list">
          <div class="status-item"><span>一般點班</span><strong>每人每天最多 1 項</strong></div>
          <div class="status-item"><span>支援</span><strong>獨立公平，可與一般點班併存</strong></div>
          <div class="status-item"><span>△1</span><strong>白班護理長優先＋其他人輪替公平</strong></div>
          <div class="status-item"><span>公平性</span><strong>總次數＋各點班項目＋△1＋支援</strong></div>
        </div></div>
      </div>`;
  }
  function kpi(label,value,note){return `<div class="card"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-note">${note}</div></div>`}
  function countUnknownCodes(){ let n=0; state.schedule.forEach(r=>Object.values(r.shifts).forEach(c=>{if(!state.shiftCodes[String(c).trim()] && ![''].includes(String(c).trim())) n++;})); return n; }

  function renderImport(){
    const el=document.querySelector('#view-import');
    const previews=[]; for(let d=1;d<=Math.min(5,daysInMonth());d++){ previews.push(`<tr><td>${state.month}/${d}</td>${SHIFT_ORDER.map(s=>`<td>${workingPeople(d,s).map(p=>p.name).join('、')||'—'}</td>`).join('')}</tr>`); }
    const memoryNote=state.lastImportStats?`<div class="notice" style="margin-top:14px"><strong>上次匯入：</strong>已沿用 ${state.lastImportStats.reused} 位既有人員設定，新增 ${state.lastImportStats.added} 位新進人員。</div>`:'';
    el.innerHTML=`<div class="card"><div class="upload"><h2>匯入每月 Excel 班表</h2><p class="muted">系統會依姓名自動沿用之前保存的護理長、不參與點班及各項資格；只有新名字需要設定一次。</p><input type="file" id="excelFile" accept=".xlsx,.xls" /><div class="small-note">未出現在本月班表的人員設定仍會保留，之後再次出現時會自動恢復。</div>${memoryNote}</div></div>
      <div class="card" style="margin-top:16px"><div class="toolbar"><h2>班別辨識預覽</h2><span class="tag">${escapeHtml(state.sourceName||'尚未匯入')}</span></div><div class="table-wrap"><table><thead><tr><th>日期</th><th>白班 05</th><th>小夜 92</th><th>大夜 95</th></tr></thead><tbody>${previews.join('')}</tbody></table></div></div>
      <div class="card" style="margin-top:16px"><h3>班別代碼設定</h3><div class="form-row">${Object.entries({05:'day',92:'evening',95:'night',46:'admin',00:'off'}).map(([code,type])=>`<label>${code} <select data-code="${code}" class="code-map">${['day','evening','night','admin','off','other'].map(v=>`<option value="${v}" ${state.shiftCodes[code]===v?'selected':''}>${SHIFT_LABELS[v]}</option>`).join('')}</select></label>`).join('')}</div></div>`;
    document.querySelector('#excelFile').onchange=importExcel;
    document.querySelectorAll('.code-map').forEach(sel=>sel.onchange=e=>{state.shiftCodes[e.target.dataset.code]=e.target.value; save(); renderAll();});
  }

  async function importExcel(e){
    const file=e.target.files[0]; if(!file) return;
    if(typeof XLSX==='undefined'){ toast('無法載入 Excel 解析元件，請確認網路連線'); return; }
    try{
      const buf=await file.arrayBuffer(); const wb=XLSX.read(buf,{type:'array'}); const ws=wb.Sheets[wb.SheetNames[0]]; const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:''});
      const parsed=parseHospitalRoster(rows); if(!parsed.staff.length) throw new Error('找不到人員資料');
      const oldByName=Object.fromEntries(state.people.map(p=>[p.name,p]));
      syncPersonProfiles();
      let reused=0,added=0;
      const people=parsed.staff.map((s,i)=>{
        const old=oldByName[s.name]||state.personProfiles[s.name];
        if(old){reused++;return {...old,name:s.name,baseShift:s.baseShift||old.baseShift||'',qualifications:Object.fromEntries(state.duties.map(d=>[d.id,old.qualifications?.[d.id]??true]))};}
        added++;return {id:'p'+Date.now()+i,name:s.name,baseShift:s.baseShift||'',active:true,excluded:false,manager:false,qualifications:Object.fromEntries(state.duties.map(d=>[d.id,true]))};
      });
      const nameToId=Object.fromEntries(people.map(p=>[p.name,p.id]));
      state.people=people; state.schedule=parsed.staff.map(s=>({personId:nameToId[s.name],shifts:s.shifts})); state.year=parsed.year; state.month=parsed.month; state.sourceName=file.name; state.assignments={}; state.locks={}; state.importedAt=new Date().toISOString();state.lastImportStats={reused,added};
      save(); renderAll(); toast(`匯入完成：沿用 ${reused} 人，新增 ${added} 人`);
    }catch(err){ console.error(err); toast('Excel 解析失敗：'+err.message); }
  }

  function parseHospitalRoster(rows){
    const headerRow=rows.findIndex(r=>r.filter(v=>String(v).trim()==='姓名').length>=1); if(headerRow<0) throw new Error('未找到「姓名」欄');
    const dateRow=Math.max(0,headerRow-1); const dateCells=rows[dateRow];
    const nameCols=[]; rows[headerRow].forEach((v,i)=>{if(String(v).trim()==='姓名') nameCols.push(i)}); if(!nameCols.length) throw new Error('未找到姓名欄');
    const segments=[];
    nameCols.forEach((nc,idx)=>{
      const next=nameCols[idx+1]??rows[headerRow].length; const dates=[];
      for(let c=nc+1;c<next;c++){
        const raw=String(dateCells[c]||'').trim(); const m=raw.match(/(?:\d{1,2}\/)?(\d{1,2})\s*$/); if(m){ const day=+m[1]; if(day>=1&&day<=31) dates.push({col:c,day}); }
      }
      if(dates.length) segments.push({nameCol:nc,dates});
    });
    const byName={};
    for(let r=headerRow+1;r<rows.length;r++){
      for(const seg of segments){
        const name=String(rows[r]?.[seg.nameCol]||'').trim(); if(!name || ['姓名','D','E','N','公出','預假','行政','未獨立','帶N'].includes(name)) continue;
        if(!byName[name]) byName[name]={name,baseShift:String(rows[r]?.[seg.nameCol+1]||'').trim(),shifts:{}};
        seg.dates.forEach(({col,day})=>{ const code=String(rows[r]?.[col]||'').trim(); if(code) byName[name].shifts[String(day)]=code; });
      }
    }
    let month=state.month, year=state.year; const firstDate=String(rows[dateRow].find(v=>String(v).includes('/'))||''); const mm=firstDate.match(/(\d{1,2})\/(\d{1,2})/); if(mm) month=+mm[1];
    return {year,month,staff:Object.values(byName)};
  }

  function renderPeople(){
    const el=document.querySelector('#view-people');
    el.innerHTML=`<div class="card"><div class="toolbar"><div class="left"><h2>本月人員與資格</h2><span class="tag">本月 ${state.people.length} 人</span><span class="tag good">設定庫 ${Object.keys(state.personProfiles||{}).length} 人</span></div><div class="right"><button class="btn small" id="addPerson">＋新增人員</button></div></div><div class="notice" style="margin-bottom:12px">資格設定會依姓名長期保存。下月匯入同名人員時會自動沿用，不必重新勾選。</div><div class="table-wrap"><table><thead><tr><th class="name">姓名</th><th>在職</th><th>不參與點班</th><th>護理長</th>${state.duties.map(d=>`<th>${escapeHtml(d.code)}</th>`).join('')}<th>操作</th></tr></thead><tbody>${state.people.map(p=>`<tr><td class="name"><strong>${escapeHtml(p.name)}</strong><div class="small-note">原班別 ${escapeHtml(p.baseShift||'—')}</div></td><td>${check(`active|${p.id}`,p.active)}</td><td>${check(`excluded|${p.id}`,p.excluded)}</td><td>${check(`manager|${p.id}`,p.manager)}</td>${state.duties.map(d=>`<td>${check(`qual|${p.id}|${d.id}`,!!p.qualifications?.[d.id])}</td>`).join('')}<td><div class="row-actions"><button class="btn small" data-edit-person="${p.id}">編輯</button><button class="btn small" data-remove="${p.id}">停用</button></div></td></tr>`).join('')}</tbody></table></div></div>`;
    el.querySelectorAll('input[data-bind]').forEach(inp=>inp.onchange=handlePersonToggle);
    el.querySelector('#addPerson').onclick=()=>openFormModal('新增人員',[{name:'name',label:'姓名',required:true},{name:'baseShift',label:'原班別'}],{},values=>{state.people.push({id:'p'+Date.now(),name:values.name.trim(),baseShift:values.baseShift.trim(),active:true,excluded:false,manager:false,qualifications:Object.fromEntries(state.duties.map(d=>[d.id,true]))});save();renderAll();toast('已新增人員');});
    el.querySelectorAll('[data-edit-person]').forEach(b=>b.onclick=()=>{const p=personById(b.dataset.editPerson);if(!p)return;openFormModal('編輯人員',[{name:'name',label:'姓名',required:true},{name:'baseShift',label:'原班別'}],p,values=>{const oldName=p.name;p.name=values.name.trim();p.baseShift=values.baseShift.trim();if(oldName!==p.name)delete state.personProfiles[oldName];save();renderAll();toast('已更新人員資料');});});
    el.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{ const p=personById(b.dataset.remove); if(p){p.active=false; save(); renderAll();}});
  }
  function check(bind,val){return `<label class="switch"><input type="checkbox" data-bind="${bind}" ${val?'checked':''}></label>`}
  function handlePersonToggle(e){ const [type,pid,did]=e.target.dataset.bind.split('|'); const p=personById(pid); if(!p)return; if(type==='qual'){p.qualifications[did]=e.target.checked}else p[type]=e.target.checked; save(); renderAll(); }

  function renderDuties(){
    const el=document.querySelector('#view-duties');
    el.innerHTML=`<div class="card"><div class="toolbar"><div class="left"><h2>點班項目</h2><span class="tag">全部可編輯</span></div><button class="btn small" id="addDuty">＋新增項目</button></div><div class="table-wrap"><table><thead><tr><th>代號</th><th class="name">名稱</th><th>白班</th><th>小夜</th><th>大夜</th><th>計入總點班</th><th>啟用</th><th>合格人數</th><th>操作</th></tr></thead><tbody>${state.duties.map(d=>`<tr><td><input data-duty-code="${d.id}" value="${escapeAttr(d.code)}" style="width:58px"></td><td class="name"><input data-duty-name="${d.id}" value="${escapeAttr(d.name)}"></td>${SHIFT_ORDER.map(s=>`<td>${check(`dutyshift|${d.id}|${s}`,d.shifts.includes(s))}</td>`).join('')}<td>${check(`counttotal|${d.id}`,d.countInTotal)}</td><td>${check(`dutyenabled|${d.id}`,d.enabled)}</td><td>${state.people.filter(p=>p.qualifications?.[d.id]).length}</td><td><button class="btn small" data-edit-duty="${d.id}">編輯</button></td></tr>`).join('')}</tbody></table></div><div class="notice" style="margin-top:12px">「支」目前設定為獨立公平統計、不計入一般點班總次數，並可與 A / B / * / 急併存。</div></div>`;
    el.querySelectorAll('input[data-bind]').forEach(i=>i.onchange=handleDutyToggle);
    el.querySelectorAll('[data-duty-code]').forEach(i=>i.onchange=()=>{dutyById(i.dataset.dutyCode).code=i.value;save();renderAll();});
    el.querySelectorAll('[data-duty-name]').forEach(i=>i.onchange=()=>{dutyById(i.dataset.dutyName).name=i.value;save();renderAll();});
    el.querySelector('#addDuty').onclick=()=>openFormModal('新增點班項目',[{name:'code',label:'代號',required:true},{name:'name',label:'名稱',required:true}],{},values=>{const id='custom'+Date.now();state.duties.push({id,code:values.code.trim(),name:values.name.trim(),shifts:[...SHIFT_ORDER],countInTotal:true,supportCompatible:true,enabled:true});state.people.forEach(p=>p.qualifications[id]=true);save();renderAll();toast('已新增點班項目');});
    el.querySelectorAll('[data-edit-duty]').forEach(b=>b.onclick=()=>{const d=dutyById(b.dataset.editDuty);if(!d)return;openFormModal('編輯點班項目',[{name:'code',label:'代號',required:true},{name:'name',label:'名稱',required:true}],d,values=>{d.code=values.code.trim();d.name=values.name.trim();save();renderAll();toast('已更新點班項目');});});
  }
  function handleDutyToggle(e){ const [type,did,s]=e.target.dataset.bind.split('|'); const d=dutyById(did); if(!d)return; if(type==='dutyshift'){ d.shifts=e.target.checked?[...new Set([...d.shifts,s])]:d.shifts.filter(x=>x!==s); } else if(type==='counttotal') d.countInTotal=e.target.checked; else if(type==='dutyenabled')d.enabled=e.target.checked; save(); renderAll(); }

  function renderHolidays(){
    const el=document.querySelector('#view-holidays'),yearItems=state.holidays.filter(h=>String(typeof h==='string'?h:h.date).startsWith(`${state.year}-`));
    el.innerHTML=`<div class="card"><div class="toolbar"><div><h2>${state.year} 年假日設定</h2><div class="small-note">每週六、週日會自動安排 W；國定假日及連假請在這裡加入，避免每年制度調整造成誤判。</div></div><span class="tag">W 僅白班</span></div><div class="form-row"><label>日期 <input type="date" id="holidayDate" min="${state.year}-01-01" max="${state.year}-12-31"></label><label>名稱 <input type="text" id="holidayName" placeholder="例如：中秋節"></label><button class="btn primary" id="addHoliday">新增假日</button></div><div class="status-list" style="margin-top:16px">${yearItems.length?yearItems.sort((a,b)=>(a.date||a).localeCompare(b.date||b)).map(h=>{const date=typeof h==='string'?h:h.date,name=typeof h==='string'?'國定／連假':h.name;return `<div class="status-item"><span><strong>${escapeHtml(date)}</strong>　${escapeHtml(name||'國定／連假')}</span><button class="btn small" data-remove-holiday="${escapeAttr(date)}">移除</button></div>`;}).join(''):'<div class="notice">尚未加入額外假日；週六、週日仍會自動安排 W。</div>'}</div></div>`;
    el.querySelector('#addHoliday').onclick=()=>{const date=el.querySelector('#holidayDate').value,name=el.querySelector('#holidayName').value.trim();if(!date){toast('請選擇日期');return;}if(!state.holidays.some(h=>(h.date||h)===date))state.holidays.push({date,name:name||'國定／連假'});save();renderAll();showView('holidays');toast('已新增假日');};
    el.querySelectorAll('[data-remove-holiday]').forEach(b=>b.onclick=()=>{state.holidays=state.holidays.filter(h=>(h.date||h)!==b.dataset.removeHoliday);save();renderAll();showView('holidays');toast('已移除假日');});
  }

  function renderHardRules(){
    const el=document.querySelector('#view-hard-rules');
    el.innerHTML=`<div class="card"><div class="toolbar"><div><h2>強制規則</h2><div class="small-note">違反強制規則時演算法不會自動排入。</div></div><button class="btn small" id="addHard">＋新增說明規則</button></div><div id="hardList">${state.hardRules.map(r=>ruleCard(r,true)).join('')}</div></div>`;
    bindRuleToggles(el,'hard');
    el.querySelector('#addHard').onclick=()=>openFormModal('新增強制規則',[{name:'name',label:'規則名稱',required:true},{name:'desc',label:'規則說明',multiline:true}],{},values=>{state.hardRules.push({id:'hard'+Date.now(),name:values.name.trim(),desc:values.desc.trim(),enabled:true,custom:true});save();renderAll();toast('已新增強制規則');});
  }
  function ruleCard(r,hard){return `<div class="rule-card" draggable="true"><div class="drag">☰</div><div><div class="rule-title">${escapeHtml(r.name)}</div><div class="rule-desc">${escapeHtml(r.desc||'')}</div></div><div class="rule-actions"><label class="switch"><input type="checkbox" data-${hard?'hard':'soft'}="${r.id}" ${r.enabled?'checked':''}>啟用</label></div></div>`}
  function bindRuleToggles(el,type){ el.querySelectorAll(`input[data-${type}]`).forEach(i=>i.onchange=()=>{const list=type==='hard'?state.hardRules:state.softRules;const r=list.find(x=>x.id===i.dataset[type]);if(r)r.enabled=i.checked;save();renderAll();}); }

  function renderSoftRules(){
    const el=document.querySelector('#view-soft-rules');
    el.innerHTML=`<div class="card"><div class="toolbar"><div><h2>非強制規則</h2><div class="small-note">星星越多，最佳化時權重越高；多條規則可以同為五星。</div></div><button class="btn small" id="addSoft">＋新增偏好</button></div>${state.softRules.map(r=>`<div class="rule-card"><div class="drag">☰</div><div><div class="rule-title">${escapeHtml(r.name)}</div><div>${[1,2,3,4,5].map(n=>`<span class="star ${n<=r.stars?'on':''}" data-star="${r.id}|${n}">★</span>`).join('')}</div></div><div class="rule-actions"><label class="switch"><input type="checkbox" data-soft="${r.id}" ${r.enabled?'checked':''}>啟用</label></div></div>`).join('')}</div>`;
    el.querySelectorAll('[data-star]').forEach(s=>s.onclick=()=>{const [id,n]=s.dataset.star.split('|');const r=soft(id);if(r)r.stars=+n;save();renderAll();}); bindRuleToggles(el,'soft');
    el.querySelector('#addSoft').onclick=()=>openFormModal('新增偏好規則',[{name:'name',label:'偏好規則名稱',required:true}],{},values=>{state.softRules.push({id:'soft'+Date.now(),name:values.name.trim(),stars:3,enabled:true});save();renderAll();toast('已新增偏好規則');});
  }

  function openFormModal(title,fields,values,onSave){
    closeFormModal();
    const wrap=document.createElement('div');wrap.id='formModal';wrap.className='modal-backdrop';
    wrap.innerHTML=`<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><div class="modal-header"><h2 id="modalTitle">${escapeHtml(title)}</h2><button class="modal-close" type="button" aria-label="關閉">×</button></div><form id="modalForm"><div class="modal-fields">${fields.map(f=>`<label class="modal-field"><span>${escapeHtml(f.label)}</span>${f.multiline?`<textarea name="${escapeAttr(f.name)}" rows="4" ${f.required?'required':''}>${escapeHtml(values[f.name]||'')}</textarea>`:`<input name="${escapeAttr(f.name)}" value="${escapeAttr(values[f.name]||'')}" ${f.required?'required':''}>`}</label>`).join('')}</div><div class="modal-actions"><button class="btn" type="button" data-cancel>取消</button><button class="btn primary" type="submit">儲存</button></div></form></div>`;
    document.body.appendChild(wrap);
    const close=()=>closeFormModal();wrap.querySelector('.modal-close').onclick=close;wrap.querySelector('[data-cancel]').onclick=close;wrap.onclick=e=>{if(e.target===wrap)close();};
    wrap.querySelector('#modalForm').onsubmit=e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget).entries());onSave(data);close();};
    wrap.querySelector('input,textarea')?.focus();
  }
  function closeFormModal(){document.querySelector('#formModal')?.remove();}

  function renderResults(){
    const el=document.querySelector('#view-results');
    const duties=state.duties.filter(d=>d.enabled);
    const rows=[];
    for(let day=1;day<=daysInMonth();day++) for(const shift of SHIFT_ORDER){ if(resultShiftFilter!=='all'&&resultShiftFilter!==shift)continue; rows.push(`<tr><td>${state.month}/${day}${isHoliday(day)?' <span class="tag warn">假</span>':''}</td><td>${SHIFT_LABELS[shift]}</td>${duties.map(d=>dutyApplies(d,day,shift)?assignmentCell(day,shift,d):'<td>—</td>').join('')}</tr>`); }
    el.innerHTML=`<div class="card"><div class="toolbar"><div class="left"><div class="pill-tabs">${[['all','全部'],['day','白班'],['evening','小夜'],['night','大夜']].map(([v,l])=>`<button class="${resultShiftFilter===v?'active':''}" data-filter="${v}">${l}</button>`).join('')}</div><span class="tag">${state.year}/${state.month}</span></div><div class="right"><button class="btn" id="reoptimize">重新最佳化未鎖定項目</button><button class="btn primary" id="regen">全部重排</button></div></div><div class="table-wrap"><table><thead><tr><th>日期</th><th>班別</th>${duties.map(d=>`<th>${escapeHtml(d.code)}<div class="small-note">${escapeHtml(d.name)}</div></th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div><div class="notice warn" style="margin-top:12px">下拉修改後會保留人工選擇；按 🔒 可固定該格，再重新最佳化其他項目。若沒有合格人選會顯示「未排」。</div></div>`;
    el.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{resultShiftFilter=b.dataset.filter;renderResults();});
    el.querySelector('#reoptimize').onclick=()=>generate(true); el.querySelector('#regen').onclick=()=>generate(false);
    el.querySelectorAll('select[data-assign]').forEach(s=>s.onchange=manualAssign); el.querySelectorAll('[data-lock]').forEach(b=>b.onclick=toggleLock);
  }
  function assignmentCell(day,shift,duty){
    const k=key(day,shift,duty.id), pid=state.assignments[k]||'', locked=!!state.locks[k]; const candidates=workingPeople(day,shift).filter(p=>!p.excluded && p.active && (!hardEnabled('qualified')||p.qualifications?.[duty.id]));
    const options=[`<option value="">未排</option>`,...candidates.map(p=>`<option value="${p.id}" ${p.id===pid?'selected':''}>${escapeHtml(p.name)}</option>`)].join('');
    return `<td><div class="assignment-cell"><select class="assignment-select" data-assign="${k}">${options}</select><button class="lock-btn ${locked?'locked':''}" data-lock="${k}" title="${locked?'解除鎖定':'鎖定'}">${locked?'🔒':'🔓'}</button></div></td>`;
  }
  function manualAssign(e){ const k=e.target.dataset.assign, pid=e.target.value; if(pid) state.assignments[k]=pid; else delete state.assignments[k]; save(); renderFairness(); toast('已更新人工指派'); }
  function toggleLock(e){ const k=e.currentTarget.dataset.lock; state.locks[k]=!state.locks[k]; save(); renderResults(); }

  function buildBalanceSuggestions(personId,direction,scope,limit){
    const cnt=counts(false),target=personById(personId),suggestions=[],reserved=new Set();if(!target)return suggestions;
    const slots=Object.entries(state.assignments).filter(([k,pid])=>{const did=k.split('|')[2];return did!=='support'&&!state.locks[k]&&(scope==='total'||did===scope)&&(direction==='decrease'?pid===personId:pid!==personId);});
    if(direction==='increase')slots.sort((a,b)=>(cnt[b[1]]?.total||0)-(cnt[a[1]]?.total||0));
    for(const [k,fromId] of slots){
      if(suggestions.length>=limit)break;const [dayText,shift,did]=k.split('|'),day=+dayText,duty=dutyById(did);if(!duty)continue;
      if(direction==='decrease'){
        const candidates=workingPeople(day,shift).filter(p=>p.id!==personId&&!reserved.has(`${p.id}|${day}`)&&candidateEligible(p,day,shift,did));
        candidates.sort((a,b)=>(cnt[a.id]?.total||0)-(cnt[b.id]?.total||0)||(cnt[a.id]?.byDuty[did]||0)-(cnt[b.id]?.byDuty[did]||0));
        const to=candidates[0];if(!to)continue;reserved.add(`${to.id}|${day}`);suggestions.push({k,day,shift,did,fromId,toId:to.id,dutyCode:duty.code});
      }else{
        if(reserved.has(`${personId}|${day}`)||!candidateEligible(target,day,shift,did))continue;
        reserved.add(`${personId}|${day}`);suggestions.push({k,day,shift,did,fromId,toId:personId,dutyCode:duty.code});
      }
    }
    return suggestions;
  }
  function applyBalanceSuggestions(){
    if(!balanceSuggestions.length){toast('目前沒有可套用的建議');return;}
    balanceSuggestions.forEach(s=>state.assignments[s.k]=s.toId);const n=balanceSuggestions.length;balanceSuggestions=[];save();renderAll();showView('balance');toast(`已套用 ${n} 筆合法調整`);
  }
  function renderBalance(){
    const el=document.querySelector('#view-balance'),active=state.people.filter(p=>p.active&&!p.excluded),duties=state.duties.filter(d=>d.enabled&&d.id!=='support');
    el.innerHTML=`<div class="card"><div class="toolbar"><div><h2>平衡調整助手</h2><div class="small-note">這是內建規則工具，不需要連線給 Codex；任何有修改權限的排班者都能使用。</div></div><span class="tag good">遵守資格、每日一項與鎖定規則</span></div><div class="form-row"><label>人員 <select id="balancePerson">${active.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select></label><label>希望 <select id="balanceDirection"><option value="decrease">減少</option><option value="increase">增加</option></select></label><label>範圍 <select id="balanceScope"><option value="total">總點班</option>${duties.map(d=>`<option value="${d.id}">${escapeHtml(d.code)} ${escapeHtml(d.name)}</option>`).join('')}</select></label><label>次數 <select id="balanceLimit">${[1,2,3,4,5].map(n=>`<option value="${n}">${n}</option>`).join('')}</select></label><button class="btn primary" id="findBalance">尋找調整方案</button></div></div><div class="card" style="margin-top:16px"><div class="toolbar"><h2>建議方案</h2>${balanceSuggestions.length?'<button class="btn primary" id="applyBalance">套用全部建議</button>':''}</div>${balanceSuggestions.length?`<div class="status-list">${balanceSuggestions.map(s=>`<div class="status-item"><span>${state.month}/${s.day} ${SHIFT_LABELS[s.shift]}　<strong>${escapeHtml(s.dutyCode)}</strong></span><span>${escapeHtml(personById(s.fromId)?.name||'')} → <strong>${escapeHtml(personById(s.toId)?.name||'')}</strong></span></div>`).join('')}</div>`:'<div class="notice">選擇人員與想增加／減少的項目後，系統會列出可合法交換的位置；確認前不會修改排班。</div>'}</div>`;
    el.querySelector('#findBalance').onclick=()=>{balanceSuggestions=buildBalanceSuggestions(el.querySelector('#balancePerson').value,el.querySelector('#balanceDirection').value,el.querySelector('#balanceScope').value,+el.querySelector('#balanceLimit').value);renderBalance();if(!balanceSuggestions.length)toast('找不到符合所有強制規則的交換位置');};
    el.querySelector('#applyBalance')?.addEventListener('click',applyBalanceSuggestions);
  }

  function renderFairness(){
    const el=document.querySelector('#view-fairness'); const cnt=counts(); const duties=state.duties.filter(d=>d.enabled&&d.id!=='support');
    const eligibleAvg={}; duties.forEach(d=>{ const elig=state.people.filter(p=>p.active&&!p.excluded&&p.qualifications?.[d.id]); const sum=elig.reduce((a,p)=>a+(cnt[p.id]?.byDuty[d.id]||0),0); eligibleAvg[d.id]=elig.length?sum/elig.length:0; });
    const active=state.people.filter(p=>p.active&&!p.excluded); const totalAvg=active.length?active.reduce((a,p)=>a+cnt[p.id].total,0)/active.length:0; const supportElig=active.filter(p=>p.qualifications?.support); const supportAvg=supportElig.length?supportElig.reduce((a,p)=>a+cnt[p.id].support,0)/supportElig.length:0;
    const shiftSummary=SHIFT_ORDER.map(shift=>{const members=new Set(),assigned=Object.entries(state.assignments).filter(([k,pid])=>{const [,s,did]=k.split('|');if(s!==shift||did==='support'||!pid)return false;members.add(pid);return true;}).length;for(let day=1;day<=daysInMonth();day++)workingPeople(day,shift).filter(p=>!p.excluded).forEach(p=>members.add(p.id));return {shift,assigned,people:members.size,avg:members.size?assigned/members.size:0};});
    const highReasons=[];active.forEach(p=>{if(cnt[p.id].total-totalAvg>=1.5)highReasons.push(`${p.name}：總點班 ${cnt[p.id].total} 次，高於全體平均 ${totalAvg.toFixed(1)} 次`);duties.forEach(d=>{const v=cnt[p.id].byDuty[d.id]||0,avg=eligibleAvg[d.id];if(v-avg>=1.5)highReasons.push(`${p.name}：${d.code} 為 ${v} 次，高於具資格者平均 ${avg.toFixed(1)} 次`);});});
    const rows=active.map(p=>`<tr><td class="name"><strong>${escapeHtml(p.name)}</strong></td>${duties.map(d=>fairCell(cnt[p.id].byDuty[d.id]||0,eligibleAvg[d.id])).join('')}<td class="${fairClass(cnt[p.id].total,totalAvg)}">${cnt[p.id].total}</td><td class="${fairClass(cnt[p.id].support,supportAvg)}">${cnt[p.id].support}</td></tr>`).join('');
    const focusOptions=[['total','總點班'],...duties.map(d=>[d.id,d.code]),['support','支援']]; const focusVals=active.map(p=>({name:p.name,value:fairnessFocus==='total'?cnt[p.id].total:fairnessFocus==='support'?cnt[p.id].support:(cnt[p.id].byDuty[fairnessFocus]||0)})); const max=Math.max(1,...focusVals.map(x=>x.value));
    el.innerHTML=`<div class="grid kpis">${shiftSummary.map(x=>kpi(`${SHIFT_LABELS[x.shift]}平均`,`${x.avg.toFixed(1)} 次／人`,`${x.assigned} 次 ÷ ${x.people} 位曾上此班人員`)).join('')}${kpi('全體總平均',`${totalAvg.toFixed(1)} 次／人`,'不含支援，包含假日 W')}</div><div class="card" style="margin-bottom:16px"><h2>紅色代表什麼？</h2><p class="muted">紅色不是處罰，而是提醒目前次數高於可比較的人員。總點班與全體有效人員比較；單一點班本只和具有該項資格的人比較，並仍受上班日期、班別及強制規則限制。</p>${highReasons.length?`<div class="notice warn">${highReasons.slice(0,8).map(x=>`<div>• ${escapeHtml(x)}</div>`).join('')}${highReasons.length>8?`<div>另有 ${highReasons.length-8} 項，可由下表查看。</div>`:''}</div>`:'<div class="notice">目前沒有明顯偏高項目。</div>'}</div><div class="card"><div class="toolbar"><div><h2>公平檢視</h2><div class="small-note">各點班項目以「具有該項資格的人」作為公平比較母體。</div></div><div class="legend"><span><i class="dot high"></i>偏高</span><span><i class="dot ok"></i>接近平均</span><span><i class="dot low"></i>偏低</span></div></div><div class="table-wrap"><table><thead><tr><th class="name">人員</th>${duties.map(d=>`<th>${escapeHtml(d.code)}</th>`).join('')}<th>總點班</th><th>支援</th></tr></thead><tbody>${rows}</tbody></table></div></div>
      <div class="card" style="margin-top:16px"><div class="toolbar"><h3>分布檢視</h3><select id="fairFocus">${focusOptions.map(([v,l])=>`<option value="${v}" ${fairnessFocus===v?'selected':''}>${escapeHtml(l)}</option>`).join('')}</select></div><div class="bar-list">${focusVals.sort((a,b)=>b.value-a.value).map(x=>`<div class="bar-row"><span>${escapeHtml(x.name)}</span><div class="bar"><span style="width:${Math.round(x.value/max*100)}%"></span></div><strong>${x.value}</strong></div>`).join('')}</div></div>`;
    el.querySelector('#fairFocus').onchange=e=>{fairnessFocus=e.target.value;renderFairness();};
  }

  function currentRecord(){
    const cnt=counts(false),people={};
    state.people.forEach(p=>{if(!p.active)return;people[p.name]={total:cnt[p.id]?.total||0,support:cnt[p.id]?.support||0,byDuty:{...(cnt[p.id]?.byDuty||{})}};});
    return {period:`${state.year}-${String(state.month).padStart(2,'0')}`,sourceName:state.sourceName||'',confirmedAt:new Date().toISOString(),people};
  }
  function saveOfficialHistory(){
    if(!Object.keys(state.assignments).length)return false;
    const record=currentRecord(),idx=state.history.findIndex(h=>h.period===record.period);
    if(idx>=0)state.history[idx]=record;else state.history.push(record);
    save();return true;
  }
  function renderConfirmExport(){
    const el=document.querySelector('#view-confirm-export'),period=`${state.year}-${String(state.month).padStart(2,'0')}`,saved=state.history.find(h=>h.period===period);
    el.innerHTML=`<div class="card"><div class="toolbar"><div><h2>確認本月正式結果</h2><p class="muted">只有按下確認的這一版會納入歷史公平計算。預覽、人工調整與重新排班都不會寫入歷史。</p></div><span class="tag ${saved?'good':''}">${saved?'本月已有正式紀錄':'尚未確認'}</span></div><div class="status-list"><div class="status-item"><span>月份</span><strong>${period}</strong></div><div class="status-item"><span>目前指派</span><strong>${Object.keys(state.assignments).length} 格</strong></div><div class="status-item"><span>確認方式</span><strong>${saved?'再次確認會覆蓋本月舊紀錄':'確認後寫入歷史次數'}</strong></div></div><button class="btn primary" id="officialExport" style="margin-top:14px">${saved?'更新本月正式紀錄':'確認並保存到歷史次數'}</button></div>`;
    el.querySelector('#officialExport').onclick=()=>{if(!saveOfficialHistory()){toast('請先產生點班結果');return;}renderAll();showView('confirm-export');toast('本月正式結果已保存到歷史次數');};
  }
  function renderHistory(){
    const el=document.querySelector('#view-history'),duties=state.duties.filter(d=>d.enabled&&d.id!=='support'),totals={};
    state.history.forEach(h=>Object.entries(h.people||{}).forEach(([name,c])=>{totals[name]||={total:0,support:0,byDuty:{}};totals[name].total+=c.total||0;totals[name].support+=c.support||0;Object.entries(c.byDuty||{}).forEach(([did,n])=>totals[name].byDuty[did]=(totals[name].byDuty[did]||0)+n);}));
    const rows=Object.entries(totals).sort((a,b)=>a[1].total-b[1].total).map(([name,c])=>`<tr><td class="name"><strong>${escapeHtml(name)}</strong></td>${duties.map(d=>`<td>${c.byDuty[d.id]||0}</td>`).join('')}<td><strong>${c.total}</strong></td><td>${c.support}</td></tr>`).join('');
    el.innerHTML=`<div class="card"><div class="toolbar"><div><h2>歷史次數</h2><div class="small-note">自動排班已會把這些累積次數加入公平計算；歷史較少者，下個月會優先補足。</div></div><span class="tag">${state.history.length} 個月份</span></div>${state.history.length?`<div class="table-wrap"><table><thead><tr><th class="name">人員</th>${duties.map(d=>`<th>${escapeHtml(d.code)}</th>`).join('')}<th>歷史總點班</th><th>歷史支援</th></tr></thead><tbody>${rows}</tbody></table></div><div class="small-note" style="margin-top:10px">已確認月份：${state.history.map(h=>escapeHtml(h.period)).join('、')}</div>`:`<div class="notice">尚無歷史資料。請先到「確認與輸出」確認一個月的排班結果。</div>`}</div>`;
  }
  function fairCell(v,avg){return `<td class="${fairClass(v,avg)}">${v}</td>`}
  function fairClass(v,avg){ if(avg<0.5)return 'fair-ok'; const delta=v-avg; if(delta>=1.5)return 'fair-high'; if(delta<=-1.5)return 'fair-low'; return 'fair-ok'; }

  function showView(view){ activeView=view; document.querySelectorAll('.view').forEach(v=>v.classList.remove('active')); document.querySelector(`#view-${view}`).classList.add('active'); document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view)); const map={home:['排班首頁','先匯入班表，再依資格與規則自動分配每日點班。'],import:['匯入班表','讀取 Excel 班表並確認班別辨識結果。'],people:['人員管理','設定在職、不參與點班、護理長與各項資格。'],duties:['點班項目','新增、修改每一種點班工作與適用班別。'],holidays:['假日設定','週末自動辨識，並管理需要安排 W 的國定假日與連假。'],'hard-rules':['強制規則','演算法不可違反的條件。'],'soft-rules':['非強制規則','用星等設定最佳化偏好的重要程度。'],results:['點班結果','檢視、自訂、鎖定並重新最佳化。'],balance:['平衡調整助手','用合法交換調整某人的總次數或指定點班本。'],fairness:['公平檢視','檢查總點班、各本、△1 與支援的月度公平性。'],'confirm-export':['確認正式結果','確認本月最終版本並保存到歷史次數。'],history:['歷史次數','用歷史累積次數改善下個月的公平分配。']}; document.querySelector('#page-title').textContent=map[view][0]; document.querySelector('#page-subtitle').textContent=map[view][1]; }
  function toast(msg){const t=document.querySelector('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)}
  function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function escapeAttr(s){return escapeHtml(s)}

  document.querySelectorAll('#nav button').forEach(b=>b.onclick=()=>showView(b.dataset.view));
  document.querySelector('#generateBtn').onclick=()=>generate(false); document.querySelector('#resetBtn').onclick=()=>{if(confirm('要重設所有設定與排班結果嗎？'))reset();};
  renderAll(); showView('home');
})();
