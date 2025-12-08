// 설정 (배포 후 Google Apps Script Web App URL로 변경)
const CONFIG = {
    GAS_URL: 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE', // 나중에 변경 필요
    REQUIRED_RADIUS: 50 // 50미터
};

// 전역 변수
let userLocation = null;
let targetLocation = null;

// DOM 요소
const nameInput = document.getElementById('nameInput');
const nameList = document.getElementById('nameList');
const teamSelect = document.getElementById('teamSelect');
const locationStatus = document.getElementById('locationStatus');
const locationText = document.getElementById('locationText');
const attendBtn = document.getElementById('attendBtn');
const message = document.getElementById('message');

// 초기화
document.addEventListener('DOMContentLoaded', async () => {
    // 회원 목록 불러오기
    await loadMemberList();

    // 목표 위치 불러오기
    await loadTargetLocation();

    // 사용자 위치 획득
    getUserLocation();

    // 이벤트 리스너
    attendBtn.addEventListener('click', handleAttendance);

    // 이름 입력 시 팀 자동 선택
    nameInput.addEventListener('input', autoSelectTeam);
});

// 회원 목록 불러오기
async function loadMemberList() {
    try {
        const response = await fetch(`${CONFIG.GAS_URL}?action=getMembers`);
        const data = await response.json();

        if (data.success && data.members) {
            // datalist에 회원 추가
            nameList.innerHTML = '';
            data.members.forEach(member => {
                const option = document.createElement('option');
                option.value = member.name;
                option.dataset.team = member.team;
                nameList.appendChild(option);
            });
        }
    } catch (error) {
        console.error('회원 목록 로딩 실패:', error);
    }
}

// 목표 위치 불러오기
async function loadTargetLocation() {
    try {
        const response = await fetch(`${CONFIG.GAS_URL}?action=getLocation`);
        const data = await response.json();

        if (data.success && data.location) {
            targetLocation = {
                lat: data.location.latitude,
                lng: data.location.longitude,
                name: data.location.name
            };
        }
    } catch (error) {
        console.error('목표 위치 로딩 실패:', error);
        showMessage('위치 정보를 불러오는데 실패했습니다.', 'error');
    }
}

// 사용자 위치 획득
function getUserLocation() {
    if (!navigator.geolocation) {
        updateLocationStatus('위치 서비스를 지원하지 않는 브라우저입니다.', 'error');
        return;
    }

    updateLocationStatus('위치 정보 권한을 요청하고 있습니다...', 'info');

    navigator.geolocation.getCurrentPosition(
        (position) => {
            userLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };

            checkDistance();
        },
        (error) => {
            let errorMsg = '위치 정보를 가져올 수 없습니다.';

            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMsg = '위치 정보 권한이 거부되었습니다. 브라우저 설정에서 권한을 허용해주세요.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMsg = '위치 정보를 사용할 수 없습니다.';
                    break;
                case error.TIMEOUT:
                    errorMsg = '위치 정보 요청 시간이 초과되었습니다.';
                    break;
            }

            updateLocationStatus(errorMsg, 'error');
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

// 거리 확인
function checkDistance() {
    if (!userLocation || !targetLocation) {
        updateLocationStatus('위치 정보를 확인할 수 없습니다.', 'error');
        return;
    }

    const distance = calculateDistance(
        userLocation.lat,
        userLocation.lng,
        targetLocation.lat,
        targetLocation.lng
    );

    if (distance <= CONFIG.REQUIRED_RADIUS) {
        updateLocationStatus(
            `✅ 출석 가능 지역입니다! (${Math.round(distance)}m)`,
            'success'
        );
        attendBtn.disabled = false;
    } else {
        updateLocationStatus(
            `❌ 출석 불가 지역입니다. (${Math.round(distance)}m 떨어짐, ${CONFIG.REQUIRED_RADIUS}m 이내 필요)`,
            'error'
        );
        attendBtn.disabled = true;
    }
}

// Haversine 공식: 두 좌표 간 거리 계산 (미터)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // 지구 반지름 (미터)
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

// 위치 상태 업데이트
function updateLocationStatus(text, status) {
    locationText.textContent = text;
    locationStatus.className = 'location-status';

    if (status) {
        locationStatus.classList.add(status);
    }
}

// 이름 입력 시 팀 자동 선택
function autoSelectTeam() {
    const name = nameInput.value.trim();
    const options = nameList.querySelectorAll('option');

    for (let option of options) {
        if (option.value === name && option.dataset.team) {
            teamSelect.value = option.dataset.team;
            break;
        }
    }
}

// 출석 처리
async function handleAttendance() {
    const name = nameInput.value.trim();
    const team = teamSelect.value;

    // 입력 검증
    if (!name) {
        showMessage('이름을 입력해주세요.', 'error');
        return;
    }

    if (!team) {
        showMessage('팀을 선택해주세요.', 'error');
        return;
    }

    if (!userLocation) {
        showMessage('위치 정보를 확인할 수 없습니다.', 'error');
        return;
    }

    // 버튼 비활성화
    attendBtn.disabled = true;
    attendBtn.textContent = '출석 처리 중...';

    try {
        // 출석 데이터 전송
        const response = await fetch(CONFIG.GAS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'attend',
                name: name,
                team: team,
                latitude: userLocation.lat,
                longitude: userLocation.lng,
                userAgent: navigator.userAgent
            })
        });

        const data = await response.json();

        if (data.success) {
            showMessage(`✅ ${name}님 출석 완료!`, 'success');

            // 로컬스토리지에 저장
            saveAttendanceToLocal(name, team);

            // 폼 초기화
            setTimeout(() => {
                nameInput.value = '';
                teamSelect.value = '';
                attendBtn.textContent = '출석하기';
            }, 2000);
        } else {
            showMessage(data.message || '출석 처리에 실패했습니다.', 'error');
            attendBtn.disabled = false;
            attendBtn.textContent = '출석하기';
        }
    } catch (error) {
        console.error('출석 처리 에러:', error);
        showMessage('출석 처리 중 오류가 발생했습니다.', 'error');
        attendBtn.disabled = false;
        attendBtn.textContent = '출석하기';
    }
}

// 로컬스토리지에 출석 저장 (중복 방지용)
function saveAttendanceToLocal(name, team) {
    const today = new Date().toISOString().split('T')[0];
    const attendanceData = {
        name: name,
        team: team,
        date: today
    };
    localStorage.setItem('lastAttendance', JSON.stringify(attendanceData));
}

// 메시지 표시
function showMessage(text, type) {
    message.textContent = text;
    message.className = `message ${type} show`;

    setTimeout(() => {
        message.classList.remove('show');
    }, 5000);
}
