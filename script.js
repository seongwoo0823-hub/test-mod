// =====================================
// [필수] 구글 앱스 스크립트 배포 주소
// =====================================
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyt3Wa2WcYQn1JeLE8nC0CF_d6mLQ6CDzv2JBwMU1so785By01gm4r-ChR4l_j69gRo/exec"; 

if (window.location.protocol === 'file:') alert("⚠️ GitHub Pages로 접속해야 모든 기능이 작동합니다.");

// =====================================
// 1. 유틸리티 & API 키 관리 & AI 질문
// =====================================
function openKeyModal() { document.getElementById('key-modal').classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function validPos(el) { if(el.value < 0) el.value = 0; }

function saveApiKey() {
    const key = document.getElementById('api-key-input').value;
    if(!key) return alert("키를 입력하세요.");
    localStorage.setItem("GEMINI_KEY", key);
    alert("저장되었습니다!");
    closeModal('key-modal');
}

// [핵심] Gemini API 호출
async function askGemini(zoneId) {
    const inputId = `ask-${zoneId}`;
    const outputId = `ans-${zoneId}`;
    const question = document.getElementById(inputId).value;
    const apiKey = localStorage.getItem("GEMINI_KEY");

    if(!question) return alert("질문을 입력하세요.");
    if(!apiKey) return alert("상단 'AI 설정' 버튼을 눌러 API 키를 먼저 입력해주세요.");

    const outputDiv = document.getElementById(outputId);
    outputDiv.classList.remove('hidden');
    outputDiv.innerText = "AI가 생각 중입니다...";

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: question }] }] })
        });
        const data = await response.json();
        
        if (data.candidates && data.candidates.length > 0) {
            outputDiv.innerText = data.candidates[0].content.parts[0].text;
        } else {
            outputDiv.innerText = "답변을 가져올 수 없습니다. API 키를 확인하세요.";
        }
    } catch (error) {
        console.error(error);
        outputDiv.innerText = "에러 발생: " + error.message;
    }
}

// 엑셀 저장
function downloadCSV(fileName, csvContent) {
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// =====================================
// 2. AI 카메라
// =====================================
const URL_PATH = "./my_model/"; 
let model, maxPredictions, isRunning = false;

window.addEventListener('load', async () => {
    addRow(); addRow(); 
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
    btn.innerText="모델 로딩..."; btn.disabled=true;
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
            btn.innerHTML='<i class="fa-solid fa-check"></i> 작동 중'; btn.style.background="#2e7d32";
            predictLoop();
        };
    } catch(e) { alert("오류: "+e.message); btn.innerText="재시도"; btn.disabled=false; }
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
            const prob=(p[i].probability*100).toFixed(1);
            if(prob>5) con.innerHTML+=`<div class="label-item"><div style="display:flex;justify-content:space-between;"><strong>${p[i].className}</strong><span style="color:#2e7d32">${prob}%</span></div><div class="progress-bg"><div class="progress-fill" style="width:${prob}%"></div></div></div>`;
        }
    }
    requestAnimationFrame(predictLoop);
}

// =====================================
// 3. 아두이노
// =====================================
let port, keepReading=false, reader;
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
        document.getElementById('record-status').innerText="데이터 수신 중...";
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
    if (lux < 300) { text="음지"; color="#5c6bc0"; }
    else if (lux < 700) { text="반음지"; color="#ffb74d"; }
    else { text="양지"; color="#e65100"; }
    el.innerText = text; el.style.color = color;
}

function startRecording() {
    sensorDataLog=[["시간","온도","습도","조도","토양습도"]];
    document.getElementById('recordBtn').disabled=true;
    document.getElementById('saveRecordBtn').disabled=false;
    document.getElementById('record-status').innerText="기록 중...";
    recordInterval = setInterval(()=>{
        sensorDataLog.push([new Date().toLocaleTimeString(), currentVal.t, currentVal.h, currentVal.l, currentVal.s]);
    },1000);
}
function stopAndSaveRecording() {
    clearInterval(recordInterval);
    document.getElementById('recordBtn').disabled=false;
    document.getElementById('saveRecordBtn').disabled=true;
    document.getElementById('record-status').innerText="완료";
    let csv=""; sensorDataLog.forEach(r=>csv+=r.join(",")+"\n");
    downloadCSV("환경데이터.csv", csv);
}

// =====================================
// 4. 방형구법
// =====================================
function addRow() {
    const d=document.createElement('div'); d.className='list-item';
    d.innerHTML=`<div class="list-inputs"><input type="text" class="p-name" placeholder="식물명"><input type="number" class="p-count" placeholder="개체수" min="0" oninput="validPos(this)"><input type="number" class="p-freq" placeholder="방형구" min="0" oninput="validPos(this)"><input type="number" class="p-cover" placeholder="피도" min="0" max="5" oninput="validPos(this)"></div><button onclick="this.parentElement.remove()" class="btn-del"><i class="fa-solid fa-trash"></i></button>`;
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

// =====================================
// 5. 퀴즈 (학생정보, 타이머, 힌트)
// =====================================
let currentQuizType="", studentInfo={id:"", name:""};
let quizQuestions=[], selectedAnswers=[], quizTimer=null, timeLeft=300;

// 문제 데이터 (30개 예시 중 일부)
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
    { q: "모든 종의 상대밀도 합은 얼마인가?", a: 2, h: "전체 비율의 합입니다.", opts: ["10%", "50%", "100%", "300%"] }
];

function openLoginModal(type) {
    if (GOOGLE_SCRIPT_URL.includes("여기에")) { alert("선생님! script.js 파일에 구글 URL을 입력해주세요."); return; }
    currentQuizType = type;
    document.getElementById('student-id').value = "";
    document.getElementById('student-name').value = "";
    document.getElementById('login-modal').classList.remove('hidden');
}

function startRealQuiz() {
    const id = document.getElementById('student-id').value;
    const name = document.getElementById('student-name').value;
    if(!id || !name) return alert("학번과 이름을 입력해주세요.");
    
    studentInfo = { id, name };
    closeModal('login-modal');
    
    document.getElementById('quiz-modal').classList.remove('hidden');
    document.getElementById('quiz-type-title').innerText = currentQuizType;
    document.getElementById('quiz-page-1').classList.remove('hidden');
    document.getElementById('quiz-page-2').classList.add('hidden');
    document.getElementById('prev-page-btn').classList.add('hidden');
    document.getElementById('next-page-btn').classList.remove('hidden');
    document.getElementById('submit-quiz-btn').classList.add('hidden');
    
    quizQuestions = fullQuestionPool.sort(() => 0.5 - Math.random()).slice(0, 10);
    selectedAnswers = new Array(10).fill(-1);
    
    renderQuestions('quiz-page-1', 0, 5);
    renderQuestions('quiz-page-2', 5, 10);
    
    timeLeft = 300;
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
        if(!q) continue;
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
    const txt = btn.nextElementSibling;
    txt.style.display = (txt.style.display==='block') ? 'none' : 'block';
}
function selectOpt(label, qIdx, optIdx) {
    label.parentElement.querySelectorAll('.quiz-opt').forEach(el=>el.classList.remove('selected'));
    label.classList.add('selected');
    selectedAnswers[qIdx] = optIdx;
}
function changePage(p) {
    if(p===1) {
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
    const m = Math.floor(timeLeft/60);
    const s = timeLeft%60;
    document.getElementById('timer-display').innerText = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}
function quizTimeout() {
    clearInterval(quizTimer);
    alert("시간 초과! 다음 기회에...");
    closeModal('quiz-modal');
    sendToGoogleSheet(0, "통과 못함 (시간초과)", "미제출");
}
function submitQuiz() {
    if(selectedAnswers.includes(-1)) return alert("모든 문제를 풀어주세요.");
    clearInterval(quizTimer);
    let score=0, ansStr="";
    quizQuestions.forEach((q,i)=>{
        const correct = (q.a === selectedAnswers[i]);
        if(correct) score+=10;
        ansStr += `Q${i+1}(${correct?'O':'X'}) `;
    });
    let level="노력 요함 (하)";
    if(score>=80) level="매우 우수 (상)";
    else if(score>=50) level="보통 (중)";
    
    alert(`[평가 완료]\n점수: ${score}점\n수준: ${level}`);
    closeModal('quiz-modal');
    sendToGoogleSheet(score, level, ansStr);
}
function sendToGoogleSheet(score, level, answers) {
    const data = { id:studentInfo.id, name:studentInfo.name, type:currentQuizType, score:score, level:level, answers:answers };
    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
}