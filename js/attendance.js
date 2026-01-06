// 설정
const CONFIG = {
    // ⚠️⚠️⚠️ 여기를 실제 Google Apps Script 배포 URL로 변경하세요 ⚠️⚠️⚠️
    GAS_URL: 'https://script.google.com/macros/s/AKfycbxjmvZWEErrnhyGtgyhrpBAoy8lF_Cw7V9bJNgTBCRQKeFrkROu-tp43uAcSEu9VxBd/exec', // 나중에 변경 필요
    REQUIRED_RADIUS: 50 // 50m 이내만 출석 인정
};

// DOM 요소
const nameSelect = document.getElementById('nameSelect');
const nameInput = document.getElementById('nameInput');
const teamSelect = document.getElementById('teamSelect');
const attendBtn = document.getElementById('attendBtn');
const messageDiv = document.getElementById('message');
const locationStatus = document.getElementById('locationStatus');
const locationText = document.getElementById('locationText');

let userPosition = null;
let membersList = [];
let statusLoaded = false; // 출석현황 로딩 여부
let currentSeason = null; // 현재 시즌 정보
let pendingAttendanceRequest = { name: '', team: '' }; // 출석 요청 대기 중인 정보
let deviceId = null; // 기기 고유 식별자

// 기기 고유 식별자 생성 (FingerprintJS + localStorage 조합)
async function initDeviceId() {
    try {
        // 1. localStorage에 저장된 ID가 있으면 먼저 확인
        const storedId = localStorage.getItem('device_id');

        // 2. FingerprintJS로 브라우저 핑거프린트 생성
        if (typeof FingerprintJS !== 'undefined') {
            const fp = await FingerprintJS.load();
            const result = await fp.get();
            const visitorId = result.visitorId; // 핑거프린트 기반 ID

            if (storedId) {
                // 저장된 ID가 있으면 핑거프린트와 조합해서 사용
                deviceId = storedId;
            } else {
                // 없으면 새로 생성하고 저장
                deviceId = 'DEV_' + visitorId + '_' + Date.now().toString(36);
                localStorage.setItem('device_id', deviceId);
            }

            // 핑거프린트도 별도 저장 (localStorage 삭제 감지용)
            const storedFingerprint = localStorage.getItem('device_fingerprint');
            if (!storedFingerprint) {
                localStorage.setItem('device_fingerprint', visitorId);
            } else if (storedFingerprint !== visitorId) {
                // 핑거프린트가 다르면 (다른 기기에서 localStorage 복사 시도)
                // 새로운 ID 생성
                deviceId = 'DEV_' + visitorId + '_' + Date.now().toString(36);
                localStorage.setItem('device_id', deviceId);
                localStorage.setItem('device_fingerprint', visitorId);
            }
        } else {
            // FingerprintJS 로드 실패 시 fallback
            if (storedId) {
                deviceId = storedId;
            } else {
                deviceId = 'DEV_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
                localStorage.setItem('device_id', deviceId);
            }
        }

        console.log('📱 Device ID initialized:', deviceId.substring(0, 20) + '...');
    } catch (error) {
        console.error('Device ID 초기화 오류:', error);
        // 오류 시 기본 fallback
        const storedId = localStorage.getItem('device_id');
        if (storedId) {
            deviceId = storedId;
        } else {
            deviceId = 'DEV_FALLBACK_' + Date.now().toString(36);
            localStorage.setItem('device_id', deviceId);
        }
    }
}

// 현재 시즌 판단 함수
function getCurrentSeason() {
    const today = new Date();
    const month = today.getMonth() + 1; // 1~12
    const year = today.getFullYear();

    if (month >= 1 && month <= 6) {
        return {
            season: '상반기',
            seasonKey: 'firstHalf',
            teamKey: 'firstHalfTeam',
            displayText: `${year} 상반기 리그`
        };
    } else {
        return {
            season: '하반기',
            seasonKey: 'secondHalf',
            teamKey: 'secondHalfTeam',
            displayText: `${year} 하반기 리그`
        };
    }
}

// 초기화
document.addEventListener('DOMContentLoaded', async () => {
    // 💡 jQuery 로드 여부 확인
    if (typeof jQuery === 'undefined') {
        showMessage('오류: jQuery 라이브러리가 로드되지 않았습니다.', 'error');
        return;
    }

    // 💡 설정 확인
    console.log('📋 CONFIG.GAS_URL:', CONFIG.GAS_URL);

    // 📱 기기 식별자 초기화 (대리 출석 방지)
    await initDeviceId();

    // 현재 시즌 설정 및 표시
    currentSeason = getCurrentSeason();
    const seasonTextEl = document.getElementById('seasonText');
    if (seasonTextEl) {
        seasonTextEl.textContent = currentSeason.displayText;
    }

    // 초기 상태: 위치 정보 없음
    locationText.textContent = '위치 정보 확인 중...';
    locationStatus.classList.remove('success', 'error');
    attendBtn.disabled = true;

    // 기존 회원 목록 로드
    loadMembers();

    // 이벤트 리스너
    attendBtn.addEventListener('click', processAttendance);
    teamSelect.addEventListener('change', filterMembersByTeam);
    nameSelect.addEventListener('change', handleNameSelectChange);

    // 탭 전환 이벤트 리스너
    initializeTabs();

    // 자동으로 위치 정보 가져오기
    refreshLocation();

});

// 위치 정보 가져오기
function getLocation() {
    if (!navigator.geolocation) {
        locationText.textContent = '위치 서비스를 지원하지 않습니다.';
        attendBtn.disabled = true;
        return;
    }

    locationText.textContent = '위치 정보 확인 중...';
    locationStatus.classList.remove('success', 'error');

    navigator.geolocation.getCurrentPosition(
        (position) => {
            userPosition = position.coords;
            locationText.textContent = '위치 정보 확인 완료';
            locationStatus.classList.remove('error');
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
            locationStatus.classList.remove('success');
            locationStatus.classList.add('error');
            attendBtn.disabled = true;
            showMessage(errorMsg, 'error');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

// 위치정보 가져오기 헬퍼 함수 (GPS 우선, 네트워크 fallback)
function getLocationWithFallback(onSuccess, onError) {
    if (!navigator.geolocation) {
        onError({
            code: 0,
            message: '위치 서비스를 지원하지 않습니다.'
        });
        return;
    }

    // 1단계: GPS로 먼저 시도
    console.log('📍 GPS로 위치 정보 가져오는 중...');
    navigator.geolocation.getCurrentPosition(
        (position) => {
            console.log('✅ GPS로 위치 정보 획득 성공');
            onSuccess(position);
        },
        (error) => {
            // PERMISSION_DENIED는 재시도해도 소용없으므로 바로 실패 처리
            if (error.code === error.PERMISSION_DENIED) {
                console.error('❌ 위치 권한이 거부됨');
                onError(error);
                return;
            }

            // POSITION_UNAVAILABLE 또는 TIMEOUT인 경우 네트워크 기반으로 재시도
            console.log('⚠️ GPS 실패 (코드: ' + error.code + '), 네트워크 기반으로 재시도...');

            // 2단계: 네트워크 기반으로 재시도
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    console.log('✅ 네트워크 기반으로 위치 정보 획득 성공');
                    showMessage('📡 네트워크 기반으로 위치를 확인했습니다.', 'success');
                    onSuccess(position);
                },
                (networkError) => {
                    console.error('❌ 네트워크 기반도 실패');
                    onError(networkError);
                },
                { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }
            );
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

// 위치정보 가져오기 (자동)
function refreshLocation() {
    if (!navigator.geolocation) {
        locationText.textContent = '위치 서비스를 지원하지 않습니다.';
        attendBtn.disabled = true;
        showMessage('위치 서비스를 지원하지 않습니다.', 'error');
        return;
    }

    // 먼저 지도 모달 열기 (로딩 상태)
    showLocationMapWithLoading();

    locationText.textContent = '위치 정보 확인 중...';
    locationStatus.classList.remove('success', 'error');

    getLocationWithFallback(
        (position) => {
            userPosition = position.coords;
            locationText.textContent = '위치 정보 확인 완료';
            locationStatus.classList.remove('error');
            locationStatus.classList.add('success');
            attendBtn.disabled = false;
            showMessage('✅ 위치 정보가 확인되었습니다!', 'success');

            // 지도에 위치 표시
            showLocationMap(userPosition.latitude, userPosition.longitude);
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
                    errorMsg = '위치 정보 요청 시간이 초과되었습니다. 페이지를 새로고침해주세요.';
                    break;
            }

            locationText.textContent = errorMsg;
            locationStatus.classList.remove('success');
            locationStatus.classList.add('error');
            attendBtn.disabled = true;
            showMessage(errorMsg, 'error');

            // 에러 발생 시 지도 모달 닫기
            closeLocationMap();
        }
    );
}

// 기존 회원 목록 로드 (GET 요청, $.ajax 사용) - 캐싱 적용
function loadMembers() {
    // 1. 캐시에서 먼저 시도
    const cached = CacheManager.get(CacheManager.KEYS.MEMBERS);
    if (cached) {
        console.log('✅ 회원 목록 캐시에서 로드');
        console.log('📋 회원 목록 데이터:', cached);
        membersList = cached;
        renderNameSelect(membersList);
        return;
    }

    // 2. 캐시 없으면 서버에서 로드
    console.log('📡 회원 목록 서버에서 로드 중...');
    $.ajax({
        url: `${CONFIG.GAS_URL}?action=getMembers`,
        dataType: 'jsonp', // CORS 우회
        success: function(data) {
            console.log('📨 서버 응답:', data);
            if (data.success && data.members) {
                console.log('📋 회원 목록 데이터:', data.members);
                membersList = data.members;
                renderNameSelect(membersList);

                // 캐시에 저장 (10분 TTL)
                CacheManager.set(CacheManager.KEYS.MEMBERS, data.members);
            } else {
                console.error('회원 목록 로딩 실패:', data.message || '데이터 없음');
            }
        },
        error: function(jqXHR, textStatus, errorThrown) {
            console.error('회원 목록 로딩 에러:', textStatus, errorThrown);
        }
    });
}

// Select에 회원 이름 렌더링
function renderNameSelect(members) {
    nameSelect.innerHTML = '<option value="">이름을 선택하세요</option>';
    members.forEach(member => {
        const option = document.createElement('option');
        option.value = member.name;
        option.textContent = member.name;
        nameSelect.appendChild(option);
    });

    // 맨 밑에 "직접 입력" 옵션 추가
    const directInputOption = document.createElement('option');
    directInputOption.value = '__DIRECT_INPUT__';
    directInputOption.textContent = '직접 입력';
    nameSelect.appendChild(directInputOption);
}

// 팀 선택 시 해당 팀원만 필터링하여 표시
function filterMembersByTeam() {
    const selectedTeam = teamSelect.value;
    console.log('🔍 팀 필터링 시작:', selectedTeam);
    console.log('📊 현재 시즌:', currentSeason);
    console.log('👥 전체 회원 목록:', membersList);

    // select 표시, input 숨김 (팀 변경 시 항상 select 모드로)
    nameSelect.style.display = '';
    nameInput.style.display = 'none';
    nameInput.value = '';

    // 팀이 선택되지 않았으면 전체 목록 표시
    if (!selectedTeam) {
        renderNameSelect(membersList);
        return;
    }

    // 현재 시즌의 팀으로 필터링 (현재 시즌 팀 정보가 없으면 다른 시즌 팀 정보로 fallback)
    const filteredMembers = membersList.filter(member => {
        const currentSeasonTeam = member[currentSeason.teamKey]; // firstHalfTeam 또는 secondHalfTeam
        console.log(`👤 ${member.name}: 현재시즌팀=${currentSeasonTeam}, 상반기팀=${member.firstHalfTeam}, 하반기팀=${member.secondHalfTeam}`);

        // 현재 시즌 팀 정보가 있으면 그것으로 비교
        if (currentSeasonTeam) {
            return currentSeasonTeam === selectedTeam;
        }

        // 현재 시즌 팀 정보가 없으면 다른 시즌 팀 정보로 fallback
        const otherSeasonKey = currentSeason.teamKey === 'firstHalfTeam' ? 'secondHalfTeam' : 'firstHalfTeam';
        const otherSeasonTeam = member[otherSeasonKey];
        return otherSeasonTeam === selectedTeam;
    });

    console.log('✅ 필터링된 회원:', filteredMembers);
    renderNameSelect(filteredMembers);

    // 이름 선택 초기화
    nameSelect.value = '';
}

// 이름 선택 변경 시 처리
function handleNameSelectChange() {
    if (nameSelect.value === '__DIRECT_INPUT__') {
        // 직접 입력 모드로 전환
        nameSelect.style.display = 'none';
        nameInput.style.display = '';
        nameInput.focus();
    }
}


// 출석 처리
function processAttendance() {
    // 직접 입력 모드인지 확인
    const isDirectInput = nameInput.style.display !== 'none';
    const name = isDirectInput ? nameInput.value.trim() : nameSelect.value;
    const team = teamSelect.value;

    if (!name || !team || name === '__DIRECT_INPUT__') {
        showMessage('이름과 팀을 모두 선택/입력해주세요.', 'error');
        return;
    }

    if (!userPosition) {
        showMessage('위치 정보가 없습니다. "위치정보 가져오기" 버튼을 먼저 눌러주세요.', 'error');
        return;
    }

    attendBtn.disabled = true;
    attendBtn.textContent = '출석 처리 중...';

    // 💡 핵심 수정: POST 관련 설정을 제거하고 JSONP(GET) 방식으로 데이터 전달
    const dataToSend = {
        action: 'attend', // 이 파라미터가 서버(Code.gs)로 정상 전달되어야 합니다.
        name: name,
        team: team,
        season: currentSeason.season, // 상반기 또는 하반기
        latitude: userPosition.latitude,
        longitude: userPosition.longitude,
        deviceId: deviceId || 'unknown' // 📱 기기 고유 식별자 (대리 출석 방지)
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
                // 출석 실패 시 출석 요청 옵션 제공
                const errorMessage = data.message || '출석 실패';
                showMessage(`❌ ${errorMessage}`, 'error');

                // 출석 실패 시점의 이름과 팀 정보 저장
                pendingAttendanceRequest.name = name;
                pendingAttendanceRequest.team = team;

                // 커스텀 모달로 출석 요청 여부 확인
                showAttendanceFailModal(errorMessage);
            }
        },
        error: function(jqXHR, textStatus, errorThrown) {
            console.error('출석 처리 에러:', textStatus, errorThrown);
            showMessage('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.', 'error');
        },
        complete: function() {
            attendBtn.disabled = false;
            attendBtn.textContent = '출석하기';

            // 출석 후 캐시 무효화
            CacheManager.remove(CacheManager.KEYS.MEMBERS);
            CacheManager.remove(CacheManager.KEYS.TODAY_ATTENDANCE);

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
        loadLastWeekStatus();
    }
}

/**
 * 오늘 출석 현황을 서버에서 불러와 표시합니다. - 캐싱 적용
 */
function loadTodayStatus(forceReload = false) {
    const container = document.getElementById('todayStatus');

    // 1. 강제 새로고침이 아니면 캐시 확인
    if (!forceReload) {
        const cached = CacheManager.get(CacheManager.KEYS.TODAY_ATTENDANCE);
        if (cached) {
            console.log('✅ 오늘 출석 현황 캐시에서 로드');
            displayTodayStatus(cached);
            statusLoaded = true;
            return;
        }
    }

    // 2. 캐시 없거나 강제 새로고침 시 서버에서 로드
    console.log('📡 오늘 출석 현황 서버에서 로드 중...');

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

    const requestUrl = `${CONFIG.GAS_URL}?action=getTodayAttendance`;
    console.log('🔗 요청 URL:', requestUrl);

    $.ajax({
        url: requestUrl,
        dataType: 'jsonp',
        success: function(data) {
            console.log('오늘 출석 현황 응답:', data);

            if (data && data.success && data.attendance !== undefined) {
                displayTodayStatus(data.attendance);

                // 캐시에 저장 (2분 TTL)
                CacheManager.set(CacheManager.KEYS.TODAY_ATTENDANCE, data.attendance);

                if (!forceReload) {
                    statusLoaded = true;
                }
            } else {
                console.error('출석 현황 로딩 실패:', data);
                const errorMsg = data && data.message ? data.message : '출석 현황을 불러오는데 실패했습니다.';
                container.innerHTML = `<p class="text-danger">${errorMsg}</p>`;
            }
        },
        error: function(jqXHR, textStatus, errorThrown) {
            console.error('출석 현황 로딩 에러:', textStatus, errorThrown);
            container.innerHTML = '<p class="text-danger">네트워크 오류가 발생했습니다.</p>';
        }
    });
}

/**
 * 시간을 HH:MM 형식으로 변환
 */
function formatTimeHHMM(timeStr) {
    if (!timeStr) return '';

    // Date 객체인 경우
    if (timeStr instanceof Date) {
        const hours = String(timeStr.getHours()).padStart(2, '0');
        const minutes = String(timeStr.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    // 문자열 처리
    const str = String(timeStr);

    // ISO 8601 형식 또는 날짜가 포함된 경우 (예: "2025-01-15T09:30:00" 또는 "2025-01-15 09:30:00")
    if (str.includes('T') || str.includes(' ')) {
        try {
            const date = new Date(str);
            if (!isNaN(date.getTime())) {
                const hours = String(date.getHours()).padStart(2, '0');
                const minutes = String(date.getMinutes()).padStart(2, '0');
                return `${hours}:${minutes}`;
            }
        } catch (e) {
            console.warn('시간 파싱 실패:', str);
        }
    }

    // "HH:MM:SS" 형식에서 HH:MM만 추출
    const timeParts = str.split(':');
    if (timeParts.length >= 2) {
        const hours = timeParts[0].padStart(2, '0');
        const minutes = timeParts[1].padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    return str; // 형식이 다르면 원본 반환
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
                    <th>상태</th>
                    <th>출석 시간</th>
                </tr>
            </thead>
            <tbody>
    `;

    attendance.forEach(record => {
        const lateStatus = record.isLate ?
            '<span style="color: #ff9800; font-weight: 600;">⏰ 지각</span>' :
            '<span style="color: #4caf50; font-weight: 600;">✅ 정상</span>';

        html += `
            <tr>
                <td><strong>${record.name}</strong></td>
                <td>${record.team}팀</td>
                <td>${lateStatus}</td>
                <td>${formatTimeHHMM(record.time)}</td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    html += `<p style="text-align: center; color: #666; margin-top: 15px;">총 ${attendance.length}명 출석</p>`;

    container.innerHTML = html;
}

/**
 * 지난주 출석 현황을 서버에서 불러와 표시합니다. - 캐싱 적용
 */
function loadLastWeekStatus(forceReload = false) {
    const container = document.getElementById('lastWeekStatus');

    // 1. 강제 새로고침이 아니면 캐시 확인
    if (!forceReload) {
        const cached = CacheManager.get(CacheManager.KEYS.LAST_WEEK_ATTENDANCE);
        if (cached) {
            console.log('✅ 지난주 출석 현황 캐시에서 로드');
            displayLastWeekStatus(cached.attendance, cached.date);
            return;
        }
    }

    // 2. 캐시 없거나 강제 새로고침 시 서버에서 로드
    console.log('📡 지난주 출석 현황 서버에서 로드 중...');

    // 로딩 중 표시
    container.innerHTML = `
        <div style="text-align: center; padding: 40px;">
            <div style="display: inline-block; width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #667eea; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <p style="margin-top: 15px; color: #666;">지난주 출석 현황을 불러오는 중...</p>
        </div>
    `;

    const requestUrl = `${CONFIG.GAS_URL}?action=getLastWeekAttendance`;
    console.log('🔗 요청 URL:', requestUrl);

    $.ajax({
        url: requestUrl,
        dataType: 'jsonp',
        success: function(data) {
            console.log('지난주 출석 현황 응답:', data);

            if (data && data.success && data.attendance !== undefined) {
                displayLastWeekStatus(data.attendance, data.date);

                // 캐시에 저장 (10분 TTL)
                CacheManager.set(CacheManager.KEYS.LAST_WEEK_ATTENDANCE, {
                    attendance: data.attendance,
                    date: data.date
                });
            } else {
                console.error('지난주 출석 현황 로딩 실패:', data);
                const errorMsg = data && data.message ? data.message : '지난주 출석 현황을 불러오는데 실패했습니다.';
                container.innerHTML = `<p class="text-danger">${errorMsg}</p>`;
            }
        },
        error: function(jqXHR, textStatus, errorThrown) {
            console.error('지난주 출석 현황 로딩 에러:', textStatus, errorThrown);
            container.innerHTML = '<p class="text-danger">네트워크 오류가 발생했습니다.</p>';
        }
    });
}

/**
 * 지난주 출석 현황 데이터를 화면에 표시
 */
function displayLastWeekStatus(attendance, date) {
    const container = document.getElementById('lastWeekStatus');

    if (attendance.length === 0) {
        container.innerHTML = `<p class="text-secondary">${date} (토) 출석 기록이 없습니다.</p>`;
        return;
    }

    let html = `
        <p style="margin-bottom: 10px; color: #666; font-size: 14px;">${date} (토)</p>
        <table class="table">
            <thead>
                <tr>
                    <th>이름</th>
                    <th>팀</th>
                    <th>상태</th>
                    <th>출석 시간</th>
                </tr>
            </thead>
            <tbody>
    `;

    attendance.forEach(record => {
        const lateStatus = record.isLate ?
            '<span style="color: #ff9800; font-weight: 600;">⏰ 지각</span>' :
            '<span style="color: #4caf50; font-weight: 600;">✅ 정상</span>';

        html += `
            <tr>
                <td><strong>${record.name}</strong></td>
                <td>${record.team}팀</td>
                <td>${lateStatus}</td>
                <td>${formatTimeHHMM(record.time)}</td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    html += `<p style="text-align: center; color: #666; margin-top: 15px;">총 ${attendance.length}명 출석</p>`;

    container.innerHTML = html;
}

// ==================== 위치 확인 지도 모달 ====================

let locationMap = null;
let locationMarker = null;

/**
 * 로딩 상태로 지도 모달 표시
 */
function showLocationMapWithLoading() {
    const modal = document.getElementById('locationMapModal');
    const mapContainer = document.getElementById('locationMap');

    if (!modal || !mapContainer) {
        console.error('지도 모달 요소를 찾을 수 없습니다.');
        showMessage('지도를 표시할 수 없습니다.', 'error');
        return;
    }

    // 로딩 인디케이터 표시
    mapContainer.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; background: #f8f9fa;">
            <div style="width: 50px; height: 50px; border: 5px solid #f3f3f3; border-top: 5px solid #667eea; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <p style="margin-top: 20px; color: #666; font-size: 16px;">📍 위치 정보를 가져오는 중...</p>
        </div>
        <style>
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    `;

    // 모달 표시
    modal.style.display = 'flex';
}

/**
 * 카카오맵 초기화 및 지도 모달 표시
 */
function showLocationMap(latitude, longitude) {
    const modal = document.getElementById('locationMapModal');
    const mapContainer = document.getElementById('locationMap');

    // DOM 요소 존재 확인
    if (!modal || !mapContainer) {
        console.error('지도 모달 요소를 찾을 수 없습니다.');
        showMessage('지도를 표시할 수 없습니다.', 'error');
        return;
    }

    // 모달이 이미 열려있지 않으면 열기
    if (modal.style.display !== 'flex') {
        modal.style.display = 'flex';
    }

    // 로딩 메시지 제거 (innerHTML을 비우고 지도를 다시 생성)
    mapContainer.innerHTML = '';

    // 현재 위치 버튼 추가
    const currentLocationBtn = document.createElement('button');
    currentLocationBtn.id = 'currentLocationBtn';
    currentLocationBtn.className = 'current-location-btn';
    currentLocationBtn.title = '현재 위치로 이동';
    currentLocationBtn.textContent = '📍';
    currentLocationBtn.addEventListener('click', moveToCurrentLocation);
    mapContainer.appendChild(currentLocationBtn);

    // 카카오맵 SDK 로드 확인 및 대기
    const initializeMap = () => {
        if (typeof kakao === 'undefined' || !kakao.maps) {
            console.error('카카오맵 SDK가 로드되지 않았습니다.');
            showMessage('지도를 불러올 수 없습니다.', 'error');
            closeLocationMap();
            return;
        }

        // 지도가 이미 생성되어 있으면 위치만 업데이트
        if (locationMap && locationMarker) {
            const position = new kakao.maps.LatLng(latitude, longitude);
            locationMap.setCenter(position);
            locationMarker.setPosition(position);
            return;
        }

        // 지도 생성
        try {
            const position = new kakao.maps.LatLng(latitude, longitude);

            const mapOption = {
                center: position,
                level: 3, // 확대 레벨
                draggable: false // 지도 드래그 비활성화 (확대/축소는 가능)
            };

            locationMap = new kakao.maps.Map(mapContainer, mapOption);

            // 마커 생성
            locationMarker = new kakao.maps.Marker({
                position: position,
                map: locationMap
            });

            console.log('✅ 카카오맵 초기화 완료');
        } catch (error) {
            console.error('카카오맵 초기화 오류:', error);
            showMessage('지도를 불러오는 중 오류가 발생했습니다.', 'error');
            closeLocationMap();
        }
    };

    // 모달이 표시된 후 지도 초기화 (렌더링 이슈 방지)
    setTimeout(initializeMap, 100);
}

/**
 * 지도 모달 닫기
 */
function closeLocationMap() {
    const modal = document.getElementById('locationMapModal');
    modal.style.display = 'none';
}


/**
 * 지도에서 현재 위치로 이동
 */
function moveToCurrentLocation() {
    const currentLocationBtn = document.getElementById('currentLocationBtn');

    // 버튼 로딩 상태
    if (currentLocationBtn) {
        currentLocationBtn.classList.add('loading');
        currentLocationBtn.disabled = true;
    }

    // 위치 정보 가져오기 (GPS 우선, 네트워크 fallback)
    getLocationWithFallback(
        (position) => {
            const latitude = position.coords.latitude;
            const longitude = position.coords.longitude;

            // userPosition 업데이트 (출석체크에 사용) - position.coords 구조와 통일
            userPosition = { latitude: latitude, longitude: longitude };

            // 지도와 마커 업데이트
            if (locationMap && locationMarker && typeof kakao !== 'undefined' && kakao.maps) {
                const newPosition = new kakao.maps.LatLng(latitude, longitude);
                locationMap.setCenter(newPosition);
                locationMarker.setPosition(newPosition);

                showMessage('📍 현재 위치로 이동했습니다.', 'success');
            }

            // 버튼 로딩 해제
            if (currentLocationBtn) {
                currentLocationBtn.classList.remove('loading');
                currentLocationBtn.disabled = false;
            }
        },
        (error) => {
            console.error('위치 정보 가져오기 실패:', error);
            let errorMessage = '위치 정보를 가져올 수 없습니다.';

            switch (error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage = '위치 권한이 거부되었습니다. 브라우저 설정에서 위치 권한을 허용해주세요.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage = '위치 정보를 사용할 수 없습니다.';
                    break;
                case error.TIMEOUT:
                    errorMessage = '위치 정보 요청 시간이 초과되었습니다.';
                    break;
            }

            showMessage(errorMessage, 'error');

            // 버튼 로딩 해제
            if (currentLocationBtn) {
                currentLocationBtn.classList.remove('loading');
                currentLocationBtn.disabled = false;
            }
        }
    );
}

// 지도 모달 이벤트 리스너 추가 (DOMContentLoaded 시)
window.addEventListener('DOMContentLoaded', () => {
    const closeMapModalBtn = document.getElementById('closeMapModal');
    const currentLocationBtn = document.getElementById('currentLocationBtn');

    if (closeMapModalBtn) {
        closeMapModalBtn.addEventListener('click', closeLocationMap);
    }

    if (currentLocationBtn) {
        currentLocationBtn.addEventListener('click', moveToCurrentLocation);
    }

    // 모달 배경 클릭 시 닫기
    const modal = document.getElementById('locationMapModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeLocationMap();
            }
        });
    }

    // 출석 실패 모달 이벤트 리스너
    const cancelFailBtn = document.getElementById('cancelFailBtn');
    const requestFromFailBtn = document.getElementById('requestFromFailBtn');
    const failModal = document.getElementById('attendanceFailModal');

    if (cancelFailBtn) {
        cancelFailBtn.addEventListener('click', () => {
            hideAttendanceFailModal(true); // 취소 시 데이터 초기화
        });
    }

    if (requestFromFailBtn) {
        requestFromFailBtn.addEventListener('click', () => {
            hideAttendanceFailModal(false); // 출석 요청하기 시 데이터 유지
            showRequestModal();
        });
    }

    if (failModal) {
        failModal.addEventListener('click', (e) => {
            if (e.target === failModal) {
                hideAttendanceFailModal(true); // 배경 클릭 시 데이터 초기화
            }
        });
    }

    // 출석 요청 모달 이벤트 리스너
    const closeRequestModal = document.getElementById('closeRequestModal');
    const cancelRequestBtn = document.getElementById('cancelRequestBtn');
    const submitRequestBtn = document.getElementById('submitRequestBtn');
    const requestModal = document.getElementById('attendanceRequestModal');

    if (closeRequestModal) {
        closeRequestModal.addEventListener('click', hideRequestModal);
    }

    if (cancelRequestBtn) {
        cancelRequestBtn.addEventListener('click', hideRequestModal);
    }

    if (submitRequestBtn) {
        submitRequestBtn.addEventListener('click', submitAttendanceRequest);
    }

    if (requestModal) {
        requestModal.addEventListener('click', (e) => {
            if (e.target === requestModal) {
                hideRequestModal();
            }
        });
    }

    // 라디오 버튼 변경 이벤트 리스너
    const reasonRadios = document.querySelectorAll('input[name="requestReason"]');
    const customReasonTextarea = document.getElementById('requestReasonCustom');

    reasonRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === '기타' && customReasonTextarea) {
                customReasonTextarea.style.display = 'block';
                customReasonTextarea.focus();
            } else if (customReasonTextarea) {
                customReasonTextarea.style.display = 'none';
                customReasonTextarea.value = '';
            }
        });
    });
});

// ==================== 출석 요청 관련 함수 ====================

/**
 * 출석 실패 모달 표시
 */
function showAttendanceFailModal(errorMessage) {
    const modal = document.getElementById('attendanceFailModal');
    const failMessageEl = document.getElementById('failMessage');

    if (modal && failMessageEl) {
        failMessageEl.textContent = errorMessage;
        modal.style.display = 'flex';
    }
}

/**
 * 출석 실패 모달 숨기기
 */
function hideAttendanceFailModal(clearData = false) {
    const modal = document.getElementById('attendanceFailModal');
    if (modal) {
        modal.style.display = 'none';

        // clearData가 true일 때만 저장된 출석 요청 정보 초기화 (취소 시)
        if (clearData) {
            pendingAttendanceRequest.name = '';
            pendingAttendanceRequest.team = '';
        }
    }
}

/**
 * 출석 요청 모달 표시
 */
function showRequestModal() {
    // 저장된 정보가 없으면 현재 선택된 정보를 사용 (방어 로직)
    if (!pendingAttendanceRequest.name || !pendingAttendanceRequest.team) {
        const isDirectInput = nameInput.style.display !== 'none';
        const name = isDirectInput ? nameInput.value.trim() : nameSelect.value;
        const team = teamSelect.value;

        if (!name || !team || name === '__DIRECT_INPUT__') {
            showMessage('이름과 팀을 먼저 선택/입력해주세요.', 'error');
            return;
        }

        // 현재 정보 저장
        pendingAttendanceRequest.name = name;
        pendingAttendanceRequest.team = team;
    }

    const modal = document.getElementById('attendanceRequestModal');
    const customReasonTextarea = document.getElementById('requestReasonCustom');

    if (modal) {
        // 라디오 버튼 초기화 (첫 번째 옵션 선택)
        const firstRadio = document.querySelector('input[name="requestReason"]');
        if (firstRadio) {
            firstRadio.checked = true;
        }

        // 직접 입력 텍스트 영역 숨김 및 초기화
        if (customReasonTextarea) {
            customReasonTextarea.style.display = 'none';
            customReasonTextarea.value = '';
        }

        modal.style.display = 'flex';
    }
}

/**
 * 출석 요청 모달 숨기기
 */
function hideRequestModal() {
    const modal = document.getElementById('attendanceRequestModal');
    const customReasonTextarea = document.getElementById('requestReasonCustom');

    if (modal) {
        modal.style.display = 'none';

        // 텍스트 영역 초기화
        if (customReasonTextarea) {
            customReasonTextarea.style.display = 'none';
            customReasonTextarea.value = '';
        }

        // 저장된 출석 요청 정보 초기화
        pendingAttendanceRequest.name = '';
        pendingAttendanceRequest.team = '';
    }
}

/**
 * 출석 요청 제출
 */
function submitAttendanceRequest() {
    // 저장된 이름과 팀 정보 사용
    const name = pendingAttendanceRequest.name;
    const team = pendingAttendanceRequest.team;

    if (!name || !team) {
        showMessage('이름과 팀 정보가 없습니다. 다시 시도해주세요.', 'error');
        return;
    }

    // 선택된 라디오 버튼 값 가져오기
    const selectedRadio = document.querySelector('input[name="requestReason"]:checked');
    let reason = '';

    if (selectedRadio) {
        if (selectedRadio.value === '기타') {
            // "기타" 선택 시 직접 입력한 내용 사용
            const customReason = document.getElementById('requestReasonCustom').value.trim();
            if (!customReason) {
                showMessage('사유를 직접 입력해주세요.', 'error');
                return;
            }
            reason = `기타: ${customReason}`;
        } else {
            // 선택된 옵션 사용
            reason = selectedRadio.value;
        }
    }

    if (!reason) {
        showMessage('사유를 선택해주세요.', 'error');
        return;
    }

    const submitBtn = document.getElementById('submitRequestBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = '제출 중...';

    const dataToSend = {
        action: 'submitAttendanceRequest',
        name: name,
        team: team,
        season: currentSeason.season,
        latitude: userPosition ? userPosition.latitude : '',
        longitude: userPosition ? userPosition.longitude : '',
        reason: reason,
        deviceId: deviceId || 'unknown' // 📱 기기 고유 식별자
    };

    $.ajax({
        url: CONFIG.GAS_URL,
        data: dataToSend,
        dataType: 'jsonp',
        success: function(data) {
            if (data.success) {
                showMessage('✅ 출석 요청이 제출되었습니다. 관리자 승인을 기다려주세요.', 'success');
                hideRequestModal();
            } else {
                showMessage(`❌ ${data.message || '출석 요청 실패'}`, 'error');
            }
        },
        error: function(jqXHR, textStatus, errorThrown) {
            console.error('출석 요청 에러:', textStatus, errorThrown);
            showMessage('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.', 'error');
        },
        complete: function() {
            submitBtn.disabled = false;
            submitBtn.textContent = '요청 제출';
        }
    });
}