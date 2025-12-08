// 설정
const CONFIG = {
    GAS_URL: 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE', // 나중에 변경 필요
    ATTENDANCE_URL: window.location.origin + '/index.html'
};

// DOM 요소
const latitudeInput = document.getElementById('latitude');
const longitudeInput = document.getElementById('longitude');
const locationNameInput = document.getElementById('locationName');
const saveLocationBtn = document.getElementById('saveLocationBtn');
const locationMessage = document.getElementById('locationMessage');
const currentLocation = document.getElementById('currentLocation');
const getMyLocationBtn = document.getElementById('getMyLocationBtn');

const attendanceUrlInput = document.getElementById('attendanceUrl');
const generateQRBtn = document.getElementById('generateQRBtn');
const qrcodeDiv = document.getElementById('qrcode');
const downloadQRBtn = document.getElementById('downloadQRBtn');

const refreshTodayBtn = document.getElementById('refreshTodayBtn');
const todayAttendance = document.getElementById('todayAttendance');

const refreshMembersBtn = document.getElementById('refreshMembersBtn');
const membersList = document.getElementById('membersList');

// 초기화
document.addEventListener('DOMContentLoaded', () => {
    // 출석 URL 설정
    attendanceUrlInput.value = CONFIG.ATTENDANCE_URL;

    // 현재 설정된 위치 불러오기
    loadCurrentLocation();

    // 오늘 출석 현황 불러오기
    loadTodayAttendance();

    // 회원 목록 불러오기
    loadMembers();

    // 이벤트 리스너
    saveLocationBtn.addEventListener('click', saveLocation);
    getMyLocationBtn.addEventListener('click', getMyLocation);
    generateQRBtn.addEventListener('click', generateQRCode);
    downloadQRBtn.addEventListener('click', downloadQRCode);
    refreshTodayBtn.addEventListener('click', loadTodayAttendance);
    refreshMembersBtn.addEventListener('click', loadMembers);
});

// 현재 설정된 위치 불러오기
async function loadCurrentLocation() {
    try {
        const response = await fetch(`${CONFIG.GAS_URL}?action=getLocation`);
        const data = await response.json();

        if (data.success && data.location) {
            currentLocation.innerHTML = `
                <strong>${data.location.name || '이름 없음'}</strong><br>
                위도: ${data.location.latitude}<br>
                경도: ${data.location.longitude}
            `;
        } else {
            currentLocation.textContent = '아직 위치가 설정되지 않았습니다.';
        }
    } catch (error) {
        console.error('위치 정보 로딩 실패:', error);
        currentLocation.textContent = '위치 정보를 불러오는데 실패했습니다.';
    }
}

// 위치 저장
async function saveLocation() {
    const lat = parseFloat(latitudeInput.value);
    const lng = parseFloat(longitudeInput.value);
    const name = locationNameInput.value.trim();

    // 입력 검증
    if (!lat || !lng) {
        showLocationMessage('위도와 경도를 입력해주세요.', 'error');
        return;
    }

    if (lat < -90 || lat > 90) {
        showLocationMessage('위도는 -90 ~ 90 사이의 값이어야 합니다.', 'error');
        return;
    }

    if (lng < -180 || lng > 180) {
        showLocationMessage('경도는 -180 ~ 180 사이의 값이어야 합니다.', 'error');
        return;
    }

    if (!name) {
        showLocationMessage('장소 이름을 입력해주세요.', 'error');
        return;
    }

    saveLocationBtn.disabled = true;
    saveLocationBtn.textContent = '저장 중...';

    try {
        const response = await fetch(CONFIG.GAS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'saveLocation',
                latitude: lat,
                longitude: lng,
                name: name
            })
        });

        const data = await response.json();

        if (data.success) {
            showLocationMessage('위치가 저장되었습니다!', 'success');
            loadCurrentLocation();

            // 입력 필드 초기화
            latitudeInput.value = '';
            longitudeInput.value = '';
            locationNameInput.value = '';
        } else {
            showLocationMessage(data.message || '위치 저장에 실패했습니다.', 'error');
        }
    } catch (error) {
        console.error('위치 저장 에러:', error);
        showLocationMessage('위치 저장 중 오류가 발생했습니다.', 'error');
    } finally {
        saveLocationBtn.disabled = false;
        saveLocationBtn.textContent = '위치 저장';
    }
}

// 내 현재 위치 가져오기
function getMyLocation() {
    if (!navigator.geolocation) {
        showLocationMessage('위치 서비스를 지원하지 않는 브라우저입니다.', 'error');
        return;
    }

    getMyLocationBtn.disabled = true;
    getMyLocationBtn.textContent = '위치 확인 중...';

    navigator.geolocation.getCurrentPosition(
        (position) => {
            latitudeInput.value = position.coords.latitude;
            longitudeInput.value = position.coords.longitude;

            showLocationMessage('현재 위치를 가져왔습니다!', 'success');

            getMyLocationBtn.disabled = false;
            getMyLocationBtn.textContent = '내 현재 위치 가져오기';
        },
        (error) => {
            let errorMsg = '위치 정보를 가져올 수 없습니다.';

            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMsg = '위치 정보 권한이 거부되었습니다.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMsg = '위치 정보를 사용할 수 없습니다.';
                    break;
                case error.TIMEOUT:
                    errorMsg = '위치 정보 요청 시간이 초과되었습니다.';
                    break;
            }

            showLocationMessage(errorMsg, 'error');

            getMyLocationBtn.disabled = false;
            getMyLocationBtn.textContent = '내 현재 위치 가져오기';
        }
    );
}

// QR 코드 생성
function generateQRCode() {
    const url = attendanceUrlInput.value;

    if (!url) {
        alert('URL이 없습니다.');
        return;
    }

    // 기존 QR 코드 제거
    qrcodeDiv.innerHTML = '';

    // 새 QR 코드 생성
    new QRCode(qrcodeDiv, {
        text: url,
        width: 256,
        height: 256,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
    });

    downloadQRBtn.style.display = 'block';
}

// QR 코드 다운로드
function downloadQRCode() {
    const canvas = qrcodeDiv.querySelector('canvas');

    if (!canvas) {
        alert('QR 코드를 먼저 생성해주세요.');
        return;
    }

    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = 'futsal-attendance-qr.png';
    link.href = url;
    link.click();
}

// 오늘 출석 현황 불러오기
async function loadTodayAttendance() {
    todayAttendance.innerHTML = '<p class="loading">데이터를 불러오는 중</p>';

    try {
        const response = await fetch(`${CONFIG.GAS_URL}?action=getTodayAttendance`);
        const data = await response.json();

        if (data.success && data.attendance && data.attendance.length > 0) {
            todayAttendance.innerHTML = '';

            data.attendance.forEach(record => {
                const item = document.createElement('div');
                item.className = 'attendance-item';
                item.innerHTML = `
                    <div>
                        <strong>${record.name}</strong> (${record.team}팀)
                        <div style="font-size: 0.9em; color: #666; margin-top: 5px;">
                            ${record.time}
                        </div>
                    </div>
                `;
                todayAttendance.appendChild(item);
            });

            // 통계 추가
            const teamCounts = { A: 0, B: 0, C: 0 };
            data.attendance.forEach(record => {
                if (teamCounts[record.team] !== undefined) {
                    teamCounts[record.team]++;
                }
            });

            const statsDiv = document.createElement('div');
            statsDiv.className = 'info-box';
            statsDiv.style.marginTop = '15px';
            statsDiv.innerHTML = `
                <strong>📊 출석 통계</strong><br>
                총 ${data.attendance.length}명 출석<br>
                A팀: ${teamCounts.A}명 | B팀: ${teamCounts.B}명 | C팀: ${teamCounts.C}명
            `;
            todayAttendance.appendChild(statsDiv);

        } else {
            todayAttendance.innerHTML = '<p>오늘 출석 기록이 없습니다.</p>';
        }
    } catch (error) {
        console.error('출석 현황 로딩 실패:', error);
        todayAttendance.innerHTML = '<p style="color: red;">데이터를 불러오는데 실패했습니다.</p>';
    }
}

// 회원 목록 불러오기
async function loadMembers() {
    membersList.innerHTML = '<p class="loading">데이터를 불러오는 중</p>';

    try {
        const response = await fetch(`${CONFIG.GAS_URL}?action=getMembers`);
        const data = await response.json();

        if (data.success && data.members && data.members.length > 0) {
            membersList.innerHTML = '';

            // 팀별로 정렬
            const sortedMembers = data.members.sort((a, b) => {
                if (a.team !== b.team) {
                    return a.team.localeCompare(b.team);
                }
                return a.name.localeCompare(b.name);
            });

            sortedMembers.forEach(member => {
                const item = document.createElement('div');
                item.className = 'member-item';
                item.innerHTML = `
                    <div>
                        <strong>${member.name}</strong> (${member.team}팀)
                    </div>
                    <div style="font-size: 0.9em; color: #666;">
                        출석 ${member.attendanceCount || 0}회
                    </div>
                `;
                membersList.appendChild(item);
            });

            // 통계 추가
            const teamCounts = { A: 0, B: 0, C: 0 };
            data.members.forEach(member => {
                if (teamCounts[member.team] !== undefined) {
                    teamCounts[member.team]++;
                }
            });

            const statsDiv = document.createElement('div');
            statsDiv.className = 'info-box';
            statsDiv.style.marginTop = '15px';
            statsDiv.innerHTML = `
                <strong>📊 회원 통계</strong><br>
                총 ${data.members.length}명<br>
                A팀: ${teamCounts.A}명 | B팀: ${teamCounts.B}명 | C팀: ${teamCounts.C}명
            `;
            membersList.appendChild(statsDiv);

        } else {
            membersList.innerHTML = '<p>등록된 회원이 없습니다.</p>';
        }
    } catch (error) {
        console.error('회원 목록 로딩 실패:', error);
        membersList.innerHTML = '<p style="color: red;">데이터를 불러오는데 실패했습니다.</p>';
    }
}

// 위치 메시지 표시
function showLocationMessage(text, type) {
    locationMessage.textContent = text;
    locationMessage.className = `message ${type} show`;

    setTimeout(() => {
        locationMessage.classList.remove('show');
    }, 5000);
}
