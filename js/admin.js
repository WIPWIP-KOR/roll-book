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

// 카카오 지도 API의 클라이언트 키 (admin.js 파일의 HTML에 스크립트 태그로 포함되어야 함)
// let map; // 전역 변수 지도 객체 (HTML에서 초기화될 예정)
// let marker; // 전역 변수 마커 객체 (HTML에서 초기화될 예정)


// ==================== 유틸리티 ====================

/**
 * GAS 서버에 JSONP 요청을 보내는 범용 함수
 * @param {string} action - 실행할 Apps Script 함수 (액션)
 * @param {object} params - 요청에 포함할 파라미터 객체
 * @returns {Promise} - 서버 응답 결과를 resolve 하는 프로미스
 */
function requestGas(action, params = {}) {
    return new Promise((resolve, reject) => {
        const callbackName = 'jsonpCallback_' + Date.now();
        
        // 콜백 함수를 전역 범위에 등록
        window[callbackName] = (response) => {
            // 응답이 오면 스크립트 태그 제거 및 콜백 함수 해제
            const script = document.getElementById(callbackName);
            if (script) {
                script.remove();
            }
            delete window[callbackName];
            
            if (response.success) {
                resolve(response);
            } else {
                reject(response.message || '서버 오류가 발생했습니다.');
            }
        };

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
        document.head.appendChild(script);

        // 오류 처리 (네트워크 오류, 타임아웃 등 - GAS에서 응답이 오지 않는 경우)
        // GAS는 HTTP 200 응답 내에서 오류를 반환하므로, 이는 주로 네트워크 레벨의 오류를 잡습니다.
        script.onerror = () => {
            reject('네트워크 연결 또는 서버 응답에 실패했습니다.');
            const script = document.getElementById(callbackName);
            if (script) {
                script.remove();
            }
            delete window[callbackName];
        };
    });
}

/**
 * QR 코드를 생성하고 표시합니다.
 * @param {string} url - QR 코드로 변환할 URL (출석 페이지 URL)
 */
function generateQRCode(url) {
    const qrCodeContainer = document.getElementById('qr-code');
    if (qrCodeContainer) {
        qrCodeContainer.innerHTML = '';
        new QRCode(qrCodeContainer, {
            text: url,
            width: 200,
            height: 200,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });
        document.getElementById('qr-link').href = url;
    }
}


// ==================== 인증 관리 ====================

/**
 * 관리자 인증 상태 확인 및 팝업 표시
 */
async function checkAdminStatus() {
    try {
        const response = await requestGas('checkAdminStatus');
        const status = response.isSet;

        if (status === false) {
            // 비밀번호 미설정 상태: 설정 팝업 강제 표시
            document.getElementById('admin-auth-title').textContent = '관리자 비밀번호 설정';
            document.getElementById('password-action').textContent = '비밀번호 설정';
            document.getElementById('current-password-group').style.display = 'none';
            document.getElementById('adminAuthModal').style.display = 'block';
            document.getElementById('password-action').onclick = setAdminPassword;
        } else {
            // 비밀번호 설정 상태: 관리자 페이지 로드
            document.getElementById('admin-container').style.display = 'block';
            await loadAdminData();
        }

    } catch (error) {
        console.error('인증 상태 확인 오류:', error);
        alert('서버와의 통신에 실패했습니다. 관리자에게 문의하세요.');
    }
}

/**
 * 관리자 인증 시도 (비밀번호 입력 팝업용)
 */
async function authenticateAdminAttempt() {
    const password = document.getElementById('current-password').value;
    if (!password) {
        alert('비밀번호를 입력해주세요.');
        return;
    }
    
    try {
        const response = await requestGas('authenticateAdmin', { password: password });
        
        if (response.isAuthenticated) {
            alert('인증 성공!');
            document.getElementById('adminAuthModal').style.display = 'none';
            document.getElementById('admin-container').style.display = 'block';
            await loadAdminData();
        } else {
            alert('비밀번호가 일치하지 않습니다.');
        }

    } catch (error) {
        alert('인증 중 오류가 발생했습니다: ' + error);
    }
}

/**
 * 관리자 비밀번호 설정/변경/해제 처리
 */
async function setAdminPassword() {
    const newPassword = document.getElementById('new-password').value;
    
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
            document.getElementById('adminAuthModal').style.display = 'none';
            // 상태 재확인 (새로운 상태에 맞춰 페이지 로드)
            await checkAdminStatus(); 
        } else {
            alert('비밀번호 설정에 실패했습니다.');
        }
    } catch (error) {
        alert('비밀번호 설정 중 오류가 발생했습니다: ' + error);
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
 * 저장된 출석 위치를 불러와 지도에 표시하고, 위치 설정 정보를 업데이트합니다.
 */
async function loadLocation() {
    try {
        const response = await requestGas('getLocation');
        const location = response.location;

        if (location) {
            const lat = location.latitude;
            const lon = location.longitude;
            const name = location.name;
            
            // 1. 지도에 마커 및 중심 이동
            const moveLatLon = new kakao.maps.LatLng(lat, lon);
            
            // 지도와 마커가 존재할 경우
            if (window.map && window.marker) { 
                window.map.setCenter(moveLatLon);
                window.marker.setPosition(moveLatLon);
            }
            
            // 2. 입력 필드 업데이트
            document.getElementById('latitude-input').value = lat;
            document.getElementById('longitude-input').value = lon;
            document.getElementById('location-name-input').value = name;
            
            // 3. 표시 영역 업데이트
            document.getElementById('current-location-display').textContent = 
                `현재 설정 위치: ${name} (위도: ${lat}, 경도: ${lon})`;

        } else {
            document.getElementById('current-location-display').textContent = 
                '**경고: 출석 위치가 설정되지 않았습니다.**';
        }

    } catch (error) {
        console.error('위치 불러오기 오류:', error);
        document.getElementById('current-location-display').textContent = 
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
    const name = document.getElementById('location-name-input').value.trim();

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
 * 관리자 페이지의 모든 데이터를 로드하고 표시합니다.
 */
async function loadAdminData() {
    // 로딩 인디케이터 표시
    document.getElementById('attendance-list').innerHTML = '로딩 중...';
    document.getElementById('member-list').innerHTML = '로딩 중...';

    // 1. 위치 로드 및 지도 초기화
    if (window.map === undefined) {
        initMap(); // 지도 초기화는 한 번만 수행
    }
    await loadLocation();

    // 2. 출석 페이지 QR 코드 생성 (출석 페이지의 실제 URL로 변경 필요)
    const attendanceUrl = GAS_URL.replace('/exec', '/dev'); // 또는 실제 배포된 출석 페이지 URL
    generateQRCode(attendanceUrl);

    // 3. 오늘 출석 현황 로드
    await loadTodayAttendance();

    // 4. 회원 목록 로드
    await loadMembers();
}

/**
 * 오늘 출석 현황을 서버에서 불러와 테이블에 표시합니다.
 */
async function loadTodayAttendance() {
    const container = document.getElementById('attendance-list');
    container.innerHTML = '출석 현황 로딩 중...';
    
    try {
        const response = await requestGas('getTodayAttendance');
        const attendance = response.attendance;

        if (attendance.length === 0) {
            container.innerHTML = '<p class="text-secondary">오늘 출석 기록이 없습니다.</p>';
            return;
        }

        let html = `
            <table class="table table-striped">
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
                    <td>${record.name}</td>
                    <td>${record.team}</td>
                    <td>${record.time}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;

    } catch (error) {
        container.innerHTML = `<p class="text-danger">출석 현황 로드 실패: ${error}</p>`;
        console.error('출석 현황 로드 오류:', error);
    }
}

/**
 * 전체 회원 목록을 서버에서 불러와 테이블에 표시합니다.
 */
async function loadMembers() {
    const container = document.getElementById('member-list');
    container.innerHTML = '회원 목록 로딩 중...';
    
    try {
        // 💡 GAS에서 캐싱된 회원 목록을 사용하므로, 속도가 빠릅니다.
        const response = await requestGas('getMembers');
        const members = response.members;

        if (members.length === 0) {
            container.innerHTML = '<p class="text-secondary">등록된 회원 목록이 없습니다.</p>';
            return;
        }

        let html = `
            <table class="table table-striped">
                <thead>
                    <tr>
                        <th>이름</th>
                        <th>팀</th>
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
            html += `
                <tr>
                    <td>${member.name}</td>
                    <td>${member.team}</td>
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


// ==================== 지도 API 초기화 (Kakao Map) ====================

/**
 * 카카오 맵을 초기화하고 마커를 설정합니다.
 * 이 함수는 HTML 파일의 <script> 태그에서 카카오 맵 API 로드 완료 후 호출되어야 합니다.
 */
function initMap() {
    const mapContainer = document.getElementById('map'), // 지도를 표시할 div 
          mapOption = { 
            center: new kakao.maps.LatLng(37.566826, 126.9786567), // 서울 시청
            level: 3 // 지도의 확대 레벨
        };
    
    // 지도를 생성합니다    
    window.map = new kakao.maps.Map(mapContainer, mapOption); 
    
    // 마커가 표시될 위치입니다. (초기 위치는 지도 중심)
    const initialPosition = mapOption.center;
    
    // 마커를 생성합니다
    window.marker = new kakao.maps.Marker({
        position: initialPosition,
        draggable: true // 마커를 드래그 가능하도록 설정합니다
    });

    // 마커가 지도 위에 표시되도록 설정합니다
    window.marker.setMap(window.map);
    
    // 마커 드래그가 끝났을 때 이벤트 처리
    kakao.maps.event.addListener(window.marker, 'dragend', function() {
        const latlng = window.marker.getPosition();
        document.getElementById('latitude-input').value = latlng.getLat();
        document.getElementById('longitude-input').value = latlng.getLng();
    });
    
    // 지도 클릭 시 해당 위치로 마커 이동 및 좌표 업데이트
    kakao.maps.event.addListener(window.map, 'click', function(mouseEvent) {
        const latlng = mouseEvent.latLng; 
        window.marker.setPosition(latlng);
        document.getElementById('latitude-input').value = latlng.getLat();
        document.getElementById('longitude-input').value = latlng.getLng();
    });

    // 초기 위치 로드
    loadLocation();
}

// ==================== 이벤트 리스너 및 초기 실행 ====================

document.addEventListener('DOMContentLoaded', () => {
    // 1. 관리자 인증 상태 확인 및 페이지 로드 시작
    checkAdminStatus(); 

    // 2. 이벤트 리스너 연결
    document.getElementById('auth-submit').addEventListener('click', authenticateAdminAttempt);
    document.getElementById('password-manage-btn').addEventListener('click', openPasswordManagementModal);
    document.getElementById('save-location-btn').addEventListener('click', saveLocation);
    document.getElementById('reload-data-btn').addEventListener('click', loadAdminData);
});

// 3. 카카오 지도 API가 로드되면 initMap 함수를 호출해야 합니다.
// (이 부분은 HTML 파일에서 <script src="...&autoload=false" ...> 후 window.kakao.maps.load(initMap); 와 같이 처리됩니다.)
