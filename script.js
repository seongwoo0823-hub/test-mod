// =====================================
// 1. 기본 설정 및 유틸리티
// =====================================

// [안전장치] 파일 직접 실행 시 경고 (카메라 권한 문제 방지)
if (window.location.protocol === 'file:') {
    alert("⚠️ 주의: HTML 파일을 더블 클릭해서 열면 카메라가 작동하지 않을 수 있습니다.\n\nVS Code의 'Live Server'를 이용하거나 GitHub Pages에 올려서 실행해주세요.");
}

// Gemini 질문 복사
function copyAndOpenGemini() {
    const inputVal = document.getElementById('gemini-input').value;
    if(!inputVal) { alert("질문 내용을 먼저 입력해주세요."); return; }
    
    navigator.clipboard.writeText(inputVal).then(() => {
        if(confirm("질문이 복사되었습니다!\nGemini로 이동하여 붙여넣기(Ctrl+V) 하시겠습니까?")) {
            window.open("https://gemini.google.com/app", '_blank');
        }
    });
}

// =====================================
// 2. AI 카메라 (WebUSB 스타일 연결 방식 적용)
// =====================================
const URL = "./my_model/";
let model, maxPredictions;
let isRunning = false;
let animationId;

// [단계 1] 카메라 권한을 먼저 얻고 장치 목록을 가져옴
async function getCameraPermission() {
    const select = document.getElementById('camera-select');
    select.innerHTML = '<option>권한 요청 중...</option>';

    try {
        // 1. 먼저 아무 카메라나 요청해서 권한 허용 팝업을 띄움
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        
        // 2. 권한을 얻었으면 일단 스트림을 끄고 (목록만 갱신 목적)
        stream.getTracks().forEach(track => track.stop());

        // 3. 이제 진짜 장치 목록을 가져옴
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');

        select.innerHTML = ''; // 초기화
        
        if (videoDevices.length === 0) {
            select.innerHTML = '<option disabled>연결된 카메라 없음</option>';
            return;
        }

        // 4. 목록에 추가
        videoDevices.forEach((device, i) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            // 라벨이 없으면 '카메라 1', '카메라 2' 등으로 표시
            option.text = device.label || `카메라 ${i + 1} (USB/내장)`;
            select.appendChild(option);
        });

        // USB 카메라는 보통 목록의 뒤쪽에 추가됨 -> 마지막 것 선택
        if (videoDevices.length > 1) {
            select.selectedIndex = videoDevices.length - 1;
        }
        
        alert(`✅ 카메라 ${videoDevices.length}개가 감지되었습니다.\n목록에서 사용할 USB 카메라를 선택하고 'Start'를 누르세요.`);

    } catch (err) {
        console.error(err);
        alert("❌ 카메라 권한이 차단되었습니다.\n\n1. 브라우저 주소창 왼쪽 '자물쇠' 아이콘 클릭\n2. 권한 재설정(허용)\n3. 새로고침 하세요.");
        select.innerHTML = '<option>권한 필요</option>';
    }
}

// 페이지 로드 시 자동으로 권한 요청 시도 (실패 시 수동 버튼 필요)
window.addEventListener('load', getCameraPermission);


// [단계 2] 선택한 카메라로 AI 시작
async function startCamera() {
    if(isRunning) { 
        alert("카메라가 이미 켜져 있습니다."); return; 
    }

    const startBtn = document.getElementById("startBtn");
    const video = document.getElementById("video-element");
    const canvas = document.getElementById("canvas-element");
    const select = document.getElementById("camera-select");
    const deviceId = select.value;

    if (!deviceId) {
        // 장치 목록이 비어있으면 다시 권한 요청 시도
        await getCameraPermission();
        return;
    }

    startBtn.innerText = "모델 및 카메라 로딩...";
    startBtn.disabled = true;

    try {
        // 1. 티처블 머신 모델 로드
        const modelURL = URL + "model.json";
        const metadataURL = URL + "metadata.json";
        model = await tmImage.load(modelURL, metadataURL);
        maxPredictions = model.getTotalClasses();

        // 2. 선택한 USB 카메라 ID로 스트림 요청
        const constraints = {
            video: {
                deviceId: { exact: deviceId }, // 사용자가 선택한 바로 그 카메라!
                width: { ideal: 640 }, // 해상도 높임 (인식률 향상)
                height: { ideal: 480 }
            }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        video.style.display = "none"; // 비디오 태그는 숨김
        video.setAttribute("playsinline", true); // 모바일 전체화면 방지

        // 비디오 데이터 로드 완료 시
        video.onloadedmetadata = () => {
            video.play();
            isRunning = true;
            document.getElementById('loader-text').style.display = "none";
            startBtn.innerHTML = '<i class="fa-solid fa-video"></i> 작동 중 (재시작하려면 새로고침)';
            
            // 캔버스 크기 동기화
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            predictLoop(); // 예측 루프 시작
        };

    } catch (err) {
        alert("카메라 실행 오류: " + err.message + "\n\n다른 카메라를 선택하거나 USB를 다시 꽂아보세요.");
        startBtn.innerText = "다시 시도";
        startBtn.disabled = false;
        isRunning = false;
    }
}

// [단계 3] AI 예측 루프
async function predictLoop() {
    if(!isRunning) return;

    const video = document.getElementById("video-element");
    const canvas = document.getElementById("canvas-element");
    const ctx = canvas.getContext("2d");

    // 1. 사용자에게 보여줄 화면 그리기
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // 2. AI에게 이미지 전달하여 분석
    // (video 엘리먼트를 직접 넘겨주면 티처블 머신이 알아서 처리)
    const prediction = await model.predict(video);
    
    // 3. 결과 UI 업데이트
    updateResultBars(prediction);

    animationId = window.requestAnimationFrame(predictLoop);
}

function updateResultBars(prediction) {
    const labelContainer = document.getElementById("label-container");
    labelContainer.innerHTML = "";
    
    // 확률 높은 순 정렬
    prediction.sort((a, b) => b.probability - a.probability);

    // 상위 3개만 표시
    for (let i = 0; i < 3; i++) {
        if (i >= maxPredictions) break;
        
        const prob = (prediction[i].probability * 100).toFixed(1);
        // 5% 미만은 잡음으로 간주하여 표시 안 함
        if(prob > 5) {
            const div = document.createElement("div");
            div.className = "label-item";
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <strong>${prediction[i].className}</strong>
                    <span style="color:#2e7d32; font-weight:bold;">${prob}%</span>
                </div>
                <div class="progress-bg">
                    <div class="progress-fill" style="width:${prob}%"></div>
                </div>
            `;
            labelContainer.appendChild(div);
        }
    }
}


// =====================================
// 3. 아두이노 (Web Serial API)
// =====================================
let port, keepReading = false, reader;
let sensorDataLog = [];
let recordInterval = null;
let currentVal = {t:"-", h:"-", l:"-"};

async function connectArduino() {
    // 브라우저 호환성 체크
    if (!("serial" in navigator)) {
        alert("이 기능은 PC 크롬(Chrome) 또는 엣지(Edge) 브라우저에서만 작동합니다."); return;
    }

    try {
        port = await navigator.serial.requestPort(); // 포트 선택 팝업
        await port.open({ baudRate: 9600 });
        
        document.getElementById('connectBtn').innerText = "✅ 연결됨";
        document.getElementById('connectBtn').disabled = true;
        document.getElementById('recordBtn').disabled = false;
        
        keepReading = true;
        readSerial();
    } catch(e) { 
        console.log("연결 취소됨", e); 
    }
}

async function readSerial() {
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();
    let buffer = "";

    try {
        while (keepReading) {
            const {value, done} = await reader.read();
            if(done) break;
            if(value) {
                buffer += value;
                const lines = buffer.split("\n");
                buffer = lines.pop(); // 완전하지 않은 마지막 줄은 남김

                for(const line of lines) {
                    // 데이터 포맷: 온도,습도,조도
                    const parts = line.trim().split(",");
                    if(parts.length >= 3) {
                        currentVal = {t: parts[0], h: parts[1], l: parts[2]};
                        document.getElementById('val-temp').innerText = currentVal.t;
                        document.getElementById('val-humid').innerText = currentVal.h;
                        document.getElementById('val-light').innerText = currentVal.l;
                    }
                }
            }
        }
    } catch(e) { console.error(e); }
}

function startRecording() {
    sensorDataLog = [];
    document.getElementById('recordBtn').disabled = true;
    document.getElementById('saveRecordBtn').disabled = false;
    document.getElementById('record-status').innerText = "🔴 기록 중 (1초 간격)...";
    
    recordInterval = setInterval(() => {
        const time = new Date().toLocaleTimeString();
        sensorDataLog.push([time, currentVal.t, currentVal.h, currentVal.l]);
    }, 1000);
}

function stopAndSaveRecording() {
    clearInterval(recordInterval);
    document.getElementById('recordBtn').disabled = false;
    document.getElementById('saveRecordBtn').disabled = true;
    document.getElementById('record-status').innerText = "저장 완료!";
    
    let csv = "\uFEFF시간,온도,습도,조도\n";
    sensorDataLog.forEach(row => csv += row.join(",") + "\n");
    downloadFile(csv, "환경데이터_로그.csv");
}


// =====================================
// 4. 방형구법 계산기
// =====================================
window.onload = function() { 
    getCameraPermission(); // 페이지 켜지면 카메라 권한 먼저 체크
    addRow(); addRow(); 
};

function addRow() {
    const container = document.getElementById('inputList');
    const div = document.createElement('div');
    div.className = 'list-item';
    div.innerHTML = `
        <div class="list-inputs">
            <input type="text" class="p-name" placeholder="식물명">
            <input type="number" class="p-count" placeholder="개체수">
            <input type="number" class="p-freq" placeholder="출현방형구">
            <input type="number" class="p-cover" placeholder="피도(1~5)" max="5">
        </div>
        <button onclick="this.parentElement.remove()" class="btn-del"><i class="fa-solid fa-trash"></i></button>
    `;
    container.appendChild(div);
}

function calculate() {
    const totalQ = parseFloat(document.getElementById('totalQuadrats').value);
    const items = document.querySelectorAll('.list-item');
    let data = [], sumD=0, sumF=0, sumC=0;

    items.forEach(item => {
        const name = item.querySelector('.p-name').value;
        const count = parseFloat(item.querySelector('.p-count').value)||0;
        const freq = parseFloat(item.querySelector('.p-freq').value)||0;
        const cover = parseFloat(item.querySelector('.p-cover').value)||0;
        if(cover > 5) cover = 5;

        if(name) {
            const freqVal = freq/totalQ;
            data.push({name, count, freqVal, cover});
            sumD+=count; sumF+=freqVal; sumC+=cover;
        }
    });

    if(data.length===0) { alert("데이터를 입력해주세요."); return; }
    
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

function closeModal() { 
    document.getElementById('result-modal').classList.add('hidden'); 
}

function downloadResultCSV() {
    const rows = document.querySelectorAll('#resultTable tr');
    let csv = "\uFEFF순위,종이름,중요치(IV)\n";
    
    const bodyRows = document.getElementById('resultBody').querySelectorAll('tr');
    if(bodyRows.length === 0) { alert("결과가 없습니다."); return; }

    bodyRows.forEach(r => {
        const cols = r.querySelectorAll('td');
        csv += `${cols[0].innerText},${cols[1].innerText},${cols[2].innerText}\n`;
    });
    
    downloadFile(csv, "우점종분석.csv");
}

function downloadFile(content, fileName) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
}
  