// =====================================
// 1. 기본 설정 및 유틸리티
// =====================================

// [경고] 파일 직접 실행 감지
if (window.location.protocol === 'file:') {
    alert("⚠️ 주의: HTML 파일을 직접 열면(file://) 보안 문제로 AI와 카메라가 작동하지 않습니다.\n\nGitHub Pages 주소(https://...)로 접속해야만 정상 작동합니다.");
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

// [핵심] 강력한 엑셀(CSV) 저장 함수 (한글 깨짐 방지 완벽 적용)
function downloadCSV(fileName, data) {
    if (!data || data.length === 0) {
        alert("저장할 데이터가 없습니다.");
        return;
    }

    let csvContent = "\uFEFF"; // 한글 깨짐 방지 (BOM)
    
    data.forEach(function(rowArray) {
        let row = rowArray.join(",");
        csvContent += row + "\r\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}


// =====================================
// 2. AI 카메라 및 모델 로드
// =====================================
// 경로 문제 해결을 위해 상대 경로 명시
const URL_PATH = "./my_model/"; 
let model, maxPredictions;
let isRunning = false;
let animationId;

// 페이지 로드 시 카메라 권한 미리 체크
window.addEventListener('load', async () => {
    const select = document.getElementById('camera-select');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop()); // 권한만 얻고 끔

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

        if(videoDevices.length > 1) select.selectedIndex = videoDevices.length - 1;

    } catch (e) {
        console.error(e);
        select.innerHTML = '<option>권한 필요 (클릭해서 허용)</option>';
    }
});

async function startCamera() {
    if(isRunning) { alert("이미 카메라가 켜져 있습니다."); return; }

    const startBtn = document.getElementById("startBtn");
    const video = document.getElementById("video-element");
    const select = document.getElementById("camera-select");
    const deviceId = select.value;

    startBtn.innerText = "① AI 모델 로딩 중...";
    startBtn.disabled = true;

    try {
        const modelURL = URL_PATH + "model.json";
        const metadataURL = URL_PATH + "metadata.json";
        
        // 모델 로드 시도 및 상세 에러 처리
        try {
            model = await tmImage.load(modelURL, metadataURL);
            maxPredictions = model.getTotalClasses();
        } catch (e) {
            // 구체적인 에러 원인 출력
            console.error("모델 로드 실패:", e);
            throw new Error(`AI 모델 파일을 불러올 수 없습니다.\n\n[확인할 경로]\n${window.location.href}my_model/model.json\n\n1. 깃허브에 '.nojekyll' 파일을 만드셨나요?\n2. 'my_model' 폴더명이 정확한가요?`);
        }

        startBtn.innerText = "② 카메라 연결 중...";

        const constraints = {
            video: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                width: { ideal: 640 },
                height: { ideal: 480 }
            }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        video.style.display = "none"; 
        video.setAttribute("playsinline", true);

        video.onloadedmetadata = () => {
            video.play();
            isRunning = true;
            document.getElementById('loader-text').style.display = "none";
            startBtn.innerHTML = '<i class="fa-solid fa-check"></i> 식물 인식 중...';
            startBtn.style.background = "#1b5e20";
            
            predictLoop();
        };

    } catch (err) {
        alert(err.message);
        startBtn.innerText = "다시 시작";
        startBtn.disabled = false;
        startBtn.style.background = "#d32f2f";
        isRunning = false;
    }
}

async function predictLoop() {
    if(!isRunning) return;

    const video = document.getElementById("video-element");
    const canvas = document.getElementById("canvas-element");
    const ctx = canvas.getContext("2d");

    if(canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
    }

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
                const div = document.createElement("div");
                div.className = "label-item";
                div.innerHTML = `
                    <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                        <strong>${prediction[i].className}</strong>
                        <span style="color:#2e7d32; font-weight:bold;">${prob}%</span>
                    </div>
                    <div class="progress-bg"><div class="progress-fill" style="width:${prob}%"></div></div>
                `;
                labelContainer.appendChild(div);
            }
        }
    }
    animationId = window.requestAnimationFrame(predictLoop);
}


// =====================================
// 3. 아두이노 및 엑셀 저장 (수정됨)
// =====================================
let port, keepReading = false, reader;
let sensorDataLog = []; // 데이터 저장소
let recordInterval = null;
let currentVal = {t:"-", h:"-", l:"-"};

async function connectArduino() {
    if (!("serial" in navigator)) {
        alert("PC 크롬 브라우저에서만 가능한 기능입니다."); return;
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
    sensorDataLog = []; // 초기화
    sensorDataLog.push(["시간", "온도", "습도", "조도"]); // 헤더 추가

    document.getElementById('recordBtn').disabled = true;
    document.getElementById('saveRecordBtn').disabled = false;
    document.getElementById('record-status').innerText = "🔴 기록 중 (1초 간격)...";
    
    recordInterval = setInterval(() => {
        const time = new Date().toLocaleTimeString();
        // 실제 데이터가 없으면 0이나 -로 기록
        sensorDataLog.push([time, currentVal.t, currentVal.h, currentVal.l]);
    }, 1000);
}

function stopAndSaveRecording() {
    clearInterval(recordInterval);
    document.getElementById('recordBtn').disabled = false;
    document.getElementById('saveRecordBtn').disabled = true;
    document.getElementById('record-status').innerText = "저장 완료!";
    
    // [수정] 엑셀 다운로드 함수 호출
    downloadCSV("환경데이터_로그.csv", sensorDataLog);
}


// =====================================
// 4. 방형구법 계산 및 엑셀 저장 (수정됨)
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
            <input type="number" class="p-cover" placeholder="피도(1~5)" max="5">
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
        let cover = parseFloat(item.querySelector('.p-cover').value)||0;
        if(cover > 5) cover = 5;

        if(name) {
            data.push({name, count, freq: freq/totalQ, cover});
            sumD+=count; sumF+=(freq/totalQ); sumC+=cover;
        }
    });

    if(data.length===0) return alert("데이터를 입력해주세요.");
    
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

// [수정] 방형구법 결과 엑셀 저장
function downloadResultCSV() {
    let exportData = [];
    exportData.push(["순위", "종 이름", "중요치(IV)"]); // 헤더

    const bodyRows = document.getElementById('resultBody').querySelectorAll('tr');
    if(bodyRows.length === 0) { alert("저장할 결과가 없습니다."); return; }

    bodyRows.forEach(r => {
        const cols = r.querySelectorAll('td');
        // 각 셀의 텍스트를 추출해서 배열로 만듦
        exportData.push([cols[0].innerText, cols[1].innerText, cols[2].innerText]);
    });
    
    downloadCSV("우점종분석_결과.csv", exportData);
}