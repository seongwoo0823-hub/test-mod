// =====================================
// 1. 기본 설정 및 유틸리티
// =====================================
if (window.location.protocol === 'file:') {
    alert("⚠️ 주의: GitHub Pages 주소(https://...)로 접속해야 카메라와 AI가 작동합니다.");
}

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

// =====================================
// 2. AI 카메라 및 모델 로딩 (핵심)
// =====================================
// [중요] 깃허브 페이지 구조에 맞춘 상대 경로
const URL_PATH = "./my_model/"; 
let model, maxPredictions, isRunning = false;

// 초기화: 카메라 권한 요청 및 리스트업
window.addEventListener('load', async () => {
    // 방형구법 초기행
    addRow(); addRow();

    const select = document.getElementById('camera-select');
    try {
        // 1. 권한 요청 (잠깐 켰다 끄기)
        const stream = await navigator.mediaDevices.getUserMedia({video: true});
        stream.getTracks().forEach(track => track.stop());

        // 2. 장치 목록 가져오기
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        
        select.innerHTML = '';
        if(videoDevices.length === 0) { 
            select.innerHTML = '<option disabled>카메라 없음</option>'; 
            return; 
        }

        videoDevices.forEach((dev, i) => {
            const opt = document.createElement('option');
            opt.value = dev.deviceId;
            opt.text = dev.label || `카메라 ${i+1}`;
            select.appendChild(opt);
        });

        // 3. 후면 카메라/USB 카메라 자동 선택 시도
        if(videoDevices.length > 1) select.selectedIndex = videoDevices.length - 1;

    } catch (e) {
        console.error(e);
        select.innerHTML = '<option>권한 필요 (허용해주세요)</option>';
    }
});

async function startCamera() {
    if(isRunning) return alert("이미 카메라가 켜져 있습니다.");
    
    const btn = document.getElementById("startBtn");
    const video = document.getElementById("video-element");
    const devId = document.getElementById("camera-select").value;

    btn.innerText = "① AI 모델 로딩 중...";
    btn.disabled = true;

    try {
        // [AI 모델 로드]
        // 에러 발생 시 .nojekyll 파일 확인 필요
        model = await tmImage.load(URL_PATH + "model.json", URL_PATH + "metadata.json");
        maxPredictions = model.getTotalClasses();

        btn.innerText = "② 카메라 연결 중...";

        // [카메라 스트림 시작]
        const constraints = {
            video: { 
                deviceId: devId ? { exact: devId } : undefined, 
                width: { ideal: 640 }, 
                height: { ideal: 480 } 
            }
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        
        // 비디오 준비 완료 시 루프 시작
        video.onloadedmetadata = () => {
            video.play();
            isRunning = true;
            document.getElementById('loader-text').style.display = "none";
            btn.innerHTML = '<i class="fa-solid fa-check"></i> 작동 중';
            btn.style.background = "#1b5e20";
            
            predictLoop();
        };

    } catch (err) {
        console.error(err);
        alert("오류 발생!\n\n1. AI 모델: 깃허브에 '.nojekyll' 파일이 있는지 확인하세요.\n2. 카메라: 브라우저 권한이 허용되었는지 확인하세요.\n\n" + err.message);
        btn.innerText = "다시 시도";
        btn.disabled = false;
        btn.style.background = "#d32f2f";
    }
}

async function predictLoop() {
    if(!isRunning) return;
    
    const video = document.getElementById("video-element");
    const canvas = document.getElementById("canvas-element");
    const ctx = canvas.getContext("2d");

    // 캔버스 크기 동기화
    if(canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
    }

    // 1. 화면 그리기
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // 2. AI 예측
    if(model) {
        const prediction = await model.predict(video);
        const con = document.getElementById("label-container");
        con.innerHTML = "";
        
        // 확률순 정렬
        prediction.sort((a,b) => b.probability - a.probability);

        // 상위 3개 표시
        for(let i=0; i<3; i++){
            if(i >= maxPredictions) break;
            const prob = (prediction[i].probability * 100).toFixed(1);
            
            // 5% 이상인 것만 표시
            if(prob > 5) {
                con.innerHTML += `
                <div class="label-item">
                    <div style="display:flex; justify-content:space-between;">
                        <strong>${prediction[i].className}</strong>
                        <span style="color:#2e7d32; font-weight:bold;">${prob}%</span>
                    </div>
                    <div class="progress-bg">
                        <div class="progress-fill" style="width:${prob}%"></div>
                    </div>
                </div>`;
            }
        }
    }
    requestAnimationFrame(predictLoop);
}

// =====================================
// 3. 아두이노 (조도 기준 적용)
// =====================================
let port, keepReading=false;
let sensorDataLog=[], recordInterval=null;
let currentVal={t:"-", h:"-", l:"-", s:"-"};

async function connectArduino() {
    if(!navigator.serial) return alert("PC 크롬/엣지 브라우저에서만 가능합니다.");
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
    // [설정] 이미지 기준표에 맞게 숫자 조정
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
// 4. 방형구법 (통합 엑셀 저장)
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
function closeModal(){document.getElementById('result-modal').classList.add('hidden');}
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