// =====================================
// 1. 설정 및 초기화
// =====================================
const URL = "./my_model/";
let model, maxPredictions;
let isRunning = false;
let animationId;

// [경고] HTML 파일을 직접 열었을 때 발생하는 보안 문제 안내
if (window.location.protocol === 'file:') {
    alert("⚠️ [중요] 현재 파일을 더블클릭해서 열었습니다.\n\n이 상태에서는 '티처블 머신 AI'가 보안 문제로 작동하지 않습니다.\n\nVS Code의 'Live Server' 확장프로그램을 설치해서 실행하거나, 웹 서버(GitHub Pages 등)에 올려야만 식물 인식이 가능합니다!");
}

// Gemini 질문 복사 기능
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
// 2. 카메라 및 AI 로직 (핵심 수정)
// =====================================

// 페이지 로드 시 카메라 장치 찾기
window.addEventListener('load', async () => {
    const select = document.getElementById('camera-select');
    try {
        // 권한 요청을 위해 잠깐 켰다 끔
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop()); 

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        
        select.innerHTML = '';
        if (videoDevices.length === 0) {
            select.innerHTML = '<option disabled>카메라 없음</option>';
            return;
        }

        videoDevices.forEach((device, i) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `카메라 ${i+1}`;
            select.appendChild(option);
        });

        // USB 카메라(보통 리스트 마지막) 자동 선택
        if(videoDevices.length > 1) select.selectedIndex = videoDevices.length - 1;

    } catch (e) {
        console.error(e);
        select.innerHTML = '<option>권한 필요 (클릭해서 허용)</option>';
    }
});

// [Start 버튼] 클릭 시 실행되는 함수
async function startCamera() {
    if(isRunning) { alert("이미 작동 중입니다."); return; }

    const startBtn = document.getElementById("startBtn");
    const video = document.getElementById("video-element");
    const select = document.getElementById("camera-select");
    const deviceId = select.value;

    startBtn.innerText = "① AI 모델 로딩 중...";
    startBtn.disabled = true;

    try {
        // 1. 티처블 머신 모델 로드 (파일 경로 문제 시 여기서 에러 발생)
        const modelURL = URL + "model.json";
        const metadataURL = URL + "metadata.json";
        
        try {
            model = await tmImage.load(modelURL, metadataURL);
            maxPredictions = model.getTotalClasses();
        } catch (modelError) {
            throw new Error("AI 모델을 찾을 수 없습니다.\n폴더 안에 'my_model' 폴더가 있는지, 그 안에 파일 3개가 다 있는지 확인하세요.\n(또는 file:// 경로 문제일 수 있습니다)");
        }

        startBtn.innerText = "② 카메라 연결 중...";

        // 2. 카메라 스트림 가져오기
        const constraints = {
            video: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                width: { ideal: 640 }, // 화질 개선
                height: { ideal: 480 }
            }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        video.style.display = "none"; // 비디오 태그 숨김 (캔버스에 그릴 예정)
        video.setAttribute("playsinline", true); // 모바일 전체화면 방지

        // 3. 비디오가 준비되면 루프 시작
        video.onloadedmetadata = () => {
            video.play();
            isRunning = true;
            document.getElementById('loader-text').style.display = "none"; // 아이콘 숨김
            startBtn.innerHTML = '<i class="fa-solid fa-check"></i> 식물 인식 중...';
            startBtn.style.background = "#1b5e20"; // 버튼 색 변경
            
            predictLoop(); // 예측 루프 시작
        };

    } catch (err) {
        alert("오류 발생:\n" + err.message);
        startBtn.innerText = "다시 시작";
        startBtn.disabled = false;
        startBtn.style.background = "#d32f2f"; // 에러 시 빨간색
    }
}

// [무한 반복] 비디오를 캔버스에 그리고 -> AI가 분석
async function predictLoop() {
    if(!isRunning) return;

    const video = document.getElementById("video-element");
    const canvas = document.getElementById("canvas-element");
    const ctx = canvas.getContext("2d");

    // 화면 크기 맞춤
    if(canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
    }

    // 1. 비디오 화면을 캔버스에 그리기 (사용자에게 보여줌)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // 2. AI 예측 수행
    if (model) {
        const prediction = await model.predict(video);
        
        // 결과 UI 업데이트
        const labelContainer = document.getElementById("label-container");
        labelContainer.innerHTML = "";
        
        // 확률 순 정렬
        prediction.sort((a, b) => b.probability - a.probability);

        // 상위 3개 표시
        for (let i = 0; i < 3; i++) {
            if (i >= maxPredictions) break;
            
            const name = prediction[i].className;
            const prob = (prediction[i].probability * 100).toFixed(1);

            if (prob > 5) { // 5% 이상만 표시
                const div = document.createElement("div");
                div.className = "label-item";
                div.innerHTML = `
                    <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                        <strong>${name}</strong>
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

    // 다음 프레임 요청
    animationId = window.requestAnimationFrame(predictLoop);
}


// =====================================
// 3. 아두이노 (Web Serial API)
// =====================================
let port, keepReading = false, reader;
let sensorDataLog = [];
let recordInterval = null;
let currentVal = {t:"-", h:"-", l:"-"};

async function connectArduino() {
    if (!("serial" in navigator)) {
        alert("이 기능은 PC 크롬 브라우저에서만 작동합니다."); return;
    }
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
    document.getElementById('record-status').innerText = "🔴 기록 중...";
    
    recordInterval = setInterval(() => {
        sensorDataLog.push([new Date().toLocaleTimeString(), currentVal.t, currentVal.h, currentVal.l]);
    }, 1000);
}

function stopAndSaveRecording() {
    clearInterval(recordInterval);
    document.getElementById('recordBtn').disabled = false;
    document.getElementById('saveRecordBtn').disabled = true;
    document.getElementById('record-status').innerText = "저장 완료!";
    let csv = "\uFEFF시간,온도,습도,조도\n";
    sensorDataLog.forEach(row => csv += row.join(",") + "\n");
    downloadFile(csv, "환경데이터.csv");
}

// =====================================
// 4. 방형구법 계산기
// =====================================
window.onload = function() { addRow(); addRow(); };

function addRow() {
    const div = document.createElement('div');
    div.className = 'list-item';
    div.innerHTML = `
        <div class="list-inputs">
            <input type="text" class="p-name" placeholder="식물명">
            <input type="number" class="p-count" placeholder="개체수">
            <input type="number" class="p-freq" placeholder="출현방형구">
            <input type="number" class="p-cover" placeholder="피도" max="5">
        </div>
        <button onclick="this.parentElement.remove()" class="btn-del"><i class="fa-solid fa-trash"></i></button>
    `;
    document.getElementById('inputList').appendChild(div);
}

function calculate() {
    const items = document.querySelectorAll('.list-item');
    const totalQ = document.getElementById('totalQuadrats').value;
    let data = [], sumD=0, sumF=0, sumC=0;

    items.forEach(item => {
        const name = item.querySelector('.p-name').value;
        const count = parseFloat(item.querySelector('.p-count').value)||0;
        const freq = parseFloat(item.querySelector('.p-freq').value)||0;
        const cover = parseFloat(item.querySelector('.p-cover').value)||0;
        if(name) {
            data.push({name, count, freq: freq/totalQ, cover});
            sumD+=count; sumF+=(freq/totalQ); sumC+=cover;
        }
    });

    if(data.length===0) return alert("데이터 입력 필요");
    
    const tbody = document.getElementById('resultBody');
    tbody.innerHTML = "";
    let maxIV = 0, domName = "";

    data = data.map(d => {
        const iv = ((d.count/sumD)*100) + ((d.freq/sumF)*100) + ((d.cover/sumC)*100);
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