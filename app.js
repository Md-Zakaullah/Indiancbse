const TABLES = {
  students: { table: 'students', title: 'Students', description: 'Admissions, class details and guardian contact information.', columns: [['name','Student'],['admission_no','Admission no.'],['class_name','Class'],['guardian_name','Guardian'],['phone','Phone'],['status','Status']], fields: [['name','Student name','text'],['admission_no','Admission number','text'],['class_name','Class / section','text'],['guardian_name','Parent / guardian','text'],['phone','Guardian phone','tel'],['status','Status','select',['Active','Pending','On leave']] ] },
  attendance: { table: 'attendance', title: 'Attendance', description: 'Daily attendance records for enrolled students.', columns: [['student_name','Student'],['attendance_date','Date'],['status','Status'],['remarks','Remarks']], fields: [['student_id','Student','student'],['attendance_date','Date','date'],['status','Status','select',['Present','Absent','Late']],['remarks','Remarks','text']] },
  exams: { table: 'exam_results', title: 'Academics & exams', description: 'CBSE-aligned assessment and examination records.', columns: [['student_name','Student'],['class_name','Class'],['subject','Subject'],['assessment','Assessment'],['marks_obtained','Score'],['grade','Grade']], fields: [['student_id','Student','student'],['subject','Subject','text'],['assessment','Assessment / term','text'],['marks_obtained','Marks obtained','number'],['maximum_marks','Maximum marks','number']] },
  fees: { table: 'fee_records', title: 'Fees & finance', description: 'Fee collection and pending balances (Indian rupees).', columns: [['student_name','Student'],['fee_type','Fee type'],['due_date','Due date'],['amount','Amount (₹)'],['status','Status']], fields: [['student_id','Student','student'],['fee_type','Fee type','text'],['due_date','Due date','date'],['amount','Amount (₹)','number'],['status','Status','select',['Paid','Pending']]] },
  hostel: { table: 'hostel_allocations', title: 'Hostel management', description: 'Boarding residents, hostel wing and room allocation.', columns: [['student_name','Resident'],['hostel_name','Hostel'],['wing','Wing'],['room_number','Room'],['bed_label','Bed'],['status','Status']], fields: [['student_id','Student','student'],['hostel_name','Hostel','select',["Boys' Hostel","Girls' Hostel"]],['wing','Wing / block','text'],['room_number','Room number','text'],['bed_label','Bed label','text'],['status','Status','select',['Boarding','On leave']]] },
  staff: { table: 'staff', title: 'Staff directory', description: 'Manage teaching and support staff.', columns: [['name','Staff member'],['employee_no','Employee ID'],['role','Role'],['department','Department'],['phone','Phone'],['status','Status']], fields: [['name','Full name','text'],['employee_no','Employee ID','text'],['role','Role / designation','text'],['department','Department','text'],['phone','Contact number','tel'],['status','Status','select',['On duty','On leave']]] },
  notices: { table: 'notices', title: 'Notice board', description: 'Announcements and school event information.', columns: [['title','Notice'],['category','Category'],['event_date','Date'],['body','Message']], fields: [['title','Notice title','text'],['category','Category','select',['Academic','Event','Hostel','General']],['event_date','Notice / event date','date'],['body','Message','textarea']] }
};
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
let supabaseClient, currentSchool, activeSection = 'dashboard', editingRecord = null, cache = {};
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const dateLabel = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '—';
const rupees = value => '₹' + Number(value || 0).toLocaleString('en-IN');
function notify(message, error=false) { const el=$('#toast'); el.textContent=message; el.classList.toggle('error',error); el.classList.add('show'); clearTimeout(notify.timer); notify.timer=setTimeout(()=>el.classList.remove('show'),3000); }
function setMessage(el, text, error=false) { el.textContent=text; el.classList.toggle('error',error); }
function readyConfig() { const c=window.SCHOOL_SUPABASE_CONFIG; return c && c.url && c.anonKey && !c.url.includes('YOUR-PROJECT') && !c.anonKey.includes('YOUR_SUPABASE'); }
function showSetup() { const n=$('#setupNotice'); n.hidden=false; n.innerHTML='<strong>Backend setup required.</strong> Create a Supabase project, run <code>supabase/schema.sql</code> in its SQL Editor, then add your project URL and publishable/anon key to <code>supabase-config.js</code>. See <code>README.md</code> for steps.'; }
async function showAuth(session) { $('#authView').hidden=!!session; $('#appView').hidden=!session; if(session) await loadSchool(); }
async function loadSchool() {
  const {data,error}=await supabaseClient.from('school_members').select('school_id,role,schools(id,name,board)').eq('user_id',(await supabaseClient.auth.getUser()).data.user.id);
  if(error) { setMessage($('#appMessage'),error.message,true); return; }
  if(!data?.length) { $('#appView').hidden=true; $('#authView').hidden=false; $('#authTitle').textContent='Set up your school'; $('#authSwitchText').textContent='Your account is ready.'; $('#authSwitch').hidden=true; $('#authForm [name="schoolName"]').closest('label').hidden=false; $('#authForm [name="email"]').closest('label').hidden=true; $('#authForm [name="password"]').closest('label').hidden=true; $('#authSubmit').textContent='Create school workspace'; $('#authForm').dataset.mode='school'; setMessage($('#authMessage'),'Create your school workspace to continue.'); return; }
  currentSchool=data[0].schools; $('#schoolLabel').textContent=`${currentSchool.name} · ${currentSchool.board||'CBSE'}`; $('#appMessage').textContent=''; await renderDashboard(); await showSection(activeSection);
}
async function authSubmit(event) {
  event.preventDefault(); const form=new FormData(event.currentTarget); const mode=event.currentTarget.dataset.mode||'login'; const email=form.get('email'),password=form.get('password');
  setMessage($('#authMessage'),'Please wait…');
  try {
    if(mode==='signup') {
      const {data,error}=await supabaseClient.auth.signUp({email,password}); if(error) throw error;
      if(data.session) { const schoolName=form.get('schoolName'); if(schoolName) { const {error:schoolError}=await supabaseClient.rpc('create_school',{school_name:schoolName,school_board:'CBSE'}); if(schoolError) throw schoolError; } await showAuth(data.session); }
      else setMessage($('#authMessage'),'Account created. Verify your email, then sign in to create your school workspace.');
      return;
    }
    if(mode==='school') { const schoolName=form.get('schoolName')?.trim(); if(!schoolName) throw new Error('Enter your school name.'); const {error}=await supabaseClient.rpc('create_school',{school_name:schoolName,school_board:'CBSE'}); if(error) throw error; $('#authForm').dataset.mode='login'; await showAuth((await supabaseClient.auth.getSession()).data.session); return; }
    const {data,error}=await supabaseClient.auth.signInWithPassword({email,password}); if(error) throw error; await showAuth(data.session);
  } catch(error) { setMessage($('#authMessage'),error.message||'Authentication failed.',true); }
}
async function loadRows(section) {
  const config=TABLES[section]; if(!config) return [];
  let query=supabaseClient.from(config.table).select('*').eq('school_id',currentSchool.id).order('created_at',{ascending:false}).limit(500);
  const {data,error}=await query; if(error) throw error;
  if(['attendance','exam_results','fee_records','hostel_allocations'].includes(config.table)) {
    const ids=[...new Set(data.map(row=>row.student_id).filter(Boolean))];
    let students=[]; if(ids.length) { const result=await supabaseClient.from('students').select('id,name,class_name,admission_no,guardian_name,phone').eq('school_id',currentSchool.id).in('id',ids); if(result.error) throw result.error; students=result.data||[]; }
    const byId=Object.fromEntries(students.map(student=>[student.id,student]));
    return data.map(row=>({...row,student_name:byId[row.student_id]?.name||'—',class_name:byId[row.student_id]?.class_name||'—',guardian_name:byId[row.student_id]?.guardian_name||'—'}));
  }
  return data||[];
}
async function renderDashboard() {
  try {
    const results=await Promise.all(['students','staff','hostel_allocations','fee_records','attendance'].map(table=>supabaseClient.from(table).select('*',{count:'exact',head:true}).eq('school_id',currentSchool.id)));
    results.forEach(r=>{if(r.error) throw r.error;});
    const nums=results.map(r=>r.count||0); const students=await loadRows('students');
    $('#dashboardStats').innerHTML=[['Students',nums[0],'♧','blue'],['Staff',nums[1],'♙','green'],['Hostel residents',nums[2],'⌂','gold'],['Fee records',nums[3],'₹','pink']].map(([label,value,icon,color])=>`<article class="stat-card"><span class="stat-icon ${color}">${icon}</span><p>${label}</p><strong>${value}</strong></article>`).join('');
    $('#recentRows').innerHTML=students.slice(0,6).map(s=>`<tr><td><strong>${escapeHtml(s.name)}</strong></td><td>${escapeHtml(s.admission_no)}</td><td>${escapeHtml(s.class_name)}</td><td>${escapeHtml(s.guardian_name)}</td><td><span class="status">${escapeHtml(s.status)}</span></td></tr>`).join('')||'<tr><td colspan="5" class="empty">Add students to get started.</td></tr>';
  } catch(error) { setMessage($('#appMessage'),error.message,true); }
}
function displayValue(key,row) { const value=row[key]; if(key==='amount') return rupees(value); if(key==='due_date'||key==='attendance_date'||key==='event_date') return dateLabel(value); if(key==='marks_obtained') return `${value} / ${row.maximum_marks}`; return value ?? '—'; }
async function showSection(section) {
  activeSection=section; $$('.nav-button[data-section]').forEach(button=>button.classList.toggle('active',button.dataset.section===section));
  $('#page-dashboard').classList.toggle('active',section==='dashboard'); $('#page-records').classList.toggle('active',section!=='dashboard');
  if(section==='dashboard') { await renderDashboard(); return; }
  const config=TABLES[section]; $('#sectionTitle').textContent=config.title; $('#sectionDescription').textContent=config.description; $('#searchInput').value='';
  try { cache[section]=await loadRows(section); renderTable(section); } catch(error) { setMessage($('#appMessage'),error.message,true); }
}
function renderTable(section) {
  const config=TABLES[section], search=$('#searchInput').value.toLowerCase(); let rows=cache[section]||[];
  if(search) rows=rows.filter(row=>Object.values(row).some(value=>String(value??'').toLowerCase().includes(search)));
  $('#tableHead').innerHTML=`<tr>${config.columns.map(([,label])=>`<th>${escapeHtml(label)}</th>`).join('')}<th>Actions</th></tr>`;
  $('#tableRows').innerHTML=rows.map(row=>`<tr>${config.columns.map(([key])=>`<td>${escapeHtml(displayValue(key,row))}</td>`).join('')}<td><div class="row-actions"><button class="icon-button" data-edit="${section}" data-id="${row.id}" title="Edit">✎</button><button class="icon-button danger" data-delete="${section}" data-id="${row.id}" title="Delete">×</button></div></td></tr>`).join('')||`<tr><td colspan="${config.columns.length+1}" class="empty">No records found.</td></tr>`;
}
async function openForm(section,row=null) {
  const config=TABLES[section]; if(!config) return; editingRecord=row?{section,id:row.id}:null; $('#modalTitle').textContent=(row?'Edit ':'Add ')+config.title; const studentFields=config.fields.some(field=>field[2]==='student'); let students=[];
  if(studentFields) { const result=await supabaseClient.from('students').select('id,name,class_name').eq('school_id',currentSchool.id).order('name'); if(result.error){notify(result.error.message,true);return;} students=result.data||[]; }
  $('#formFields').innerHTML=config.fields.map(([key,label,type,options])=>{let input='';const value=row?.[key]??(type==='date'?new Date().toISOString().slice(0,10):'');if(type==='select'){input=`<select name="${key}" required>${options.map(option=>`<option ${option===value?'selected':''}>${escapeHtml(option)}</option>`).join('')}</select>`;}else if(type==='student'){input=`<select name="student_id" required>${students.map(student=>`<option value="${student.id}" ${student.id===value?'selected':''}>${escapeHtml(student.name)} — ${escapeHtml(student.class_name)}</option>`).join('')}</select>`;}else if(type==='textarea'){input=`<textarea name="${key}" required>${escapeHtml(value)}</textarea>`;}else{input=`<input name="${key}" type="${type}" value="${escapeHtml(value)}" ${key==='amount'||key.includes('marks')?'min="0"':''} required>`;}return `<label class="field ${type==='textarea'?'wide':''}"><span>${escapeHtml(label)}</span>${input}</label>`;}).join('');
  $('#modalBackdrop').hidden=false;
}
function closeForm(){ $('#modalBackdrop').hidden=true; $('#recordForm').reset(); editingRecord=null; }
async function saveRecord(event) {
  event.preventDefault(); const section=editingRecord?.section||$('#addRecord').dataset.section; const config=TABLES[section]; const payload=Object.fromEntries(new FormData(event.currentTarget).entries()); payload.school_id=currentSchool.id;
  for(const key of ['amount','marks_obtained','maximum_marks']) if(payload[key]!==undefined) payload[key]=Number(payload[key]);
  if(section==='exams'&&payload.marks_obtained>payload.maximum_marks){notify('Marks cannot exceed maximum marks.',true);return;}
  try { let result;if(editingRecord) result=await supabaseClient.from(config.table).update(payload).eq('id',editingRecord.id).eq('school_id',currentSchool.id); else result=await supabaseClient.from(config.table).insert(payload); if(result.error) throw result.error; closeForm(); notify('Saved to secure school database.'); await showSection(section); await renderDashboard(); }
  catch(error){notify(error.message||'Could not save record.',true);}
}
async function deleteRecord(section,id) { if(!confirm('Permanently delete this record?')) return; try { const {error}=await supabaseClient.from(TABLES[section].table).delete().eq('id',id).eq('school_id',currentSchool.id); if(error) throw error; notify('Record deleted.'); await showSection(section); await renderDashboard(); } catch(error){notify(error.message||'Could not delete record.',true);} }
async function exportCsv() { const rows=cache[activeSection]||await loadRows(activeSection); if(!rows.length){notify('There are no records to export.');return;} const headers=Object.keys(rows[0]); const csv=[headers.join(','),...rows.map(row=>headers.map(key=>`"${String(row[key]??'').replaceAll('"','""')}"`).join(','))].join('\r\n'); const link=document.createElement('a'); link.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); link.download=`${activeSection}-export.csv`; link.click(); URL.revokeObjectURL(link.href); }
function bindEvents() {
  $('#authForm').addEventListener('submit',authSubmit); $('#authSwitch').addEventListener('click',()=>{const signup=$('#authForm').dataset.mode!=='signup';$('#authForm').dataset.mode=signup?'signup':'login';$('#authTitle').textContent=signup?'Create your account':'Welcome back';$('#authSubmit').textContent=signup?'Create account':'Sign in';$('#authSwitchText').textContent=signup?'Already registered?':'New to Northstar?';$('#authSwitch').textContent=signup?'Sign in':'Create account';$('#schoolNameField').hidden=!signup;});
  $('#navigation').addEventListener('click',event=>{const button=event.target.closest('[data-section]');if(button)showSection(button.dataset.section);});
  document.addEventListener('click',event=>{const jump=event.target.closest('[data-section-link]');if(jump)showSection(jump.dataset.sectionLink);const open=event.target.closest('[data-open]');if(open){$('#addRecord').dataset.section=open.dataset.open;showSection(open.dataset.open).then(()=>openForm(open.dataset.open));}});
  $('#addRecord').addEventListener('click',()=>openForm(activeSection)); $('#recordForm').addEventListener('submit',saveRecord); $('#closeModal').addEventListener('click',closeForm); $('#cancelModal').addEventListener('click',closeForm); $('#modalBackdrop').addEventListener('click',event=>{if(event.target===$('#modalBackdrop'))closeForm();});
  $('#tableRows').addEventListener('click',event=>{const edit=event.target.closest('[data-edit]'),del=event.target.closest('[data-delete]');if(edit){const row=(cache[edit.dataset.edit]||[]).find(item=>item.id===edit.dataset.id);if(row)openForm(edit.dataset.edit,row);}if(del)deleteRecord(del.dataset.delete,del.dataset.id);});
  $('#searchInput').addEventListener('input',()=>renderTable(activeSection)); $('#exportData').addEventListener('click',exportCsv); $('#signOut').addEventListener('click',async()=>{await supabaseClient.auth.signOut();location.reload();}); $('#menuToggle').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
  supabaseClient.auth.onAuthStateChange((_event,session)=>{if(!session){$('#appView').hidden=true;$('#authView').hidden=false;}});
}
async function init() {
  bindEvents();
  if(!readyConfig()||!window.supabase){showSetup();$('#authView').hidden=false;$('#authTitle').textContent='Connect your database';setMessage($('#authMessage'),'Complete Supabase setup using the README instructions.');$('#authForm').hidden=true;$('.auth-switch').hidden=true;return;}
  supabaseClient=window.supabase.createClient(window.SCHOOL_SUPABASE_CONFIG.url,window.SCHOOL_SUPABASE_CONFIG.anonKey); const {data,error}=await supabaseClient.auth.getSession(); if(error){showSetup();setMessage($('#authMessage'),error.message,true);return;} await showAuth(data.session);
}
document.addEventListener('DOMContentLoaded',init);
