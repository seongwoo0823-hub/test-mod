// ==========================================
// PART 1. 티처블 머신 AI 식물 인식
// ==========================================
const URL = "./my_model/"; // 모델 파일이 있는 폴더 경로
let model, webcam, labelContainer, maxPredictions;
let isCameraOn = false;

// 카메라 켜기 버튼 클릭 시 실행
async function init() {
    if (isCameraOn) return; // 이미 켜져있으면 중복 실행 방지
    
    const startBtn = document.getElementById("startBtn");
    startBtn.innerText = "⌛ 모델 로딩 중...";
    startBtn.disabled = true;

    try {
        const modelURL = URL + "model.json";
        const metadataURL = URL + "metadata.json";

        // 모델과 메타데이터 로드
        model = await tmImage.load(modelURL, metadataURL);
        maxPredictions = model.getTotalClasses();

        // 웹캠 설정
        const flip = true; // 화면 좌우 반전
        webcam = new tmImage.Webcam(300, 300, flip); // 너비, 높이, 반전여부
        await webcam.setup(); // 웹캠 접근 권한 요청
        await webcam.play();
        window.requestAnimationFrame(loop);

        // 화면에 웹캠 추가
        document.getElementById("webcam-container").innerHTML = "";
        document.getElementById("webcam-container").appendChild(webcam.canvas);
        
        // 결과 라벨 컨테이너 초기화
        labelContainer = document.getElementById("label-container");
        labelContainer.innerHTML = "";
        for (let i = 0; i < maxPredictions; i++) {
            // 결과바 생성 (디자인 요소)
            let div = document.createElement("div");
            div.className = "label-bar-container";
            div.innerHTML = `<span class="label-text" id="text-${i}"></span><div class="label-bar" id="bar-${i}"></div>`;
            labelContainer.appendChild(div);
        }

        isCameraOn = true;
        startBtn.innerText = "카메라 작동 중 (아래 결과 확인)";

    } catch (error) {
        alert("카메라 실행 실패! 모델 파일 경로 확인 또는 카메라 권한을 허용해주세요.");
        startBtn.innerText = "▶ 카메라 켜기 (재시도)";
        startBtn.disabled = false;
        console.error(error);
    }
}

async function loop() {
    webcam.update(); // 웹캠 프레임 업데이트
    await predict();
    window.requestAnimationFrame(loop);
}

// 예측 실행 및 결과 표시 화면 업데이트
async function predict() {
    const prediction = await model.predict(webcam.canvas);
    
    // 가능성이 높은 순서로 정렬
    prediction.sort((a, b) => b.probability - a.probability);

    // 상위 3개만 표시 (혹은 전체 표시)
    for (let i = 0; i < maxPredictions; i++) {
        const name = prediction[i].className;
        const probability = (prediction[i].probability * 100).toFixed(1);
        
        const textSpan = document.getElementById(`text-${i}`);
        const barDiv = document.getElementById(`bar-${i}`);

        if(probability > 5) { // 5% 이상인 것만 진하게 표시
             textSpan.innerText = `${name} (${probability}%)`;
             barDiv.style.width = `${probability}%`;
        } else {
             textSpan.innerText = "";
             barDiv.style.width = "0%";
        }
    }
}


// ==========================================
// PART 2. 방형구법 계산기 로직
// ==========================================

// 페이지 로드 시 초기 입력 행 3개 추가
window.onload = function() {
    addRow(); addRow(); addRow();
};

// 테이블에 새로운 입력 행 추가
function addRow() {
    const tableBody = document.getElementById('inputTable').getElementsByTagName('tbody')[0];
    const newRow = tableBody.insertRow();
    newRow.innerHTML = `
        <td><input type="text" placeholder="예: 토끼풀" class="plant-name"></td>
        <td><input type="number" placeholder="0" min="0" class="count-input"></td>
        <td><input type="number" placeholder="0" min="0" class="freq-input"></td>
        <td><input type="number" placeholder="1~5" min="1" max="5" class="cover-input"></td>
        <td><button onclick="deleteRow(this)" class="btn-delete">삭제</button></td>
    `;
}

// 행 삭제
function deleteRow(btn) {
    const row = btn.parentNode.parentNode;
    if (document.getElementById('inputTable').tBodies[0].rows.length > 1) {
        row.parentNode.removeChild(row);
    } else {
        alert("최소 1개의 행은 필요합니다.");
    }
}

// [핵심] 계산 및 우점종 선정 함수
function calculate() {
    const totalQuadrats = parseFloat(document.getElementById('totalQuadrats').value);
    const rows = document.getElementById('inputTable').tBodies[0].rows;
    
    if(totalQuadrats <= 0 || isNaN(totalQuadrats)) {
        alert("전체 방형구 수를 정확히 입력해주세요."); return;
    }

    let rawData = [];
    let sumDensity = 0, sumFrequencyVal = 0, sumCoverageClass = 0;

    // 1. 입력 데이터 수집 및 합계 계산
    for(let i=0; i<rows.length; i++) {
        const name = rows[i].querySelector('.plant-name').value.trim();
        const count = parseFloat(rows[i].querySelector('.count-input').value) || 0;
        const freqCount = parseFloat(rows[i].querySelector('.freq-input').value) || 0;
        let coverClass = parseFloat(rows[i].querySelector('.cover-input').value) || 0;

        if(name === "") continue; // 이름 없는 행 건너뜀
        if(coverClass > 5) coverClass = 5; // 피도계급 최대 5로 제한

        // 빈도 계산 (해당 종이 출현한 방형구 수 / 전체 방형구 수)
        const frequencyValue = freqCount / totalQuadrats; 

        rawData.push({ name, count, frequencyValue, coverClass });
        
        sumDensity += count;
        sumFrequencyVal += frequencyValue;
        sumCoverageClass += coverClass;
    }

    if(rawData.length === 0) { alert("데이터를 입력해주세요!"); return; }

    // 2. 상대값 및 중요치(IV) 계산
    let results = [];
    rawData.forEach(item => {
        // 상대밀도(RD) = (해당 종 개체수 / 전체 종 개체수 합) * 100
        const rd = (sumDensity === 0) ? 0 : (item.count / sumDensity) * 100;
        
        // 상대빈도(RF) = (해당 종 빈도 / 전체 종 빈도 합) * 100
        const rf = (sumFrequencyVal === 0) ? 0 : (item.frequencyValue / sumFrequencyVal) * 100;
        
        // 상대피도(RC) = (해당 종 피도계급 / 전체 종 피도계급 합) * 100  (간이 계산법 적용)
        const rc = (sumCoverageClass === 0) ? 0 : (item.coverClass / sumCoverageClass) * 100;
        
        // 중요치(IV) = RD + RF + RC
        const iv = rd + rf + rc;

        results.push({ name: item.name, rd, rf, rc, iv });
    });

    // 중요치(IV) 기준으로 내림차순 정렬 (우점종 찾기)
    results.sort((a, b) => b.iv - a.iv);

    // 3. 결과 화면 출력
    displayResults(results);
}

// 계산 결과를 화면에 보여주는 함수
function displayResults(sortedData) {
    const resultSection = document.getElementById('result-section');
    const resultBody = document.getElementById('resultBody');
    const dominantResultDiv = document.getElementById('dominant-result');
    
    resultBody.innerHTML = ""; // 기존 결과 초기화

    sortedData.forEach((item, index) => {
        const newRow = resultBody.insertRow();
        // 1위~3위는 순위에 메달 이모지 추가
        let rankMark = (index + 1);
        if(index === 0) rankMark = "🥇";
        else if(index === 1) rankMark = "🥈";
        else if(index === 2) rankMark = "🥉";

        newRow.innerHTML = `
            <td>${rankMark}</td>
            <td style="font-weight:bold;">${item.name}</td>
            <td>${item.rd.toFixed(1)}%</td>
            <td>${item.rf.toFixed(1)}%</td>
            <td>${item.rc.toFixed(1)}%</td>
            <td style="color:var(--primary-color); font-weight:bold;">${item.iv.toFixed(1)}</td>
        `;
    });

    // 우점종 문구 출력 (1위 식물)
    const dominantInfo = sortedData[0];
    dominantResultDiv.innerHTML = `
        이 군집의 우점종은 <br>
        <span class="highlight-text">${dominantInfo.name}</span> 입니다! 
        (중요치: ${dominantInfo.iv.toFixed(1)})
    `;

    resultSection.style.display = 'block'; // 결과 섹션 보여주기
    // 결과 섹션으로 부드럽게 스크롤 이동
    resultSection.scrollIntoView({ behavior: 'smooth' });
}


// ==========================================
// PART 3. 엑셀(CSV) 파일 다운로드
// ==========================================
function downloadCSV() {
    let csvContent = "\uFEFF"; // UTF-8 BOM (한글 깨짐 방지)
    csvContent += "순위,종 이름,상대밀도(%),상대빈도(%),상대피도(%),중요치(IV)\n"; // 헤더

    const rows = document.getElementById('resultBody').querySelectorAll('tr');
    
    if(rows.length === 0) { alert("먼저 분석을 완료해주세요."); return; }

    rows.forEach(row => {
        let cols = row.querySelectorAll('td');
        let rowData = [];
        // 이모지가 있는 순위 열은 텍스트만 추출하거나 그대로 사용
        rowData.push(cols[0].innerText); // 순위
        rowData.push(cols[1].innerText); // 이름
        rowData.push(cols[2].innerText.replace('%','')); // 숫자만 추출
        rowData.push(cols[3].innerText.replace('%',''));
        rowData.push(cols[4].innerText.replace('%',''));
        rowData.push(cols[5].innerText);
        
        csvContent += rowData.join(",") + "\n";
    });

    // 파일 생성 및 다운로드 트리거
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `방형구법_분석결과_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}