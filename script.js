// =====================================
// [필수] 구글 앱스 스크립트 배포 주소
// =====================================
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyt3Wa2WcYQn1JeLE8nC0CF_d6mLQ6CDzv2JBwMU1so785By01gm4r-ChR4l_j69gRo/exec"; 

if (window.location.protocol === 'file:') alert("⚠️ 주의: GitHub Pages로 접속해야 카메라와 저장 기능이 정상 작동합니다.");

// =====================================
// 1. 유틸리티 & API 키 관리
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

// [핵심] Gemini API 호출 함수
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
    el.innerText = text; el.style.backgroundColor = color; el.style.color="white";
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
// 4. 방형구법 & 퀴즈 (기존 로직 동일)
// =====================================
// (이전 코드의 퀴즈 로직, 방형구 계산 로직, 엑셀 다운로드 함수 등은 너무 길어서 생략했습니다. 
//  반드시 직전 답변의 script.js에서 해당 부분들을 복사해서 여기에 붙여넣으세요!)
//  * startRealQuiz, submitQuiz, renderQuestions, calculate, addRow, downloadResultCSV 등 *