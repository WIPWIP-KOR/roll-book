// ====================================================================
// admin.js (클라이언트 측 JavaScript) - 수정된 전체 코드
// ====================================================================

// 설정
const CONFIG = {
    // ⚠️⚠️⚠️ 여기를 실제 Google Apps Script 배포 URL로 변경하세요 ⚠️⚠️⚠️
    GAS_URL: 'https://script.google.com/macros/s/AKfycbxjmvZWEErrnhyGtgyhrpBAoy8lF_Cw7V9bJNgTBCRQKeFrkROu-tp43uAcSEu9VxBd/exec', // 나중에 변경 필요
    ATTENDANCE_URL: window.location.origin
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

// ✨ 비밀번호 관리 DOM 요소 추가
const setPasswordBtn = document.getElementById('setPasswordBtn');
const newPasswordInput = document.getElementById('newPassword');
const passwordMessage = document.getElementById('passwordMessage');
const adminContent = document.getElementById('adminContent'); // 관리자 페이지 전체 컨테이너 ID (admin.html에 필요)


// =================================================================
// 💥 인증 시작 및 초기화 💥
// =================================================================

// 초기화
document.addEventListener('DOMContentLoaded', () => {
    if (typeof jQuery === 'undefined') {
        alert("jQuery 라이브러리가 로드되지 않았습니다. admin.html 파일을 확인하세요.");
        return;
    }

    // 1. 관리자 인증 상태 확인 (초기 진입 로직)
    // adminContent를 숨기고 인증 상태에 따라 표시하도록 처리 (admin.html의 CSS/구조 필요)
    if (adminContent) {
        adminContent.style.display = 'none';
    }
    
    // ✨✨✨ 핵심 수정 부분: 인증 상태 확인 시작 ✨✨✨
    google.script.run
        .withSuccessHandler(handleAdminStatus)
        .withFailureHandler(showError)
        .checkAdminStatus(); 
    // ✨✨✨ 수정 끝 ✨✨✨
    
    // 이벤트 리스너는 인증 성공 후 initializeAdminPage에서 연결하는 것이 더 안전하지만,
    // DOMContentLoaded에서 연결하고 버튼을 비활성화하는 방식으로 진행합니다.
    
    // 이벤트 리스너 연결 (페이지 로드 후, 인증 전)
    saveLocationBtn.addEventListener('click', saveLocation);
    getMyLocationBtn.addEventListener('click', getMyLocation);
    generateQRBtn.addEventListener('click', generateQRCode);
    downloadQRBtn.addEventListener('click', downloadQRCode);
    refreshTodayBtn.addEventListener('click', loadTodayAttendance);
    refreshMembersBtn.addEventListener('click', loadMembers);
    
    if (setPasswordBtn) {
        setPasswordBtn.addEventListener('click', handleSetPassword);
    }
});

/**
 * 관리자 인증 상태에 따라 페이지 로드 방식을 결정합니다. (Code.gs에서 호출됨)
 * @param {{isSet: boolean}} result - 비밀번호 설정 여부
 */
function handleAdminStatus(result) {
    console.log("Admin Status Check Result:", result);

    if (result.isSet === false) {
        // 💥 비밀번호가 미설정 상태: 팝업 없이 바로 관리자 페이지를 초기화합니다.
        initializeAdminPage();
    } else {
        // 비밀번호가 설정되어 있음: 팝업을 띄워 인증을 시도합니다.
        showPasswordPrompt();
    }
}

/**
 * 비밀번호가 설정되어 있을 때 팝업을 띄우고 인증을 시도합니다.
 */
function showPasswordPrompt() {
    const password = prompt("관리자 비밀번호를 입력하세요.");

    if (password !== null) {
        // 사용자 입력 비밀번호를 백엔드(authenticateAdmin)로 전송하여 인증 시도
        google.script.run
            .withSuccessHandler(function(authResult) {
                if (authResult.isAuthenticated) {
                    initializeAdminPage(); // 인증 성공
                } else {
                    alert("비밀번호가 일치하지 않습니다.");
                    showPasswordPrompt(); // 재시도
                }
            })
            .withFailureHandler(showError)
            .authenticateAdmin(password); // Code.gs의 authenticateAdmin 호출
    } else {
        alert("관리자 권한이 필요합니다.");
        // window.location.href = 'index.html'; // 일반 페이지로 리다이렉트 (선택 사항)
    }
}

/**
 * 비밀번호가 없거나 인증에 성공했을 때 관리자 페이지 초기화 (기존 초기화 코드 통합)
 */
function initializeAdminPage() {
    console.log("관리자 페이지 로드 시작.");
    if (adminContent) {
        adminContent.style.display = 'block'; // 숨겨진 콘텐츠 표시
    }

    // 출석 URL 설정
    attendanceUrlInput.value = CONFIG.ATTENDANCE_URL;

    // 카카오맵 초기화
    initKakaoMap();

    // 현재 설정된 위치 불러오기
    loadCurrentLocation();

    // 오늘 출석 현황 불러오기
    loadTodayAttendance();

    // 회원 목록 불러오기
    loadMembers();
}

/**
 * 일반적인 Google Apps Script 오류 핸들러
 */
function showError(error) {
    console.error("Scripts Error:", error);
    alert("오류가 발생했습니다: " + (error.message || error));
}


// =================================================================
// 2. 관리자 비밀번호 설정 기능 (AJAX / JSONP) - 기존 코드 유지 및 개선
// =================================================================

/**
 * 비밀번호 설정 버튼 클릭 처리 함수 (AJAX/JSONP 방식)
 */
function handleSetPassword() {
    if (typeof CONFIG === 'undefined' || !CONFIG.GAS_URL) {
        passwordMessage.textContent = "❌ CONFIG.GAS_URL이 정의되지 않았습니다. 관리자에게 문의하세요.";
        passwordMessage.style.color = 'red';
        return;
    }

    const newPassword = newPasswordInput.value.trim();
    passwordMessage.textContent = ''; 
    setPasswordBtn.disabled = true;

    if (newPassword === "") {
        const confirmClear = confirm("비밀번호를 공백으로 저장하면 관리자 인증이 해제됩니다. 계속하시겠습니까?");
        if (!confirmClear) {
            setPasswordBtn.disabled = false;
            return;
        }
    } else if (newPassword.length !== 4 || isNaN(newPassword)) {
        passwordMessage.textContent = '🚨 비밀번호는 정확히 4자리 숫자여야 합니다.';
        passwordMessage.style.color = 'red';
        setPasswordBtn.disabled = false;
        return;
    }

    const encodedPassword = encodeURIComponent(newPassword);
    const gasUrl = `${CONFIG.GAS_URL}?action=setAdminPassword&newPassword=${encodedPassword}`;
    
    $.ajax({
        url: gasUrl,
        dataType: 'jsonp', 
        success: function(data) {
            // Code.gs의 createResponse 구조에 따라 data.success가 true고, data.success.success가 true인지 확인
            if (data.success && (data.success === true || (data.success.success !== undefined && data.success.success === true))) { 
                const msg = (newPassword === "") 
                    ? '✅ 관리자 비밀번호가 해제(미등록)되었습니다. 다음 접속부터 바로 이동됩니다.'
                    : '✅ 관리자 비밀번호가 성공적으로 갱신되었습니다. 다음 접속부터 팝업이 나타납니다.';
                passwordMessage.textContent = msg;
                passwordMessage.style.color = 'green';
                newPasswordInput.value = ''; 
            } else {
                passwordMessage.textContent = '❌ 비밀번호 저장에 실패했습니다. (스크립트 오류 또는 유효하지 않은 비밀번호)';
                passwordMessage.style.color = 'red';
            }
        },
        error: function() {
            passwordMessage.textContent = '⚠️ 통신 오류: 비밀번호 저장에 실패했습니다. 네트워크를 확인하세요.';
            passwordMessage.style.color = 'red';
        },
        complete: function() {
            setPasswordBtn.disabled = false;
        }
    });
}

// =================================================================
// 3. 기존 관리자 기능 함수들 (유지)
// =================================================================

// 나머지 함수 (loadCurrentLocation, saveLocation, getMyLocation, generateQRCode, 
// downloadQRCode, loadTodayAttendance, loadMembers, showLocationMessage, 
// initKakaoMap, searchPlaces, placesSearchCB, selectPlace, setLocation, window.searchPlaces)
// 는 변경 없이 그대로 유지됩니다.

// 현재 설정된 위치 불러오기 (GET 요청, $.ajax 사용)
function loadCurrentLocation() {
    currentLocation.textContent = '위치 정보를 불러오는 중...';

    $.ajax({
        url: `${CONFIG.GAS_URL}?action=getLocation`,
        dataType: 'jsonp', 
        success: function(data) {
            if (data.success && data.location) {
                currentLocation.innerHTML = `
                    <strong>${data.location.name || '이름 없음'}</strong><br>
                    위도: ${data.location.latitude}<br>
                    경도: ${data.location.longitude}
                `;
            } else {
                currentLocation.textContent = '아직 위치가 설정되지 않았습니다.';
            }
        },
        error: function(jqXHR, textStatus, errorThrown) {
            console.error('위치 정보 로딩 실패:', textStatus, errorThrown);
            currentLocation.textContent = '위치 정보를 불러오는데 실패했습니다.';
        }
    });
}

// 위치 저장 (JSONP 요청, $.ajax 사용)
function saveLocation() {
    const lat = parseFloat(latitudeInput.value);
    const lng = parseFloat(longitudeInput.value);
    const name = locationNameInput.value.trim();

    if (!lat || !lng || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        showLocationMessage('유효한 위도와 경도를 입력해주세요.', 'error');
        return;
    }

    if (!name) {
        showLocationMessage('장소 이름을 입력해주세요.', 'error');
        return;
    }

    saveLocationBtn.disabled = true;
    saveLocationBtn.textContent = '저장 중...';

    const urlWithParams = `${CONFIG.GAS_URL}?action=saveLocation&latitude=${lat}&longitude=${lng}&name=${encodeURIComponent(name)}`;

    $.ajax({
        url: urlWithParams,
        dataType: 'jsonp',          
        success: function(data) {
            if (data.success) {
                showLocationMessage('위치가 저장되었습니다!', 'success');
                loadCurrentLocation();

                latitudeInput.value = '';
                longitudeInput.value = '';
                locationNameInput.value = '';
            } else {
                showLocationMessage(data.message || '위치 저장에 실패했습니다.', 'error');
            }
        },
        error: function(jqXHR, textStatus, errorThrown) {
            console.error('위치 저장 에러:', textStatus, errorThrown);
            showLocationMessage('위치 저장 중 오류가 발생했습니다.', 'error');
        },
        complete: function() {
            saveLocationBtn.disabled = false;
            saveLocationBtn.textContent = '위치 저장';
        }
    });
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

    qrcodeDiv.innerHTML = '';

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

// 오늘 출석 현황 불러오기 (GET 요청, $.ajax 사용)
function loadTodayAttendance() {
    refreshTodayBtn.disabled = true;
    todayAttendance.innerHTML = '<p class="loading">데이터를 불러오는 중</p>';

    $.ajax({
        url: `${CONFIG.GAS_URL}?action=getTodayAttendance`,
        dataType: 'jsonp', 
        success: function(data) {
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
        },
        error: function(jqXHR, textStatus, errorThrown) {
            console.error('출석 현황 로딩 실패:', textStatus, errorThrown);
            todayAttendance.innerHTML = '<p style="color: red;">데이터를 불러오는데 실패했습니다.</p>';
        },
        complete: function() {
            refreshTodayBtn.disabled = false;
        }
    });
}

// 회원 목록 불러오기 (GET 요청, $.ajax 사용)
function loadMembers() {
    refreshMembersBtn.disabled = true;
    membersList.innerHTML = '<p class="loading">데이터를 불러오는 중</p>';

    $.ajax({
        url: `${CONFIG.GAS_URL}?action=getMembers`,
        dataType: 'jsonp', 
        success: function(data) {
            if (data.success && data.members && data.members.length > 0) {
                membersList.innerHTML = '';

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
        },
        error: function(jqXHR, textStatus, errorThrown) {
            console.error('회원 목록 로딩 실패:', textStatus, errorThrown);
            membersList.innerHTML = '<p style="color: red;">데이터를 불러오는데 실패했습니다.</p>';
        },
        complete: function() {
            refreshMembersBtn.disabled = false;
        }
    });
}

// 위치 메시지 표시
function showLocationMessage(text, type) {
    locationMessage.textContent = text;
    locationMessage.className = `message ${type} show`;

    setTimeout(() => {
        locationMessage.classList.remove('show');
    }, 5000);
}

// ==================== 카카오맵 관련 (기존 코드 유지) ====================

let map; // 카카오맵 객체
let marker; // 마커 객체
let ps; // 장소 검색 객체

/**
 * 카카오맵 초기화
 */
function initKakaoMap() {
    if (typeof kakao === 'undefined') {
        console.warn('카카오맵 API가 로드되지 않았습니다. admin.html의 YOUR_KAKAO_APP_KEY를 발급받은 키로 변경하세요.');
        const mapEl = document.getElementById('map');
        if (mapEl) {
            mapEl.innerHTML = '<p style="padding: 20px; text-align: center; color: #999;">카카오맵 API 키를 설정해주세요. 자세한 내용은 https://developers.kakao.com 를 확인하세요.</p>';
        }
        return;
    }

    const defaultPosition = new kakao.maps.LatLng(37.5665, 126.9780);

    const mapContainer = document.getElementById('map');
    const mapOption = {
        center: defaultPosition,
        level: 3
    };

    map = new kakao.maps.Map(mapContainer, mapOption);
    ps = new kakao.maps.services.Places();

    kakao.maps.event.addListener(map, 'click', function(mouseEvent) {
        const latlng = mouseEvent.latLng;
        setLocation(latlng.getLat(), latlng.getLng(), '지도에서 선택한 위치');
    });

    console.log('카카오맵 초기화 완료');
}

/**
 * 장소 검색
 */
function searchPlaces() {
    if (!ps) {
        alert('카카오맵 API가 로드되지 않았습니다.');
        return;
    }

    const keyword = document.getElementById('mapSearch').value.trim();

    if (!keyword) {
        alert('검색어를 입력해주세요.');
        return;
    }

    ps.keywordSearch(keyword, placesSearchCB);
}

/**
 * 장소 검색 결과 콜백
 */
function placesSearchCB(data, status, pagination) {
    const searchResults = document.getElementById('searchResults');

    if (status === kakao.maps.services.Status.OK) {
        searchResults.innerHTML = '<h4>검색 결과</h4>';

        data.forEach((place, index) => {
            const resultItem = document.createElement('div');
            resultItem.className = 'search-result-item';
            resultItem.innerHTML = `
                <div class="result-number">${index + 1}</div>
                <div class="result-content">
                    <strong>${place.place_name}</strong>
                    <div class="result-address">${place.address_name}</div>
                    ${place.phone ? `<div class="result-phone">📞 ${place.phone}</div>` : ''}
                </div>
            `;

            resultItem.onclick = () => {
                selectPlace(place);
            };

            searchResults.appendChild(resultItem);
        });

    } else if (status === kakao.maps.services.Status.ZERO_RESULT) {
        searchResults.innerHTML = '<p style="padding: 20px; text-align: center;">검색 결과가 없습니다.</p>';
    } else if (status === kakao.maps.services.Status.ERROR) {
        searchResults.innerHTML = '<p style="padding: 20px; text-align: center; color: red;">검색 중 오류가 발생했습니다.</p>';
    }
}

/**
 * 검색 결과에서 장소 선택
 */
function selectPlace(place) {
    const lat = parseFloat(place.y);
    const lng = parseFloat(place.x);
    const name = place.place_name;

    setLocation(lat, lng, name);

    const position = new kakao.maps.LatLng(lat, lng);
    map.setCenter(position);

    document.getElementById('searchResults').innerHTML = '';
}

/**
 * 위치 설정 (마커 표시 및 입력란 자동 입력)
 */
function setLocation(lat, lng, name) {
    document.getElementById('latitude').value = lat;
    document.getElementById('longitude').value = lng;
    document.getElementById('locationName').value = name;

    if (marker) {
        marker.setMap(null);
    }

    const position = new kakao.maps.LatLng(lat, lng);
    marker = new kakao.maps.Marker({
        position: position,
        map: map
    });

    map.setCenter(position);

    showLocationMessage(`위치가 선택되었습니다: ${name}`, 'success');
}

// 전역 함수로 노출 (HTML에서 호출)
window.searchPlaces = searchPlaces
