// =====================================
// [필수] 구글 앱스 스크립트 배포 주소
// =====================================
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyt3Wa2WcYQn1JeLE8nC0CF_d6mLQ6CDzv2JBwMU1so785By01gm4r-ChR4l_j69gRo/exec"; 

if (window.location.protocol === 'file:') alert("⚠️ 주의: GitHub Pages로 접속해야 카메라와 저장 기능이 정상 작동합니다.");

// =====================================
// 1. 유틸리티 (엑셀 저장, 입력 제한)
// =====================================
function copyAndOpenGemini() {
    const val = document.getElementById('gemini-input').value;
    if(!val) { alert("질문할 내용을 입력해주세요."); return; }
    navigator.clipboard.writeText(val).then(() => {
        if(confirm("복사되었습니다! Gemini로 이동하시겠습니까?")) window.open("https://gemini.google.com/app", '_blank');
    });
}

// 엑셀 저장 함수 (가장 강력한 방식 - BOM 포함)
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

function validPos(el) { if(el.value < 0) el.value = 0; }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }


// =====================================
// 2. 아두이노 센서 (연결 및 저장 오류 해결)
// =====================================
let port, keepReading = false, reader;
let sensorDataLog = [];
let recordInterval = null;
let currentVal = {t:"-", h:"-", l:"-", s:"-"};

async function connectArduino() {
    if (!("serial" in navigator)) { alert("PC 크롬 또는 엣지 브라우저에서만 사용 가능합니다."); return; }
    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });
        
        document.getElementById('connectBtn').innerText = "✅ 연결됨";
        document.getElementById('connectBtn').disabled = true;
        document.getElementById('recordBtn').disabled = false;
        document.getElementById('record-status').innerText = "데이터 수신 중...";
        
        keepReading = true;
        readSerial();
    } catch(e) { 
        console.error(e);
        alert("연결 실패: 포트를 선택하지 않았거나 다른 프로그램이 사용 중입니다.");
    }
}

async function readSerial() {
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();
    let buffer = "";

    try {
        while (keepReading) {
            const { value, done } = await reader.read();
            if (done) { reader.releaseLock(); break; }
            if (value) {
                buffer += value;
                const lines = buffer.split("\n");
                buffer = lines.pop(); // 덜 들어온 데이터는 버퍼에 남김

                for (const line of lines) {
                    const parts = line.trim().split(",");
                    if (parts.length >= 4) {
                        currentVal = {t:parts[0], h:parts[1], l:parts[2], s:parts[3]};
                        
                        // 화면 업데이트
                        document.getElementById('val-temp').innerText = currentVal.t;
                        document.getElementById('val-humid').innerText = currentVal.h;
                        document.getElementById('val-light').innerText = currentVal.l;
                        document.getElementById('val-soil').innerText = currentVal.s;
                        
                        // 조도 설명 업데이트
                        updateLightDescription(parseInt(currentVal.l));
                    }
                }
            }
        }
    } catch (e) { console.error(e); }
}

function updateLightDescription(lux) {
    const el = document.getElementById('desc-light');
    let text="", color="#666";
    // [설정] 이미지 기준표에 맞게 숫자 조정
    if (lux < 300) { text="🌑 음지 (어두움)"; color="#5c6bc0"; }
    else if (lux < 700) { text="⛅ 반음지/반양지"; color="#ffb74d"; }
    else { text="☀️ 양지 (매우 밝음)"; color="#e65100"; }
    el.innerText = text; el.style.color = color;
}

function startRecording() {
    sensorDataLog = [["시간", "온도(C)", "습도(%)", "조도(Level)", "토양습도(%)"]];
    document.getElementById('recordBtn').disabled = true;
    document.getElementById('saveRecordBtn').disabled = false;
    document.getElementById('record-status').innerText = "🔴 기록 중 (1초 간격)...";
    
    if(recordInterval) clearInterval(recordInterval);
    recordInterval = setInterval(() => {
        const time = new Date().toLocaleTimeString();
        sensorDataLog.push([time, currentVal.t, currentVal.h, currentVal.l, currentVal.s]);
    }, 1000);
}

function stopAndSaveRecording() {
    clearInterval(recordInterval);
    document.getElementById('recordBtn').disabled = false;
    document.getElementById('saveRecordBtn').disabled = true;
    document.getElementById('record-status').innerText = "저장 완료!";
    
    // CSV 변환
    let csv = "";
    sensorDataLog.forEach(row => { csv += row.join(",") + "\n"; });
    downloadCSV("환경데이터_로그.csv", csv);
}


// =====================================
// 3. 방형구법 분석 (오류 해결)
// =====================================
function addRow() {
    const container = document.getElementById('inputList');
    const div = document.createElement('div');
    div.className = 'list-item';
    div.innerHTML = `
        <div class="list-inputs">
            <input type="text" class="p-name" placeholder="식물명">
            <input type="number" class="p-count" placeholder="개체수" min="0" oninput="validPos(this)">
            <input type="number" class="p-freq" placeholder="출현방형구" min="0" oninput="validPos(this)">
            <input type="number" class="p-cover" placeholder="피도(1~5)" min="0" max="5" oninput="validPos(this)">
        </div>
        <button onclick="this.parentElement.remove()" class="btn-del"><i class="fa-solid fa-trash"></i></button>
    `;
    container.appendChild(div);
}

function calculate() {
    const totalQ = Math.abs(parseFloat(document.getElementById('totalQuadrats').value)) || 10;
    const items = document.querySelectorAll('.list-item');
    let data = [], sD=0, sF=0, sC=0;

    items.forEach(item => {
        const n = item.querySelector('.p-name').value;
        const c = Math.abs(parseFloat(item.querySelector('.p-count').value)||0);
        const f = Math.abs(parseFloat(item.querySelector('.p-freq').value)||0);
        let cv = Math.abs(parseFloat(item.querySelector('.p-cover').value)||0);
        if(cv > 5) cv = 5;

        if(n) {
            // 빈도값: 출현방형구 / 전체방형구
            const fVal = f / totalQ;
            data.push({n, c, fVal, cv, fRaw: f});
            sD += c; sF += fVal; sC += cv;
        }
    });

    if(data.length === 0) return alert("데이터를 입력해주세요.");

    const tbody = document.getElementById('resultBody');
    tbody.innerHTML = "";
    let maxIV = 0, domName = "";

    // 중요치 계산 (상대밀도+상대빈도+상대피도)
    data = data.map(d => {
        const rD = (sD===0) ? 0 : (d.c / sD) * 100;
        const rF = (sF===0) ? 0 : (d.fVal / sF) * 100;
        const rC = (sC===0) ? 0 : (d.cv / sC) * 100;
        const iv = rD + rF + rC;
        
        if(iv > maxIV) { maxIV = iv; domName = d.n; }
        return { ...d, iv };
    }).sort((a,b) => b.iv - a.iv);

    data.forEach((d, i) => {
        tbody.innerHTML += `<tr><td>${i+1}</td><td>${d.n}</td><td>${d.iv.toFixed(1)}</td></tr>`;
    });

    document.getElementById('dominant-species').innerText = domName;
    document.getElementById('dominant-iv').innerText = "IV: " + maxIV.toFixed(1);
    document.getElementById('result-modal').classList.remove('hidden');
}

function downloadResultCSV() {
    let csv = "[입력 데이터]\n";
    csv += "전체 방형구 수," + document.getElementById('totalQuadrats').value + "\n";
    csv += "식물명,개체수,출현 방형구,피도 계급\n";
    
    document.querySelectorAll('.list-item').forEach(item => {
        const n = item.querySelector('.p-name').value;
        if(n) {
            csv += `${n},${item.querySelector('.p-count').value},${item.querySelector('.p-freq').value},${item.querySelector('.p-cover').value}\n`;
        }
    });

    csv += "\n[분석 결과]\n순위,우점종 여부,종 이름,중요치(IV)\n";
    const rows = document.getElementById('resultBody').querySelectorAll('tr');
    
    if(rows.length === 0) return alert("분석 결과가 없습니다.");

    rows.forEach(r => {
        const c = r.querySelectorAll('td');
        const rank = c[0].innerText;
        const name = c[1].innerText;
        const iv = c[2].innerText;
        const isDom = (rank === "1") ? "우점종(WIN)" : "";
        csv += `${rank},${isDom},${name},${iv}\n`;
    });

    downloadCSV("식물군집조사_통합보고서.csv", csv);
}


// =====================================
// 4. AI 카메라 (기존 로직 유지)
// =====================================
const URL_PATH = "./my_model/"; 
let model, maxPredictions, isRunning = false;

window.addEventListener('load', async () => {
    // 초기 방형구 2줄 추가
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
    if(isRunning) return alert("이미 켜져 있습니다.");
    const btn = document.getElementById("startBtn");
    const video = document.getElementById("video-element");
    const devId = document.getElementById("camera-select").value;

    btn.innerText = "모델 로딩 중..."; btn.disabled = true;
    try {
        model = await tmImage.load(URL_PATH+"model.json", URL_PATH+"metadata.json");
        maxPredictions = model.getTotalClasses();
        
        const stream = await navigator.mediaDevices.getUserMedia({
            video:{deviceId:devId?{exact:devId}:undefined, width:640, height:480}
        });
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            video.play(); isRunning = true;
            document.getElementById('loader-text').style.display="none";
            btn.innerHTML='<i class="fa-solid fa-check"></i> 작동 중'; btn.style.background="#1b5e20";
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
            if(i>=maxPredictions) break;
            const prob=(p[i].probability*100).toFixed(1);
            if(prob>5) con.innerHTML+=`<div class="label-item"><div style="display:flex;justify-content:space-between;"><strong>${p[i].className}</strong><span style="color:#2e7d32">${prob}%</span></div><div class="progress-bg"><div class="progress-fill" style="width:${prob}%"></div></div></div>`;
        }
    }
    requestAnimationFrame(predictLoop);
}


// =====================================
// 5. 퀴즈 기능 (학생정보, 타이머, 페이징)
// =====================================
let currentQuizType="", studentInfo={id:"", name:""};
let quizQuestions=[], selectedAnswers=[], quizTimer=null, timeLeft=300;

// 문제 풀 (예시 데이터)
const fullQuestionPool = [
    { q: "일정한 지역에 모여 사는 '같은 종'의 개체 집단은?", a: 0, h: "종이 같아야 합니다.", opts: ["개체군", "군집", "생태계", "생물권"] },
    { q: "여러 종의 개체군들이 모여 이룬 집단은?", a: 2, h: "개체군들의 모임입니다.", opts: ["개체", "개체군", "군집", "환경"] },
    { q: "식물 군집 조사 시 사용하는 1mx1m 틀은?", a: 0, h: "사각형 모양의 틀입니다.", opts: ["방형구", "원형구", "프레파라트", "샬레"] },
    { q: "방형구법으로 알 수 없는 지표는?", a: 3, h: "지능은 측정할 수 없습니다.", opts: ["밀도", "빈도", "피도", "지능"] },
    { q: "특정 종의 개체 수를 전체 면적으로 나눈 값은?", a: 0, h: "빽빽한 정도.", opts: ["밀도", "빈도", "피도", "중요치"] },
    { q: "특정 종이 출현한 방형구 수를 전체 방형구 수로 나눈 것은?", a: 1, h: "얼마나 자주 출현하는가?", opts: ["밀도", "빈도", "피도", "상대밀도"] },
    { q: "지표면을 덮고 있는 면적의 비율은?", a: 2, h: "덮을 피(被) 자를 씁니다.", opts: ["밀도", "빈도", "피도", "중요치"] },
    { q: "군집을 대표하는 가장 우세한 종은?", a: 1, h: "우수하고 점령한 종.", opts: ["희소종", "우점종", "지표종", "외래종"] },
    { q: "중요치(IV) 공식으로 옳은 것은?", a: 1, h: "상대값 3개의 합.", opts: ["밀도+빈도+피도", "상대밀도+상대빈도+상대피도", "밀도x빈도", "상대밀도/상대피도"] },
    { q: "모든 종의 상대밀도 합은?", a: 2, h: "전체는 100%입니다.", opts: ["10%", "50%", "100%", "300%"] }
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
    
    // 퀴즈 화면 준비
    document.getElementById('quiz-modal').classList.remove('hidden');
    document.getElementById('quiz-type-title').innerText = currentQuizType;
    document.getElementById('quiz-page-1').classList.remove('hidden');
    document.getElementById('quiz-page-2').classList.add('hidden');
    document.getElementById('prev-page-btn').classList.add('hidden');
    document.getElementById('next-page-btn').classList.remove('hidden');
    document.getElementById('submit-quiz-btn').classList.add('hidden');
    
    // 10문제 랜덤 선택
    quizQuestions = fullQuestionPool.sort(() => 0.5 - Math.random()).slice(0, 10);
    selectedAnswers = new Array(10).fill(-1);
    
    // 문제 렌더링
    renderQuestions('quiz-page-1', 0, 5);
    renderQuestions('quiz-page-2', 5, 10);
    
    // 타이머
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