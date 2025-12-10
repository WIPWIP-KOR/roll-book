// 설정
const CONFIG = {
    // ⚠️⚠️⚠️ 여기를 실제 Google Apps Script 배포 URL로 변경하세요 ⚠️⚠️⚠️
    GAS_URL: 'https://script.google.com/macros/s/AKfycbxjmvZWEErrnhyGtgyhrpBAoy8lF_Cw7V9bJNgTBCRQKeFrkROu-tp43uAcSEu9VxBd/exec', // 나중에 변경 필요
    REQUIRED_RADIUS: 50 // 50m 이내만 출석 인정
};

// DOM 요소
const nameInput = document.getElementById('nameInput');
const teamSelect = document.getElementById('teamSelect');
const attendBtn = document.getElementById('attendBtn');
const messageDiv = document.getElementById('message');
const locationStatus = document.getElementById('locationStatus');
const locationText = document.getElementById('locationText');
const nameList = document.getElementById('nameList');

let userPosition = null;
let membersList = [];
let statusLoaded = false; // 출석현황 로딩 여부

// 초기화
document.addEventListener('DOMContentLoaded', () => {
    // 💡 jQuery 로드 여부 확인
    if (typeof jQuery === 'undefined') {
        showMessage('오류: jQuery 라이브러리가 로드되지 않았습니다.', 'error');
        return;
    }

    // 위치 정보 가져오기 시작
    getLocation();

    // 기존 회원 목록 로드
    loadMembers();

    // 이벤트 리스너
    attendBtn.addEventListener('click', processAttendance);
    nameInput.addEventListener('change', autoSelectTeam);

    // 탭 전환 이벤트 리스너
    initializeTabs();

    // 출석현황 새로고침 버튼
    const refreshStatusBtn = document.getElementById('refreshStatusBtn');
    if (refreshStatusBtn) {
        refreshStatusBtn.addEventListener('click', () => {
            loadTodayStatus(true);
        });
    }
});

// 위치 정보 가져오기
function getLocation() {
    if (!navigator.geolocation) {
        locationText.textContent = '위치 서비스를 지원하지 않습니다.';
        attendBtn.disabled = true;
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            userPosition = position.coords;
            locationText.textContent = '위치 정보 확인 완료';
            locationStatus.classList.add('success');
            attendBtn.disabled = false;
        },
        (error) => {
            let errorMsg = '위치 정보를 가져올 수 없습니다.';

            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMsg = '위치 정보 권한이 거부되었습니다. 설정에서 허용해주세요.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMsg = '위치 정보를 사용할 수 없습니다.';
                    break;
                case error.TIMEOUT:
                    errorMsg = '위치 정보 요청 시간이 초과되었습니다.';
                    break;
            }

            locationText.textContent = errorMsg;
            locationStatus.classList.add('error');
            attendBtn.disabled = true;
            showMessage(errorMsg, 'error');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

// 기존 회원 목록 로드 (GET 요청, $.ajax 사용)
function loadMembers() {
    $.ajax({
        url: `${CONFIG.GAS_URL}?action=getMembers`,
        dataType: 'jsonp', // CORS 우회
        success: function(data) {
            if (data.success && data.members) {
                membersList = data.members;
                renderDatalist(membersList);
            } else {
                console.error('회원 목록 로딩 실패:', data.message || '데이터 없음');
            }
        },
        error: function(jqXHR, textStatus, errorThrown) {
            console.error('회원 목록 로딩 에러:', textStatus, errorThrown);
        }
    });
}

// Datalist에 회원 이름 렌더링
function renderDatalist(members) {
    nameList.innerHTML = '';
    members.forEach(member => {
        const option = document.createElement('option');
        option.value = member.name;
        nameList.appendChild(option);
    });
}

// 이름 입력 시 팀 자동 선택
function autoSelectTeam() {
    const selectedName = nameInput.value;
    const member = membersList.find(m => m.name === selectedName);

    if (member) {
        teamSelect.value = member.team;
    } else {
        teamSelect.value = '';
    }
}

// 출석 처리
function processAttendance() {
    const name = nameInput.value.trim();
    const team = teamSelect.value;

    if (!name || !team) {
        showMessage('이름과 팀을 모두 선택/입력해주세요.', 'error');
        return;
    }

    if (!userPosition) {
        showMessage('위치 정보 확인 중입니다. 잠시 후 다시 시도해주세요.', 'error');
        getLocation();
        return;
    }

    attendBtn.disabled = true;
    attendBtn.textContent = '출석 처리 중...';

    // 💡 핵심 수정: POST 관련 설정을 제거하고 JSONP(GET) 방식으로 데이터 전달
    const dataToSend = {
        action: 'attend', // 이 파라미터가 서버(Code.gs)로 정상 전달되어야 합니다.
        name: name,
        team: team,
        latitude: userPosition.latitude,
        longitude: userPosition.longitude,
        userAgent: navigator.userAgent // IP 대체를 위한 정보
    };

    $.ajax({
        url: CONFIG.GAS_URL,
        // type: 'POST',             // ❌ 제거 (JSONP는 GET으로 작동)
        data: dataToSend,           // ✅ 일반 객체로 전달 (쿼리 파라미터로 자동 변환)
        // contentType: 'application/json', // ❌ 제거
        dataType: 'jsonp', // CORS 우회
        success: function(data) {
            if (data.success) {
                showMessage(`✅ ${name}님 출석 완료!`, 'success');
                // 성공 시 로컬 스토리지에 저장 (선택된 이름과 팀)
                localStorage.setItem('last_name', name);
                localStorage.setItem('last_team', team);
            } else {
                showMessage(`❌ ${data.message || '출석 실패'}`, 'error');
            }
        },
        error: function(jqXHR, textStatus, errorThrown) {
            console.error('출석 처리 에러:', textStatus, errorThrown);
            showMessage('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.', 'error');
        },
        complete: function() {
            attendBtn.disabled = false;
            attendBtn.textContent = '출석하기';
            loadMembers(); // 출석 후 목록 새로고침 (총 출석수 업데이트)
        }
    });
}

// 메시지 표시
function showMessage(text, type) {
    messageDiv.textContent = text;
    messageDiv.className = `message ${type} show`;

    setTimeout(() => {
        messageDiv.classList.remove('show');
    }, 5000);
}

// ==================== 탭 관리 ====================

/**
 * 탭 초기화 및 이벤트 리스너 등록
 */
function initializeTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.getAttribute('data-tab');
            switchTab(tabName);
        });
    });
}

/**
 * 탭 전환
 */
function switchTab(tabName) {
    // 모든 탭 버튼과 콘텐츠 비활성화
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });

    // 선택된 탭 활성화
    const selectedBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    const selectedContent = document.getElementById(`${tabName}Tab`);

    if (selectedBtn && selectedContent) {
        selectedBtn.classList.add('active');
        selectedContent.classList.add('active');
    }

    // 출석현황 탭이 선택되면 데이터 로드 (최초 1회만)
    if (tabName === 'status' && !statusLoaded) {
        loadTodayStatus();
    }
}

/**
 * 오늘 출석 현황을 서버에서 불러와 표시합니다.
 */
function loadTodayStatus(forceReload = false) {
    const container = document.getElementById('todayStatus');

    // 로딩 중 표시
    container.innerHTML = `
        <div style="text-align: center; padding: 40px;">
            <div style="display: inline-block; width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #667eea; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <p style="margin-top: 15px; color: #666;">출석 현황을 불러오는 중...</p>
        </div>
        <style>
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    `;

    $.ajax({
        url: `${CONFIG.GAS_URL}?action=getTodayAttendance`,
        dataType: 'jsonp',
        success: function(data) {
            if (data.success && data.attendance) {
                displayTodayStatus(data.attendance);
                if (!forceReload) {
                    statusLoaded = true;
                }
            } else {
                container.innerHTML = '<p class="text-danger">출석 현황을 불러오는데 실패했습니다.</p>';
            }
        },
        error: function(jqXHR, textStatus, errorThrown) {
            console.error('출석 현황 로딩 에러:', textStatus, errorThrown);
            container.innerHTML = '<p class="text-danger">네트워크 오류가 발생했습니다.</p>';
        }
    });
}

/**
 * 출석 현황 데이터를 화면에 표시
 */
function displayTodayStatus(attendance) {
    const container = document.getElementById('todayStatus');

    if (attendance.length === 0) {
        container.innerHTML = '<p class="text-secondary">오늘 출석 기록이 없습니다.</p>';
        return;
    }

    let html = `
        <table class="table">
            <thead>
                <tr>
                    <th>이름</th>
                    <th>팀</th>
                    <th>출석 시간</th>
                </tr>
            </thead>
            <tbody>
    `;

    attendance.forEach(record => {
        html += `
            <tr>
                <td><strong>${record.name}</strong></td>
                <td>${record.team}팀</td>
                <td>${record.time}</td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    html += `<p style="text-align: center; color: #666; margin-top: 15px;">총 ${attendance.length}명 출석</p>`;

    container.innerHTML = html;
}