/**
 * 풋살 동호회 출석 시스템 - 관리자 페이지 (admin.js)
 * * 기능:
 * 1. 관리자 인증 상태 확인 및 비밀번호 설정/변경/해제
 * 2. 카카오 지도 API를 사용한 출석 위치 설정 및 저장
 * 3. 현재 출석 현황 및 회원 목록 표시 (GET 요청)
 */

// ==================== 설정 ====================

// Google Apps Script 배포 URL로 변경해야 합니다.
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxjmvZWEErrnhyGtgyhrpBAoy8lF_Cw7V9bJNgTBCRQKeFrkROu-tp43uAcSEu9VxBd/exec';

// 인증 토큰 유효 시간 (30분)
const AUTH_TOKEN_DURATION = 30 * 60 * 1000; 

// 카카오 지도 API의 클라이언트 키 (admin.js 파일의 HTML에 스크립트 태그로 포함되어야 함)
// let map; // 전역 변수 지도 객체 (HTML에서 초기화될 예정)
// let marker; // 전역 변수 마커 객체 (HTML에서 초기화될 예정)


// ==================== 탭 상태 관리 ====================

// 각 탭의 로딩 상태 추적
const tabLoadState = {
    location: false,
    qrcode: false,
    members: false,
    settings: false
};

// ==================== 인증 토큰 관리 ====================

/**
 * 인증 토큰을 sessionStorage에 저장
 */
function setAuthToken() {
    const tokenData = {
        timestamp: Date.now()
    };
    sessionStorage.setItem('adminAuthToken', JSON.stringify(tokenData));
    console.log('✅ 인증 토큰 저장됨');
}

/**
 * 인증 토큰이 유효한지 확인
 */
function isAuthTokenValid() {
    const tokenStr = sessionStorage.getItem('adminAuthToken');
    if (!tokenStr) {
        console.log('❌ 인증 토큰 없음');
        return false;
    }

    try {
        const tokenData = JSON.parse(tokenStr);
        const elapsed = Date.now() - tokenData.timestamp;

        if (elapsed > AUTH_TOKEN_DURATION) {
            console.log('❌ 인증 토큰 만료 (경과 시간:', Math.floor(elapsed / 60000), '분)');
            sessionStorage.removeItem('adminAuthToken');
            return false;
        }

        console.log('✅ 인증 토큰 유효 (남은 시간:', Math.floor((AUTH_TOKEN_DURATION - elapsed) / 60000), '분)');
        return true;
    } catch (error) {
        console.error('❌ 인증 토큰 파싱 오류:', error);
        sessionStorage.removeItem('adminAuthToken');
        return false;
    }
}

/**
 * 인증 토큰 제거
 */
function clearAuthToken() {
    sessionStorage.removeItem('adminAuthToken');
    console.log('🗑️ 인증 토큰 제거됨');
}

// ==================== 유틸리티 ====================

/**
 * GAS 서버에 JSONP 요청을 보내는 범용 함수
 * @param {string} action - 실행할 Apps Script 함수 (액션)
 * @param {object} params - 요청에 포함할 파라미터 객체
 * @returns {Promise} - 서버 응답 결과를 resolve 하는 프로미스
 */
function requestGas(action, params = {}) {
    return new Promise((resolve, reject) => {
        const callbackName = 'jsonpCallback_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        let timeoutId;

        // 정리 함수
        const cleanup = () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            const script = document.getElementById(callbackName);
            if (script) {
                script.remove();
            }
            delete window[callbackName];
        };

        // 콜백 함수를 전역 범위에 등록
        window[callbackName] = (response) => {
            cleanup();

            if (response && response.success) {
                resolve(response);
            } else {
                reject(response?.message || '서버 오류가 발생했습니다.');
            }
        };

        // 타임아웃 설정 (10초)
        timeoutId = setTimeout(() => {
            cleanup();
            reject('요청 시간이 초과되었습니다. 네트워크 상태를 확인해주세요.');
        }, 10000);

        const url = new URL(GAS_URL);
        url.searchParams.append('action', action);
        url.searchParams.append('callback', callbackName);

        for (const key in params) {
            if (params[key] !== undefined && params[key] !== null) {
                url.searchParams.append(key, params[key]);
            }
        }

        // 스크립트 태그를 생성하여 JSONP 요청
        const script = document.createElement('script');
        script.src = url.toString();
        script.id = callbackName;

        // 오류 처리
        script.onerror = () => {
            cleanup();
            reject('네트워크 연결 또는 서버 응답에 실패했습니다.');
        };

        document.head.appendChild(script);
    });
}

/**
 * QR 코드를 생성하고 표시합니다.
 */
function generateQRCode() {
    const urlInput = document.getElementById('attendanceUrl');
    const url = urlInput.value;

    if (!url) {
        alert('출석 URL이 설정되지 않았습니다.');
        return;
    }

    const qrCodeContainer = document.getElementById('qrcode');
    if (qrCodeContainer) {
        // 기존 QR 코드 제거
        qrCodeContainer.innerHTML = '';

        // 새 QR 코드 생성
        window.qrCodeInstance = new QRCode(qrCodeContainer, {
            text: url,
            width: 200,
            height: 200,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });

        // 다운로드 버튼 표시
        document.getElementById('downloadQRBtn').style.display = 'inline-block';

        console.log('✅ QR 코드 생성 완료:', url);
    }
}

/**
 * QR 코드를 이미지 파일로 다운로드합니다.
 */
function downloadQRCode() {
    const qrCodeContainer = document.getElementById('qrcode');
    const canvas = qrCodeContainer.querySelector('canvas');

    if (!canvas) {
        alert('QR 코드를 먼저 생성해주세요.');
        return;
    }

    try {
        // Canvas를 이미지로 변환
        const imageData = canvas.toDataURL('image/png');

        // 다운로드 링크 생성
        const downloadLink = document.createElement('a');
        downloadLink.href = imageData;
        downloadLink.download = '출석체크_QR코드.png';

        // 다운로드 실행
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        console.log('✅ QR 코드 다운로드 완료');
    } catch (error) {
        console.error('❌ QR 코드 다운로드 오류:', error);
        alert('QR 코드 다운로드 중 오류가 발생했습니다.');
    }
}


// ==================== 인증 관리 ====================

/**
 * 페이지 로드 시 인증 확인 및 관리자 페이지 초기화
 */
async function checkAndInitAdmin() {
    console.log('🔐 관리자 페이지 인증 확인');

    // 1. 토큰이 유효한지 확인
    if (isAuthTokenValid()) {
        console.log('✅ 유효한 토큰 있음 - 바로 페이지 로드');
        await loadAdminData();
        return;
    }

    // 2. 토큰이 없거나 만료됨 - 비밀번호 확인 필요
    console.log('🔑 인증 필요 - 모달 표시');
    showAuthModal();
}

/**
 * 인증 모달 표시
 */
function showAuthModal() {
    const modal = document.getElementById('adminAuthModal');
    modal.style.display = 'flex';
    document.getElementById('adminPassword').focus();
}

/**
 * 인증 모달 숨기기
 */
function hideAuthModal() {
    const modal = document.getElementById('adminAuthModal');
    modal.style.display = 'none';
    document.getElementById('adminPassword').value = '';
    document.getElementById('adminAuthMessage').textContent = '';
}

/**
 * 비밀번호 인증 시도
 */
async function attemptAuth() {
    const password = document.getElementById('adminPassword').value.trim();
    const messageEl = document.getElementById('adminAuthMessage');

    if (!password) {
        messageEl.textContent = '비밀번호를 입력해주세요.';
        messageEl.className = 'message-area error';
        return;
    }

    if (password.length !== 4 || isNaN(password)) {
        messageEl.textContent = '비밀번호는 4자리 숫자입니다.';
        messageEl.className = 'message-area error';
        return;
    }

    try {
        messageEl.textContent = '인증 중...';
        messageEl.className = 'message-area';

        const response = await requestGas('authenticateAdmin', { password: password });

        if (response.isAuthenticated) {
            console.log('✅ 인증 성공');
            messageEl.textContent = '인증 성공!';
            messageEl.className = 'message-area success';

            // 토큰 저장
            setAuthToken();

            // 모달 숨기고 페이지 로드
            setTimeout(async () => {
                hideAuthModal();
                await loadAdminData();
            }, 500);
        } else {
            console.log('❌ 인증 실패');
            messageEl.textContent = '비밀번호가 일치하지 않습니다.';
            messageEl.className = 'message-area error';
            document.getElementById('adminPassword').value = '';
            document.getElementById('adminPassword').focus();
        }
    } catch (error) {
        console.error('❌ 인증 오류:', error);
        messageEl.textContent = '인증 중 오류가 발생했습니다: ' + error;
        messageEl.className = 'message-area error';
    }
}

/**
 * 관리자 비밀번호 설정/변경/해제 처리
 */
async function setAdminPassword() {
    const newPassword = document.getElementById('newPassword').value;

    // 비밀번호 해제
    if (newPassword === "") {
        if (!confirm('비밀번호를 해제하시겠습니까? 해제 시 누구나 접근 가능합니다.')) {
            return;
        }
    } else if (newPassword.length !== 4 || isNaN(newPassword)) {
        alert('비밀번호는 4자리 숫자로 입력해야 합니다.');
        return;
    }

    try {
        const response = await requestGas('setAdminPassword', { newPassword: newPassword });

        if (response.success) {
            alert(newPassword === "" ? '비밀번호가 해제되었습니다.' : '비밀번호가 설정/변경되었습니다.');
            document.getElementById('newPassword').value = '';
        } else {
            alert('비밀번호 설정에 실패했습니다.');
        }
    } catch (error) {
        alert('비밀번호 설정 중 오류가 발생했습니다: ' + error);
    }
}

/**
 * 출석 시간 설정 저장
 */
async function saveAttendanceTime() {
    const startHour = document.getElementById('attendanceStartHour').value;
    const startMinute = document.getElementById('attendanceStartMinute').value;
    const lateHour = document.getElementById('lateThresholdHour').value;
    const lateMinute = document.getElementById('lateThresholdMinute').value;
    const messageEl = document.getElementById('attendanceTimeMessage');

    // 입력 검증
    if (!startHour || !startMinute) {
        messageEl.textContent = '출석 시작 시간을 모두 선택해주세요.';
        messageEl.className = 'message-area error';
        return;
    }

    if (!lateHour || !lateMinute) {
        messageEl.textContent = '지각 기준 시간을 모두 선택해주세요.';
        messageEl.className = 'message-area error';
        return;
    }

    // HH:mm 형식으로 변환
    const startTime = `${startHour}:${startMinute}`;
    const lateTime = `${lateHour}:${lateMinute}`;

    // 시간 검증: 지각 기준 시간이 출석 시작 시간보다 늦어야 함
    if (startTime >= lateTime) {
        messageEl.textContent = '지각 기준 시간은 출석 시작 시간보다 늦어야 합니다.';
        messageEl.className = 'message-area error';
        return;
    }

    try {
        const response = await requestGas('saveAttendanceTime', {
            startTime: startTime,
            lateTime: lateTime
        });

        if (response.success) {
            messageEl.textContent = '✅ 출석 시간 설정이 저장되었습니다.';
            messageEl.className = 'message-area success';

            // 현재 설정 표시 업데이트
            updateCurrentTimeDisplay(startTime, lateTime);

            // 3초 후 메시지 제거
            setTimeout(() => {
                messageEl.textContent = '';
                messageEl.className = 'message-area';
            }, 3000);
        } else {
            messageEl.textContent = '❌ 저장에 실패했습니다: ' + (response.message || '알 수 없는 오류');
            messageEl.className = 'message-area error';
        }
    } catch (error) {
        messageEl.textContent = '❌ 저장 중 오류가 발생했습니다: ' + error;
        messageEl.className = 'message-area error';
    }
}

/**
 * 시간 값을 HH:mm 형식 문자열로 변환
 * @param {string|Date} timeValue - 시간 값 (문자열 또는 날짜 객체)
 * @returns {string|null} - HH:mm 형식 문자열 또는 null
 */
function formatTimeValue(timeValue) {
    if (!timeValue) return null;

    // 이미 HH:mm 형식인 경우
    if (typeof timeValue === 'string' && /^\d{1,2}:\d{2}$/.test(timeValue)) {
        // 한 자리 시간을 두 자리로 변환 (예: "9:30" -> "09:30")
        const [hour, minute] = timeValue.split(':');
        return `${hour.padStart(2, '0')}:${minute}`;
    }

    // 날짜 객체인 경우 또는 날짜 문자열인 경우
    try {
        const date = new Date(timeValue);
        if (!isNaN(date.getTime())) {
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${hours}:${minutes}`;
        }
    } catch (e) {
        console.error('시간 형식 변환 오류:', e);
    }

    return null;
}

/**
 * 기존 출석 기록의 지각 여부 재계산
 */
async function recalculateLateStatus() {
    const messageEl = document.getElementById('recalculateMessage');
    const btn = document.getElementById('recalculateLateBtn');

    // 확인 메시지
    if (!confirm('기존 출석 기록의 지각 여부를 현재 지각 기준 시간에 따라 다시 계산합니다.\n계속하시겠습니까?')) {
        return;
    }

    try {
        btn.disabled = true;
        btn.textContent = '⏳ 재계산 중...';
        messageEl.textContent = '';
        messageEl.className = 'message-area';

        const response = await requestGas('recalculateLateStatus');

        if (response.success) {
            const { totalProcessed, updatedCount } = response.data;
            messageEl.textContent = `✅ 재계산 완료!\n총 ${totalProcessed}개 기록 중 ${updatedCount}개 업데이트됨`;
            messageEl.className = 'message-area success';

            // 3초 후 메시지 제거
            setTimeout(() => {
                messageEl.textContent = '';
                messageEl.className = 'message-area';
            }, 5000);
        } else {
            messageEl.textContent = '❌ ' + (response.message || '재계산에 실패했습니다.');
            messageEl.className = 'message-area error';
        }
    } catch (error) {
        messageEl.textContent = '❌ 재계산 중 오류가 발생했습니다: ' + error;
        messageEl.className = 'message-area error';
    } finally {
        btn.disabled = false;
        btn.textContent = '🔄 지각 여부 재계산';
    }
}

/**
 * 현재 설정 표시 업데이트
 */
function updateCurrentTimeDisplay(startTime, lateTime) {
    const currentStartTimeEl = document.getElementById('currentStartTime');
    const currentLateTimeEl = document.getElementById('currentLateTime');

    const formattedStartTime = formatTimeValue(startTime);
    const formattedLateTime = formatTimeValue(lateTime);

    if (formattedStartTime) {
        currentStartTimeEl.textContent = formattedStartTime;
        currentStartTimeEl.classList.remove('not-set');
    } else {
        currentStartTimeEl.textContent = '설정되지 않음';
        currentStartTimeEl.classList.add('not-set');
    }

    if (formattedLateTime) {
        currentLateTimeEl.textContent = formattedLateTime;
        currentLateTimeEl.classList.remove('not-set');
    } else {
        currentLateTimeEl.textContent = '설정되지 않음';
        currentLateTimeEl.classList.add('not-set');
    }
}

/**
 * 출석 시간 설정 불러오기
 */
async function loadAttendanceTime() {
    try {
        console.log('⏰ 출석 시간 설정 로드 시작...');
        const response = await requestGas('getAttendanceTime');

        console.log('✅ 출석 시간 설정 응답:', response);

        if (response.success && response.attendanceTime) {
            const { startTime, lateTime } = response.attendanceTime;

            // 현재 설정 표시 업데이트
            updateCurrentTimeDisplay(startTime, lateTime);

            // 드롭다운에 값 설정 (포맷 변환 적용)
            const formattedStartTime = formatTimeValue(startTime);
            const formattedLateTime = formatTimeValue(lateTime);

            if (formattedStartTime) {
                const [startHour, startMinute] = formattedStartTime.split(':');
                document.getElementById('attendanceStartHour').value = startHour;
                document.getElementById('attendanceStartMinute').value = startMinute;
            }

            if (formattedLateTime) {
                const [lateHour, lateMinute] = formattedLateTime.split(':');
                document.getElementById('lateThresholdHour').value = lateHour;
                document.getElementById('lateThresholdMinute').value = lateMinute;
            }

            console.log('✅ 출석 시간 설정 로드 완료');
        } else {
            // 설정이 없을 때
            console.log('ℹ️ 출석 시간 설정이 없습니다.');
            updateCurrentTimeDisplay(null, null);
        }
    } catch (error) {
        console.error('❌ 출석 시간 설정 로드 오류:', error);
        updateCurrentTimeDisplay(null, null);

        // 사용자에게 오류 표시
        const messageEl = document.getElementById('attendanceTimeMessage');
        if (messageEl) {
            messageEl.textContent = '⚠️ 설정을 불러오는 중 오류가 발생했습니다: ' + error;
            messageEl.className = 'message-area error';
            setTimeout(() => {
                messageEl.textContent = '';
                messageEl.className = 'message-area';
            }, 5000);
        }
    }
}

/**
 * 출석 가능 요일 설정 저장
 */
async function saveAttendanceDays() {
    const checkboxes = document.querySelectorAll('.attendance-day-checkbox:checked');
    const selectedDays = Array.from(checkboxes).map(cb => String(cb.value));
    const messageEl = document.getElementById('attendanceDaysMessage');

    console.log('저장할 요일:', selectedDays);

    try {
        // 빈 배열이면 빈 문자열, 아니면 쉼표로 연결
        const daysString = selectedDays.length > 0 ? selectedDays.join(',') : '';

        const response = await requestGas('saveAttendanceDays', {
            days: daysString
        });

        if (response.success) {
            messageEl.textContent = selectedDays.length > 0
                ? '✅ 출석 가능 요일 설정이 저장되었습니다.'
                : '✅ 모든 요일에 출석 가능하도록 설정되었습니다.';
            messageEl.className = 'message-area success';
        } else {
            messageEl.textContent = '❌ 저장에 실패했습니다: ' + (response.message || '알 수 없는 오류');
            messageEl.className = 'message-area error';
        }
    } catch (error) {
        messageEl.textContent = '❌ 저장 중 오류가 발생했습니다: ' + error;
        messageEl.className = 'message-area error';
    }
}

/**
 * 출석 가능 요일 설정 불러오기
 */
async function loadAttendanceDays() {
    try {
        console.log('📅 출석 가능 요일 설정 로드 시작...');
        const response = await requestGas('getAttendanceDays');

        console.log('✅ 출석 가능 요일 응답:', response);

        // 모든 체크박스 초기화
        document.querySelectorAll('.attendance-day-checkbox').forEach(cb => {
            cb.checked = false;
        });

        if (response.success && response.attendanceDays !== undefined) {
            // 문자열로 강제 변환 (타입 에러 방지)
            const daysString = String(response.attendanceDays || '');

            console.log('📅 저장된 요일 문자열:', daysString);

            // 저장된 요일 체크
            if (daysString && daysString.trim() !== '') {
                const days = daysString.split(',').map(d => String(d).trim()).filter(d => d !== '');
                console.log('📅 파싱된 요일 배열:', days);

                days.forEach(day => {
                    const checkbox = document.querySelector(`.attendance-day-checkbox[value="${day}"]`);
                    if (checkbox) {
                        checkbox.checked = true;
                        console.log('✅ 요일 로드:', day, '체크됨');
                    } else {
                        console.warn('⚠️ 요일 체크박스를 찾을 수 없음:', day);
                    }
                });
            } else {
                console.log('ℹ️ 설정된 요일 없음 (모든 요일 허용)');
            }

            console.log('✅ 출석 가능 요일 설정 로드 완료');
        } else {
            console.log('ℹ️ 출석 가능 요일 설정이 없습니다.');
        }
    } catch (error) {
        console.error('❌ 출석 가능 요일 설정 로드 오류:', error);

        // 사용자에게 오류 표시
        const messageEl = document.getElementById('attendanceDaysMessage');
        if (messageEl) {
            messageEl.textContent = '⚠️ 설정을 불러오는 중 오류가 발생했습니다: ' + error;
            messageEl.className = 'message-area error';
            setTimeout(() => {
                messageEl.textContent = '';
                messageEl.className = 'message-area';
            }, 5000);
        }
    }
}

/**
 * 비밀번호 관리 팝업 열기 (설정된 비밀번호를 변경/해제할 때 사용)
 */
function openPasswordManagementModal() {
    document.getElementById('admin-auth-title').textContent = '관리자 비밀번호 변경/해제';
    document.getElementById('password-action').textContent = '변경/해제 실행';
    document.getElementById('current-password-group').style.display = 'none'; // 현재 비밀번호 확인은 GAS에서 별도로 처리할 수도 있지만, 여기서는 단순화
    document.getElementById('new-password').value = '';
    
    const actionButton = document.getElementById('password-action');
    actionButton.onclick = setAdminPassword;
    
    document.getElementById('adminAuthModal').style.display = 'block';
}


// ==================== 지도 및 위치 관리 ====================

/**
 * 저장된 출석 위치를 불러와 지도에 표시하고, 위치 설정 정보를 업데이트합니다. - 캐싱 적용
 */
async function loadLocation() {
    try {
        // 1. 캐시 확인
        let location = CacheManager.get(CacheManager.KEYS.LOCATION);

        if (!location) {
            console.log('📡 위치 정보 서버에서 로드 중...');
            const response = await requestGas('getLocation');
            location = response.location;

            // 캐시에 저장 (1시간 TTL)
            if (location) {
                CacheManager.set(CacheManager.KEYS.LOCATION, location);
            }
        } else {
            console.log('✅ 위치 정보 캐시에서 로드');
        }

        if (location) {
            const lat = location.latitude;
            const lon = location.longitude;
            const name = location.name;

            // 1. 입력 필드 업데이트
            document.getElementById('latitude').value = lat;
            document.getElementById('longitude').value = lon;
            document.getElementById('locationName').value = name;

            // 2. 표시 영역 업데이트
            document.getElementById('currentLocation').textContent =
                `${name} (위도: ${lat}, 경도: ${lon})`;

            // 3. 지도가 이미 초기화되어 있다면 마커 위치 업데이트
            if (window.map && window.marker) {
                const moveLatLon = new kakao.maps.LatLng(lat, lon);
                window.map.setCenter(moveLatLon);
                window.marker.setPosition(moveLatLon);
            }

        } else {
            document.getElementById('currentLocation').textContent =
                '⚠️ 출석 위치가 설정되지 않았습니다.';
        }

    } catch (error) {
        console.error('위치 불러오기 오류:', error);
        document.getElementById('currentLocation').textContent =
            '위치 정보를 불러오는 데 실패했습니다.';
    }
}

/**
 * 현재 지도상의 마커 위치를 GAS 서버에 저장합니다.
 */
async function saveLocation() {
    const position = window.marker.getPosition();
    const lat = position.getLat();
    const lon = position.getLng();
    const name = document.getElementById('locationName').value.trim();

    if (!name) {
        alert('장소명을 입력해주세요.');
        return;
    }
    
    if (!confirm(`위도: ${lat}, 경도: ${lon}을 출석 위치로 저장하시겠습니까?`)) {
        return;
    }

    try {
        const response = await requestGas('saveLocation', {
            latitude: lat,
            longitude: lon,
            name: name
        });

        if (response.success) {
            // 캐시 무효화
            CacheManager.remove(CacheManager.KEYS.LOCATION);

            alert('출석 위치가 성공적으로 저장되었습니다!');
            loadLocation(); // 저장 후 새로고침
        } else {
            alert('위치 저장에 실패했습니다: ' + response.message);
        }
    } catch (error) {
        alert('위치 저장 중 오류가 발생했습니다: ' + error);
    }
}


// ==================== 데이터 로드 및 표시 ====================

/**
 * 관리자 페이지의 초기 데이터를 로드합니다 (위치설정 탭만).
 */
async function loadAdminData() {
    console.log('🚀 관리자 데이터 로딩 시작');

    // 탭 초기화
    initializeTabs();

    // 1. 위치 정보 로드 (첫 번째 탭이므로 바로 로드)
    await loadLocationTab();

    console.log('✅ 초기 데이터 로딩 완료');
}

/**
 * 위치설정 탭 데이터 로드
 */
async function loadLocationTab() {
    if (tabLoadState.location) return;

    await loadLocation();
    tabLoadState.location = true;
}

/**
 * QR코드 탭 데이터 로드
 */
function loadQRCodeTab() {
    if (tabLoadState.qrcode) return;

    // 출석 페이지 URL 설정 및 표시
    const attendanceUrl = window.location.origin + window.location.pathname.replace('admin.html', 'index.html');
    document.getElementById('attendanceUrl').value = attendanceUrl;

    // QR 코드 자동 생성
    generateQRCode();

    tabLoadState.qrcode = true;
}

/**
 * 회원목록 탭 데이터 로드
 */
async function loadMembersTab(forceReload = false) {
    if (tabLoadState.members && !forceReload) return;

    const container = document.getElementById('membersList');

    // 로딩 인디케이터 표시
    container.innerHTML = `
        <div style="text-align: center; padding: 40px;">
            <div style="display: inline-block; width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #667eea; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <p style="margin-top: 15px; color: #666;">회원 목록을 불러오는 중...</p>
        </div>
        <style>
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    `;

    await loadMembers();

    if (!forceReload) {
        tabLoadState.members = true;
    }
}

/**
 * 설정 탭 데이터 로드
 */
async function loadSettingsTab() {
    console.log('⚙️ 설정 탭 데이터 로드 시작...');

    try {
        // 출석 시간 설정 및 요일 설정 항상 로드 (최신 데이터 표시)
        await Promise.all([
            loadAttendanceTime(),
            loadAttendanceDays()
        ]);

        console.log('✅ 설정 탭 데이터 로드 완료');
    } catch (error) {
        console.error('❌ 설정 탭 데이터 로드 오류:', error);
    }
}

/**
 * 전체 회원 목록을 서버에서 불러와 테이블에 표시합니다. - 캐싱 적용
 */
async function loadMembers() {
    const container = document.getElementById('membersList');

    try {
        // 1. 캐시 확인
        let members = CacheManager.get(CacheManager.KEYS.MEMBERS);

        if (!members) {
            console.log('📡 회원 목록 서버에서 로드 중...');
            // 💡 GAS에서 캐싱된 회원 목록을 사용하므로, 속도가 빠릅니다.
            const response = await requestGas('getMembers');
            members = response.members;

            // 캐시에 저장 (10분 TTL)
            CacheManager.set(CacheManager.KEYS.MEMBERS, members);
        } else {
            console.log('✅ 회원 목록 캐시에서 로드');
        }

        if (members.length === 0) {
            container.innerHTML = '<p class="text-secondary">등록된 회원 목록이 없습니다.</p>';
            return;
        }

        let html = `
            <table class="table table-striped">
                <thead>
                    <tr>
                        <th>이름</th>
                        <th>상반기 팀</th>
                        <th>하반기 팀</th>
                        <th>총 출석수</th>
                        <th>최초 등록일</th>
                    </tr>
                </thead>
                <tbody>
        `;

        // 총 출석수를 기준으로 내림차순 정렬
        members.sort((a, b) => b.attendanceCountTotal - a.attendanceCountTotal);

        members.forEach(member => {
            // attendanceCountTotal은 GAS에서 캐시된 객체에 추가된 필드명입니다.
            const count = member.attendanceCountTotal !== undefined ? member.attendanceCountTotal : member.attendanceCount;
            const firstHalfTeam = member.firstHalfTeam || '';
            const secondHalfTeam = member.secondHalfTeam || '';
            html += `
                <tr>
                    <td>${member.name}</td>
                    <td>${firstHalfTeam}</td>
                    <td>${secondHalfTeam}</td>
                    <td>${count}회</td>
                    <td>${member.firstDate}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;

    } catch (error) {
        container.innerHTML = `<p class="text-danger">회원 목록 로드 실패: ${error}</p>`;
        console.error('회원 목록 로드 오류:', error);
    }
}


// ==================== 장소 검색 기능 ====================

/**
 * 카카오맵 Places API를 사용하여 장소를 검색합니다.
 */
function searchPlaces() {
    const keyword = document.getElementById('mapSearch').value.trim();

    if (!keyword) {
        alert('검색어를 입력해주세요.');
        return;
    }

    if (!window.map) {
        alert('지도가 아직 초기화되지 않았습니다. 잠시 후 다시 시도해주세요.');
        return;
    }

    // Places 서비스 객체 생성
    const ps = new kakao.maps.services.Places();

    // 키워드로 장소 검색
    ps.keywordSearch(keyword, (data, status) => {
        if (status === kakao.maps.services.Status.OK) {
            displaySearchResults(data);
        } else if (status === kakao.maps.services.Status.ZERO_RESULT) {
            alert('검색 결과가 없습니다.');
        } else {
            alert('검색 중 오류가 발생했습니다.');
        }
    });
}

/**
 * 검색 결과를 화면에 표시합니다.
 */
function displaySearchResults(places) {
    const resultsContainer = document.getElementById('searchResults');

    if (places.length === 0) {
        resultsContainer.innerHTML = '<p>검색 결과가 없습니다.</p>';
        return;
    }

    // 기존 내용 제거
    resultsContainer.innerHTML = '';

    const listDiv = document.createElement('div');
    listDiv.className = 'search-results-list';

    const title = document.createElement('h4');
    title.textContent = '🔍 검색 결과 (클릭하여 선택)';
    listDiv.appendChild(title);

    places.forEach((place, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'search-result-item';

        // data 속성으로 안전하게 데이터 저장
        itemDiv.dataset.lat = place.y;
        itemDiv.dataset.lng = place.x;
        itemDiv.dataset.name = place.place_name;

        const nameStrong = document.createElement('strong');
        nameStrong.textContent = `${index + 1}. ${place.place_name}`;

        const addressP = document.createElement('p');
        addressP.textContent = place.address_name;

        itemDiv.appendChild(nameStrong);
        itemDiv.appendChild(addressP);

        // 클릭 이벤트 리스너 추가
        itemDiv.addEventListener('click', function() {
            const lat = parseFloat(this.dataset.lat);
            const lng = parseFloat(this.dataset.lng);
            const name = this.dataset.name;
            selectPlace(lat, lng, name);
        });

        listDiv.appendChild(itemDiv);
    });

    resultsContainer.appendChild(listDiv);
}

/**
 * 검색 결과에서 선택한 장소로 지도와 마커를 이동합니다.
 */
function selectPlace(lat, lng, name) {
    console.log('📍 장소 선택:', { lat, lng, name });
    alert('장소 선택: ' + name); // 디버깅용

    // 입력 필드 업데이트
    const latInput = document.getElementById('latitude');
    const lngInput = document.getElementById('longitude');
    const nameInput = document.getElementById('locationName');

    console.log('입력 필드 찾기:', { latInput, lngInput, nameInput });

    if (latInput && lngInput && nameInput) {
        latInput.value = lat;
        lngInput.value = lng;
        nameInput.value = name;
        console.log('✅ 입력 필드 업데이트 완료');
        alert('입력 필드 업데이트 완료!'); // 디버깅용
    } else {
        console.error('❌ 입력 필드를 찾을 수 없습니다!');
        alert('입력 필드를 찾을 수 없습니다!'); // 디버깅용
    }

    // 지도와 마커가 있으면 위치 업데이트
    if (window.map && window.marker) {
        const position = new kakao.maps.LatLng(lat, lng);

        // 지도 중심 이동
        window.map.setCenter(position);

        // 마커 위치 이동
        window.marker.setPosition(position);

        console.log('✅ 지도 및 마커 위치 업데이트 완료');
    } else {
        console.warn('⚠️ 지도 또는 마커가 초기화되지 않았습니다.');
    }

    // 검색 결과 숨기기
    document.getElementById('searchResults').innerHTML = '';

    console.log(`✅ 선택 완료: ${name} (위도: ${lat}, 경도: ${lng})`);
}

/**
 * 사용자의 현재 위치를 가져와서 지도에 표시합니다.
 */
function getMyLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                const currentPosition = new kakao.maps.LatLng(lat, lng);

                // 지도 중심 이동
                window.map.setCenter(currentPosition);

                // 마커 위치 이동
                window.marker.setPosition(currentPosition);

                // 입력 필드 업데이트
                document.getElementById('latitude').value = lat;
                document.getElementById('longitude').value = lng;

                alert('현재 위치를 가져왔습니다.');
            },
            (error) => {
                alert('현재 위치를 가져올 수 없습니다: ' + error.message);
            }
        );
    } else {
        alert('이 브라우저는 위치 정보를 지원하지 않습니다.');
    }
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

    // 탭 별 데이터 지연 로딩
    switch(tabName) {
        case 'location':
            loadLocationTab();
            break;
        case 'qrcode':
            loadQRCodeTab();
            break;
        case 'members':
            loadMembersTab();
            break;
        case 'settings':
            // 설정 탭: 출석 시간 설정 및 요일 설정 로드
            loadSettingsTab();
            break;
    }
}

// ==================== 지도 UI 제어 ====================

/**
 * 주소 검색 버튼 클릭 시 지도 섹션을 열고 초기화합니다.
 */
async function openMapSearch() {
    const mapSection = document.getElementById('mapSearchSection');

    // 지도 섹션 표시
    mapSection.style.display = 'block';

    // 지도가 제대로 초기화되지 않았다면 초기화
    if (!window.map || typeof window.map.setCenter !== 'function') {
        try {
            console.log('🗺️ 지도 초기화 시작...');
            await initMapAsync();
            console.log('✅ 지도 초기화 완료');
        } catch (error) {
            console.error('❌ 지도 초기화 실패:', error);
            alert('지도를 불러오는데 실패했습니다. 페이지를 새로고침 후 다시 시도해주세요.');
            mapSection.style.display = 'none';
        }
    } else {
        // 이미 초기화된 지도가 있으면 크기 재조정
        try {
            // 카카오맵 v3는 relayout() 사용
            if (window.map.relayout && typeof window.map.relayout === 'function') {
                window.map.relayout();
            } else if (window.kakao && window.kakao.maps && window.kakao.maps.event) {
                // 카카오맵 v2는 event.trigger 사용
                window.kakao.maps.event.trigger(window.map, 'resize');
            }
        } catch (error) {
            console.warn('지도 크기 재조정 실패:', error);
        }

        // 현재 마커 위치로 지도 중심 이동
        if (window.marker && window.marker.getPosition) {
            try {
                const position = window.marker.getPosition();
                window.map.setCenter(position);
            } catch (error) {
                console.warn('마커 위치 이동 실패:', error);
            }
        }
    }
}

/**
 * 지도 닫기 버튼 클릭 시 지도 섹션을 숨깁니다.
 */
function closeMapSearch() {
    const mapSection = document.getElementById('mapSearchSection');
    mapSection.style.display = 'none';
}

// ==================== 지도 API 초기화 (Kakao Map) ====================

/**
 * 카카오 맵을 비동기로 초기화하고 마커를 설정합니다.
 * SDK가 완전히 로드될 때까지 대기한 후 초기화합니다.
 */
function initMapAsync() {
    return new Promise((resolve, reject) => {
        console.log('🗺️ 카카오맵 초기화 시작...');

        // 1. 지도 컨테이너 확인
        const mapContainer = document.getElementById('map');
        if (!mapContainer) {
            console.error('❌ 지도 컨테이너(#map)를 찾을 수 없습니다.');
            reject('지도 컨테이너 없음');
            return;
        }
        console.log('✅ 지도 컨테이너 확인됨:', mapContainer);

        // 2. 카카오맵 SDK가 로드될 때까지 대기 (최대 10초)
        let attempts = 0;
        const maxAttempts = 100; // 10초 (100 * 100ms)

        const waitForKakao = () => {
            attempts++;

            if (window.kakao && window.kakao.maps) {
                console.log('✅ 카카오맵 SDK 확인됨 (시도 횟수:', attempts, ')');
                initializeMap(mapContainer, resolve, reject);
            } else if (attempts >= maxAttempts) {
                console.error('❌ 카카오맵 SDK 로드 타임아웃 (10초 경과)');
                console.error('   window.kakao:', window.kakao);
                reject('카카오맵 SDK 로드 타임아웃');
            } else {
                console.log('⏳ 카카오맵 SDK 대기 중... (', attempts, '/', maxAttempts, ')');
                setTimeout(waitForKakao, 100);
            }
        };

        waitForKakao();

    });
}

/**
 * 실제 지도 초기화를 수행하는 내부 함수
 */
function initializeMap(mapContainer, resolve, reject) {
    try {
        const mapOption = {
            center: new kakao.maps.LatLng(37.566826, 126.9786567), // 서울 시청
            level: 3 // 지도의 확대 레벨
        };
        console.log('🗺️ 지도 옵션 생성:', mapOption);

        // 지도를 생성합니다
        window.map = new kakao.maps.Map(mapContainer, mapOption);
        console.log('✅ 지도 객체 생성 완료:', window.map);

        // 마커가 표시될 위치입니다. (초기 위치는 지도 중심)
        const initialPosition = mapOption.center;

        // 마커를 생성합니다
        window.marker = new kakao.maps.Marker({
            position: initialPosition,
            draggable: true // 마커를 드래그 가능하도록 설정합니다
        });

        // 마커가 지도 위에 표시되도록 설정합니다
        window.marker.setMap(window.map);
        console.log('✅ 마커 생성 및 설정 완료');

        // 마커 드래그가 끝났을 때 이벤트 처리
        kakao.maps.event.addListener(window.marker, 'dragend', function() {
            const latlng = window.marker.getPosition();
            document.getElementById('latitude').value = latlng.getLat();
            document.getElementById('longitude').value = latlng.getLng();
        });

        // 지도 클릭 시 해당 위치로 마커 이동 및 좌표 업데이트
        kakao.maps.event.addListener(window.map, 'click', function(mouseEvent) {
            const latlng = mouseEvent.latLng;
            window.marker.setPosition(latlng);
            document.getElementById('latitude').value = latlng.getLat();
            document.getElementById('longitude').value = latlng.getLng();
        });

        console.log('✅ 카카오맵 초기화 완료');

        resolve();
    } catch (error) {
        console.error('❌ 카카오맵 초기화 오류:', error);
        console.error('❌ 에러 스택:', error.stack);
        reject(error);
    }
}

// ==================== 이벤트 리스너 및 초기 실행 ====================

/**
 * 시간/분 선택 드롭다운 옵션을 동적으로 생성
 */
function initializeTimeSelectors() {
    // 시간 옵션 생성 (00-23)
    const hourSelects = [
        document.getElementById('attendanceStartHour'),
        document.getElementById('lateThresholdHour')
    ];

    hourSelects.forEach(select => {
        if (select) {
            for (let h = 0; h < 24; h++) {
                const option = document.createElement('option');
                const hourStr = String(h).padStart(2, '0');
                option.value = hourStr;
                option.textContent = hourStr;
                select.appendChild(option);
            }
        }
    });

    // 분 옵션 생성 (00-59)
    const minuteSelects = [
        document.getElementById('attendanceStartMinute'),
        document.getElementById('lateThresholdMinute')
    ];

    minuteSelects.forEach(select => {
        if (select) {
            for (let m = 0; m < 60; m++) {
                const option = document.createElement('option');
                const minuteStr = String(m).padStart(2, '0');
                option.value = minuteStr;
                option.textContent = minuteStr;
                select.appendChild(option);
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // 0. 시간/분 선택 드롭다운 초기화
    initializeTimeSelectors();

    // 1. 관리자 인증 확인 및 페이지 로드
    checkAndInitAdmin();

    // 2. 인증 모달 이벤트 리스너
    document.getElementById('adminAuthSubmit').addEventListener('click', attemptAuth);
    document.getElementById('adminAuthCancel').addEventListener('click', () => {
        // 취소 시 통계 페이지로 이동
        window.location.href = 'stats.html';
    });
    document.getElementById('adminPassword').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            attemptAuth();
        }
    });

    // 3. 기타 이벤트 리스너 연결
    const setPasswordBtn = document.getElementById('setPasswordBtn');
    if (setPasswordBtn) {
        setPasswordBtn.addEventListener('click', setAdminPassword);
    }

    const saveLocationBtn = document.getElementById('saveLocationBtn');
    if (saveLocationBtn) {
        saveLocationBtn.addEventListener('click', saveLocation);
    }

    const getMyLocationBtn = document.getElementById('getMyLocationBtn');
    if (getMyLocationBtn) {
        getMyLocationBtn.addEventListener('click', getMyLocation);
    }

    const generateQRBtn = document.getElementById('generateQRBtn');
    if (generateQRBtn) {
        generateQRBtn.addEventListener('click', generateQRCode);
    }

    const downloadQRBtn = document.getElementById('downloadQRBtn');
    if (downloadQRBtn) {
        downloadQRBtn.addEventListener('click', downloadQRCode);
    }

    const openMapBtn = document.getElementById('openMapBtn');
    if (openMapBtn) {
        openMapBtn.addEventListener('click', openMapSearch);
    }

    const closeMapBtn = document.getElementById('closeMapBtn');
    if (closeMapBtn) {
        closeMapBtn.addEventListener('click', closeMapSearch);
    }

    const saveAttendanceTimeBtn = document.getElementById('saveAttendanceTimeBtn');
    if (saveAttendanceTimeBtn) {
        saveAttendanceTimeBtn.addEventListener('click', saveAttendanceTime);
    }

    const recalculateLateBtn = document.getElementById('recalculateLateBtn');
    if (recalculateLateBtn) {
        recalculateLateBtn.addEventListener('click', recalculateLateStatus);
    }

    const saveAttendanceDaysBtn = document.getElementById('saveAttendanceDaysBtn');
    if (saveAttendanceDaysBtn) {
        saveAttendanceDaysBtn.addEventListener('click', saveAttendanceDays);
    }

    // 출석 가능 요일 체크박스 - label의 기본 동작 사용
    // label을 클릭하면 자동으로 checkbox가 토글되므로 별도 핸들러 불필요
});

// 3. 카카오 지도 API가 로드되면 initMap 함수를 호출해야 합니다.
// (이 부분은 HTML 파일에서 <script src="...&autoload=false" ...> 후 window.kakao.maps.load(initMap); 와 같이 처리됩니다.)
