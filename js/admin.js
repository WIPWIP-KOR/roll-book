/**
 * 풋살 동호회 출석 시스템 - 관리자 페이지 (admin.js)
 * * 기능:
 * 1. 관리자 인증 상태 확인 및 비밀번호 설정/변경/해제
 * 2. 카카오 지도 API를 사용한 출석 위치 설정 및 저장
 * 3. 현재 출석 현황 및 회원 목록 표시 (GET 요청)
 */

// ==================== 설정 ====================

// GAS_URL 은 js/config.js 에서 전역으로 정의됩니다. (HTML에서 config.js 를 먼저 로드)

// 인증 토큰 유효 시간 (30분)
const AUTH_TOKEN_DURATION = 30 * 60 * 1000; 

// ==================== 탭 상태 관리 ====================

// 각 탭의 로딩 상태 추적
const tabLoadState = {
    location: false,
    qrcode: false,
    members: false,
    manual: false,
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
 * 기존 출석 기록의 지각 여부 재계산 (날짜 범위 지정 가능)
 */
async function recalculateLateStatus() {
    const messageEl = document.getElementById('recalculateMessage');
    const btn = document.getElementById('recalculateLateBtn');
    const startDateEl = document.getElementById('recalculateStartDate');
    const endDateEl = document.getElementById('recalculateEndDate');

    const startDate = startDateEl.value;
    const endDate = endDateEl.value;

    // 날짜 유효성 검사
    if (!startDate || !endDate) {
        messageEl.textContent = '❌ 시작일과 종료일을 모두 선택해주세요.';
        messageEl.className = 'message-area error';
        return;
    }

    if (startDate > endDate) {
        messageEl.textContent = '❌ 시작일이 종료일보다 늦을 수 없습니다.';
        messageEl.className = 'message-area error';
        return;
    }

    // 확인 메시지
    if (!confirm(`${startDate} ~ ${endDate} 기간의 출석 기록을 재계산합니다.\n계속하시겠습니까?`)) {
        return;
    }

    try {
        btn.disabled = true;
        btn.textContent = '⏳ 재계산 중...';
        messageEl.textContent = '';
        messageEl.className = 'message-area';

        const response = await requestGas('recalculateLateStatus', {
            startDate: startDate,
            endDate: endDate
        });

        if (response.success) {
            const { totalProcessed, updatedCount } = response;
            messageEl.textContent = `✅ 재계산 완료! (${startDate} ~ ${endDate})\n총 ${totalProcessed}개 기록 중 ${updatedCount}개 업데이트됨`;
            messageEl.className = 'message-area success';

            // 5초 후 메시지 제거
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

// ==================== 대회 우승팀 관리 ====================

// 현재 연도+시즌의 회원 목록 캐시 (팀 드롭다운/미리보기에 사용)
let winnerMembersCache = [];

/**
 * 우승팀 탭 로드: 연도 목록, 팀 드롭다운, 우승 기록 목록 초기화
 */
async function loadWinnerTab() {
    await populateWinnerYears();
    await refreshWinnerTeams();
    await loadWinnerList();
}

/**
 * 연도 드롭다운 채우기 (출석 기록이 있는 연도 + 올해)
 */
async function populateWinnerYears() {
    const yearSelect = document.getElementById('winnerYear');
    if (!yearSelect) return;
    // 이미 채워져 있으면 스킵 (재진입 시 선택값 유지)
    if (yearSelect.options.length > 0) return;

    const currentYear = new Date().getFullYear();
    let years = [];

    try {
        const response = await requestGas('getAvailableYears');
        years = response.availableYears || [];
    } catch (error) {
        console.error('연도 목록 조회 실패:', error);
    }

    // 올해가 목록에 없으면 추가
    if (!years.includes(currentYear)) {
        years.unshift(currentYear);
    }
    years.sort((a, b) => b - a);

    yearSelect.innerHTML = '';
    years.forEach(year => {
        const opt = document.createElement('option');
        opt.value = year;
        opt.textContent = `${year}년`;
        yearSelect.appendChild(opt);
    });
    yearSelect.value = currentYear;
}

/**
 * 선택한 연도의 회원 목록을 불러와 팀 드롭다운을 갱신
 */
async function refreshWinnerTeams() {
    const yearSelect = document.getElementById('winnerYear');
    const seasonSelect = document.getElementById('winnerSeason');
    const teamSelect = document.getElementById('winnerTeam');
    if (!yearSelect || !seasonSelect || !teamSelect) return;

    const year = yearSelect.value;
    const season = seasonSelect.value;

    teamSelect.innerHTML = '<option value="">팀 선택</option>';

    try {
        const response = await requestGas('getMembers', { year: year, fresh: 1 });
        winnerMembersCache = response.members || [];
    } catch (error) {
        console.error('회원 목록 조회 실패:', error);
        winnerMembersCache = [];
    }

    // 선택한 시즌의 팀 목록(중복 제거) 추출
    const teamKey = (season === '상반기') ? 'firstHalfTeam' : 'secondHalfTeam';
    const teams = new Set();
    winnerMembersCache.forEach(m => {
        const t = String(m[teamKey] || '').trim();
        if (t) teams.add(t);
    });

    Array.from(teams).sort().forEach(team => {
        const opt = document.createElement('option');
        opt.value = team;
        opt.textContent = `${team}팀`;
        teamSelect.appendChild(opt);
    });

    updateWinnerTeamPreview();
}

/**
 * 선택한 팀에 속한 선수 미리보기 표시
 */
function updateWinnerTeamPreview() {
    const seasonSelect = document.getElementById('winnerSeason');
    const teamSelect = document.getElementById('winnerTeam');
    const preview = document.getElementById('winnerTeamPreview');
    if (!seasonSelect || !teamSelect || !preview) return;

    const season = seasonSelect.value;
    const team = teamSelect.value;

    if (!team) {
        preview.style.display = 'none';
        preview.innerHTML = '';
        return;
    }

    const teamKey = (season === '상반기') ? 'firstHalfTeam' : 'secondHalfTeam';
    const players = winnerMembersCache
        .filter(m => String(m[teamKey] || '').trim() === team)
        .map(m => String(m.name || '').trim())
        .filter(n => n);

    preview.style.display = 'block';
    if (players.length === 0) {
        preview.innerHTML = `⚠️ <strong>${team}팀</strong> 소속 선수가 없습니다.`;
    } else {
        preview.innerHTML = `👥 <strong>${team}팀</strong> 소속 ${players.length}명: ${players.join(', ')}`;
    }
}

/**
 * 우승팀 저장
 */
async function saveSeasonWinner() {
    const yearSelect = document.getElementById('winnerYear');
    const seasonSelect = document.getElementById('winnerSeason');
    const teamSelect = document.getElementById('winnerTeam');
    const messageEl = document.getElementById('winnerMessage');
    const btn = document.getElementById('saveWinnerBtn');

    const year = yearSelect.value;
    const season = seasonSelect.value;
    const team = teamSelect.value;

    messageEl.style.color = '';

    if (!team) {
        messageEl.style.color = '#dc3545';
        messageEl.textContent = '우승팀을 선택해주세요.';
        return;
    }

    if (!confirm(`${year}년 ${season} 우승팀을 '${team}팀'으로 등록하시겠습니까?\n해당 팀 선수들의 우승 횟수에 반영됩니다.`)) {
        return;
    }

    try {
        btn.disabled = true;
        btn.textContent = '⏳ 등록 중...';

        const response = await requestGas('saveSeasonWinner', {
            year: year,
            season: season,
            team: team
        });

        messageEl.style.color = '#28a745';
        messageEl.textContent = response.message || '✅ 우승팀이 등록되었습니다.';

        await loadWinnerList();
    } catch (error) {
        messageEl.style.color = '#dc3545';
        messageEl.textContent = '❌ ' + (typeof error === 'string' ? error : '우승팀 등록에 실패했습니다.');
    } finally {
        btn.disabled = false;
        btn.textContent = '🏆 우승팀 등록';
    }
}

/**
 * 등록된 우승 기록 목록 표시
 */
async function loadWinnerList() {
    const listEl = document.getElementById('winnerList');
    if (!listEl) return;

    listEl.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">불러오는 중...</p>';

    let winners = [];
    try {
        const response = await requestGas('getSeasonWinners');
        winners = response.winners || [];
    } catch (error) {
        console.error('우승 기록 조회 실패:', error);
        listEl.innerHTML = '<p style="color: #dc3545; text-align: center; padding: 20px;">우승 기록을 불러오지 못했습니다.</p>';
        return;
    }

    if (winners.length === 0) {
        listEl.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">등록된 우승 기록이 없습니다.</p>';
        return;
    }

    listEl.innerHTML = winners.map(w => {
        const players = (w.players || []).join(', ');
        const safeSeason = w.season.replace(/'/g, "\\'");
        return `
            <div style="padding: 15px; margin-bottom: 12px; background: #fff; border: 1px solid #e0e0e0; border-radius: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                    <div>
                        <span style="font-weight: 700; color: #333;">🏆 ${w.season}</span>
                        <span style="margin-left: 8px; padding: 2px 10px; background: #667eea; color: #fff; border-radius: 12px; font-size: 0.85em;">${w.team}팀</span>
                        <span style="margin-left: 8px; color: #888; font-size: 0.85em;">${w.playerCount}명</span>
                    </div>
                    <button class="btn-secondary" style="padding: 6px 12px; font-size: 0.85em;" onclick="deleteSeasonWinner('${safeSeason}')">🗑️ 삭제</button>
                </div>
                <div style="margin-top: 10px; color: #666; font-size: 0.9em;">${players || '선수 정보 없음'}</div>
            </div>
        `;
    }).join('');
}

/**
 * 우승 기록 삭제
 */
async function deleteSeasonWinner(season) {
    if (!confirm(`'${season}' 우승 기록을 삭제하시겠습니까?\n해당 선수들의 우승 횟수에서 차감됩니다.`)) {
        return;
    }

    const messageEl = document.getElementById('winnerMessage');
    messageEl.style.color = '';

    try {
        const response = await requestGas('deleteSeasonWinner', { season: season });
        messageEl.style.color = '#28a745';
        messageEl.textContent = response.message || '✅ 삭제되었습니다.';
        await loadWinnerList();
    } catch (error) {
        messageEl.style.color = '#dc3545';
        messageEl.textContent = '❌ ' + (typeof error === 'string' ? error : '삭제에 실패했습니다.');
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
 * 출석 인정 거리 설정 저장
 */
async function saveAttendanceRadius() {
    const radius = document.getElementById('attendanceRadius').value;
    const messageEl = document.getElementById('attendanceRadiusMessage');

    // 입력 검증
    if (!radius || radius === '') {
        messageEl.textContent = '거리를 입력해주세요.';
        messageEl.className = 'message-area error';
        return;
    }

    const radiusNum = parseInt(radius, 10);
    if (isNaN(radiusNum) || radiusNum < 10 || radiusNum > 500) {
        messageEl.textContent = '거리는 10m~500m 사이로 설정해주세요.';
        messageEl.className = 'message-area error';
        return;
    }

    try {
        const response = await requestGas('saveAttendanceRadius', {
            radius: radiusNum
        });

        if (response.success) {
            messageEl.textContent = '✅ 출석 인정 거리 설정이 저장되었습니다.';
            messageEl.className = 'message-area success';

            // 현재 설정 표시 업데이트
            document.getElementById('currentRadius').textContent = radiusNum + 'm';

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
 * 출석 인정 거리 설정 불러오기
 */
async function loadAttendanceRadius() {
    try {
        console.log('📍 출석 인정 거리 설정 로드 시작...');
        const response = await requestGas('getAttendanceRadius');

        console.log('✅ 출석 인정 거리 설정 응답:', response);

        if (response.success && response.radius !== undefined && response.radius !== null) {
            const radius = response.radius;

            // 현재 설정 표시 업데이트
            document.getElementById('currentRadius').textContent = radius + 'm';

            // 입력 필드에 값 설정
            document.getElementById('attendanceRadius').value = radius;

            console.log('✅ 출석 인정 거리 설정 로드 완료:', radius);
        } else {
            // 설정이 없을 때 기본값 50m 사용
            console.log('ℹ️ 출석 인정 거리 설정이 없습니다. 기본값 50m 사용');
            document.getElementById('currentRadius').textContent = '50m';
            document.getElementById('attendanceRadius').value = 50;
        }
    } catch (error) {
        console.error('❌ 출석 인정 거리 설정 로드 오류:', error);

        // 오류 시 기본값 사용
        document.getElementById('currentRadius').textContent = '50m';
        document.getElementById('attendanceRadius').value = 50;

        // 사용자에게 오류 표시
        const messageEl = document.getElementById('attendanceRadiusMessage');
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

    // 1. 첫 번째 탭(회원·출석·우승)이므로 바로 로드
    await loadManageTab();

    console.log('✅ 초기 데이터 로딩 완료');
}

/**
 * 회원·출석·우승 통합 탭 데이터 로드
 */
async function loadManageTab() {
    // 탭 진입 시 자동 조회하지 않고, 각 섹션의 조회 버튼으로 불러온다
    renderMembersInitial();
    setupTeamAssignSection();
    setupManualSection();
    setupWinnerSection();
}

// ==================== 팀 배정 ====================
let teamAssignData = null;
let pendingAssignments = {}; // 아직 적용 안 한 팀 배정 (이름 → 팀), '전체 적용' 시 일괄 반영

function currentSeasonForAssign() {
    const sel = document.getElementById('teamAssignSeason');
    if (sel && sel.value) return sel.value;
    return (new Date().getMonth() + 1) <= 6 ? '상반기' : '하반기';
}

/** 팀 배정 섹션 초기 세팅 (시즌 기본값 = 현재 시즌, 목록은 조회 버튼으로) */
function setupTeamAssignSection() {
    const sel = document.getElementById('teamAssignSeason');
    if (sel && !sel.dataset.init) {
        sel.value = (new Date().getMonth() + 1) <= 6 ? '상반기' : '하반기';
        sel.dataset.init = '1';
    }
    const area = document.getElementById('teamAssignArea');
    if (area) area.innerHTML = '<p class="text-secondary">조회 버튼을 눌러 팀 배정 현황을 불러오세요.</p>';
}

async function loadTeamAssignment() {
    const area = document.getElementById('teamAssignArea');
    const season = currentSeasonForAssign();
    if (area) area.innerHTML = '<p class="text-secondary">불러오는 중...</p>';
    try {
        const r = await requestGas('getTeamAssignment', { season: season });
        teamAssignData = r;
        pendingAssignments = {}; // 새로 불러오면 임시 배정 초기화
        renderTeamAssignment(r);
    } catch (e) {
        if (area) area.innerHTML = `<p class="text-danger">조회 실패: ${typeof e === 'string' ? e : '오류'}</p>`;
    }
}

function escJs(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

function renderTeamAssignment(d) {
    const area = document.getElementById('teamAssignArea');
    if (!area) return;
    const teams = d.teams || { A: [], B: [], C: [] };
    const coaches = d.coaches || {};
    const unassigned = d.unassigned || [];

    // 팀별 카드 + 감독 지정
    let html = `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px;">`;
    ['A', 'B', 'C'].forEach(t => {
        const mem = teams[t] || [];
        const coach = coaches[t] || '';
        const list = mem.slice();
        if (coach && list.indexOf(coach) === -1) list.push(coach); // 팀 밖 감독도 옵션에 포함
        let opts = '<option value="">(감독 없음)</option>';
        list.forEach(n => { opts += `<option value="${n}" ${n === coach ? 'selected' : ''}>${n}</option>`; });
        html += `
            <div style="flex:1;min-width:170px;border:1px solid #e0e0e0;border-radius:10px;padding:12px;">
                <div style="font-weight:700;color:#667eea;margin-bottom:6px;">${t}팀 <span style="color:#888;font-weight:400;font-size:0.85em;">(${mem.length}명)</span></div>
                <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;">
                    <span style="font-size:0.85em;color:#666;">감독</span>
                    <select id="coach-${t}" style="flex:1;padding:6px;border:1px solid #ccc;border-radius:6px;">${opts}</select>
                    <button class="btn-secondary" style="padding:4px 10px;font-size:0.85em;" onclick="saveTeamCoach('${t}')">지정</button>
                </div>
                <div style="font-size:0.85em;color:#555;">${mem.length ? mem.join(', ') : '소속 없음'}</div>
            </div>`;
    });
    html += `</div>`;

    // 미배정 회원 — 한 명씩 팀을 골라두고(임시) 마지막에 '전체 적용'
    const pendingCount = Object.keys(pendingAssignments).length;
    html += `<h4 style="margin:0 0 10px 0;color:#333;">미배정 회원 <span style="color:#888;font-weight:400;font-size:0.85em;">(${unassigned.length}명)</span></h4>`;
    if (unassigned.length === 0) {
        html += `<p class="text-secondary">✅ 모든 회원이 팀에 배정되었습니다.</p>`;
    } else {
        html += `<p style="color:#888;font-size:0.85em;margin:0 0 8px 0;">각 회원의 팀을 선택한 뒤 아래 <b>전체 적용</b>을 누르세요.</p>`;
        html += `<div style="display:flex;flex-direction:column;gap:8px;">`;
        unassigned.forEach(n => {
            const e = escJs(n);
            const picked = pendingAssignments[n] || '';
            const btn = (t) => {
                const on = picked === t;
                const style = on
                    ? 'padding:4px 14px;background:#667eea;color:#fff;border:2px solid #667eea;'
                    : 'padding:4px 14px;';
                return `<button class="btn-secondary" style="${style}" onclick="stageAssign('${e}','${t}')">${t}</button>`;
            };
            html += `
                <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:${picked ? '#eef1ff' : '#fff7e6'};border:1px solid ${picked ? '#c7d2fe' : '#ffe0a3'};border-radius:8px;">
                    <span style="flex:1;font-weight:600;">${n}${picked ? ` <span style="color:#667eea;font-size:0.85em;">→ ${picked}팀</span>` : ''}</span>
                    ${btn('A')}${btn('B')}${btn('C')}
                </div>`;
        });
        html += `</div>`;

        html += `
            <button id="applyAssignBtn" class="btn-primary" style="margin-top:14px;" ${pendingCount === 0 ? 'disabled' : ''} onclick="applyAssignments()">
                ✅ 전체 적용 ${pendingCount > 0 ? `(${pendingCount}명)` : ''}
            </button>`;
    }

    area.innerHTML = html;
}

/** 미배정 회원 팀을 임시 선택(토글) — 아직 서버 반영 안 함 */
function stageAssign(name, team) {
    if (pendingAssignments[name] === team) {
        delete pendingAssignments[name]; // 같은 팀 다시 누르면 선택 해제
    } else {
        pendingAssignments[name] = team;
    }
    renderTeamAssignment(teamAssignData);
}

/** 임시 선택한 팀 배정을 한 번에 서버로 적용 */
async function applyAssignments() {
    const season = currentSeasonForAssign();
    const list = Object.keys(pendingAssignments).map(name => ({ name: name, team: pendingAssignments[name] }));
    if (list.length === 0) return;

    const btn = document.getElementById('applyAssignBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 적용 중...'; }

    try {
        await requestGas('assignTeamsBulk', { season: season, assignments: JSON.stringify(list) });
        await loadTeamAssignment(); // 성공 시 임시 선택 초기화 + 재조회
    } catch (e) {
        alert('일괄 적용 실패: ' + (typeof e === 'string' ? e : '오류가 발생했습니다.'));
        if (btn) { btn.disabled = false; btn.textContent = '✅ 전체 적용'; }
    }
}

async function saveTeamCoach(team) {
    const season = currentSeasonForAssign();
    const sel = document.getElementById('coach-' + team);
    const coach = sel ? sel.value : '';
    try {
        await requestGas('setTeamCoach', { season: season, team: team, coach: coach });
        await loadTeamAssignment();
    } catch (e) {
        alert('감독 지정 실패: ' + (typeof e === 'string' ? e : '오류가 발생했습니다.'));
    }
}

/** 출석 승인 섹션 초기 세팅 (날짜 기본값, 요청목록은 새로고침 버튼으로 조회) */
function setupManualSection() {
    const dateEl = document.getElementById('manualAttendDate');
    if (dateEl && !dateEl.value) {
        dateEl.value = new Date().toISOString().split('T')[0];
    }
    const list = document.getElementById('attendanceRequestsList');
    if (list) {
        list.innerHTML = '<p class="text-secondary">🔄 새로고침을 눌러 출석 요청을 불러오세요.</p>';
    }
}

/** 우승팀 섹션 초기 세팅 (불러오기 버튼으로 조회) */
function setupWinnerSection() {
    const list = document.getElementById('winnerList');
    if (list) {
        list.innerHTML = '<p class="text-secondary" style="text-align:center;padding:20px;">🔄 "우승팀 정보 불러오기"를 눌러주세요.</p>';
    }
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
        // 출석 시간 설정, 거리 설정, 요일 설정 항상 로드 (최신 데이터 표시)
        await Promise.all([
            loadAttendanceTime(),
            loadAttendanceRadius(),
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
let adminMembersList = [];   // 현재 표시 중인 회원 목록 (정렬됨)
let editingMemberIndex = -1; // 인라인 수정 중인 행 인덱스

async function loadMembers(forceReload = false) {
    const container = document.getElementById('membersList');

    try {
        let members = forceReload ? null : CacheManager.get(CacheManager.KEYS.MEMBERS);

        if (!members) {
            console.log('📡 회원 목록 서버에서 로드 중...');
            // forceReload(조회 버튼) 시 서버 캐시까지 우회하여 시트 최신값 조회
            const response = await requestGas('getMembers', forceReload ? { fresh: 1 } : {});
            members = response.members || [];
            CacheManager.set(CacheManager.KEYS.MEMBERS, members);
        } else {
            console.log('✅ 회원 목록 캐시에서 로드');
        }

        // 총 출석수 기준 내림차순 정렬
        members.sort((a, b) => (b.attendanceCountTotal || 0) - (a.attendanceCountTotal || 0));
        adminMembersList = members;
        editingMemberIndex = -1;
        renderMembersSection();

    } catch (error) {
        container.innerHTML = `<p class="text-danger">회원 목록 로드 실패: ${error}</p>`;
        console.error('회원 목록 로드 오류:', error);
    }
}

/** 팀 선택 드롭다운 HTML */
function teamSelectHtml(id, selected, placeholder) {
    const opts = ['A', 'B', 'C'].map(t =>
        `<option value="${t}" ${String(selected || '') === t ? 'selected' : ''}>${t}팀</option>`
    ).join('');
    return `<select id="${id}" style="padding:8px;border:1px solid #ccc;border-radius:6px;"><option value="">${placeholder}</option>${opts}</select>`;
}

/** 선수 등록 폼 HTML (데이터 불필요, 항상 표시) */
function addMemberFormHtml() {
    return `
        <div style="padding: 15px; margin-bottom: 20px; background: #f0f4ff; border: 1px solid #c7d2fe; border-radius: 10px;">
            <h4 style="margin: 0 0 12px 0; color: #333;">➕ 선수 등록</h4>
            <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
                <input type="text" id="newMemberName" placeholder="이름" style="padding:8px 10px;border:1px solid #ccc;border-radius:6px;flex:1;min-width:120px;">
                <button class="btn-primary" style="padding:8px 16px;" onclick="submitAddMember()">등록</button>
            </div>
            <p style="margin:8px 0 0 0;color:#888;font-size:0.85em;">팀 배정은 아래 '🧩 팀 배정'에서 합니다.</p>
            <p id="addMemberMsg" class="message-area" style="margin:6px 0 0 0;"></p>
        </div>
    `;
}

/** 탭 진입 시: 등록 폼 + 조회 버튼만 표시 (목록은 버튼 클릭 시 조회) */
function renderMembersInitial() {
    const container = document.getElementById('membersList');
    if (!container) return;
    container.innerHTML = addMemberFormHtml() + `
        <button class="btn-primary" onclick="loadMembers(true)">🔄 회원 목록 조회</button>
        <p class="text-secondary" style="margin-top:12px;">조회 버튼을 눌러 회원 목록을 불러오세요.</p>
    `;
}

/** 선수 등록 폼 + 회원 테이블 렌더링 */
function renderMembersSection() {
    const container = document.getElementById('membersList');
    const members = adminMembersList;

    let html = addMemberFormHtml();
    html += `<div style="text-align:right;margin-bottom:10px;"><button class="btn-secondary" style="padding:6px 12px;font-size:0.9em;" onclick="loadMembers(true)">🔄 새로고침</button></div>`;

    if (members.length === 0) {
        html += '<p class="text-secondary">등록된 선수가 없습니다. 위에서 선수를 등록해주세요.</p>';
        container.innerHTML = html;
        return;
    }

    html += `
        <table class="table table-striped">
            <thead>
                <tr>
                    <th>이름</th><th>상반기</th><th>하반기</th><th>출석</th><th>등록일</th><th>관리</th>
                </tr>
            </thead>
            <tbody>
    `;

    members.forEach((member, idx) => {
        const count = member.attendanceCountTotal !== undefined ? member.attendanceCountTotal : (member.attendanceCount || 0);
        const first = member.firstHalfTeam || '';
        const second = member.secondHalfTeam || '';

        if (idx === editingMemberIndex) {
            // 수정 모드 행
            html += `
                <tr style="background:#fffbe6;">
                    <td><input type="text" id="editMemberName" value="${member.name}" style="padding:6px;border:1px solid #ccc;border-radius:6px;width:90px;"></td>
                    <td>${teamSelectHtml('editMemberFirstTeam', first, '-')}</td>
                    <td>${teamSelectHtml('editMemberSecondTeam', second, '-')}</td>
                    <td>${count}회</td>
                    <td>${member.firstDate || ''}</td>
                    <td style="white-space:nowrap;">
                        <button class="btn-primary" style="padding:4px 10px;font-size:0.85em;" onclick="saveMemberEdit(${idx})">저장</button>
                        <button class="btn-secondary" style="padding:4px 10px;font-size:0.85em;" onclick="cancelEditMember()">취소</button>
                    </td>
                </tr>
            `;
        } else {
            html += `
                <tr>
                    <td>${member.name}</td>
                    <td>${first}</td>
                    <td>${second}</td>
                    <td>${count}회</td>
                    <td>${member.firstDate || ''}</td>
                    <td style="white-space:nowrap;">
                        <button class="btn-secondary" style="padding:4px 10px;font-size:0.85em;" onclick="startEditMember(${idx})">✏️ 수정</button>
                        <button class="btn-secondary" style="padding:4px 10px;font-size:0.85em;color:#dc3545;" onclick="confirmDeleteMember(${idx})">🗑️ 삭제</button>
                    </td>
                </tr>
            `;
        }
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

/** 선수 등록 */
async function submitAddMember() {
    const nameEl = document.getElementById('newMemberName');
    const name = nameEl.value.trim();
    const msg = document.getElementById('addMemberMsg');
    msg.style.color = '';

    if (!name) {
        msg.style.color = '#dc3545';
        msg.textContent = '이름을 입력해주세요.';
        return;
    }

    try {
        // 팀 배정은 별도 섹션에서 → 등록 시 팀 미지정
        const r = await requestGas('addMember', { name: name });
        await loadMembers(true);
        const m = document.getElementById('addMemberMsg');
        if (m) { m.style.color = '#28a745'; m.textContent = r.message || `✅ ${name} 등록됨`; }
    } catch (e) {
        const m = document.getElementById('addMemberMsg');
        if (m) { m.style.color = '#dc3545'; m.textContent = '❌ ' + (typeof e === 'string' ? e : '등록에 실패했습니다.'); }
    }
}

/** 수정 모드 진입 */
function startEditMember(idx) {
    editingMemberIndex = idx;
    renderMembersSection();
    const el = document.getElementById('editMemberName');
    if (el) el.focus();
}

/** 수정 취소 */
function cancelEditMember() {
    editingMemberIndex = -1;
    renderMembersSection();
}

/** 수정 저장 */
async function saveMemberEdit(idx) {
    const original = adminMembersList[idx] && adminMembersList[idx].name;
    if (!original) return;
    const newName = document.getElementById('editMemberName').value.trim();
    const first = document.getElementById('editMemberFirstTeam').value;
    const second = document.getElementById('editMemberSecondTeam').value;

    if (!newName) { alert('이름을 입력해주세요.'); return; }

    try {
        await requestGas('updateMember', {
            originalName: original, newName: newName,
            firstHalfTeam: first, secondHalfTeam: second
        });
        editingMemberIndex = -1;
        await loadMembers(true);
    } catch (e) {
        alert('수정 실패: ' + (typeof e === 'string' ? e : '오류가 발생했습니다.'));
    }
}

/** 선수 삭제 */
async function confirmDeleteMember(idx) {
    const name = adminMembersList[idx] && adminMembersList[idx].name;
    if (!name) return;
    if (!confirm(`'${name}' 선수를 삭제하시겠습니까?\n(출석 기록은 보존되며 회원 목록에서만 제거됩니다)`)) return;

    try {
        await requestGas('deleteMember', { name: name });
        await loadMembers(true);
    } catch (e) {
        alert('삭제 실패: ' + (typeof e === 'string' ? e : '오류가 발생했습니다.'));
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
    } else {
        console.error('❌ 입력 필드를 찾을 수 없습니다!');
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

    initTabScrollHint();
}

/**
 * 탭이 많아 가로 스크롤이 필요한 경우, 스크롤 위치에 따라
 * 양 끝 그라데이션 힌트를 표시/숨김 처리
 */
function initTabScrollHint() {
    const wrap = document.querySelector('.tab-scroll-wrap');
    const container = wrap ? wrap.querySelector('.tab-container') : null;
    if (!wrap || !container) return;

    const update = () => {
        const maxScroll = container.scrollWidth - container.clientWidth;
        // 약간의 여유(1px)로 부동소수점 오차 보정
        wrap.classList.toggle('can-scroll-left', container.scrollLeft > 1);
        wrap.classList.toggle('can-scroll-right', container.scrollLeft < maxScroll - 1);
    };

    container.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    // 활성 탭이 보이도록 스크롤한 뒤 힌트 갱신
    const activeBtn = container.querySelector('.tab-btn.active');
    if (activeBtn && activeBtn.scrollIntoView) {
        activeBtn.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }
    update();
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

    // 탭 전환 시 모든 접이식 섹션 접기
    document.querySelectorAll('details.admin-acc').forEach(d => { d.open = false; });

    // 탭 별 데이터 지연 로딩
    switch(tabName) {
        case 'manage':
            // 회원·출석·우승 통합 탭
            loadManageTab();
            break;
        case 'settings':
            // 설정 탭: 위치설정 + 출석 시간/요일/거리 설정 로드
            loadLocationTab();
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
 * 지각 재계산 날짜 필드 초기화 (기본값: 오늘)
 */
function initializeRecalculateDateFields() {
    const startDateEl = document.getElementById('recalculateStartDate');
    const endDateEl = document.getElementById('recalculateEndDate');

    if (startDateEl && endDateEl) {
        // 오늘 날짜를 YYYY-MM-DD 형식으로
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];

        startDateEl.value = todayStr;
        endDateEl.value = todayStr;
    }
}

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

    // 0-1. 지각 재계산 날짜 필드 초기화 (기본값: 오늘)
    initializeRecalculateDateFields();

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

    const saveAttendanceRadiusBtn = document.getElementById('saveAttendanceRadiusBtn');
    if (saveAttendanceRadiusBtn) {
        saveAttendanceRadiusBtn.addEventListener('click', saveAttendanceRadius);
    }

    // 출석 가능 요일 체크박스 - label의 기본 동작 사용
    // label을 클릭하면 자동으로 checkbox가 토글되므로 별도 핸들러 불필요

    // 수동 출석 관련 이벤트 리스너
    const loadUncheckedBtn = document.getElementById('loadUncheckedBtn');
    if (loadUncheckedBtn) {
        loadUncheckedBtn.addEventListener('click', loadUncheckedMembers);
    }

    // 출석 요청 관련 이벤트 리스너
    const refreshRequestsBtn = document.getElementById('refreshRequestsBtn');
    if (refreshRequestsBtn) {
        refreshRequestsBtn.addEventListener('click', loadAttendanceRequests);
    }

    // 우승팀 관련 이벤트 리스너
    const loadWinnerBtn = document.getElementById('loadWinnerBtn');
    if (loadWinnerBtn) {
        loadWinnerBtn.addEventListener('click', loadWinnerTab);
    }
    const loadTeamAssignBtn = document.getElementById('loadTeamAssignBtn');
    if (loadTeamAssignBtn) {
        loadTeamAssignBtn.addEventListener('click', loadTeamAssignment);
    }
    const teamAssignSeason = document.getElementById('teamAssignSeason');
    if (teamAssignSeason) {
        teamAssignSeason.addEventListener('change', loadTeamAssignment);
    }
    const saveWinnerBtn = document.getElementById('saveWinnerBtn');
    if (saveWinnerBtn) {
        saveWinnerBtn.addEventListener('click', saveSeasonWinner);
    }
    const winnerYearSelect = document.getElementById('winnerYear');
    if (winnerYearSelect) {
        winnerYearSelect.addEventListener('change', refreshWinnerTeams);
    }
    const winnerSeasonSelect = document.getElementById('winnerSeason');
    if (winnerSeasonSelect) {
        winnerSeasonSelect.addEventListener('change', refreshWinnerTeams);
    }
    const winnerTeamSelect = document.getElementById('winnerTeam');
    if (winnerTeamSelect) {
        winnerTeamSelect.addEventListener('change', updateWinnerTeamPreview);
    }

    // 사진 모달 닫기 이벤트 리스너
    const closePhotoModalBtn = document.getElementById('closePhotoModal');
    if (closePhotoModalBtn) {
        closePhotoModalBtn.addEventListener('click', closePhotoModal);
    }

    // 사진 모달 배경 클릭 시 닫기
    const photoModal = document.getElementById('photoViewModal');
    if (photoModal) {
        photoModal.addEventListener('click', (e) => {
            if (e.target === photoModal) {
                closePhotoModal();
            }
        });
    }
});

// 3. 카카오 지도 API가 로드되면 initMap 함수를 호출해야 합니다.
// (이 부분은 HTML 파일에서 <script src="...&autoload=false" ...> 후 window.kakao.maps.load(initMap); 와 같이 처리됩니다.)

// ==================== 수동 출석 관리 ====================

/**
 * 출석 승인 탭 로드
 */
function loadManualTab() {
    if (tabLoadState.manual) return;

    // 오늘 날짜를 기본값으로 설정
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    document.getElementById('manualAttendDate').value = dateStr;

    // 출석 요청 목록 로드
    loadAttendanceRequests();

    tabLoadState.manual = true;
}

/**
 * 미출석자 목록 불러오기
 */
async function loadUncheckedMembers() {
    const dateInput = document.getElementById('manualAttendDate');
    const targetDate = dateInput.value;

    if (!targetDate) {
        alert('날짜를 선택해주세요.');
        return;
    }

    const messageEl = document.getElementById('manualAttendMessage');
    const btn = document.getElementById('loadUncheckedBtn');

    try {
        btn.disabled = true;
        btn.textContent = '⏳ 불러오는 중...';
        messageEl.textContent = '';
        messageEl.className = 'message';

        const response = await requestGas('getUncheckedMembers', { date: targetDate });

        if (response.success) {
            const { uncheckedMembers, totalMembers, attendedCount } = response;

            // 통계 업데이트
            document.getElementById('totalMembersCount').textContent = totalMembers;
            document.getElementById('attendedCount').textContent = attendedCount;
            document.getElementById('uncheckedCount').textContent = uncheckedMembers.length;

            // 미출석자 목록 표시
            displayUncheckedMembers(uncheckedMembers, targetDate);

            // 섹션 표시
            document.getElementById('uncheckedMembersSection').style.display = 'block';

            if (uncheckedMembers.length === 0) {
                messageEl.textContent = '🎉 모든 회원이 출석했습니다!';
                messageEl.className = 'message success';
            }
        } else {
            messageEl.textContent = '❌ ' + (response.message || '데이터를 불러오는데 실패했습니다.');
            messageEl.className = 'message error';
        }
    } catch (error) {
        messageEl.textContent = '❌ 오류 발생: ' + error;
        messageEl.className = 'message error';
        console.error('미출석자 조회 오류:', error);
    } finally {
        btn.disabled = false;
        btn.textContent = '미출석자 불러오기';
    }
}

/**
 * 미출석자 목록 화면에 표시
 */
function displayUncheckedMembers(members, targetDate) {
    const container = document.getElementById('uncheckedMembersList');

    if (members.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">모든 회원이 출석했습니다! 🎉</p>';
        return;
    }

    let html = '';

    members.forEach(member => {
        const firstHalfTeam = member.firstHalfTeam || '-';
        const secondHalfTeam = member.secondHalfTeam || '-';

        // 현재 시즌 판단 (1~6월: 상반기, 7~12월: 하반기)
        const month = parseInt(targetDate.substring(5, 7));
        const currentSeason = (month >= 1 && month <= 6) ? '상반기' : '하반기';
        const currentTeam = (currentSeason === '상반기') ? firstHalfTeam : secondHalfTeam;

        html += `
            <div class="member-card">
                <div class="member-card-header">
                    <span class="member-name">${member.name}</span>
                </div>
                <div class="member-teams">
                    <span class="member-team-badge">상반기: ${firstHalfTeam}</span>
                    <span class="member-team-badge">하반기: ${secondHalfTeam}</span>
                </div>
                <div class="attend-controls">
                    <select id="team-${member.name}" class="team-select">
                        <option value="">팀 선택</option>
                        <option value="A" ${currentTeam === 'A' ? 'selected' : ''}>A팀</option>
                        <option value="B" ${currentTeam === 'B' ? 'selected' : ''}>B팀</option>
                        <option value="C" ${currentTeam === 'C' ? 'selected' : ''}>C팀</option>
                    </select>
                    <select id="season-${member.name}" class="season-select">
                        <option value="상반기" ${currentSeason === '상반기' ? 'selected' : ''}>상반기</option>
                        <option value="하반기" ${currentSeason === '하반기' ? 'selected' : ''}>하반기</option>
                    </select>
                    <button onclick="processManualAttend('${member.name}', '${targetDate}')">출석 처리</button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

/**
 * 수동 출석 처리
 */
async function processManualAttend(name, targetDate) {
    const teamSelect = document.getElementById(`team-${name}`);
    const seasonSelect = document.getElementById(`season-${name}`);

    const team = teamSelect.value;
    const season = seasonSelect.value;

    if (!team) {
        alert('팀을 선택해주세요.');
        return;
    }

    if (!confirm(`${name}님을 ${targetDate}에 ${team}팀 ${season}으로 출석 처리하시겠습니까?`)) {
        return;
    }

    const messageEl = document.getElementById('manualAttendMessage');

    try {
        messageEl.textContent = '⏳ 처리 중...';
        messageEl.className = 'message';

        const response = await requestGas('manualAttend', {
            name: name,
            team: team,
            season: season,
            date: targetDate
        });

        if (response.success) {
            messageEl.textContent = '✅ ' + (response.message || '출석이 처리되었습니다.');
            messageEl.className = 'message success';

            // 미출석자 목록 새로고침
            setTimeout(() => {
                loadUncheckedMembers();
            }, 1000);
        } else {
            messageEl.textContent = '❌ ' + (response.message || '출석 처리에 실패했습니다.');
            messageEl.className = 'message error';
        }
    } catch (error) {
        messageEl.textContent = '❌ 오류 발생: ' + error;
        messageEl.className = 'message error';
        console.error('수동 출석 처리 오류:', error);
    }
}

// ==================== 출석 요청 관리 ====================

/**
 * 출석 요청 목록 로드
 */
async function loadAttendanceRequests() {
    const container = document.getElementById('attendanceRequestsList');

    try {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">⏳ 출석 요청 불러오는 중...</p>';

        const response = await requestGas('getAttendanceRequests');

        if (response.success) {
            const { requests } = response;
            displayAttendanceRequests(requests);
        } else {
            container.innerHTML = `<p style="text-align: center; color: #f44336; padding: 20px;">❌ ${response.message || '출석 요청을 불러오는데 실패했습니다.'}</p>`;
        }
    } catch (error) {
        container.innerHTML = `<p style="text-align: center; color: #f44336; padding: 20px;">❌ 오류 발생: ${error}</p>`;
        console.error('출석 요청 조회 오류:', error);
    }
}

/**
 * 출석 요청 목록 화면에 표시
 */
function displayAttendanceRequests(requests) {
    const container = document.getElementById('attendanceRequestsList');

    console.log(`📋 [출석 요청 표시] 총 ${requests.length}개 요청`);

    if (requests.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">대기 중인 출석 요청이 없습니다. 🎉</p>';
        return;
    }

    let html = '';

    requests.forEach(request => {
        console.log(`📋 [요청 처리] ID: ${request.requestId}, 이름: ${request.name}`);
        console.log(`📸 [사진 URL] "${request.photoUrl}"`);
        console.log(`👤 [선택한 동료] "${request.selectedPerson || '없음'}"`);

        const requestDateTime = new Date(request.requestDateTime);
        const displayDate = requestDateTime.toLocaleString('ko-KR', {
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        // 사진 보기 버튼 (사진이 있는 경우에만)
        const photoButton = request.photoUrl ?
            `<button class="btn-secondary" style="margin-right: 10px;" onclick="viewPhoto('${request.requestId}', '${request.name}', '${request.selectedPerson || ''}', '${request.photoUrl}')">📸 사진 보기</button>`
            : '';

        console.log(`🔘 [사진 버튼] ${request.photoUrl ? '표시됨' : '표시 안 됨'}`);

        // 선택한 동료 정보 표시
        const selectedPersonInfo = request.selectedPerson ?
            `<div class="request-info-row">
                <span class="request-label">선택한 동료:</span>
                <span class="request-value">👤 ${request.selectedPerson}</span>
            </div>`
            : '';

        html += `
            <div class="request-card">
                <div class="request-header">
                    <span class="request-name">${request.name}</span>
                    <span class="request-time">${displayDate}</span>
                </div>
                <div class="request-info">
                    <div class="request-info-row">
                        <span class="request-label">팀:</span>
                        <span class="request-value">${request.team}팀</span>
                    </div>
                    <div class="request-info-row">
                        <span class="request-label">시즌:</span>
                        <span class="request-value">${request.season}</span>
                    </div>
                    ${selectedPersonInfo}
                </div>
                <div class="request-reason">
                    <strong>사유:</strong> ${request.reason}
                </div>
                <div class="request-actions">
                    ${photoButton}
                    <button class="btn-approve" onclick="approveRequest('${request.requestId}')">✅ 승인</button>
                    <button class="btn-reject" onclick="rejectRequest('${request.requestId}')">❌ 거부</button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

/**
 * 출석 요청 승인
 */
async function approveRequest(requestId) {
    if (!confirm('이 출석 요청을 승인하시겠습니까?')) {
        return;
    }

    try {
        const response = await requestGas('approveAttendanceRequest', { requestId: requestId });

        if (response.success) {
            alert('✅ ' + (response.message || '출석 요청이 승인되었습니다.'));
            // 목록 새로고침
            loadAttendanceRequests();
        } else {
            alert('❌ ' + (response.message || '승인에 실패했습니다.'));
        }
    } catch (error) {
        alert('❌ 오류 발생: ' + error);
        console.error('출석 요청 승인 오류:', error);
    }
}

/**
 * 출석 요청 거부
 */
async function rejectRequest(requestId) {
    if (!confirm('이 출석 요청을 거부하시겠습니까?')) {
        return;
    }

    try {
        const response = await requestGas('rejectAttendanceRequest', { requestId: requestId });

        if (response.success) {
            alert('✅ ' + (response.message || '출석 요청이 거부되었습니다.'));
            // 목록 새로고침
            loadAttendanceRequests();
        } else {
            alert('❌ ' + (response.message || '거부에 실패했습니다.'));
        }
    } catch (error) {
        alert('❌ 오류 발생: ' + error);
        console.error('출석 요청 거부 오류:', error);
    }
}

/**
 * 사진 보기 모달 표시
 */
function viewPhoto(requestId, requesterName, selectedPerson, photoUrl) {
    const modal = document.getElementById('photoViewModal');
    const photoImg = document.getElementById('photoViewImage');
    const noPhotoMsg = document.getElementById('noPhotoMessage');
    const requesterEl = document.getElementById('photoRequester');
    const selectedPersonEl = document.getElementById('photoSelectedPerson');

    // 요청자 정보 표시
    requesterEl.textContent = requesterName;
    selectedPersonEl.textContent = selectedPerson || '(빈 풋살장 사진)';

    if (photoUrl) {
        // 기존 URL 형식을 썸네일 URL로 변환 (CORS 문제 해결)
        let displayUrl = photoUrl;
        let fileId = null;

        // 이미 썸네일 URL이면 그대로 사용
        if (photoUrl.includes('lh3.googleusercontent.com')) {
            displayUrl = photoUrl;
        }
        // drive.google.com/uc 형식에서 파일 ID 추출
        else if (photoUrl.includes('drive.google.com/uc')) {
            const match = photoUrl.match(/[?&]id=([^&]+)/);
            if (match && match[1]) {
                fileId = match[1];
            }
        }
        // drive.usercontent.google.com 형식에서 파일 ID 추출
        else if (photoUrl.includes('drive.usercontent.google.com')) {
            const match = photoUrl.match(/[?&]id=([^&]+)/);
            if (match && match[1]) {
                fileId = match[1];
            }
        }

        // 파일 ID를 추출했으면 썸네일 URL로 변환
        if (fileId) {
            displayUrl = `https://lh3.googleusercontent.com/d/${fileId}=s1600`;
            console.log('📸 [URL 변환] 기존:', photoUrl);
            console.log('📸 [URL 변환] 썸네일:', displayUrl);
        }

        // 사진 있음
        photoImg.src = displayUrl;
        photoImg.style.display = 'block';
        noPhotoMsg.style.display = 'none';
    } else {
        // 사진 없음
        photoImg.style.display = 'none';
        noPhotoMsg.style.display = 'block';
    }

    modal.style.display = 'flex';
}

/**
 * 사진 보기 모달 닫기
 */
function closePhotoModal() {
    const modal = document.getElementById('photoViewModal');
    modal.style.display = 'none';
}
