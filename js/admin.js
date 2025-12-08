// ==================== 설정 ====================
const CONFIG = {
    GAS_URL: 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec',
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

let map, marker, ps;

// ==================== 초기화 ====================
document.addEventListener('DOMContentLoaded', () => {
    attendanceUrlInput.value = CONFIG.ATTENDANCE_URL;
    initKakaoMap();
    loadCurrentLocation();
    loadTodayAttendance();
    loadMembers();

    saveLocationBtn.addEventListener('click', saveLocation);
    getMyLocationBtn.addEventListener('click', getMyLocation);
    generateQRBtn.addEventListener('click', generateQRCode);
    downloadQRBtn.addEventListener('click', downloadQRCode);
    refreshTodayBtn.addEventListener('click', loadTodayAttendance);
    refreshMembersBtn.addEventListener('click', loadMembers);
});

// ==================== 위치 관련 ====================
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

async function saveLocation() {
    const lat = parseFloat(latitudeInput.value);
    const lng = parseFloat(longitudeInput.value);
    const name = locationNameInput.value.trim();

    if (isNaN(lat) || isNaN(lng)) return showLocationMessage('위도와 경도를 입력해주세요.', 'error');
    if (lat < -90 || lat > 90) return showLocationMessage('위도는 -90 ~ 90 사이의 값이어야 합니다.', 'error');
    if (lng < -180 || lng > 180) return showLocationMessage('경도는 -180 ~ 180 사이의 값이어야 합니다.', 'error');
    if (!name) return showLocationMessage('장소 이름을 입력해주세요.', 'error');

    saveLocationBtn.disabled = true;
    saveLocationBtn.textContent = '저장 중...';

    try {
        const response = await fetch(CONFIG.GAS_URL, {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ action:'saveLocation', latitude:lat, longitude:lng, name:name })
        });
        const data = await response.json();
        if (data.success) {
            showLocationMessage('위치가 저장되었습니다!', 'success');
            loadCurrentLocation();
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

function getMyLocation() {
    if (!navigator.geolocation) return showLocationMessage('위치 서비스를 지원하지 않는 브라우저입니다.', 'error');

    getMyLocationBtn.disabled = true;
    getMyLocationBtn.textContent = '위치 확인 중...';

    navigator.geolocation.getCurrentPosition(
        pos => {
            latitudeInput.value = pos.coords.latitude;
            longitudeInput.value = pos.coords.longitude;
            showLocationMessage('현재 위치를 가져왔습니다!', 'success');
            getMyLocationBtn.disabled = false;
            getMyLocationBtn.textContent = '내 현재 위치 가져오기';
        },
        err => {
            let errorMsg = '위치 정보를 가져올 수 없습니다.';
            switch(err.code) {
                case err.PERMISSION_DENIED: errorMsg='권한 거부'; break;
                case err.POSITION_UNAVAILABLE: errorMsg='위치 사용 불가'; break;
                case err.TIMEOUT: errorMsg='요청 시간 초과'; break;
            }
            showLocationMessage(errorMsg, 'error');
            getMyLocationBtn.disabled = false;
            getMyLocationBtn.textContent = '내 현재 위치 가져오기';
        },
        {enableHighAccuracy:true}
    );
}

// ==================== QR 코드 ====================
function generateQRCode() {
    const url = attendanceUrlInput.value;
    if (!url) return alert('URL이 없습니다.');

    qrcodeDiv.innerHTML = '';
    new QRCode(qrcodeDiv, {text:url,width:256,height:256,colorDark:'#000000',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.H});
    downloadQRBtn.style.display='block';
}

function downloadQRCode() {
    const canvas = qrcodeDiv.querySelector('canvas');
    if (!canvas) return alert('QR 코드를 먼저 생성해주세요.');
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = 'futsal-attendance-qr.png';
    link.href = url;
    link.click();
}

// ==================== 오늘 출석 / 회원 ====================
async function loadTodayAttendance() {
    todayAttendance.innerHTML='<p class="loading">데이터를 불러오는 중</p>';
    try {
        const res = await fetch(`${CONFIG.GAS_URL}?action=getTodayAttendance`);
        const data = await res.json();
        if (data.success && data.attendance?.length>0) {
            todayAttendance.innerHTML='';
            data.attendance.forEach(r=>{
                const div=document.createElement('div');
                div.className='attendance-item';
                div.innerHTML=`<strong>${r.name}</strong> (${r.team}팀)<div style="font-size:0.9em;color:#666;margin-top:5px;">${r.time}</div>`;
                todayAttendance.appendChild(div);
            });
        } else todayAttendance.innerHTML='<p>오늘 출석 기록이 없습니다.</p>';
    } catch(e){todayAttendance.innerHTML='<p style="color:red;">데이터를 불러오는데 실패했습니다.</p>';}
}

async function loadMembers() {
    membersList.innerHTML='<p class="loading">데이터를 불러오는 중</p>';
    try{
        const res = await fetch(`${CONFIG.GAS_URL}?action=getMembers`);
        const data = await res.json();
        if(data.success && data.members?.length>0){
            membersList.innerHTML='';
            data.members.sort((a,b)=>{
                if(a.team!==b.team) return a.team.localeCompare(b.team);
                return a.name.localeCompare(b.name);
            }).forEach(m=>{
                const div=document.createElement('div');
                div.className='member-item';
                div.innerHTML=`<strong>${m.name}</strong> (${m.team}팀)<div style="font-size:0.9em;color:#666;">출석 ${m.attendanceCount||0}회</div>`;
                membersList.appendChild(div);
            });
        } else membersList.innerHTML='<p>등록된 회원이 없습니다.</p>';
    }catch(e){membersList.innerHTML='<p style="color:red;">데이터를 불러오는데 실패했습니다.</p>';}
}

// ==================== 메시지 ====================
function showLocationMessage(text,type){
    locationMessage.textContent=text;
    locationMessage.className=`message ${type} show`;
    setTimeout(()=>{locationMessage.classList.remove('show');},5000);
}

// ==================== 카카오맵 ====================
function initKakaoMap(){
    if(typeof kakao==='undefined'){console.warn('카카오맵 API 미로드'); return;}
    const defaultPos = new kakao.maps.LatLng(37.5665,126.9780);
    map=new kakao.maps.Map(document.getElementById('map'),{center:defaultPos,level:3});
    ps=new kakao.maps.services.Places();
    kakao.maps.event.addListener(map,'click',mouseEvent=>{
        const latlng=mouseEvent.latLng;
        setLocation(latlng.getLat(),latlng.getLng(),'지도에서 선택한 위치');
    });
}

function searchPlaces(){
    if(!ps) return alert('카카오맵 API 미로드');
    const keyword=document.getElementById('mapSearch').value.trim();
    if(!keyword) return alert('검색어를 입력해주세요');
    ps.keywordSearch(keyword,placesSearchCB);
}

function placesSearchCB(data,status){
    const searchResults=document.getElementById('searchResults');
    searchResults.innerHTML='';
    if(status===kakao.maps.services.Status.OK){
        data.forEach((place,index)=>{
            const div=document.createElement('div');
            div.className='search-result-item';
            div.innerHTML=`<div class="result-number">${index+1}</div><div class="result-content"><strong>${place.place_name}</strong><div class="result-address">${place.address_name}</div>${place.phone?`<div class="result-phone">📞 ${place.phone}</div>`:''}</div>`;
            div.onclick=()=>{selectPlace(place)};
            searchResults.appendChild(div);
        });
    }else searchResults.innerHTML='<p>검색 결과가 없습니다.</p>';
}

function selectPlace(place){
    setLocation(parseFloat(place.y),parseFloat(place.x),place.place_name);
    map.setCenter(new kakao.maps.LatLng(parseFloat(place.y),parseFloat(place.x)));
    document.getElementById('searchResults').innerHTML='';
}

function setLocation(lat,lng,name){
    latitudeInput.value=lat;
    longitudeInput.value=lng;
    locationNameInput.value=name;
    if(marker) marker.setMap(null);
    marker=new kakao.maps.Marker({position:new kakao.maps.LatLng(lat,lng),map:map});
    map.setCenter(new kakao.maps.LatLng(lat,lng));
    showLocationMessage(`위치가 선택되었습니다: ${name}`,'success');
}

window.searchPlaces=searchPlaces;