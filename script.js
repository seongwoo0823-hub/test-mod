// =====================================
// [필수 설정] 여기에 구글 웹앱 URL을 붙여넣으세요!
// =====================================
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwJ8TWrpYbykx13VVnngx10fo1xFwVwYFokfG5GMGXnzh-SgaGC7npBVZgvCU0LXL6f/exec"; 

if (window.location.protocol === 'file:') alert("⚠️ GitHub Pages로 접속해야 정상 작동합니다.");

// =====================================
// 1. 유틸리티 & 퀴즈 로직
// =====================================
function copyAndOpenGemini() {
    const val = document.getElementById('gemini-input').value;
    if(!val) { alert("내용을 입력하세요"); return; }
    navigator.clipboard.writeText(val).then(() => {
        if(confirm("복사되었습니다! Gemini로 이동하시겠습니까?")) window.open("https://gemini.google.com/app", '_blank');
    });
}
function downloadCSV(name, content) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\uFEFF"+content], {type:'text/csv;charset=utf-8;'}));
    link.download = name; link.click();
}
function validPos(el) { if(el.value < 0) el.value = 0; }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// 퀴즈 데이터 (30개 중 예시 10개)
const questionPool = [
    { q: "일정한 지역에 모여 사는 '같은 종'의 개체 집단은?", a: 0, opts: ["개체군", "군집", "생태계", "생물권"] },
    { q: "여러 종의 개체군들이 모여 이룬 집단은?", a: 2, opts: ["개체", "개체군", "군집", "환경"] },
    { q: "식물 군집 조사 시 사용하는 1mx1m 틀은?", a: 0, opts: ["방형구", "원형구", "프레파라트", "샬레"] },
    { q: "방형구법으로 알 수 없는 지표는?", a: 3, opts: ["밀도", "빈도", "피도", "지능"] },
    { q: "특정 종의 개체 수를 전체 면적으로 나눈 값은?", a: 0, opts: ["밀도", "빈도", "피도", "중요치"] },
    { q: "특정 종이 출현한 방형구 수를 전체 방형구 수로 나눈 것은?", a: 1, opts: ["밀도", "빈도", "피도", "상대밀도"] },
    { q: "지표면을 덮고 있는 면적의 비율은?", a: 2, opts: ["밀도", "빈도", "피도", "중요치"] },
    { q: "중요치가 가장 높아 군집을 대표하는 종은?", a: 1, opts: ["희소종", "우점종", "지표종", "외래종"] },
    { q: "중요치(IV)를 구하는 올바른 공식은?", a: 1, opts: ["밀도+빈도+피도", "상대밀도+상대빈도+상대피도", "밀도x빈도x피도", "상대밀도/상대피도"] },
    { q: "모든 종의 상대밀도 합은 얼마인가?", a: 2, opts: ["10%", "50%", "100%", "300%"] }
];

let currentQuizType = ""; 
let selectedAnswers = [];

function startQuiz(type) {
    if (GOOGLE_SCRIPT_URL.includes("여기에")) {
        alert("⚠️ 선생님! script.js 파일을 열어서 'GOOGLE_SCRIPT_URL' 부분에 주소를 넣어주세요.");
        return;
    }
    currentQuizType = type;
    document.getElementById('quiz-title').innerText = type + " (총 10문제)";
    document.getElementById('quiz-modal').classList.remove('hidden');
    document.getElementById('quiz-container').style.display = 'block';
    document.getElementById('quiz-result').style.display = 'none';
    document.getElementById('submit-quiz-btn').style.display = 'block';
    document.getElementById('close-quiz-btn').style.display = 'none';
    
    // 랜덤 10문제 출제
    const shuffled = questionPool.sort(() => 0.5 - Math.random());
    const selectedQuestions = shuffled.slice(0, 10);
    
    const container = document.getElementById('quiz-container');
    container.innerHTML = "";
    selectedAnswers = new Array(10).fill(-1);

    selectedQuestions.forEach((qData, index) => {
        const div = document.createElement('div');
        div.className = 'quiz-item';
        div.dataset.correct = qData.a;
        let html = `<div class="quiz-q">Q${index+1}. ${qData.q}</div>`;
        qData.opts.forEach((optText, optIdx) => {
            html += `<label class="quiz-opt" onclick="selectOpt(this, ${index}, ${optIdx})"><input type="radio" name="q${index}" value="${optIdx}"> ${optText}</label>`;
        });
        div.innerHTML = html;
        container.appendChild(div);
    });
}

function selectOpt(label, qIdx, optIdx) {
    const parent = label.parentElement;
    parent.querySelectorAll('.quiz-opt').forEach(el => el.classList.remove('selected'));
    label.classList.add('selected');
    label.querySelector('input').checked = true;
    selectedAnswers[qIdx] = optIdx;
}

function submitQuiz() {
    if (selectedAnswers.includes(-1)) return alert("모든 문제를 풀어주세요!");

    let score = 0;
    let answerString = "";
    const qDivs = document.querySelectorAll('.quiz-item');

    qDivs.forEach((div, idx) => {
        const correct = parseInt(div.dataset.correct);
        const student = selectedAnswers[idx];
        if (correct === student) score += 10;
        answerString += `Q${idx+1}(${student==correct?'O':'X'}), `;
    });

    let level = "노력 요함 (하)", color = "#e53935";
    if (score >= 80) { level = "매우 우수 (상)"; color = "#2e7d32"; }
    else if (score >= 50) { level = "보통 (중)"; color = "#fbc02d"; }

    document.getElementById('quiz-container').style.display = 'none';
    document.getElementById('submit-quiz-btn').style.display = 'none';
    
    const resDiv = document.getElementById('quiz-result');
    resDiv.style.display = 'block';
    document.getElementById('score-text').innerText = score + "점";
    const lvlText = document.getElementById('level-text');
    lvlText.innerText = level;
    lvlText.style.color = color;
    document.getElementById('close-quiz-btn').style.display = 'block';

    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: currentQuizType, score: score, level: level, answers: answerString })
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