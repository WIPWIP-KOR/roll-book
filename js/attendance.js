// 설정
const CONFIG = {
    GAS_URL: GAS_URL, // js/config.js 에서 전역으로 정의 (전 페이지 공통 URL)
    REQUIRED_RADIUS: 50 // 50m 이내만 출석 인정
};

// DOM 요소
const attendBtn = document.getElementById('attendBtn');
const messageDiv = document.getElementById('message');
const locationStatus = document.getElementById('locationStatus');
const locationText = document.getElementById('locationText');
const attendSection = document.getElementById('attendSection');
const memberRadioList = document.getElementById('memberRadioList');
const locationRetryBtn = document.getElementById('locationRetryBtn');

let userPosition = null;
let membersList = [];
let selectedTeam = 'A';        // 현재 선택된 팀 탭
let selectedMemberName = '';   // 현재 선택된 회원
let todayAttendedNames = new Set(); // 오늘 이미 출석한 회원 (목록에서 숨김)
let statusLoaded = false; // 출석현황 로딩 여부
let hallOfFameLoaded = false; // 명예의 전당 로딩 여부
let currentSeason = null; // 현재 시즌 정보
let pendingAttendanceRequest = { name: '', team: '' }; // 출석 요청 대기 중인 정보
let deviceId = null; // 기기 고유 식별자
let capturedPhotoData = null; // 촬영한 사진 데이터 (Base64)
let randomAttendeesData = []; // 랜덤으로 선택된 출석자 목록

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

    // 초기 상태: 위치 확인 전 → 출석 영역 숨김
    locationText.textContent = '위치 정보 확인 중...';
    locationStatus.classList.remove('success', 'error');
    if (attendSection) attendSection.style.display = 'none';
    if (locationRetryBtn) locationRetryBtn.style.display = 'none';
    attendBtn.disabled = true;

    // 기존 회원 목록 로드 + 오늘 출석자 조회(출석한 사람은 목록에서 숨김)
    loadMembers();
    loadTodayAttendedNames();

    // 이벤트 리스너
    attendBtn.addEventListener('click', onAttendClick);

    // 팀 탭 (A/B/C) 전환
    document.querySelectorAll('.team-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.team-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            selectedTeam = tab.getAttribute('data-team');
            renderTeamMembers(selectedTeam);
        });
    });

    // 위치 다시 조회 버튼
    if (locationRetryBtn) locationRetryBtn.addEventListener('click', refreshLocation);

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
        locationStatus.classList.add('error');
        if (attendSection) attendSection.style.display = 'none';
        if (locationRetryBtn) locationRetryBtn.style.display = 'block';
        return;
    }

    locationText.textContent = '위치 정보 확인 중...';
    locationStatus.classList.remove('success', 'error');
    if (locationRetryBtn) locationRetryBtn.style.display = 'none';

    getLocationWithFallback(
        (position) => {
            userPosition = position.coords;
            locationText.textContent = '✅ 위치 정보 확인 완료';
            locationStatus.classList.remove('error');
            locationStatus.classList.add('success');
            if (locationRetryBtn) locationRetryBtn.style.display = 'none';

            // 위치 확인 후에만 출석 영역(팀 탭 + 회원 목록) 표시
            if (attendSection) attendSection.style.display = 'block';
            renderTeamMembers(selectedTeam);
        },
        (error) => {
            let errorMsg = '위치 정보를 가져올 수 없습니다.';

            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMsg = '위치 권한이 거부되었습니다. 설정에서 허용 후 다시 조회해주세요.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMsg = '위치 정보를 사용할 수 없습니다. 다시 조회해주세요.';
                    break;
                case error.TIMEOUT:
                    errorMsg = '위치 요청 시간이 초과되었습니다. 다시 조회해주세요.';
                    break;
            }

            locationText.textContent = errorMsg;
            locationStatus.classList.remove('success');
            locationStatus.classList.add('error');

            // 실패 시: 출석 영역 숨기고 '위치 다시 조회' 버튼 표시
            if (attendSection) attendSection.style.display = 'none';
            if (locationRetryBtn) locationRetryBtn.style.display = 'block';
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
        renderTeamMembers(selectedTeam);
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
                renderTeamMembers(selectedTeam);

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

// 오늘 이미 출석한 회원 이름 조회 → 출석 명단에서 숨기기 위해 사용
function loadTodayAttendedNames() {
    // 출석현황 캐시가 있으면 재사용
    const cached = CacheManager.get(CacheManager.KEYS.TODAY_ATTENDANCE);
    if (cached) {
        todayAttendedNames = new Set(cached.map(r => String(r.name).trim()));
        renderTeamMembers(selectedTeam);
        return;
    }

    $.ajax({
        url: `${CONFIG.GAS_URL}?action=getTodayAttendance`,
        dataType: 'jsonp',
        success: function(data) {
            if (data && data.success && Array.isArray(data.attendance)) {
                todayAttendedNames = new Set(data.attendance.map(r => String(r.name).trim()));
                CacheManager.set(CacheManager.KEYS.TODAY_ATTENDANCE, data.attendance);
                renderTeamMembers(selectedTeam);
            }
        },
        error: function(jqXHR, textStatus, errorThrown) {
            console.error('오늘 출석자 조회 에러:', textStatus, errorThrown);
        }
    });
}

// 선택한 팀의 회원을 가나다순 라디오 버튼으로 렌더링 (오늘 출석한 회원은 숨김)
function renderTeamMembers(team) {
    if (!memberRadioList) return;

    // 선택 초기화
    selectedMemberName = '';
    attendBtn.disabled = true;

    const teamKey = currentSeason ? currentSeason.teamKey : 'firstHalfTeam';

    // 현재 시즌 팀만 표시 (다른 시즌 팀으로 대체하지 않음)
    const teamMembers = membersList.filter(member => String(member[teamKey] || '').trim() === team);
    const filtered = teamMembers.filter(member => !todayAttendedNames.has(String(member.name).trim()));

    // 가나다순 정렬
    filtered.sort((a, b) => String(a.name).localeCompare(String(b.name), 'ko'));

    if (filtered.length === 0) {
        memberRadioList.innerHTML = teamMembers.length > 0
            ? '<p class="member-radio-empty">🎉 이 팀은 모두 출석했습니다.</p>'
            : '<p class="member-radio-empty">이 팀에 등록된 회원이 없습니다.</p>';
        return;
    }

    memberRadioList.innerHTML = filtered.map(member => {
        const safe = String(member.name).replace(/"/g, '&quot;');
        return `<label class="member-radio-item">
            <input type="radio" name="attendMember" value="${safe}">
            <span>${member.name}</span>
        </label>`;
    }).join('');

    // 회원 선택 시 출석 버튼 활성화
    memberRadioList.querySelectorAll('input[name="attendMember"]').forEach(radio => {
        radio.addEventListener('change', () => {
            selectedMemberName = radio.value;
            attendBtn.disabled = false;
        });
    });
}

// 출석하기 버튼 → 확인 팝업 → 출석 처리
function onAttendClick() {
    if (!selectedMemberName) {
        showMessage('출석할 회원을 선택해주세요.', 'error');
        return;
    }
    if (!userPosition) {
        showMessage('위치 정보가 없습니다. 위치를 다시 조회해주세요.', 'error');
        return;
    }
    if (confirm(`${selectedMemberName}님으로 출석하시겠습니까?`)) {
        processAttendance();
    }
}

// 출석 처리
function processAttendance() {
    const name = selectedMemberName;
    const team = selectedTeam;

    if (!name || !team) {
        showMessage('출석할 회원을 선택해주세요.', 'error');
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
                // 중복 제출 방지: 선택 초기화 + 방금 출석한 회원은 명단에서 숨김
                selectedMemberName = '';
                todayAttendedNames.add(String(name).trim());
                renderTeamMembers(selectedTeam);
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
            // 성공 시 선택이 비워져 버튼 비활성, 실패 시 선택이 남아 재시도 가능
            attendBtn.disabled = !selectedMemberName;
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

    // 명예의 전당 탭이 선택되면 데이터 로드 (최초 1회만)
    if (tabName === 'hallOfFame' && !hallOfFameLoaded) {
        loadHallOfFame();
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

    // 출석 시간순으로 정렬 (오름차순)
    const sortedAttendance = [...attendance].sort((a, b) => {
        if (!a.time || !b.time) return 0;
        return a.time.localeCompare(b.time);
    });

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

    sortedAttendance.forEach(record => {
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
    html += `<p style="text-align: center; color: #666; margin-top: 15px;">총 ${sortedAttendance.length}명 출석</p>`;

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

    // 출석 시간순으로 정렬 (오름차순)
    const sortedAttendance = [...attendance].sort((a, b) => {
        if (!a.time || !b.time) return 0;
        return a.time.localeCompare(b.time);
    });

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

    sortedAttendance.forEach(record => {
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
    html += `<p style="text-align: center; color: #666; margin-top: 15px;">총 ${sortedAttendance.length}명 출석</p>`;

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

    // 카메라 촬영 버튼 이벤트 리스너
    const takePictureBtn = document.getElementById('takePictureBtn');
    const photoCapture = document.getElementById('photoCapture');
    const retakePictureBtn = document.getElementById('retakePictureBtn');

    if (takePictureBtn && photoCapture) {
        takePictureBtn.addEventListener('click', () => {
            photoCapture.click();
        });
    }

    if (photoCapture) {
        photoCapture.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                handlePhotoCapture(file);
            }
        });
    }

    if (retakePictureBtn) {
        retakePictureBtn.addEventListener('click', () => {
            capturedPhotoData = null;
            document.getElementById('photoPreview').style.display = 'none';
            photoCapture.value = '';
        });
    }
});

/**
 * 촬영한 사진 처리 (리사이징 포함)
 */
function handlePhotoCapture(file) {
    const reader = new FileReader();

    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            // 이미지 리사이징 (최대 800x600)
            const maxWidth = 800;
            const maxHeight = 600;
            let width = img.width;
            let height = img.height;

            // 비율 유지하면서 리사이징
            if (width > height) {
                if (width > maxWidth) {
                    height = Math.round(height * maxWidth / width);
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width = Math.round(width * maxHeight / height);
                    height = maxHeight;
                }
            }

            // Canvas로 리사이징
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // JPEG 품질 0.7로 압축
            const photoData = canvas.toDataURL('image/jpeg', 0.7);
            capturedPhotoData = photoData;

            // 미리보기 표시
            const previewEl = document.getElementById('photoPreview');
            const previewImg = document.getElementById('photoPreviewImage');

            previewImg.src = photoData;
            previewEl.style.display = 'block';

            console.log('📸 사진 촬영 완료 (리사이징됨)');
        };

        img.onerror = function() {
            console.error('이미지 로드 오류');
            showMessage('이미지를 불러오는데 실패했습니다.', 'error');
        };

        img.src = e.target.result;
    };

    reader.onerror = function(error) {
        console.error('사진 읽기 오류:', error);
        showMessage('사진을 불러오는데 실패했습니다.', 'error');
    };

    reader.readAsDataURL(file);
}

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
        const name = selectedMemberName;
        const team = selectedTeam;

        if (!name || !team) {
            showMessage('출석할 회원을 먼저 선택해주세요.', 'error');
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

        // 사진 관련 상태 초기화
        capturedPhotoData = null;
        document.getElementById('photoPreview').style.display = 'none';

        modal.style.display = 'flex';

        // 랜덤 인원 조회 API 호출
        loadRandomAttendees();
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
 * 랜덤 인원 조회 API 호출
 */
function loadRandomAttendees() {
    const loadingEl = document.getElementById('randomPersonLoading');
    const listEl = document.getElementById('randomPersonList');
    const emptyEl = document.getElementById('emptyFieldMessage');

    // 로딩 표시
    loadingEl.style.display = 'block';
    listEl.style.display = 'none';
    emptyEl.style.display = 'none';

    $.ajax({
        url: CONFIG.GAS_URL,
        data: {
            action: 'getRandomAttendees',
            season: currentSeason.season
        },
        dataType: 'jsonp',
        success: function(data) {
            loadingEl.style.display = 'none';

            if (data.success && data.attendees) {
                randomAttendeesData = data.attendees;
                displayRandomAttendees(data.attendees);
            } else {
                showMessage('❌ 출석자 목록을 불러오는데 실패했습니다.', 'error');
            }
        },
        error: function(jqXHR, textStatus, errorThrown) {
            loadingEl.style.display = 'none';
            console.error('랜덤 인원 조회 에러:', textStatus, errorThrown);
            showMessage('네트워크 오류가 발생했습니다.', 'error');
        }
    });
}

/**
 * 랜덤 인원 목록 표시
 */
function displayRandomAttendees(attendees) {
    const listEl = document.getElementById('randomPersonList');
    const emptyEl = document.getElementById('emptyFieldMessage');
    const optionsContainer = document.getElementById('randomPersonOptions');

    if (attendees.length === 0) {
        // 출석한 사람이 없으면 빈 풋살장 안내 표시
        listEl.style.display = 'none';
        emptyEl.style.display = 'block';
    } else {
        // 출석한 사람이 있으면 목록 표시
        emptyEl.style.display = 'none';
        listEl.style.display = 'block';

        // 라디오 버튼 생성
        optionsContainer.innerHTML = '';
        attendees.forEach((person, index) => {
            const label = document.createElement('label');
            label.className = 'reason-option';
            label.innerHTML = `
                <input type="radio" name="selectedPerson" value="${person}" ${index === 0 ? 'checked' : ''}>
                <span>👤 ${person}</span>
            `;
            optionsContainer.appendChild(label);
        });
    }
}

/**
 * 출석 요청 제출
 */
function submitAttendanceRequest() {
    console.log('🚀 [디버그] submitAttendanceRequest 함수 시작');

    // 저장된 이름과 팀 정보 사용
    const name = pendingAttendanceRequest.name;
    const team = pendingAttendanceRequest.team;
    console.log('🚀 [디버그] 이름:', name, '팀:', team);

    if (!name || !team) {
        console.log('❌ [디버그] 이름/팀 정보 없음');
        showMessage('이름과 팀 정보가 없습니다. 다시 시도해주세요.', 'error');
        return;
    }

    // 사진 촬영 여부 확인
    console.log('🚀 [디버그] capturedPhotoData:', capturedPhotoData ? '있음' : '없음');
    if (!capturedPhotoData) {
        console.log('❌ [디버그] 사진 없음');
        showMessage('사진을 촬영해주세요.', 'error');
        return;
    }

    // 선택된 동료 (랜덤 인원이 있는 경우만)
    let selectedPerson = '';
    console.log('🚀 [디버그] randomAttendeesData.length:', randomAttendeesData.length);
    if (randomAttendeesData.length > 0) {
        const selectedPersonRadio = document.querySelector('input[name="selectedPerson"]:checked');
        console.log('🚀 [디버그] selectedPersonRadio:', selectedPersonRadio);
        if (!selectedPersonRadio) {
            console.log('❌ [디버그] 동료 선택 안 됨');
            showMessage('함께 사진 찍을 사람을 선택해주세요.', 'error');
            return;
        }
        selectedPerson = selectedPersonRadio.value;
        console.log('🚀 [디버그] selectedPerson:', selectedPerson);
    }

    // 선택된 라디오 버튼 값 가져오기
    const selectedRadio = document.querySelector('input[name="requestReason"]:checked');
    console.log('🚀 [디버그] selectedRadio:', selectedRadio);
    let reason = '';

    if (selectedRadio) {
        if (selectedRadio.value === '기타') {
            // "기타" 선택 시 직접 입력한 내용 사용
            const customReason = document.getElementById('requestReasonCustom').value.trim();
            console.log('🚀 [디버그] customReason:', customReason);
            if (!customReason) {
                console.log('❌ [디버그] 기타 사유 입력 안 됨');
                showMessage('사유를 직접 입력해주세요.', 'error');
                return;
            }
            reason = `기타: ${customReason}`;
        } else {
            // 선택된 옵션 사용
            reason = selectedRadio.value;
        }
    }
    console.log('🚀 [디버그] reason:', reason);

    if (!reason) {
        console.log('❌ [디버그] 사유 없음');
        showMessage('사유를 선택해주세요.', 'error');
        return;
    }

    console.log('✅ [디버그] 모든 검증 통과, 전송 시작');

    const submitBtn = document.getElementById('submitRequestBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = '제출 중...';

    // 디버깅: 사진 데이터 확인
    console.log('📸 [프론트엔드] capturedPhotoData 확인:', capturedPhotoData ? `있음 (길이: ${capturedPhotoData.length} bytes)` : '없음');
    console.log('👤 [프론트엔드] selectedPerson:', selectedPerson || '없음');

    const dataToSend = {
        action: 'submitAttendanceRequest',
        name: name,
        team: team,
        season: currentSeason.season,
        latitude: userPosition ? userPosition.latitude : '',
        longitude: userPosition ? userPosition.longitude : '',
        reason: reason,
        deviceId: deviceId || 'unknown', // 📱 기기 고유 식별자
        photoData: capturedPhotoData, // 📸 사진 데이터 (Base64)
        selectedPerson: selectedPerson // 👤 선택한 동료 이름
    };

    console.log('📦 [프론트엔드] 전송할 데이터:', {
        action: dataToSend.action,
        name: dataToSend.name,
        team: dataToSend.team,
        season: dataToSend.season,
        reason: dataToSend.reason,
        photoDataLength: dataToSend.photoData ? dataToSend.photoData.length : 0,
        selectedPerson: dataToSend.selectedPerson
    });

    // POST 방식으로 전송 (이미지 데이터가 크므로)
    // 헤더 없이 전송하여 CORS preflight 완전히 회피
    fetch(CONFIG.GAS_URL, {
        method: 'POST',
        body: JSON.stringify(dataToSend)
    })
    .then(response => response.json())
    .then(data => {
        // 백엔드 로그를 콘솔에 출력
        if (data.logs && data.logs.length > 0) {
            console.log('🔍 [백엔드 로그 시작] ====================================');
            data.logs.forEach(log => console.log(log));
            console.log('🔍 [백엔드 로그 끝] ====================================');
        }

        if (data.success) {
            console.log('✅ [출석 요청 성공]', data);
            showMessage('✅ 출석 요청이 제출되었습니다. 관리자 승인을 기다려주세요.', 'success');
            hideRequestModal();
        } else {
            console.error('❌ [출석 요청 실패]', data);
            showMessage('❌ ' + (data.message || '요청 제출에 실패했습니다.'), 'error');
        }
        submitBtn.disabled = false;
        submitBtn.textContent = '요청 제출';
    })
    .catch((error) => {
        console.error('출석 요청 에러:', error);
        showMessage('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = '요청 제출';
    });
}

// ==================== 명예의 전당 ====================

/**
 * 명예의 전당 데이터를 서버에서 불러와 표시합니다.
 */
function loadHallOfFame(forceReload = false) {
    const container = document.getElementById('hallOfFameContent');

    // 1. 강제 새로고침이 아니면 캐시 확인
    if (!forceReload) {
        const cached = CacheManager.get(CacheManager.KEYS.HALL_OF_FAME);
        if (cached) {
            console.log('✅ 명예의 전당 캐시에서 로드');
            displayHallOfFame(cached);
            hallOfFameLoaded = true;
            return;
        }
    }

    // 2. 캐시 없거나 강제 새로고침 시 서버에서 로드
    console.log('📡 명예의 전당 서버에서 로드 중...');

    // 로딩 중 표시
    container.innerHTML = `
        <div style="text-align: center; padding: 40px;">
            <div style="display: inline-block; width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #667eea; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <p style="margin-top: 15px; color: #666;">명예의 전당을 불러오는 중...</p>
        </div>
        <style>
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    `;

    const requestUrl = `${CONFIG.GAS_URL}?action=getHallOfFame`;
    console.log('🔗 요청 URL:', requestUrl);

    $.ajax({
        url: requestUrl,
        dataType: 'jsonp',
        success: function(data) {
            console.log('명예의 전당 응답:', data);

            if (data && data.success && data.hallOfFame !== undefined) {
                displayHallOfFame(data.hallOfFame);

                // 캐시에 저장 (10분 TTL)
                CacheManager.set(CacheManager.KEYS.HALL_OF_FAME, data.hallOfFame);

                if (!forceReload) {
                    hallOfFameLoaded = true;
                }
            } else {
                console.error('명예의 전당 로딩 실패:', data);
                const errorMsg = data && data.message ? data.message : '명예의 전당을 불러오는데 실패했습니다.';
                container.innerHTML = `<p class="text-danger">${errorMsg}</p>`;
            }
        },
        error: function(jqXHR, textStatus, errorThrown) {
            console.error('명예의 전당 로딩 에러:', textStatus, errorThrown);
            container.innerHTML = '<p class="text-danger">네트워크 오류가 발생했습니다.</p>';
        }
    });
}

// 명예의 전당 데이터 저장 (팝업에서 사용)
let hallOfFameData = [];

/**
 * 명예의 전당 데이터를 화면에 표시
 */
function displayHallOfFame(hallOfFame) {
    const container = document.getElementById('hallOfFameContent');
    hallOfFameData = hallOfFame; // 팝업용 데이터 저장

    if (hallOfFame.length === 0) {
        container.innerHTML = `
            <div class="hall-of-fame-empty">
                <p>🏆 아직 우승 기록이 없습니다.</p>
                <p class="text-secondary">정기전에서 우승하면 이곳에 기록됩니다!</p>
            </div>
        `;
        return;
    }

    let html = '<div class="hall-of-fame-rankings">';

    hallOfFame.forEach((player, index) => {
        // 순위별 메달/아이콘
        let rankIcon = '';
        let rankClass = '';

        if (player.rank === 1) {
            rankIcon = '🥇';
            rankClass = 'gold';
        } else if (player.rank === 2) {
            rankIcon = '🥈';
            rankClass = 'silver';
        } else if (player.rank === 3) {
            rankIcon = '🥉';
            rankClass = 'bronze';
        } else {
            rankIcon = `<span class="rank-number">${player.rank}</span>`;
            rankClass = '';
        }

        // 우승 시즌 정보 포맷팅 (최대 8개까지만 표시)
        const seasonsText = formatSeasons(player.seasons, 8);

        html += `
            <div class="hall-of-fame-item ${rankClass}" onclick="showHallOfFameDetail(${index})" style="cursor: pointer;">
                <div class="rank-badge">${rankIcon}</div>
                <div class="player-info">
                    <div class="player-name-row">
                        <span class="player-name">${player.name}</span>
                        <span class="win-count">${player.wins}회</span>
                    </div>
                    <div class="season-tags">${seasonsText}</div>
                </div>
                <div class="detail-arrow">›</div>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}

/**
 * 우승 시즌 정보를 압축 형식으로 포맷팅
 * 예: [{season: "2024상반기", team: "A팀"}] -> "24상(A)"
 * @param {Array} seasons - 시즌 배열
 * @param {number} maxDisplay - 최대 표시 개수 (null이면 전체 표시)
 */
function formatSeasons(seasons, maxDisplay = null) {
    if (!seasons || seasons.length === 0) return '';

    const displaySeasons = maxDisplay ? seasons.slice(0, maxDisplay) : seasons;
    const remaining = maxDisplay ? seasons.length - maxDisplay : 0;

    let html = displaySeasons.map(s => {
        // 시즌 문자열 또는 객체 처리
        if (typeof s === 'string') {
            // 구버전 호환 (시즌만 있는 경우)
            return `<span class="season-tag">${shortenSeason(s)}</span>`;
        } else {
            // 새버전 (시즌 + 팀)
            const shortSeason = shortenSeason(s.season);
            const shortTeam = shortenTeam(s.team);
            return `<span class="season-tag">${shortSeason}(${shortTeam})</span>`;
        }
    }).join('');

    // 8개 초과 시 +N 표시
    if (remaining > 0) {
        html += `<span class="season-tag more">+${remaining}</span>`;
    }

    return html;
}

/**
 * 시즌명 압축 (2024상반기 -> 24상)
 */
function shortenSeason(season) {
    if (!season) return '';
    // 다양한 양식 지원: "2026상반기", "2026 상반기", "26년 상반기" → "26상"
    const match = String(season).match(/(\d{2,4})\s*년?\s*(상|하)/);
    if (match) {
        const year = match[1].slice(-2); // 끝 2자리
        const half = match[2];
        return `${year}${half}`;
    }
    return season;
}

/**
 * 팀명 압축 (A팀 -> A)
 */
function shortenTeam(team) {
    if (!team) return '';
    return team.replace('팀', '');
}

/**
 * 명예의 전당 상세 팝업 표시
 */
function showHallOfFameDetail(index) {
    const player = hallOfFameData[index];
    if (!player) return;

    const modal = document.getElementById('hallOfFameDetailModal');
    if (!modal) return;

    // 순위 아이콘
    let rankIcon = '';
    if (player.rank === 1) rankIcon = '🥇';
    else if (player.rank === 2) rankIcon = '🥈';
    else if (player.rank === 3) rankIcon = '🥉';
    else rankIcon = `${player.rank}위`;

    // 전체 시즌 정보 (제한 없이)
    const allSeasonsText = formatSeasons(player.seasons, null);

    // 모달 콘텐츠 업데이트
    document.getElementById('hofDetailRank').textContent = rankIcon;
    document.getElementById('hofDetailName').textContent = player.name;
    document.getElementById('hofDetailWins').textContent = `${player.wins}회 우승`;
    document.getElementById('hofDetailSeasons').innerHTML = allSeasonsText;

    modal.style.display = 'flex';
}

/**
 * 명예의 전당 상세 팝업 숨기기
 */
function hideHallOfFameDetail() {
    const modal = document.getElementById('hallOfFameDetailModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// 명예의 전당 팝업 이벤트 리스너
window.addEventListener('DOMContentLoaded', () => {
    const hofModal = document.getElementById('hallOfFameDetailModal');
    const hofCloseBtn = document.getElementById('closeHofDetailModal');

    if (hofCloseBtn) {
        hofCloseBtn.addEventListener('click', hideHallOfFameDetail);
    }

    if (hofModal) {
        hofModal.addEventListener('click', (e) => {
            if (e.target === hofModal) {
                hideHallOfFameDetail();
            }
        });
    }
});
