// =====================================
// [필수] 구글 앱스 스크립트 주소
// =====================================
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwMXVBPFTJbRU1x7AI_z1ULPTMTfKwIPgi-fPCrGFGMPtA717L5DxNYfcKHJ3q5v9ip/exec"; 

// [중요] Google Generative AI SDK 가져오기
import { GoogleGenerativeAI } from "@google/generative-ai";

if (window.location.protocol === 'file:') alert("⚠️ GitHub Pages로 접속해야만 작동합니다.");

// =====================================
// 1. 유틸리티 & 설정
// =====================================
// HTML 버튼에서 호출할 수 있도록 window 객체에 함수 등록
window.openKeyModal = () => document.getElementById('key-modal').classList.remove('hidden');
window.closeModal = (id) => document.getElementById(id).classList.add('hidden');
window.closeAiBox = () => document.getElementById('ai-response').classList.add('hidden');
window.validPos = (el) => { if(el.value < 0) el.value = 0; }; // 음수 방지

window.saveApiKey = () => {
    const key = document.getElementById('api-key-input').value;
    if(!key) return alert("키를 입력하세요.");
    localStorage.setItem("GEMINI_KEY", key);
    alert("저장되었습니다!");
    window.closeModal('key-modal');
};

// =====================================
// 2. Gemini AI 질문 (SDK 사용)
// =====================================
window.askGemini = async () => {
    const question = document.getElementById('ai-input').value;
    const apiKey = localStorage.getItem("GEMINI_KEY");

    if(!question) return alert("질문을 입력하세요.");
    if(!apiKey) return alert("상단 ⚙️ 버튼을 눌러 API 키를 먼저 입력해주세요.");

    const box = document.getElementById('ai-response');
    const textDiv = document.getElementById('ai-text');
    box.classList.remove('hidden');
    textDiv.innerText = "🤖 AI가 생각 중입니다...";

    try {
        // SDK 초기화 및 모델 호출
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const result = await model.generateContent(question + " (고등학생 수준으로 쉽고 짧게 설명해줘)");
        const response = await result.response;
        const text = response.text();
        
        textDiv.innerText = text;
    } catch (error) {
        console.error(error);
        textDiv.innerText = "오류 발생: API 키가 정확한지 확인해주세요.\n" + error.message;
    }
};

window.downloadCSV = (fileName, csvContent) => {
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// =====================================
// 3. AI 카메라 (검은 화면 해결)
// =====================================
const URL_PATH = "./my_model/"; 
let model, maxPredictions, isRunning = false;

// 페이지 로드 시 초기화
window.addEventListener('load', async () => {
    window.addRow(); window.addRow(); // 방형구 초기화
    
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

window.startCamera = async () => {
    if(isRunning) return alert("이미 켜져 있습니다.");
    const btn = document.getElementById("startBtn");
    const video = document.getElementById("video-element");
    const devId = document.getElementById("camera-select").value;

    btn.innerText = "로딩 중..."; btn.disabled = true;

    try {
        model = await tmImage.load(URL_PATH+"model.json", URL_PATH+"metadata.json");
        maxPredictions = model.getTotalClasses();
        
        const stream = await navigator.mediaDevices.getUserMedia({
            video:{deviceId:devId?{exact:devId}:undefined, width:640, height:480}
        });
        
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            video.play(); 
            isRunning = true;
            document.getElementById('loader-text').style.display="none";
            btn.innerHTML='<i class="fa-solid fa-check"></i> 작동 중'; 
            btn.style.background="#66bb6a";
            predictLoop();
        };
    } catch(e) { alert("오류: "+e.message); btn.innerText="재시도"; btn.disabled=false; }
};

async function predictLoop() {
    if(!isRunning) return;
    
    const video = document.getElementById("video-element");
    const canvas = document.getElementById("canvas-element");
    const ctx = canvas.getContext("2d");

    // [중요] 캔버스 크기를 비디오 원본 크기에 맞춤 (검은 화면 방지)
    if(video.videoWidth > 0 && canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
    }

    // 1. 비디오 화면을 캔버스에 그리기
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // 2. AI 예측
    if(model){
        const p = await model.predict(video); // video 요소 자체를 넘김
        const con = document.getElementById("label-container");
        con.innerHTML="";
        p.sort((a,b)=>b.probability-a.probability);
        for(let i=0; i<3; i++){
            const prob=(p[i].probability*100).toFixed(1);
            if(prob>5) con.innerHTML+=`<div class="label-item"><div style="display:flex;justify-content:space-between;"><strong>${p[i].className}</strong><span style="color:#009688;font-weight:bold;">${prob}%</span></div><div class="progress-bg"><div class="progress-fill" style="width:${prob}%"></div></div></div>`;
        }
    }
    requestAnimationFrame(predictLoop);
}

// =====================================
// 4. 아두이노
// =====================================
let port, keepReading=false;
let sensorDataLog=[], recordInterval=null;
let currentVal={t:"-", h:"-", l:"-", s:"-"};

window.connectArduino = async () => {
    if(!navigator.serial) return alert("PC 크롬에서만 가능");
    try {
        port = await navigator.serial.requestPort();
        await port.open({baudRate:9600});
        document.getElementById('connectBtn').innerText="✅";
        document.getElementById('connectBtn').disabled=true;
        document.getElementById('recordBtn').disabled=false;
        document.getElementById('record-status').innerText="데이터 수신 중...";
        keepReading=true; readSerial();
    } catch(e){console.log(e);}
};

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
    else { text="양지"; color="#ef6c00"; }
    el.innerText = text; el.style.backgroundColor = color; el.style.color="white";
}

window.startRecording = () => {
    sensorDataLog=[["시간","온도","습도","조도","토양습도"]];
    document.getElementById('recordBtn').disabled=true;
    document.getElementById('saveRecordBtn').disabled=false;
    document.getElementById('record-status').innerText="기록 중...";
    recordInterval = setInterval(()=>{
        sensorDataLog.push([new Date().toLocaleTimeString(), currentVal.t, currentVal.h, currentVal.l, currentVal.s]);
    },1000);
};
window.stopAndSaveRecording = () => {
    clearInterval(recordInterval);
    document.getElementById('recordBtn').disabled=false;
    document.getElementById('saveRecordBtn').disabled=true;
    document.getElementById('record-status').innerText="완료";
    let csv=""; sensorDataLog.forEach(r=>csv+=r.join(",")+"\n");
    window.downloadCSV("환경데이터.csv", csv);
};

// =====================================
// 5. 방형구법
// =====================================
window.addRow = () => {
    const d=document.createElement('div'); d.className='list-item';
    d.innerHTML=`<div class="list-inputs"><input type="text" class="p-name" placeholder="식물명"><input type="number" class="p-count" placeholder="개체수" min="0" oninput="validPos(this)"><input type="number" class="p-freq" placeholder="방형구" min="0" oninput="validPos(this)"><input type="number" class="p-cover" placeholder="피도" min="0" max="5" oninput="validPos(this)"></div><button onclick="this.parentElement.remove()" class="btn-del"><i class="fa-solid fa-trash"></i></button>`;
    document.getElementById('inputList').appendChild(d);
};
window.calculate = () => {
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
};
window.downloadResultCSV = () => {
    let csv="[입력]\n전체방형구,"+document.getElementById('totalQuadrats').value+"\n식물명,개체수,출현방형구,피도\n";
    document.querySelectorAll('.list-item').forEach(i=>{
        const n=i.querySelector('.p-name').value;
        if(n) csv+=`${n},${i.querySelector('.p-count').value},${i.querySelector('.p-freq').value},${i.querySelector('.p-cover').value}\n`;
    });
    csv+="\n[결과]\n순위,우점종,종,IV\n";
    const rows=document.getElementById('resultBody').querySelectorAll('tr');
    if(rows.length===0)return alert("결과 없음");
    rows.forEach(r=>{
        const c=r.querySelectorAll('td');
        csv+=`${c[0].innerText},${c[0].innerText==='1'?'WIN':''},${c[1].innerText},${c[2].innerText}\n`;
    });
    window.downloadCSV("통합보고서.csv", csv);
};

// =====================================
// 6. 퀴즈
// =====================================
let currentQuizType="", studentInfo={id:"", name:""};
let quizQuestions=[], selectedAnswers=[], quizTimer=null, timeLeft=300;

const fullQuestionPool = [
    { id:1, q:"일정한 지역에 모여 사는 '같은 종'의 개체 집단은?", a:0, h:"종이 같아야 합니다.", opts:["개체군", "군집", "생태계", "생물권"] },
    { id:2, q:"여러 종의 개체군들이 모여 이룬 집단은?", a:2, h:"개체군들의 모임입니다.", opts:["개체", "개체군", "군집", "환경"] },
    { id:3, q:"식물 군집 조사 시 사용하는 1mx1m 틀은?", a:0, h:"사각형 모양의 틀입니다.", opts:["방형구", "원형구", "프레파라트", "샬레"] },
    { id:4, q:"방형구법으로 알 수 없는 지표는?", a:3, h:"지능은 측정할 수 없습니다.", opts:["밀도", "빈도", "피도", "지능"] },
    { id:5, q:"특정 종의 개체 수를 전체 면적으로 나눈 값은?", a:0, h:"빽빽한 정도.", opts:["밀도", "빈도", "피도", "중요치"] },
    { id:6, q:"특정 종이 출현한 방형구 수를 전체 방형구 수로 나눈 것은?", a:1, h:"얼마나 자주 출현하는가?", opts:["밀도", "빈도", "피도", "상대밀도"] },
    { id:7, q:"지표면을 덮고 있는 면적의 비율은?", a:2, h:"덮을 피(被) 자를 씁니다.", opts:["밀도", "빈도", "피도", "중요치"] },
    { id:8, q:"군집을 대표하는 가장 우세한 종은?", a:1, h:"우수하고 점령한 종.", opts:["희소종", "우점종", "지표종", "외래종"] },
    { id:9, q:"중요치(IV) 공식으로 옳은 것은?", a:1, h:"상대값 3개의 합.", opts:["밀도+빈도+피도", "상대밀도+상대빈도+상대피도", "밀도x빈도", "상대밀도/상대피도"] },
    { id:10, q:"모든 종의 상대밀도 합은?", a:2, h:"전체는 100%입니다.", opts:["10%", "50%", "100%", "300%"] },
    { id:11, q:"군집 내 모든 종의 중요치 합은?", a:2, h:"100이 3개 모이면?", opts:["100", "200", "300", "알 수 없다"] },
    { id:12, q:"방형구 설치 원칙은?", a:1, h:"주관이 들어가면 안 됩니다.", opts:["식물이 많은 곳", "무작위(랜덤)", "평평한 곳", "꽃이 있는 곳"] },
    { id:13, q:"경계선 식물 세는 규칙은?", a:2, h:"두 면 포함, 두 면 제외.", opts:["모두 셈", "안 셈", "ㄴ자 규칙", "큰 것만 셈"] },
    { id:14, q:"특정 환경을 알려주는 종은?", a:2, h:"환경의 지표.", opts:["우점종", "핵심종", "지표종", "희소종"] },
    { id:15, q:"서로 이익을 얻는 상호작용은?", a:2, h:"상부상조.", opts:["경쟁", "기생", "상리공생", "편리공생"] },
    { id:16, q:"경쟁에서 진 종이 사라지는 현상은?", a:0, h:"배타적으로 밀려남.", opts:["경쟁 배타", "분서", "공생", "천이"] },
    { id:17, q:"경쟁을 피해 나누어 사는 것은?", a:1, h:"나눌 분.", opts:["경쟁 배타", "분서", "포식", "기생"] },
    { id:18, q:"한쪽만 이익, 다른 쪽은 영향 없음은?", a:3, h:"한쪽만 편리.", opts:["상리공생", "기생", "포식", "편리공생"] },
    { id:19, q:"개체 수는 적지만 생태계에 중요한 종은?", a:1, h:"핵심 돌.", opts:["우점종", "핵심종", "지표종", "희소종"] },
    { id:20, q:"맨땅에서 시작하는 천이는?", a:0, h:"처음 시작.", opts:["1차 천이", "2차 천이", "습성 천이", "음수림"] },
    { id:21, q:"산불 후 시작되는 천이는?", a:1, h:"두 번째 기회.", opts:["1차 천이", "2차 천이", "건성 천이", "습성 천이"] },
    { id:22, q:"천이의 마지막 안정 상태는?", a:1, h:"최고조(Climax).", opts:["개척자", "극상", "초원", "관목림"] },
    { id:23, q:"건성 천이 개척자는?", a:1, h:"바위의 옷.", opts:["이끼", "지의류", "초본", "관목"] },
    { id:24, q:"숲의 가장 위쪽 층은?", a:3, h:"키 큰 나무.", opts:["지표층", "초본층", "관목층", "교목층"] },
    { id:25, q:"피도 계급 정하는 방법은?", a:1, h:"비율로 등급화.", opts:["정밀 측정", "눈대중 등급", "키 기준", "개체수 기준"] },
    { id:26, q:"타감 작용의 예시는?", a:1, h:"화학물질 분비.", opts:["꽃과 벌", "소나무 독성", "사자와 사슴", "콩과 뿌리혹박테리아"] },
    { id:27, q:"방형구법 최종 목적은?", a:1, h:"주인(우점종) 찾기.", opts:["광합성 측정", "우점종 파악", "미생물 조사", "신품종 개발"] },
    { id:28, q:"A(10), B(30), C(10)일 때 A 상대밀도는?", a:1, h:"10 / 50", opts:["10%", "20%", "33%", "50%"] },
    { id:29, q:"빈도 0.5의 의미는?", a:1, h:"절반 확률.", opts:["50개 발견", "2개 중 1개 꼴", "면적 50%", "중요치 50"] },
    { id:30, q:"지표종 예시는?", a:0, h:"오염 지표.", opts:["SO2 오염지 지의류", "참나무", "토끼풀", "강아지풀"] }
];

window.openLoginModal = (type) => {
    if (GOOGLE_SCRIPT_URL.includes("여기에")) { alert("선생님! script.js에 URL을 넣어주세요."); return; }
    currentQuizType = type;
    document.getElementById('student-id').value = "";
    document.getElementById('student-name').value = "";
    document.getElementById('login-modal').classList.remove('hidden');
};

window.startRealQuiz = () => {
    const id = document.getElementById('student-id').value;
    const name = document.getElementById('student-name').value;
    if(!id || !name) return alert("학번과 이름을 입력해주세요.");
    if(parseInt(id) < 0) return alert("학번은 양수여야 합니다.");
    
    studentInfo = { id, name };
    window.closeModal('login-modal');
    
    document.getElementById('quiz-modal').classList.remove('hidden');
    document.getElementById('quiz-type-title').innerText = currentQuizType;
    document.getElementById('quiz-page-1').classList.remove('hidden');
    document.getElementById('quiz-page-2').classList.add('hidden');
    document.getElementById('prev-page-btn').classList.add('hidden');
    document.getElementById('next-page-btn').classList.remove('hidden');
    document.getElementById('submit-quiz-btn').classList.add('hidden');
    
    // 랜덤 10문제
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
};

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

window.toggleHint = (btn) => {
    const txt = btn.nextElementSibling;
    txt.style.display = (txt.style.display==='block') ? 'none' : 'block';
};
window.selectOpt = (label, qIdx, optIdx) => {
    label.parentElement.querySelectorAll('.quiz-opt').forEach(el=>el.classList.remove('selected'));
    label.classList.add('selected');
    selectedAnswers[qIdx] = optIdx;
};
window.changePage = (p) => {
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
};
function updateTimerDisplay() {
    const m = Math.floor(timeLeft/60);
    const s = timeLeft%60;
    document.getElementById('timer-display').innerText = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}
function quizTimeout() {
    clearInterval(quizTimer);
    alert("시간 초과! 다음 기회에...");
    window.closeModal('quiz-modal');
    sendToGoogleSheet(0, "통과 못함 (시간초과)", "미제출");
}
window.submitQuiz = () => {
    if(selectedAnswers.includes(-1)) return alert("모든 문제를 풀어주세요.");
    clearInterval(quizTimer);
    let score=0, ansStr="";
    quizQuestions.forEach((q,i)=>{
        const correct = (q.a === selectedAnswers[i]);
        if(correct) score+=10;
        // 구글 시트에 문제 내용과 정오답 상세 기록
        ansStr += `[Q${i+1}. ${q.q.substring(0,10)}...](${correct?'O':'X'}) / `;
    });
    let level="노력 요함 (하)";
    if(score>=80) level="매우 우수 (상)";
    else if(score>=50) level="보통 (중)";
    
    alert(`[평가 완료]\n점수: ${score}점\n수준: ${level}`);
    window.closeModal('quiz-modal');
    sendToGoogleSheet(score, level, ansStr);
};
function sendToGoogleSheet(score, level, answers) {
    const data = { id:studentInfo.id, name:studentInfo.name, type:currentQuizType, score:score, level:level, answers:answers };
    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
}