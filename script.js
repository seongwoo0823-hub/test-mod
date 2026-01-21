// =====================================
// [필수] 구글 앱스 스크립트 웹 앱 URL을 여기에 붙여넣으세요!
// =====================================
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzDoJXUdQ5QHGvhEHckBnEtslsQdpBlc2NQygMAmco8f8zyG6eiaUc_yaIysT8ZlXBsiA/exec"; 

import { GoogleGenAI } from "@google/genai";

if (window.location.protocol === 'file:') alert("⚠️ 로컬 파일에서는 카메라 권한이 제한될 수 있습니다.");

// 전역 변수 (데이터 저장 상태)
let isEnvSaved = false;
let isQuadratSaved = false;
let isQuizSaved = false;
let currentEnvData = {};
let currentQuadratData = {};
let currentQuizData = {};
let studentInfo = { id: "", name: "" };

// =====================================
// 1. 유틸리티 & 설정
// =====================================
window.openKeyModal = () => document.getElementById('key-modal').classList.remove('hidden');
window.closeModal = (id) => document.getElementById(id).classList.add('hidden');
window.closeAiBox = () => document.getElementById('ai-response').classList.add('hidden');
window.validPos = (el) => { if(el.value < 0) el.value = 0; }; 

window.saveApiKey = () => {
    const key = document.getElementById('api-key-input').value;
    if(!key) return alert("키를 입력하세요.");
    localStorage.setItem("GEMINI_KEY", key);
    alert("저장되었습니다! 이제 AI 기능을 사용할 수 있습니다.");
    window.closeModal('key-modal');
};

// [수정 1] 일반 AI 채팅 (오류 수정됨)
window.askGemini = async () => {
    const question = document.getElementById('ai-input').value;
    const apiKey = localStorage.getItem("GEMINI_KEY");
    if(!question) return alert("질문을 입력하세요.");
    if(!apiKey) return alert("상단 ⚙️ 버튼을 눌러 API 키를 먼저 입력해주세요.");

    const box = document.getElementById('ai-response');
    const textDiv = document.getElementById('ai-text');
    box.classList.remove('hidden');
    textDiv.innerText = "🤖 AI(Gemini 3)가 생각 중...";

    try {
        const ai = new GoogleGenAI({ apiKey: apiKey });
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: question + " (고등학생에게 설명하듯 쉽고 친절하게)",
        });

        // [핵심 수정] response.text() -> response.text (괄호 제거)
        // 만약 response.text가 없으면 candidates 배열에서 직접 가져옴
        const answer = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text || "답변을 가져올 수 없습니다.";
        textDiv.innerText = answer;

    } catch (error) {
        console.error(error);
        textDiv.innerText = "오류: " + error.message;
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

// [핵심] 구글 시트로 데이터 전송 함수
async function sendDataToSheet(payload) {
    if (GOOGLE_SCRIPT_URL.includes("여기에")) {
        alert("script.js 맨 윗줄에 구글 앱스 스크립트 URL을 넣어주세요!");
        return false;
    }

    if (!studentInfo.id || !studentInfo.name) {
        const id = prompt("학번을 입력해주세요 (예: 20513)");
        const name = prompt("이름을 입력해주세요");
        if (!id || !name) {
            alert("정보가 없어 저장할 수 없습니다.");
            return false;
        }
        studentInfo = { id, name };
    }

    const finalData = { ...payload, id: studentInfo.id, name: studentInfo.name };

    try {
        await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(finalData)
        });
        
        if(payload.type !== 'quiz') {
            alert(`✅ ${studentInfo.name}님의 데이터가 저장되었습니다!`);
        }
        return true;
    } catch (error) {
        console.error(error);
        alert("저장 실패: 인터넷 연결을 확인하세요.");
        return false;
    }
}

// =====================================
// 2. AI 종합 분석 (오류 수정됨)
// =====================================
window.runComprehensiveAnalysis = async () => {
    const apiKey = localStorage.getItem("GEMINI_KEY");
    if (!apiKey) return alert("⚙️ 설정 버튼을 눌러 API 키를 먼저 입력해주세요.");

    if (!isEnvSaved && !isQuadratSaved && !isQuizSaved) {
        return alert("⚠️ 저장된 데이터가 없습니다. 먼저 활동을 진행하고 저장해주세요.");
    }

    const modal = document.getElementById('ai-report-modal');
    const content = document.getElementById('ai-report-content');
    modal.classList.remove('hidden');
    content.innerText = "🕵️‍♂️ 학생의 성취도와 현장 데이터를 분석하고 있습니다...\n(약 10초 소요)";

    let prompt = `나는 생물 선생님이고, 학생의 탐구 활동 결과를 평가하려고 해. 아래 데이터를 바탕으로 학생에게 피드백을 주는 '종합 생태 보고서'를 작성해줘.\n\n`;

    prompt += `[학생 정보]\n- 이름: ${studentInfo.name || "미입력"}\n\n`;

    if (isQuizSaved) {
        prompt += `[1. 지식 성취도 평가 (${currentQuizData.quizType})]\n- 점수: ${currentQuizData.score}점\n- 수준: ${currentQuizData.level}\n- 답안: ${currentQuizData.answers}\n\n`;
    } else {
        prompt += `[1. 지식 성취도 평가]\n(미응시)\n\n`;
    }

    if (isEnvSaved) {
        prompt += `[2. 현장 환경 데이터]\n- 온도: ${currentEnvData.temp}°C\n- 습도: ${currentEnvData.humid}%\n- 조도: ${currentEnvData.light}lux\n- 토양습도: ${currentEnvData.soil}%\n\n`;
    } else {
        prompt += `[2. 현장 환경 데이터]\n(미측정)\n\n`;
    }

    if (isQuadratSaved) {
        prompt += `[3. 식물 군집 조사]\n- 우점종: ${currentQuadratData.dominant} (IV: ${currentQuadratData.iv})\n- 관찰 종: ${currentQuadratData.summary}\n\n`;
    } else {
        prompt += `[3. 식물 군집 조사]\n(미조사)\n\n`;
    }

    prompt += `
    [분석 요청]
    1. **지식 수준**: 퀴즈 점수를 바탕으로 칭찬과 보완점 제시.
    2. **탐구 분석**: 환경 데이터(온도, 조도 등)와 우점종(식물) 사이의 생태학적 관계 추론.
    3. **종합 피드백**: 이론(퀴즈)과 실제(탐구)를 얼마나 잘 연결했는지 평가.
    선생님이 학생에게 말하듯 친절한 존댓말로 작성해줘.
    `;

    try {
        const ai = new GoogleGenAI({ apiKey: apiKey });
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
        });
        
        // [핵심 수정] response.text() -> response.text 또는 직접 경로 접근
        const answer = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text || "분석 결과를 가져올 수 없습니다.";
        content.innerText = answer;

    } catch (error) {
        console.error(error);
        content.innerText = "AI 분석 실패: " + error.message;
    }
};

// =====================================
// 3. 카메라 (단순화)
// =====================================
let currentStream = null;
window.addEventListener('load', async () => {
    window.addRow(); window.addRow(); 
    const select = document.getElementById('camera-select');
    try {
        await navigator.mediaDevices.getUserMedia({video: true});
        const devices = await navigator.mediaDevices.enumerateDevices();
        const v = devices.filter(d => d.kind === 'videoinput');
        select.innerHTML = '';
        if(v.length===0) select.innerHTML='<option disabled>없음</option>';
        else v.forEach((d,i)=>{
            const opt=document.createElement('option'); opt.value=d.deviceId; opt.text=d.label||`카메라 ${i+1}`; select.appendChild(opt);
        });
    } catch(e) { console.log(e); }
});
window.changeCamera = () => { if(currentStream){ window.stopCamera(); setTimeout(window.startCamera, 300); } };
window.startCamera = async () => {
    const video = document.getElementById("video-element");
    const devId = document.getElementById("camera-select").value;
    document.getElementById("startBtn").style.display = "none";
    document.getElementById("stopBtn").style.display = "inline-block";
    document.getElementById("loader-text").style.display = "none";
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: devId ? { exact: devId } : undefined, width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "environment" }
        });
        currentStream = stream;
        video.srcObject = stream;
    } catch(e) { window.stopCamera(); }
};
window.stopCamera = () => {
    if (currentStream) currentStream.getTracks().forEach(t => t.stop());
    document.getElementById("video-element").srcObject = null;
    currentStream = null;
    document.getElementById("startBtn").style.display = "block";
    document.getElementById("stopBtn").style.display = "none";
    document.getElementById("loader-text").style.display = "block";
};

// =====================================
// 4. 아두이노 & 환경데이터 저장
// =====================================
let port, keepReading=false;
let sensorDataLog=[], recordInterval=null;
let currentVal={t:"-", h:"-", l:"-", s:"-"};

window.connectArduino = async () => {
    if(/iPhone|iPad|Android/i.test(navigator.userAgent)) return alert("PC 크롬만 지원합니다.");
    try {
        port = await navigator.serial.requestPort();
        await port.open({baudRate:9600});
        document.getElementById('connectBtn').innerText="✅";
        document.getElementById('connectBtn').disabled=true;
        document.getElementById('recordBtn').disabled=false;
        document.getElementById('record-status').innerText="수신 중...";
        keepReading=true; readSerial();
    } catch(e){console.log(e);}
};
async function readSerial() {
    const decoder = new TextDecoderStream();
    port.readable.pipeTo(decoder.writable);
    const reader = decoder.readable.getReader();
    let buffer = "";
    while(keepReading) {
        const {value, done} = await reader.read();
        if(done) break;
        if(value) {
            buffer += value;
            const lines = buffer.split("\n");
            buffer = lines.pop();
            for(const line of lines) {
                const p = line.trim().split(",");
                if(p.length >= 4) {
                    currentVal = {t:p[0], h:p[1], l:p[2], s:p[3]};
                    document.getElementById('val-temp').innerText = currentVal.t;
                    document.getElementById('val-humid').innerText = currentVal.h;
                    document.getElementById('val-light').innerText = currentVal.l;
                    document.getElementById('val-soil').innerText = currentVal.s;
                    updateLightDescription(parseInt(currentVal.l));
                }
            }
        }
    }
}
function updateLightDescription(lux) {
    const el = document.getElementById('desc-light');
    el.innerText = lux < 300 ? "음지" : (lux < 700 ? "반음지" : "양지");
    el.style.backgroundColor = lux < 300 ? "#5c6bc0" : (lux < 700 ? "#ffb74d" : "#ef6c00");
    el.style.color="white";
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
window.stopAndSaveRecording = async () => {
    clearInterval(recordInterval);
    document.getElementById('recordBtn').disabled=false;
    document.getElementById('saveRecordBtn').disabled=true;
    document.getElementById('record-status').innerText="완료";
    
    let csv=""; sensorDataLog.forEach(r=>csv+=r.join(",")+"\n");
    window.downloadCSV("환경데이터.csv", csv);

    currentEnvData = { type: 'env', temp: currentVal.t, humid: currentVal.h, light: currentVal.l, soil: currentVal.s };
    const success = await sendDataToSheet(currentEnvData);
    if(success) isEnvSaved = true;
};

// =====================================
// 5. 방형구법 & 데이터 저장
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
        let cv=Math.abs(parseFloat(i.querySelector('.p-cover').value)||0); if(cv>5)cv=5;
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
window.downloadResultCSV = async () => {
    let csv="[입력]\n전체방형구,"+document.getElementById('totalQuadrats').value+"\n식물명,개체수,출현방형구,피도\n";
    let summaryText = "";
    document.querySelectorAll('.list-item').forEach(i=>{
        const n=i.querySelector('.p-name').value;
        if(n) {
            csv+=`${n},${i.querySelector('.p-count').value},${i.querySelector('.p-freq').value},${i.querySelector('.p-cover').value}\n`;
            summaryText += `${n}(${i.querySelector('.p-count').value}), `;
        }
    });
    csv+="\n[결과]\n순위,우점종,종,IV\n";
    const rows=document.getElementById('resultBody').querySelectorAll('tr');
    if(rows.length===0)return alert("결과 없음");
    rows.forEach(r=>{
        const c=r.querySelectorAll('td');
        csv+=`${c[0].innerText},${c[0].innerText==='1'?'WIN':''},${c[1].innerText},${c[2].innerText}\n`;
    });
    window.downloadCSV("통합보고서.csv", csv);

    const domSpecies = document.getElementById('dominant-species').innerText;
    const domIV = document.getElementById('dominant-iv').innerText;
    currentQuadratData = { type: 'quadrat', dominant: domSpecies, iv: domIV, summary: summaryText };
    const success = await sendDataToSheet(currentQuadratData);
    if(success) isQuadratSaved = true;
};

// =====================================
// 6. 퀴즈
// =====================================
let currentQuizType="";
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

function renderQuestions(cid, s, e) {
    const c = document.getElementById(cid); c.innerHTML = "";
    for(let i=s; i<e; i++) {
        const q = quizQuestions[i];
        const d = document.createElement('div'); d.className = 'quiz-item';
        let h = `<div class="quiz-q">Q${i+1}. ${q.q} <button class="hint-btn" onclick="toggleHint(this)">💡 힌트</button><div class="hint-text">${q.h}</div></div>`;
        q.opts.forEach((o, ox) => h += `<label class="quiz-opt" onclick="selectOpt(this, ${i}, ${ox})"><input type="radio" name="q${i}" value="${ox}"> ${o}</label>`);
        d.innerHTML = h; c.appendChild(d);
    }
}
window.toggleHint = (b) => { const t=b.nextElementSibling; t.style.display=(t.style.display==='block'?'none':'block'); };
window.selectOpt = (l, q, o) => { l.parentElement.querySelectorAll('.quiz-opt').forEach(e=>e.classList.remove('selected')); l.classList.add('selected'); selectedAnswers[q]=o; };
window.changePage = (p) => {
    document.getElementById('quiz-page-1').classList.toggle('hidden', p!==1);
    document.getElementById('quiz-page-2').classList.toggle('hidden', p!==2);
    document.getElementById('prev-page-btn').classList.toggle('hidden', p===1);
    document.getElementById('next-page-btn').classList.toggle('hidden', p===2);
    document.getElementById('submit-quiz-btn').classList.toggle('hidden', p!==2);
};
function updateTimerDisplay() { document.getElementById('timer-display').innerText = `${Math.floor(timeLeft/60).toString().padStart(2,'0')}:${(timeLeft%60).toString().padStart(2,'0')}`; }
function quizTimeout() {
    clearInterval(quizTimer); alert("시간 종료!");
    window.closeModal('quiz-modal');
    processQuizResult(0, "통과 못함 (시간초과)", "미제출");
}
window.submitQuiz = () => {
    if(selectedAnswers.includes(-1)) return alert("모든 문제를 풀어주세요.");
    clearInterval(quizTimer);
    let score=0, ansStr="";
    quizQuestions.forEach((q,i)=>{
        const correct = (q.a === selectedAnswers[i]);
        if(correct) score+=10;
        ansStr += `[Q${i+1}](${correct?'O':'X'}) `;
    });
    let level = score>=80 ? "매우 우수" : (score>=50 ? "보통" : "노력 요함");
    alert(`[평가 완료]\n점수: ${score}점\n수준: ${level}`);
    window.closeModal('quiz-modal');
    processQuizResult(score, level, ansStr);
};

async function processQuizResult(score, level, answers) {
    currentQuizData = { type: 'quiz', quizType: currentQuizType, score: score, level: level, answers: answers };
    const success = await sendDataToSheet(currentQuizData);
    if(success) isQuizSaved = true;
}