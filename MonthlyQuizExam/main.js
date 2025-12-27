/* main.js — MonthlyQuizExam (cleaned, no download) */

/* ---------- CONFIG ---------- */
const EXAM_HOUR_DHAKA = 21;
const SHORT_SUBJECT_IDS = new Set(["higher-math","physics","chemistry","biology","ict"]);
const DEV_EMAIL = 'devspakle@gmail.com';

// Randomization controls
// - RANDOMIZE_QUESTIONS: shuffle question order each time the exam is loaded (non-deterministic Math.random())
// - RANDOMIZE_SET: pick a random set/paper from file instead of the seeded deterministic selection
const RANDOMIZE_QUESTIONS = true;
const RANDOMIZE_SET = false;

const SUBJECTS = [
  {id:"bangla-1", name:"Bangla — 1st Paper", file:"bangla-1.json"},
  {id:"bangla-2", name:"Bangla — 2nd Paper", file:"bangla-2.json"}, 
  {id:"math", name:"Math", file:"math.json"},
  {id:"higher-math", name:"Higher Math", file:"higher-math.json"},
  {id:"physics", name:"Physics", file:"physics.json"},
  {id:"chemistry", name:"Chemistry", file:"chemistry.json"},
  {id:"biology", name:"Biology", file:"biology.json"},
  {id:"bgs", name:"Bangladesh & Global Studies", file:"bgs.json"},
  {id:"ict", name:"ICT", file:"ict.json"},
  {id:"religion", name:"Religion", file:"religion.json"}
];

/* ---------- Dhaka time helpers ---------- */
function nowUtcMs(){ return Date.now(); }
function dhakaUtcMsFromComponents(year, monthIndex, day, hour, minute=0){
  return Date.UTC(year, monthIndex, day, hour - 6, minute, 0);
}
function getDhakaNow(){
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + 6 * 60 * 60000);
}
function fmtDate(year, monthIndex, day){
  const dt = new Date(Date.UTC(year, monthIndex, day, 0,0,0));
  return dt.toLocaleDateString(undefined, {day:"numeric", month:"short"});
}

/* ---------- seeded RNG ---------- */
function xfnv1a(str) {
  for (var i = 0, h = 2166136261 >>> 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  }
  return function() { return h >>> 0; };
}
function mulberry32(a) {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
function seededRandom(seedStr){
  const sfn = xfnv1a(seedStr);
  const seed = sfn();
  return mulberry32(seed);
}
function seededShuffle(array, seedStr){
  const arr = array.slice();
  const rnd = seededRandom(seedStr);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Non-deterministic random shuffle using Math.random()
function randomShuffle(array){
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function pickPaperIndex(seedStr, count){
  const rnd = seededRandom(seedStr)();
  return Math.floor(rnd * count);
}

/* ---------- DOM refs ---------- */
const scheduleInfo = document.getElementById("scheduleInfo");
const scheduleList = document.getElementById("scheduleList");
const scheduleFooter = document.getElementById("scheduleFooter");
const scheduleCard = document.getElementById("scheduleCard");
const notExam = document.getElementById("notExam");
const examWidget = document.getElementById("examWidget");
const examTitle = document.getElementById("examTitle");
const paperInfo = document.getElementById("paperInfo");
const examTimer = document.getElementById("examTimer");
const questionsList = document.getElementById("questionsList");
const submitBtn = document.getElementById("submitBtn");
const studentNameInput = document.getElementById("studentName");
const studentEmailInput = document.getElementById("studentEmail");
const resultWidget = document.getElementById("resultWidget");
const congratsOverlay = document.getElementById("congratsOverlay");
const congratsViewBtn = document.getElementById("congratsViewBtn");
const congratsCloseBtn = document.getElementById("congratsCloseBtn");

// persist name/email
studentNameInput.value = localStorage.getItem('aq_studentName') || "";
studentEmailInput.value = localStorage.getItem('aq_studentEmail') || "";
studentNameInput.addEventListener('change', ()=> localStorage.setItem('aq_studentName', studentNameInput.value.trim()));
studentEmailInput.addEventListener('change', ()=> localStorage.setItem('aq_studentEmail', studentEmailInput.value.trim()));

/* ---------- Main ---------- */
let _testModeActive = false;
// Prevent multiple submissions/downloads while a submission is in progress
let _submissionInProgress = false;

async function init(){
  const dhakaNow = getDhakaNow();
  const year = dhakaNow.getFullYear();
  const monthIndex = dhakaNow.getMonth();
  const lastDay = new Date(year, monthIndex+1, 0).getDate();
  const startDay = lastDay - 9;

  const schedulePublishDay = Math.max(1, startDay - 20);
  const schedulePublishUtc = dhakaUtcMsFromComponents(year, monthIndex, schedulePublishDay, 0, 0);
  const nowUtc = nowUtcMs();

  const monthSeed = `${year}-${String(monthIndex+1).padStart(2,"0")}-schedule`;
  const shuffled = seededShuffle(SUBJECTS, monthSeed);

  const schedule = [];
  for(let i=0;i<10;i++){
    schedule.push({ day: startDay + i, subject: shuffled[i] });
  }

  if(nowUtc >= schedulePublishUtc){
    scheduleInfo.textContent = "Published routine (visible 20 days before exams)";
    scheduleList.innerHTML = "";
    for(const item of schedule){
      const li = document.createElement("li");
      li.innerHTML = `<span class="date">${item.day} ${dhakaMonthName(monthIndex)}</span><span class="sub">${item.subject.name}</span>`;
      scheduleList.appendChild(li);
    }
    scheduleFooter.textContent = `Exam window: ${startDay} → ${lastDay} (last 10 days of month). Exams start daily at 9:00 PM (Dhaka).`;
  } else {
    scheduleInfo.textContent = "Routine will be published soon";
    scheduleList.innerHTML = `<li class="muted">Routine will be published on <strong>${fmtDate(year, monthIndex, schedulePublishDay)}</strong></li>`;
    scheduleFooter.textContent = `Come back then — the routine will be visible 20 days prior to the exam window.`;
  }

  const dhDay = dhakaNow.getDate();
  if(_testModeActive){
    const subj = SUBJECTS.find(s=>s.id==='math') || SUBJECTS[0];
    const dur = SHORT_SUBJECT_IDS.has(subj.id) ? 25 : 30;
    const nowUtcMsVal = nowUtcMs();
    const examStartUtc = nowUtcMsVal - 1000;
    const examEndUtc = nowUtcMsVal + dur*60*1000;
    notExam.classList.add("hidden");
    examWidget.classList.remove("hidden");
    resultWidget.classList.add("hidden");
    // hide routine while exam is running
    if(scheduleCard) scheduleCard.classList.add('hidden');
    await loadExamPaper(dhakaNow.getFullYear(), dhakaNow.getMonth(), dhDay, subj, examStartUtc, examEndUtc, dur);
    return;
  }

  if(dhDay >= startDay && dhDay <= lastDay){
    const todayIndex = dhDay - startDay;
    const todays = schedule[todayIndex];
    const examStartUtc = dhakaUtcMsFromComponents(year, monthIndex, dhDay, EXAM_HOUR_DHAKA, 0);
    const durationMinutes = SHORT_SUBJECT_IDS.has(todays.subject.id) ? 25 : 30;
    const examEndUtc = examStartUtc + durationMinutes * 60 * 1000;

    if(nowUtc >= examStartUtc && nowUtc <= examEndUtc){
      notExam.classList.add("hidden");
      examWidget.classList.remove("hidden");
      resultWidget.classList.add("hidden");
      // hide routine while exam is running
      if(scheduleCard) scheduleCard.classList.add('hidden');
      await loadExamPaper(year, monthIndex, dhDay, todays.subject, examStartUtc, examEndUtc, durationMinutes);
    } else {  
      notExam.classList.remove("hidden");
      examWidget.classList.add("hidden");
      // show routine when exam is not active
      if(scheduleCard) scheduleCard.classList.remove('hidden');
      scheduleFooter.innerHTML += ` Today (${dhDay}) scheduled: <strong>${todays.subject.name}</strong>.`;
    }
  } else {
    notExam.classList.remove("hidden");
    examWidget.classList.add("hidden");
    // show routine (no exam running)
    if(scheduleCard) scheduleCard.classList.remove('hidden');
    scheduleFooter.innerHTML += ` Next exam window starts on ${startDay}.`;
  }
}

/* ---------- helpers ---------- */
function dhakaMonthName(monthIndex){
  return new Date(2020, monthIndex, 1).toLocaleDateString(undefined, {month:"short"});
}

/* ---------- load paper ---------- */
async function loadExamPaper(year, monthIndex, day, subject, examStartUtc, examEndUtc, durationMinutes){
  examTitle.textContent = `${subject.name} — Exam`;
  const paperSeed = `${year}-${String(monthIndex+1).padStart(2,"0")}-${String(day).padStart(2,"0")}|${subject.id}`;
  const filePath = `./quizdata/${subject.file}`;
  let data = null;
  const examStartedAt = Date.now();
  try {
    const r = await fetch(filePath, {cache:"no-store"});
    if(!r.ok) throw new Error("not found");
    data = await r.json();
  } catch (err) {
    console.error('Failed to load quiz file', filePath, err);
    paperInfo.textContent = `No question data found for "${subject.name}". Demo JSON missing.`;
    questionsList.innerHTML = `<div class="muted">Demo data not available for this subject.</div>`;
    startExamTimer(examStartUtc, examEndUtc);
    return;
  }

  let paper = null;
  let paperAlias = null;

  if(Array.isArray(data.papers) && data.papers.length > 0){
    const idx = RANDOMIZE_SET ? Math.floor(Math.random() * data.papers.length) : pickPaperIndex(paperSeed, data.papers.length);
    paper = data.papers[idx];
    // normalize identifier and validate questions array
    paper.paperId = paper.paperId || paper.id || `paper${idx+1}`;
    if(!Array.isArray(paper.questions) || paper.questions.length === 0){
      paperInfo.textContent = `Paper data incomplete for "${subject.name}". Missing 'questions' array.`;
      questionsList.innerHTML = `<div class="muted">Paper is missing questions.</div>`;
      startExamTimer(examStartUtc, examEndUtc);
      return;
    }
    // optionally randomize question order each time the exam loads
    if(RANDOMIZE_QUESTIONS){ paper.questions = randomShuffle(paper.questions); console.info('Questions randomized for paper', paper.paperId); }

    paperAlias = data.alias || data.board || null;
  } else if(Array.isArray(data.sets) && data.sets.length > 0){
    const idx = RANDOMIZE_SET ? Math.floor(Math.random() * data.sets.length) : pickPaperIndex(paperSeed, data.sets.length);
    const set = data.sets[idx];
    paperAlias = set.alias || null;
    let mappedQuestions = (set.questions || []).map((qq, i) => {
      return {
        id: `${set.id}-q${i+1}`,
        text: qq.q || qq.text || `Q${i+1}`,
        options: qq.a || qq.options || [],
        answer: typeof qq.correct !== "undefined" ? qq.correct : (typeof qq.answer !== "undefined" ? qq.answer : undefined)
      };
    });
    // optionally randomize mapped questions each time the exam loads
    if(RANDOMIZE_QUESTIONS){ mappedQuestions = randomShuffle(mappedQuestions); console.info('Questions randomized for set', set.id); }
    paper = { paperId: set.id, questions: mappedQuestions };
  } else {
    paperInfo.textContent = "No papers/sets found in JSON.";
    questionsList.innerHTML = `<div class="muted">Add 'papers' or 'sets' array to JSON.</div>`;
    startExamTimer(examStartUtc, examEndUtc);
    return;
  }

  paperInfo.textContent = `Paper: ${paper.paperId} — ${paper.questions.length} MCQ — ${durationMinutes} min` + (paperAlias ? ` — ${paperAlias}` : "");
  renderQuestions(paper);
  startExamTimer(examStartUtc, examEndUtc);

// submit handler — use guarded submitAnswers to prevent duplicate submissions or accidental downloads
async function submitAnswers({auto=false} = {}){
    if(_submissionInProgress){
      console.warn('Submission already in progress — ignoring duplicate submit');
      return;
    }
    _submissionInProgress = true;
    try{
        // Gather answers and identity BEFORE clearing the DOM (was causing chosenIndex === null)
      const answers = gatherAnswers();
      const studentName = studentNameInput.value.trim();
      const studentEmail = studentEmailInput.value.trim();

      // Hide the exam and routine immediately
      examWidget.classList.add('hidden');
      if(scheduleList && scheduleList.parentElement) scheduleList.parentElement.classList.add('hidden'); // hide routine
      if(scheduleFooter) scheduleFooter.classList.add('hidden');
      // clear questions and stop timer so they disappear from view
      try{ if(timerInterval) { clearInterval(timerInterval); timerInterval = null; } }catch(e){}
      if(questionsList) questionsList.innerHTML = '';
      if(paperInfo) paperInfo.textContent = '';
      if(examTimer) examTimer.textContent = '--:--';

      // Mark button as submitted
      submitBtn.textContent = auto ? 'Auto-submitting...' : 'Submitted';
      submitBtn.disabled = true;

      const resultSheet = paper.questions.map((q, i) => {
        const qid = q.id || `q${i+1}`;
        const chosen = typeof answers[qid] !== 'undefined' ? Number(answers[qid]) : null;
        const correctIndex = typeof q.answer !== 'undefined' ? Number(q.answer) : null;
        return {
          id: qid,
          text: q.text,
          options: q.options || [],
          chosenIndex: chosen,
          correctIndex,
          correct: (correctIndex !== null) ? (chosen === correctIndex) : null
        };
      });

      const totalQuestions = paper.questions.length;
      const correctCount = resultSheet.filter(r=>r.correct===true).length;
      const wrongCount = resultSheet.filter(r=>r.correct===false).length;
      const unansweredCount = resultSheet.filter(r=>r.chosenIndex===null).length;
      const timeTakenSec = Math.round((Date.now() - examStartedAt)/1000);

      const payload = {
        subjectId: subject.id,
        subjectName: subject.name,
        paperId: paper.paperId,
        studentName,
        studentEmail,
        totalQuestions,
        correctCount,
        wrongCount,
        unansweredCount,
        timeTakenSec,
        resultSheet,
        answers,
        alias: paperAlias,
        auto: auto ? true : false,
        timestamp_utc: new Date().toISOString()
      };

      await sendSubmission(payload);
    }catch(e){
      console.error('Submit failed', e);
      // allow re-try if submit failed
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Answers';
    }finally{
      _submissionInProgress = false;
    }
}

submitBtn.onclick = ()=> submitAnswers({auto:false});
submitBtn._submitAnswers = submitAnswers;


}

function renderQuestions(paper){
  questionsList.innerHTML = "";
  for(let i=0;i<paper.questions.length;i++){
    const q = paper.questions[i];
    const qid = q.id || `q${i+1}`;
    const div = document.createElement("div");
    div.className = "q-card";

    // question image if present
    const qImageHtml = q.image ? `\n      <div class="q-img-wrap"><img class="q-img" src="${q.image}" alt="${escapeHtml(q.imageAlt||q.text||'question image')}" loading="lazy"/></div>` : "";

    // options may be strings or objects { text?, image?, imageAlt? }
    const optionsHtml = (q.options || []).map((opt,oi)=>{
      let optText = '';
      let optImg = '';
      if(typeof opt === 'string'){
        optText = escapeHtml(opt);
      } else if(opt && typeof opt === 'object'){
        optText = escapeHtml(opt.text || '');
        if(opt.image) optImg = `<img class="opt-img" src="${opt.image}" alt="${escapeHtml(opt.imageAlt||opt.text||'option image')}" loading="lazy"/>`;
      }
      return `<label><input type="radio" name="${qid}" value="${oi}"/> <div class="opt-flex">${optImg ? `<div class="opt-img-wrap">${optImg}</div>` : ''}${optText ? `<div class="opt-text">${optText}</div>` : ''}</div></label>`;
    }).join("");

    div.innerHTML = `\n      <div class="q-text"><strong>${i+1}.</strong> ${escapeHtml(q.text||'')}</div>${qImageHtml}\n      <div class="options" id="opt-${qid}">${optionsHtml}</div>\n    `;
    questionsList.appendChild(div);

    // Ensure options are selectable regardless of CSS quirks: add click/keyboard handlers and visual selection
    const labels = div.querySelectorAll('label');
    labels.forEach(lbl => {
      const input = lbl.querySelector('input[type="radio"]');
      const optFlex = lbl.querySelector('.opt-flex');
      // make label keyboard-focusable
      lbl.tabIndex = 0;

      lbl.addEventListener('click', (e) => {
        if(input){
          input.checked = true;
          input.dispatchEvent(new Event('change', {bubbles: true}));
          // update selected class in this question
          const group = div.querySelectorAll('.opt-flex');
          group.forEach(el => el.classList.remove('selected'));
          if(optFlex) optFlex.classList.add('selected');
        }
      });
      lbl.addEventListener('keydown', (e) => {
        if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); lbl.click(); }
      });

      // keep selection classes in sync if input state changes (e.g., keyboard, accessibility tools)
      if(input){
        input.addEventListener('change', ()=>{
          const group = div.querySelectorAll('.opt-flex');
          group.forEach(el => el.classList.remove('selected'));
          if(input.checked && optFlex) optFlex.classList.add('selected');
        });
      }
    });
  }
}

function gatherAnswers(){
  const ans = {};
  const radios = questionsList.querySelectorAll('input[type="radio"]:checked');
  radios.forEach(r=>{
    ans[r.name] = Number(r.value);
  });
  return ans;
}
function escapeHtml(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

/* ---------- timer ---------- */
let timerInterval = null;
function startExamTimer(examStartUtc, examEndUtc){
  if(timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(()=>{
    const now = nowUtcMs();
    if(now < examStartUtc){
      examTimer.textContent = `Starts in ${msToClock(examStartUtc - now)}`;
    } else if (now >= examStartUtc && now <= examEndUtc){
      const leftMs = examEndUtc - now;
      examTimer.textContent = msToClock(leftMs);
      if(leftMs <= 0){
        clearInterval(timerInterval);
        autoSubmitOnTimeout();
      }
    } else {
      examTimer.textContent = "--:--";
      clearInterval(timerInterval);
    }
  }, 500);
}
function msToClock(ms){
  if(ms<0) ms = 0;
  const total = Math.floor(ms/1000);
  const mins = Math.floor(total/60);
  const secs = total % 60;
  return `${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}`;
}
async function autoSubmitOnTimeout(){
  // Prefer explicit submit handler attached to the submit button (set inside loadExamPaper)
  if(submitBtn && typeof submitBtn._submitAnswers === 'function'){
    try{ await submitBtn._submitAnswers({auto:true}); } catch(e){ console.error('Auto submit handler error', e); }
    return;
  }
  if(typeof submitAnswers === 'function'){
    try{ await submitAnswers({auto:true}); } catch(e){ console.error('Auto submit handler error', e); }
    return;
  }

  // Fallback (shouldn't be reached) — preserve original behaviour
  submitBtn.disabled = true;
  submitBtn.textContent = "Auto-submitting...";
  if(typeof submitBtn.onclick === 'function'){
    try{ await submitBtn.onclick(); } catch(e){ console.error('Auto submit handler error', e); }
  }
}

/* ---------- send submission (Plan B, no download) ---------- */
async function sendSubmission(payload){
  const contentObj = {
    subjectId: payload.subjectId,
    subjectName: payload.subjectName,
    paperId: payload.paperId,
    alias: payload.alias || null,
    studentName: payload.studentName || null,
    studentEmail: payload.studentEmail || null,
    totalQuestions: payload.totalQuestions ?? null,
    correctCount: payload.correctCount ?? null,
    wrongCount: payload.wrongCount ?? null,
    unansweredCount: payload.unansweredCount ?? null,
    timeTakenSec: payload.timeTakenSec ?? null,
    resultSheet: payload.resultSheet || null,
    answers: payload.answers || null,
    auto: payload.auto ? true : false,
    timestamp_utc: payload.timestamp_utc || new Date().toISOString()
  };

  const submission = { id: `sub-${Date.now()}`, contentObj };

  // Save to localStorage
  const arr = JSON.parse(localStorage.getItem('aq_submissions') || '[]');
  arr.push(submission);
  localStorage.setItem('aq_submissions', JSON.stringify(arr));

  // Save normalized personal storage
  try{
    const rawKey = (contentObj.studentEmail && contentObj.studentEmail.trim()) ? contentObj.studentEmail.trim() : (contentObj.studentName ? contentObj.studentName.trim() : 'anonymous');
    const key = String(rawKey).toLowerCase();
    const mapRaw = localStorage.getItem('aq_personal') || '{}';
    const map = JSON.parse(mapRaw);
    map[key] = map[key] || [];
    map[key].push({
      subjectId: contentObj.subjectId,
      subjectName: contentObj.subjectName,
      paperId: contentObj.paperId,
      correctCount: contentObj.correctCount,
      totalQuestions: contentObj.totalQuestions,
      timeTakenSec: contentObj.timeTakenSec,
      resultSheet: contentObj.resultSheet,
      timestamp_utc: contentObj.timestamp_utc,
      studentName: contentObj.studentName || null,
      studentEmail: contentObj.studentEmail || null,
      _rawKey: rawKey
    });
    localStorage.setItem('aq_personal', JSON.stringify(map));
  }catch(e){ console.warn('Could not save personal result', e); }

  // Show congrats overlay
  showCongratsOverlay(contentObj);
}

/* ---------- congrats overlay ---------- */
function showCongratsOverlay(contentObj){
  if(congratsOverlay){
    congratsOverlay.classList.remove('hidden');
    if(congratsViewBtn){
      congratsViewBtn.onclick = ()=> {
        const key = (contentObj.studentEmail && contentObj.studentEmail.trim()) ? contentObj.studentEmail.trim() : (contentObj.studentName ? contentObj.studentName.trim() : 'anonymous');
        const param = encodeURIComponent(key);
        window.location.href = `./result.html?email=${param}`;
      };
    }
    if(congratsCloseBtn){
      congratsCloseBtn.onclick = ()=> {
        congratsOverlay.classList.add('hidden');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Answers';
      };
    }
    return;
  }

  const overlay = document.createElement('div'); overlay.className = 'congrats-overlay';
  const card = document.createElement('div'); card.className = 'congrats-card';
  const heart = document.createElement('div'); heart.className = 'heart'; heart.innerHTML = '💖';
  const title = document.createElement('div'); title.innerHTML = `<h3>Congratulations!</h3>`;
  const text = document.createElement('div'); text.className='muted'; text.textContent = 'Your answers have been saved.';
  const btnRow = document.createElement('div'); btnRow.style.display='flex'; btnRow.style.gap='8px';
  const viewBtn = document.createElement('button'); viewBtn.className='btn'; viewBtn.textContent='View Result';
  const closeBtn = document.createElement('button'); closeBtn.className='btn'; closeBtn.textContent='Close';
  closeBtn.style.background='linear-gradient(90deg,#cbd5e1,#94a3b8)';
  btnRow.appendChild(viewBtn); btnRow.appendChild(closeBtn);
  card.appendChild(heart); card.appendChild(title); card.appendChild(text); card.appendChild(btnRow);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  viewBtn.addEventListener('click', ()=>{
    const key = (contentObj.studentEmail && contentObj.studentEmail.trim()) ? contentObj.studentEmail.trim() : (contentObj.studentName ? contentObj.studentName.trim() : 'anonymous');
    const param = encodeURIComponent(key);
    window.location.href = `./result.html?email=${param}`;
  });
  closeBtn.addEventListener('click', ()=>{
    overlay.remove();
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Answers';
  });
}

/* ---------- legacy helpers ---------- */
function showPersonalResult(contentObj){
  examWidget.classList.add("hidden");
  resultWidget.classList.remove("hidden");
  resultWidget.innerHTML = `<h3>Your submission was saved. Open Results page to view details.</h3><a class="btn" href="result.html">Open Results</a>`;
}

/* ---------- init ---------- */
const testBtn = document.getElementById('btnTestExam');
if(testBtn) testBtn.addEventListener('click', ()=>{ _testModeActive = true; init(); });
document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape' && congratsOverlay && !congratsOverlay.classList.contains('hidden')){
    congratsOverlay.classList.add('hidden');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Answers';
  }
});
init();
