// ==================================================
// 1. 제미나이(Gemini) 연동
// ==================================================
function openGemini(query) {
    // 제미나이 웹사이트를 새 창으로 엽니다.
    // URL 파라미터로 질문을 직접 넘길 수는 없지만(구글 정책), 사용자가 바로 질문할 수 있게 유도합니다.
    const url = "https://gemini.google.com/app";
    // 팁: 클립보드에 질문을 복사해줄 수 있습니다.
    navigator.clipboard.writeText(query).then(() => {
        alert("질문 내용이 복사되었습니다! 제미나이 입력창에 붙여넣기(Ctrl+V) 하세요.\n\n복사된 내용: " + query);
        window.open(url, '_blank');
    });
}

// ==================================================
// 2. AI 카메라 (장치 선택 기능 추가)
// ==================================================
const URL = "./my_model/";
let model, webcam, labelContainer, maxPredictions;
let isCameraOn = false;

// 카메라 장치 목록 가져오기 (USB 카메라 찾기용)
async function getCameras() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    const select = document.getElementById('camera-select');
    
    select.innerHTML = '<option value="" disabled selected>카메라를 선택하세요</option>';
    
    videoDevices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.text = device.label || `카메라 ${select.length + 1}`;
        select.appendChild(option);
    });
}
// 페이지 로드 시 카메라 목록 불러오기 시도
window.addEventListener('load', getCameras);

async function init() {
    if (isCameraOn) return;

    // 선택된 카메라 ID 가져오기
    const select = document.getElementById('camera-select');
    const deviceId = select.value;
    
    // 카메라 권한 요청 및 모델 로드
    const startBtn = document.getElementById("startBtn");
    startBtn.innerText = "⌛ 로딩 중...";
    
    try {
        const modelURL = URL + "model.json";
        const metadataURL = URL + "metadata.json";
        model = await tmImage.load(modelURL, metadataURL);
        maxPredictions = model.getTotalClasses();

        const flip = true; 
        // 사용자 지정 카메라가 있으면 해당 ID 사용, 없으면 기본값
        const constraints = deviceId ? { deviceId: { exact: deviceId } } : true;
        
        webcam = new tmImage.Webcam(300, 300, flip);
        
        // setup 시 constraints 전달 (이 부분이 중요)
        await webcam.setup(constraints); 
        await webcam.play();
        window.requestAnimationFrame(loop);

        document.getElementById("webcam-container").innerHTML = "";
        document.getElementById("webcam-container").appendChild(webcam.canvas);
        
        labelContainer = document.getElementById("label-container");
        labelContainer.innerHTML = "";
        for (let i = 0; i < maxPredictions; i++) {
            labelContainer.appendChild(document.createElement("div"));
        }

        isCameraOn = true;
        startBtn.innerText = "작동 중";
        startBtn.disabled = true;

    } catch (e) {
        alert("카메라 연결 실패! 브라우저 주소창 옆 '자물쇠' 아이콘을 눌러 카메라 권한을 '허용'하고 새로고침 해주세요.\n\n" + e);
        startBtn.innerText = "▶ 카메라 켜기";
    }
}

async function loop() {
    webcam.update();
    await predict();
    window.requestAnimationFrame(loop);
}

async function predict() {
    const prediction = await model.predict(webcam.canvas);
    for (let i = 0; i < maxPredictions; i++) {
        const classPrediction = prediction[i].className + ": " + prediction[i].probability.toFixed(2);
        labelContainer.childNodes[i].innerHTML = classPrediction;
    }
}


// ==================================================
// 3. 아두이노 시리얼 통신 (Web Serial API)
// ==================================================
let port, reader;
let keepReading = false;
let sensorDataLog = []; // 엑셀 저장용 데이터 배열
let recordingInterval = null;
let currentSensorValues = { temp: 0, humid: 0, light: 0 };

async function connectArduino() {
    if ("serial" in navigator) {
        try {
            port = await navigator.serial.requestPort();
            await port.open({ baudRate: 9600 });
            
            document.getElementById('connectBtn').innerText = "✅ 연결됨";
            document.getElementById('connectBtn').disabled = true;
            document.getElementById('recordBtn').disabled = false;
            
            keepReading = true;
            readSerialData();
        } catch (err) {
            console.error("접속 에러:", err);
            alert("아두이노 연결에 실패했습니다. 포트를 선택하지 않았거나 사용 중입니다.");
        }
    } else {
        alert("이 브라우저는 Web Serial API를 지원하지 않습니다. 크롬(Chrome)이나 엣지(Edge)를 사용하세요.");
    }
}

async function readSerialData() {
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();

    try {
        while (keepReading) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
                // 아두이노에서 "온도,습도,조도" (예: "25.5,60,800") 형태로 보낸다고 가정
                // 줄바꿈 기준으로 데이터를 파싱하는 로직이 필요하지만, 
                // 간단하게 수신된 문자열 덩어리에서 숫자를 추출하는 방식으로 처리
                parseSensorData(value); 
            }
        }
    } catch (error) {
        console.error(error);
    } finally {
        reader.releaseLock();
    }
}

// 간단한 파싱 함수 (아두이노 코드가 Serial.println("temp,humid,light") 형식일 때)
let buffer = "";
function parseSensorData(chunk) {
    buffer += chunk;
    let lines = buffer.split('\n');
    buffer = lines.pop(); // 덜 들어온 데이터는 버퍼에 남김

    for (let line of lines) {
        let parts = line.trim().split(',');
        if (parts.length >= 3) {
            currentSensorValues.temp = parts[0];
            currentSensorValues.humid = parts[1];
            currentSensorValues.light = parts[2];

            // 화면 업데이트
            document.getElementById('val-temp').innerText = parts[0];
            document.getElementById('val-humid').innerText = parts[1];
            document.getElementById('val-light').innerText = parts[2];
        }
    }
}

// [기록 시작] 버튼
function startRecording() {
    sensorDataLog = []; // 초기화
    document.getElementById('recordBtn').disabled = true;
    document.getElementById('saveRecordBtn').disabled = false;
    document.getElementById('record-status').innerText = "🔴 데이터 기록 중... (1초 간격)";

    // 1초마다 배열에 저장
    recordingInterval = setInterval(() => {
        const now = new Date().toLocaleTimeString();
        sensorDataLog.push([
            now, 
            currentSensorValues.temp, 
            currentSensorValues.humid, 
            currentSensorValues.light
        ]);
    }, 1000);
}

// [기록 중지 및 엑셀 저장] 버튼
function stopAndSaveRecording() {
    clearInterval(recordingInterval);
    document.getElementById('recordBtn').disabled = false;
    document.getElementById('saveRecordBtn').disabled = true;
    document.getElementById('record-status').innerText = "💾 저장 완료!";

    // CSV 변환 및 다운로드
    let csvContent = "\uFEFF시간,온도(℃),토양습도(%),조도(lx)\n";
    sensorDataLog.forEach(row => {
        csvContent += row.join(",") + "\n";
    });

    downloadFile(csvContent, "환경데이터_로그.csv");
}


// ==================================================
// 4. 방형구법 계산 (엑셀 저장 포함)
// ==================================================
window.onload = function() { addRow(); addRow(); };

function addRow() {
    const tbody = document.getElementById('inputTable').querySelector('tbody');
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="text" class="p-name"></td>
        <td><input type="number" class="p-count"></td>
        <td><input type="number" class="p-freq"></td>
        <td><input type="number" class="p-cover" max="5"></td>
        <td><button onclick="this.closest('tr').remove()">X</button></td>
    `;
    tbody.appendChild(tr);
}

function calculate() {
    // (기존 계산 로직과 동일)
    // ...중략 (위에서 제공한 코드와 동일하게 구현) ...
    // 편의상 결과 표시 부분만 간단히 연결
    
    // *실제 구현 시 이전에 드린 calculate 함수 내용 전체를 여기에 넣으세요*
    // 테스트용 더미 데이터 표시
    document.getElementById('result-section').style.display = 'block';
    document.getElementById('dominant-result').innerText = "분석 완료 (예시)";
}

// 방형구 결과 저장 함수
function downloadResultCSV() {
    // 결과 테이블의 내용을 가져와 저장
    const rows = document.getElementById('resultTable').querySelectorAll('tr');
    if(rows.length <= 1) { alert("저장할 데이터가 없습니다."); return; }

    let csv = "\uFEFF순위,종이름,상대밀도,상대빈도,상대피도,중요치\n";
    // ...테이블 파싱 로직...
    alert("기능 구현 예시: 엑셀 파일이 다운로드됩니다."); 
}

// 공통 다운로드 헬퍼 함수
function downloadFile(content, fileName) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
}