// =====================================
// 1. 기본 설정 및 유틸리티
// =====================================

// 파일 직접 실행 감지 경고
if (window.location.protocol === 'file:') {
    alert("⚠️ 주의: GitHub Pages(https://...)로 접속하지 않으면 카메라와 AI 기능이 작동하지 않습니다.");
}

// Gemini 질문 복사
function copyAndOpenGemini() {
    const inputVal = document.getElementById('gemini-input').value;
    if(!inputVal) { alert("내용을 입력하세요."); return; }
    navigator.clipboard.writeText(inputVal).then(() => {
        if(confirm("복사되었습니다! Gemini로 이동하시겠습니까?")) {
            window.open("https://gemini.google.com/app", '_blank');
        }
    });
}

// CSV 다운로드 공통 함수 (한글 깨짐 방지 BOM 포함)
function downloadCSV(fileName, csvContent) {
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
}

// 입력값 양수만 허용하는 함수 (HTML oninput에서 호출)
function validPos(el) {
    if (el.value < 0) el.value = 0;
}


// =====================================
// 2. AI 카메라 로직
// =====================================
const URL_PATH = "./my_model/"; 
let model, maxPredictions;
let isRunning = false;

// 카메라 권한 및 장치 검색 (페이지 로드 시)
window.addEventListener('load', async () => {
    const event = new Event('load'); // 방형구법 초기화를 위해 트리거
    
    const select = document.getElementById('camera-select');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        
        select.innerHTML = '';
        if (videoDevices.length === 0) { select.innerHTML = '<option disabled>카메라 없음</option>'; return; }
        
        videoDevices.forEach((device, i) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `카메라 ${i+1}`;
            select.appendChild(option);
        });
        // USB 카메라(보통 마지막) 선택
        if(videoDevices.length > 1) select.selectedIndex = videoDevices.length - 1;
        
    } catch (e) {
        console.error(e);
        select.innerHTML = '<option>권한 필요</option>';
    }
    
    // 방형구법 초기 행 추가
    addRow(); addRow();
});

async function startCamera() {
    if(isRunning) { alert("이미 켜져 있습니다."); return; }
    const startBtn = document.getElementById("startBtn");
    const video = document.getElementById("video-element");
    const deviceId = document.getElementById("camera-select").value;

    startBtn.innerText = "로딩 중...";
    startBtn.disabled = true;

    try {
        // AI 모델 로드
        model = await tmImage.load(URL_PATH + "model.json", URL_PATH + "metadata.json");
        maxPredictions = model.getTotalClasses();

        // 카메라 스트림 로드
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: 640, height: 480 }
        });
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            video.play();
            isRunning = true;
            document.getElementById('loader-text').style.display = "none";
            startBtn.innerHTML = '<i class="fa-solid fa-check"></i> 작동 중';
            startBtn.style.background = "#1b5e20";
            predictLoop();
        };
    } catch (err) {
        alert("오류: " + err.message);
        startBtn.innerText = "재시도";
        startBtn.disabled = false;
    }
}

async function predictLoop() {
    if(!isRunning) return;
    const video = document.getElementById("video-element");
    const canvas = document.getElementById("canvas-element");
    const ctx = canvas.getContext("2d");

    if(canvas.width !== video.videoWidth) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (model) {
        const prediction = await model.predict(video);
        const labelContainer = document.getElementById("label-container");
        labelContainer.innerHTML = "";
        
        prediction.sort((a, b) => b.probability - a.probability);

        for (let i = 0; i < 3; i++) {
            if (i >= maxPredictions) break;
            const prob = (prediction[i].probability * 100).toFixed(1);
            if (prob > 5) {
                labelContainer.innerHTML += `
                    <div class="label-item">
                        <div style="display:flex; justify-content:space-between;">
                            <strong>${prediction[i].className}</strong>
                            <span style="color:#2e7d32">${prob}%</span>
                        </div>
                        <div class="progress-bg"><div class="progress-fill" style="width:${prob}%"></div></div>
                    </div>`;
            }
        }
    }
    requestAnimationFrame(predictLoop);
}


// =====================================
// 3. 아두이노 데이터 연동 (토양습도 포함)
// =====================================
let port, keepReading = false, reader;
let sensorDataLog = [];
let recordInterval = null;
let currentVal = {t:"-", h:"-", l:"-", s:"-"};

async function connectArduino() {
    if (!("serial" in navigator)) { alert("PC 크롬/엣지 브라우저에서만 가능합니다."); return; }
    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });
        document.getElementById('connectBtn').innerText = "✅ 연결됨";
        document.getElementById('connectBtn').disabled = true;
        document.getElementById('recordBtn').disabled = false;
        keepReading = true;
        readSerial();
    } catch(e) { console.log(e); }
}

async function readSerial() {
    const textDecoder = new TextDecoderStream();
    port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();
    let buffer = "";

    try {
        while (keepReading) {
            const {value, done} = await reader.read();
            if(done) break;
            if(value) {
                buffer += value;
                const lines = buffer.split("\n");
                buffer = lines.pop();
                for(const line of lines) {
                    // 데이터 포맷: 온도,습도,조도,토양습도
                    const parts = line.trim().split(",");
                    if(parts.length >= 4) {
                        currentVal = {t: parts[0], h: parts[1], l: parts[2], s: parts[3]};
                        document.getElementById('val-temp').innerText = currentVal.t;
                        document.getElementById('val-humid').innerText = currentVal.h;
                        document.getElementById('val-light').innerText = currentVal.l;
                        document.getElementById('val-soil').innerText = currentVal.s;
                    }
                }
            }
        }
    } catch(e) { console.error(e); }
}

function startRecording() {
    // 엑셀 헤더 설정
    sensorDataLog = [["시간", "온도(C)", "습도(%)", "조도(lx)", "토양습도(%)"]];
    document.getElementById('recordBtn').disabled = true;
    document.getElementById('saveRecordBtn').disabled = false;
    document.getElementById('record-status').innerText = "🔴 기록 중 (1초 간격)...";
    
    recordInterval = setInterval(() => {
        sensorDataLog.push([new Date().toLocaleTimeString(), currentVal.t, currentVal.h, currentVal.l, currentVal.s]);
    }, 1000);
}

function stopAndSaveRecording() {
    clearInterval(recordInterval);
    document.getElementById('recordBtn').disabled = false;
    document.getElementById('saveRecordBtn').disabled = true;
    document.getElementById('record-status').innerText = "저장 완료";
    
    let csv = "";
    sensorDataLog.forEach(row => csv += row.join(",") + "\n");
    downloadCSV("환경데이터_로그.csv", csv);
}


// =====================================
// 4. 방형구법 계산 (통합 저장 및 양수 처리)
// =====================================

function addRow() {
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
    document.getElementById('inputList').appendChild(div);
}

function calculate() {
    // 양수로 변환하여 계산 (Math.abs 사용)
    const totalQ = Math.abs(parseFloat(document.getElementById('totalQuadrats').value)) || 10;
    const items = document.querySelectorAll('.list-item');
    let data = [], sumD=0, sumF=0, sumC=0;

    items.forEach(item => {
        const name = item.querySelector('.p-name').value;
        const count = Math.abs(parseFloat(item.querySelector('.p-count').value)||0);
        const freq = Math.abs(parseFloat(item.querySelector('.p-freq').value)||0);
        let cover = Math.abs(parseFloat(item.querySelector('.p-cover').value)||0);
        if(cover > 5) cover = 5;

        if(name) {
            data.push({name, count, freqVal: freq/totalQ, cover, rawFreq: freq}); 
            sumD+=count; sumF+=(freq/totalQ); sumC+=cover;
        }
    });

    if(data.length===0) return alert("데이터를 입력해주세요.");
    
    const tbody = document.getElementById('resultBody');
    tbody.innerHTML = "";
    let maxIV = 0, domName = "";

    data = data.map(d => {
        const iv = ((d.count/sumD)*100) + ((d.freqVal/sumF)*100) + ((d.cover/sumC)*100);
        if(iv > maxIV) { maxIV = iv; domName = d.name; }
        return {...d, iv};
    }).sort((a,b)=>b.iv-a.iv);

    data.forEach((d, i) => {
        tbody.innerHTML += `<tr><td>${i+1}</td><td>${d.name}</td><td>${d.iv.toFixed(1)}</td></tr>`;
    });

    document.getElementById('dominant-species').innerText = domName;
    document.getElementById('dominant-iv').innerText = "IV: " + maxIV.toFixed(1);
    document.getElementById('result-modal').classList.remove('hidden');
}

function closeModal() { document.getElementById('result-modal').classList.add('hidden'); }

// [통합 엑셀 저장 함수]
function downloadResultCSV() {
    let csv = "";
    
    // 1. 입력값 섹션
    csv += "[입력 데이터]\n";
    csv += "전체 방형구 수," + document.getElementById('totalQuadrats').value + "\n";
    csv += "식물명,개체수,출현 방형구 수,피도 계급\n";
    
    const inputs = document.querySelectorAll('.list-item');
    inputs.forEach(item => {
        const name = item.querySelector('.p-name').value;
        const count = item.querySelector('.p-count').value;
        const freq = item.querySelector('.p-freq').value;
        const cover = item.querySelector('.p-cover').value;
        if(name) csv += `${name},${count},${freq},${cover}\n`;
    });

    csv += "\n"; // 구분선

    // 2. 결과값 섹션
    csv += "[분석 결과]\n";
    csv += "순위,우점종 여부,종 이름,중요치(IV)\n";

    const rows = document.getElementById('resultBody').querySelectorAll('tr');
    if(rows.length === 0) { alert("먼저 분석을 진행해주세요."); return; }

    rows.forEach(r => {
        const cols = r.querySelectorAll('td');
        const rank = cols[0].innerText;
        const name = cols[1].innerText;
        const iv = cols[2].innerText;
        const isDominant = (rank === "1") ? "우점종(WIN)" : "";
        
        csv += `${rank},${isDominant},${name},${iv}\n`;
    });

    downloadCSV("식물군집조사_통합보고서.csv", csv);
}