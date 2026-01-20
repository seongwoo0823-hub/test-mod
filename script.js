// =====================================
// [필수] 구글 앱스 스크립트 배포 주소
// =====================================
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyt3Wa2WcYQn1JeLE8nC0CF_d6mLQ6CDzv2JBwMU1so785By01gm4r-ChR4l_j69gRo/exec"; 

if (window.location.protocol === 'file:') alert("⚠️ GitHub Pages로 접속해야 정상 작동합니다.");

// =====================================
// 1. 유틸리티
// =====================================
function copyAndOpenGemini() {
    const val = document.getElementById('gemini-input').value;
    if(!val) { alert("내용을 입력하세요"); return; }
    navigator.clipboard.writeText(val).then(() => {
        if(confirm("복사되었습니다! Gemini로 이동하시겠습니까?")) window.open("https://gemini.google.com/app", '_blank');
    });
}
function validPos(el) { if(el.value < 0) el.value = 0; }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// =====================================
// 2. 학업 성취도 평가 (퀴즈 + 타이머 + 페이징)
// =====================================
let currentQuizType = "";
let studentInfo = { id: "", name: "" };
let quizQuestions = [];
let selectedAnswers = [];
let quizTimer = null;
let timeLeft = 300; // 5분 (초 단위)

// 30문제 풀 (힌트 포함)
const fullQuestionPool = [
    { q: "일정한 지역에 모여 사는 '같은 종'의 개체 집단은?", a: 0, h: "종이 같아야 합니다.", opts: ["개체군", "군집", "생태계", "생물권"] },
    { q: "여러 종의 개체군들이 모여 이룬 집단은?", a: 2, h: "개체군들의 모임입니다.", opts: ["개체", "개체군", "군집", "환경"] },
    { q: "식물 군집 조사 시 사용하는 1mx1m 틀은?", a: 0, h: "사각형 모양의 틀입니다.", opts: ["방형구", "원형구", "프레파라트", "샬레"] },
    { q: "방형구법으로 알 수 없는 지표는?", a: 3, h: "식물의 수나 분포와 관련 없는 것입니다.", opts: ["밀도", "빈도", "피도", "지능"] },
    { q: "특정 종의 개체 수를 전체 면적으로 나눈 값은?", a: 0, h: "빽빽한 정도입니다.", opts: ["밀도", "빈도", "피도", "중요치"] },
    { q: "특정 종이 출현한 방형구 수를 전체 방형구 수로 나눈 것은?", a: 1, h: "얼마나 자주 나타나는가?", opts: ["밀도", "빈도", "피도", "상대밀도"] },
    { q: "지표면을 덮고 있는 면적의 비율은?", a: 2, h: "식물이 땅을 덮은 정도입니다.", opts: ["밀도", "빈도", "피도", "중요치"] },
    { q: "중요치가 가장 높아 군집을 대표하는 종은?", a: 1, h: "우세하여 점령한 종입니다.", opts: ["희소종", "우점종", "지표종", "외래종"] },
    { q: "중요치(IV)를 구하는 올바른 공식은?", a: 1, h: "상대값 3가지를 더합니다.", opts: ["밀도+빈도+피도", "상대밀도+상대빈도+상대피도", "밀도x빈도x피도", "상대밀도/상대피도"] },
    { q: "모든 종의 상대밀도 합은 얼마인가?", a: 2, h: "전체 비율의 합입니다.", opts: ["10%", "50%", "100%", "300%"] },
    { q: "군집 내 모든 종의 중요치 합은?", a: 2, h: "100이 3개 모이면?", opts: ["100", "200", "300", "알 수 없다"] },
    { q: "방형구 설치의 가장 중요한 원칙은?", a: 1, h: "주관이 들어가면 안 됩니다.", opts: ["식물이 많은 곳", "무작위(랜덤)", "평평한 곳", "꽃이 있는 곳"] },
    { q: "경계선에 걸친 식물을 세는 일반적 규칙은?", a: 2, h: "두 면은 포함, 두 면은 제외.", opts: ["모두 셈", "안 셈", "두 면(ㄴ자)만 포함", "큰 것만 셈"] },
    { q: "특정 환경 조건을 알려주는 종은?", a: 2, h: "환경의 지표가 됩니다.", opts: ["우점종", "핵심종", "지표종", "희소종"] },
    { q: "두 개체군이 모두 이익을 얻는 상호작용은?", a: 2, h: "서로에게 이득입니다.", opts: ["경쟁", "기생", "상리공생", "편리공생"] },
    { q: "경쟁에서 진 종이 사라지는 현상은?", a: 0, h: "배타적으로 밀려납니다.", opts: ["경쟁 배타", "분서", "공생", "천이"] },
    { q: "경쟁을 피하기 위해 먹이나 서식지를 나누는 것은?", a: 1, h: "나누어 서식합니다.", opts: ["경쟁 배타", "분서", "포식", "기생"] },
    { q: "한쪽만 이익을 얻고 다른 쪽은 영향이 없는 공생은?", a: 3, h: "한쪽만 편리합니다.", opts: ["상리공생", "기생", "포식", "편리공생"] },
    { q: "개체 수는 적지만 생태계 유지에 결정적인 종은?", a: 1, h: "아치형 다리의 핵심 돌.", opts: ["우점종", "핵심종", "지표종", "희소종"] },
    { q: "맨땅(불모지)에서 시작되는 천이는?", a: 0, h: "처음 시작하는 천이입니다.", opts: ["1차 천이", "2차 천이", "습성 천이", "음수림"] },
    { q: "기존 식생이 파괴된 곳(산불 등)에서 시작되는 천이는?", a: 1, h: "두 번째 기회입니다.", opts: ["1차 천이", "2차 천이", "건성 천이", "습성 천이"] },
    { q: "천이의 마지막 안정된 상태는?", a: 1, h: "최고조(Climax)에 달했습니다.", opts: ["개척자", "극상", "초원", "관목림"] },
    { q: "건성 천이의 개척자는?", a: 1, h: "바위의 옷이라 불립니다.", opts: ["이끼", "지의류", "초본", "관목"] },
    { q: "숲의 가장 위쪽 층은?", a: 3, h: "키가 큰 나무 층입니다.", opts: ["지표층", "초본층", "관목층", "교목층"] },
    { q: "피도 계급을 정하는 적절한 방법은?", a: 1, h: "정확한 면적보다는 비율로.", opts: ["정밀 측정", "눈대중 비율 등급화", "키 기준", "개체수 기준"] },
    { q: "타감 작용의 예시는?", a: 1, h: "화학물질로 경쟁자를 억제합니다.", opts: ["꽃과 벌", "소나무 밑 잡초 억제", "사자와 사슴", "콩과 뿌리혹박테리아"] },
    { q: "방형구법의 최종 목적은?", a: 1, h: "누가 주인인지 알아봅니다.", opts: ["광합성 측정", "우점종 및 군집구조 파악", "미생물 조사", "신품종 개발"] },
    { q: "A종(밀도10), B종(30), C종(10)일 때 A의 상대밀도는?", a: 1, h: "10 / (10+30+10)", opts: ["10%", "20%", "33%", "50%"] },
    { q: "빈도가 0.5라는 의미는?", a: 1, h: "절반의 확률입니다.", opts: ["50개 발견", "방형구 2개 중 1개 꼴로 발견", "면적의 50% 차지", "중요치 50"] },
    { q: "지표종의 예시로 적절한 것은?", a: 0, h: "오염된 곳에서 삽니다.", opts: ["SO2 오염지의 지의류", "참나무", "토끼풀", "강아지풀"] }
];

function openLoginModal(type) {
    currentQuizType = type;
    document.getElementById('student-id').value = "";
    document.getElementById('student-name').value = "";
    document.getElementById('login-modal').classList.remove('hidden');
}

function startRealQuiz() {
    const id = document.getElementById('student-id').value;
    const name = document.getElementById('student-name').value;
    
    if(!id || !name) { alert("학번과 이름을 모두 입력해주세요."); return; }
    
    studentInfo = { id, name };
    closeModal('login-modal');
    
    // 퀴즈 초기화
    document.getElementById('quiz-modal').classList.remove('hidden');
    document.getElementById('quiz-type-title').innerText = currentQuizType;
    document.getElementById('quiz-page-1').classList.remove('hidden');
    document.getElementById('quiz-page-2').classList.add('hidden');
    document.getElementById('prev-page-btn').classList.add('hidden');
    document.getElementById('next-page-btn').classList.remove('hidden');
    document.getElementById('submit-quiz-btn').classList.add('hidden');
    
    // 30문제 중 10개 랜덤 선택
    quizQuestions = fullQuestionPool.sort(() => 0.5 - Math.random()).slice(0, 10);
    selectedAnswers = new Array(10).fill(-1);
    
    // 문제 렌더링 (페이지별 5개)
    renderQuestions('quiz-page-1', 0, 5);
    renderQuestions('quiz-page-2', 5, 10);
    
    // 타이머 시작
    timeLeft = 300; // 5분
    updateTimerDisplay();
    if(quizTimer) clearInterval(quizTimer);
    quizTimer = setInterval(() => {
        timeLeft--;
        updateTimerDisplay();
        if(timeLeft <= 0) quizTimeout();
    }, 1000);
}

function renderQuestions(containerId, start, end) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";
    for(let i=start; i<end; i++) {
        const q = quizQuestions[i];
        const div = document.createElement('div');
        div.className = 'quiz-item';
        let html = `<div class="quiz-q">Q${i+1}. ${q.q} <button class="hint-btn" onclick="toggleHint(this)">💡 힌트</button><div class="hint-text">${q.h}</div></div>`;
        q.opts.forEach((opt, optIdx) => {
            html += `<label class="quiz-opt" onclick="selectOpt(this, ${i}, ${optIdx})"><input type="radio" name="q${i}" value="${optIdx}"> ${opt}</label>`;
        });
        div.innerHTML = html;
        container.appendChild(div);
    }
}

function toggleHint(btn) {
    const hintText = btn.nextElementSibling;
    hintText.style.display = (hintText.style.display === 'block') ? 'none' : 'block';
}

function selectOpt(label, qIdx, optIdx) {
    const parent = label.parentElement;
    parent.querySelectorAll('.quiz-opt').forEach(el => el.classList.remove('selected'));
    label.classList.add('selected');
    selectedAnswers[qIdx] = optIdx;
}

function changePage(pageNum) {
    if(pageNum === 1) {
        document.getElementById('quiz-page-1').classList.remove('hidden');
        document.getElementById('quiz-page-2').classList.add('hidden');
        document.getElementById('prev-page-btn').classList.add('hidden');
        document.getElementById('next-page-btn').classList.remove('hidden');
        document.getElementById('submit-quiz-btn').classList.add('hidden');
    } else {
        document.getElementById('quiz-page-1').classList.add('hidden');
        document.getElementById('quiz-page-2').classList.remove('hidden');
        document.getElementById('prev-page-btn').classList.remove('hidden');
        document.getElementById('next-page-btn').classList.add('hidden');
        document.getElementById('submit-quiz-btn').classList.remove('hidden');
    }
}

function updateTimerDisplay() {
    const m = Math.floor(timeLeft / 60);
    const s = timeLeft % 60;
    document.getElementById('timer-display').innerText = 
        `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

function quizTimeout() {
    clearInterval(quizTimer);
    alert("시간이 초과되었습니다! 다음 기회에 도전하세요.");
    closeModal('quiz-modal');
    sendToGoogleSheet(0, "통과 못함 (시간초과)", "시간 초과로 미제출");
}

function submitQuiz() {
    if(selectedAnswers.includes(-1)) return alert("모든 문제를 풀어주세요!");
    clearInterval(quizTimer);
    
    let score = 0;
    let ansStr = "";
    quizQuestions.forEach((q, i) => {
        const correct = (q.a === selectedAnswers[i]);
        if(correct) score += 10;
        ansStr += `Q${i+1}(${correct?'O':'X'}) `;
    });

    let level = "노력 요함 (하)";
    if(score >= 80) level = "매우 우수 (상)";
    else if(score >= 50) level = "보통 (중)";

    alert(`평가 완료!\n점수: ${score}점\n수준: ${level}`);
    closeModal('quiz-modal');
    sendToGoogleSheet(score, level, ansStr);
}

function sendToGoogleSheet(score, level, answers) {
    const data = {
        id: studentInfo.id,
        name: studentInfo.name,
        type: currentQuizType,
        score: score,
        level: level,
        answers: answers
    };
    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
}

// =====================================
// 2. AI 카메라
// =====================================
const URL_PATH = "./my_model/"; 
let model, maxPredictions, isRunning = false;

window.addEventListener('load', async () => {
    addRow(); addRow(); // 방형구 초기화
    
    const select = document.getElementById('camera-select');
    try {
        const s = await navigator.mediaDevices.getUserMedia({video:true});
        s.getTracks().forEach(t=>t.stop());
        const d = await navigator.mediaDevices.enumerateDevices();
        const v = d.filter(k=>k.kind==='videoinput');
        select.innerHTML = '';
        if(v.length===0) { select.innerHTML='<option disabled>카메라 없음</option>'; return; }
        v.forEach((dev,i)=>{
            const opt=document.createElement('option');
            opt.value=dev.deviceId; opt.text=dev.label||`카메라 ${i+1}`;
            select.appendChild(opt);
        });
        if(v.length>1) select.selectedIndex=v.length-1;
    } catch(e){ select.innerHTML='<option>권한 필요</option>'; }
});

async function startCamera() {
    if(isRunning) return alert("이미 켜져 있음");
    const btn=document.getElementById("startBtn");
    btn.innerText="모델 로딩 중..."; btn.disabled=true;
    try {
        model = await tmImage.load(URL_PATH+"model.json", URL_PATH+"metadata.json");
        maxPredictions = model.getTotalClasses();
        const devId = document.getElementById("camera-select").value;
        const stream = await navigator.mediaDevices.getUserMedia({
            video:{deviceId:devId?{exact:devId}:undefined, width:640, height:480}
        });
        const video = document.getElementById("video-element");
        video.srcObject = stream;
        video.onloadedmetadata = ()=>{
            video.play(); isRunning=true;
            document.getElementById('loader-text').style.display="none";
            btn.innerHTML='<i class="fa-solid fa-check"></i> 작동 중'; btn.style.background="#1b5e20";
            predictLoop();
        };
    } catch(e) { alert("오류(GitHub Pages인지 확인): "+e.message); btn.innerText="재시도"; btn.disabled=false; }
}

async function predictLoop() {
    if(!isRunning) return;
    const v=document.getElementById("video-element");
    const c=document.getElementById("canvas-element");
    const ctx=c.getContext("2d");
    if(c.width!==v.videoWidth) {c.width=v.videoWidth; c.height=v.videoHeight;}
    ctx.drawImage(v,0,0,c.width,c.height);
    if(model){
        const p = await model.predict(v);
        const con = document.getElementById("label-container");
        con.innerHTML="";
        p.sort((a,b)=>b.probability-a.probability);
        for(let i=0; i<3; i++){
            if(i>=maxPredictions) break;
            const prob=(p[i].probability*100).toFixed(1);
            if(prob>5) con.innerHTML+=`<div class="label-item"><div style="display:flex;justify-content:space-between;"><strong>${p[i].className}</strong><span style="color:#2e7d32">${prob}%</span></div><div class="progress-bg"><div class="progress-fill" style="width:${prob}%"></div></div></div>`;
        }
    }
    requestAnimationFrame(predictLoop);
}

// =====================================
// 3. 아두이노
// =====================================
let port, keepReading=false;
let sensorDataLog=[], recordInterval=null;
let currentVal={t:"-", h:"-", l:"-", s:"-"};

async function connectArduino() {
    if(!navigator.serial) return alert("PC 크롬에서만 가능");
    try {
        port = await navigator.serial.requestPort();
        await port.open({baudRate:9600});
        document.getElementById('connectBtn').innerText="✅ 연결됨";
        document.getElementById('connectBtn').disabled=true;
        document.getElementById('recordBtn').disabled=false;
        keepReading=true; readSerial();
    } catch(e){console.log(e);}
}

async function readSerial() {
    const decoder = new TextDecoderStream();
    port.readable.pipeTo(decoder.writable);
    const reader = decoder.readable.getReader();
    let buffer = "";
    try {
        while(keepReading) {
            const {value, done} = await reader.read();
            if(done) break;
            if(value) {
                buffer += value;
                const lines = buffer.split("\n");
                buffer = lines.pop();
                for(const line of lines) {
                    const parts = line.trim().split(",");
                    if(parts.length >= 4) {
                        currentVal = {t:parts[0], h:parts[1], l:parts[2], s:parts[3]};
                        document.getElementById('val-temp').innerText = currentVal.t;
                        document.getElementById('val-humid').innerText = currentVal.h;
                        document.getElementById('val-light').innerText = currentVal.l;
                        document.getElementById('val-soil').innerText = currentVal.s;
                        updateLightDescription(parseInt(currentVal.l));
                    }
                }
            }
        }
    } catch(e){console.error(e);}
}

function updateLightDescription(lux) {
    const el = document.getElementById('desc-light');
    let text="", color="#666";
    if (lux < 300) { text="🌑 음지 (어두움)"; color="#5c6bc0"; }
    else if (lux < 700) { text="⛅ 반음지/반양지"; color="#ffb74d"; }
    else { text="☀️ 양지 (매우 밝음)"; color="#e65100"; }
    el.innerText = text; el.style.color = color;
}

function startRecording() {
    sensorDataLog=[["시간","온도","습도","조도","토양습도"]];
    document.getElementById('recordBtn').disabled=true;
    document.getElementById('saveRecordBtn').disabled=false;
    document.getElementById('record-status').innerText="🔴 기록 중...";
    recordInterval = setInterval(()=>{
        sensorDataLog.push([new Date().toLocaleTimeString(), currentVal.t, currentVal.h, currentVal.l, currentVal.s]);
    },1000);
}
function stopAndSaveRecording() {
    clearInterval(recordInterval);
    document.getElementById('recordBtn').disabled=false;
    document.getElementById('saveRecordBtn').disabled=true;
    document.getElementById('record-status').innerText="저장 완료";
    let csv=""; sensorDataLog.forEach(r=>csv+=r.join(",")+"\n");
    downloadCSV("환경데이터.csv", csv);
}

// =====================================
// 4. 방형구법
// =====================================
function addRow() {
    const d=document.createElement('div'); d.className='list-item';
    d.innerHTML=`<div class="list-inputs"><input type="text" class="p-name" placeholder="식물명"><input type="number" class="p-count" placeholder="개체수" min="0" oninput="validPos(this)"><input type="number" class="p-freq" placeholder="방형구수" min="0" oninput="validPos(this)"><input type="number" class="p-cover" placeholder="피도" min="0" max="5" oninput="validPos(this)"></div><button onclick="this.parentElement.remove()" class="btn-del"><i class="fa-solid fa-trash"></i></button>`;
    document.getElementById('inputList').appendChild(d);
}
function calculate() {
    const totalQ=Math.abs(parseFloat(document.getElementById('totalQuadrats').value))||10;
    const items=document.querySelectorAll('.list-item');
    let data=[], sD=0, sF=0, sC=0;
    items.forEach(i=>{
        const n=i.querySelector('.p-name').value;
        const c=Math.abs(parseFloat(i.querySelector('.p-count').value)||0);
        const f=Math.abs(parseFloat(i.querySelector('.p-freq').value)||0);
        let cv=Math.abs(parseFloat(i.querySelector('.p-cover').value)||0);
        if(cv>5)cv=5;
        if(n){ data.push({n, c, fV:f/totalQ, cv}); sD+=c; sF+=(f/totalQ); sC+=cv; }
    });
    if(data.length===0) return alert("데이터 입력 필요");
    
    const tbody=document.getElementById('resultBody'); tbody.innerHTML="";
    let maxIV=0, domName="";
    data=data.map(d=>{
        const iv=((d.c/sD)*100)+((d.fV/sF)*100)+((d.cv/sC)*100);
        if(iv>maxIV){maxIV=iv; domName=d.n;}
        return{...d, iv};
    }).sort((a,b)=>b.iv-a.iv);
    
    data.forEach((d,i)=>tbody.innerHTML+=`<tr><td>${i+1}</td><td>${d.n}</td><td>${d.iv.toFixed(1)}</td></tr>`);
    document.getElementById('dominant-species').innerText=domName;
    document.getElementById('dominant-iv').innerText="IV: "+maxIV.toFixed(1);
    document.getElementById('result-modal').classList.remove('hidden');
}
function downloadResultCSV() {
    let csv="[입력 데이터]\n전체 방형구 수,"+document.getElementById('totalQuadrats').value+"\n식물명,개체수,출현 방형구,피도\n";
    document.querySelectorAll('.list-item').forEach(i=>{
        const n=i.querySelector('.p-name').value;
        if(n) csv+=`${n},${i.querySelector('.p-count').value},${i.querySelector('.p-freq').value},${i.querySelector('.p-cover').value}\n`;
    });
    csv+="\n[분석 결과]\n순위,우점종,종이름,중요치(IV)\n";
    const rows=document.getElementById('resultBody').querySelectorAll('tr');
    if(rows.length===0)return alert("결과 없음");
    rows.forEach(r=>{
        const c=r.querySelectorAll('td');
        csv+=`${c[0].innerText},${c[0].innerText==='1'?'WIN':''},${c[1].innerText},${c[2].innerText}\n`;
    });
    downloadCSV("통합보고서.csv", csv);
}