/**
 * 풋살 동호회 출석 시스템 - 통계 페이지 (stats.js)
 * * 기능:
 * 1. 연도별 통계 데이터 로드 (성능 최적화 적용)
 * 2. 동적 연도 탭 및 카테고리 탭 생성 및 전환 (팀별/개인별/월별)
 * 3. 개인별 통계 필터링 및 정렬 기능 구현
 * 4. HTML ID 불일치 및 초기화 오류 수정 완료 (personalStats, teamStats, weeklyStats 사용)
 */

// Google Apps Script 배포 URL로 변경해야 합니다.
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxjmvZWEErrnhyGtgyhrpBAoy8lF_Cw7V9bJNgTBCRQKeFrkROu-tp43uAcSEu9VxBd/exec';

// 인증 토큰 유효 시간 (30분)
const AUTH_TOKEN_DURATION = 30 * 60 * 1000;

// ==================== 전역 데이터 및 유틸리티 ====================

let currentYear = null;
let allStats = {}; // { 2025: {personal: [...], ...}, 2026: {...} }

/**
 * GAS 서버에 JSONP 요청을 보내는 범용 함수
 * @param {string} action - 실행할 Apps Script 함수 (액션)
 * @param {object} params - 요청에 포함할 파라미터 객체
 * @returns {Promise} - 서버 응답 결과를 resolve 하는 프로미스
 */
function requestGas(action, params = {}) {
    return new Promise((resolve, reject) => {
        const callbackName = 'jsonpCallback_' + Date.now();
        
        window[callbackName] = (response) => {
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

        const script = document.createElement('script');
        script.src = url.toString();
        script.id = callbackName;
        document.head.appendChild(script);

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
        return false;
    }

    try {
        const tokenData = JSON.parse(tokenStr);
        const elapsed = Date.now() - tokenData.timestamp;

        if (elapsed > AUTH_TOKEN_DURATION) {
            sessionStorage.removeItem('adminAuthToken');
            return false;
        }

        return true;
    } catch (error) {
        sessionStorage.removeItem('adminAuthToken');
        return false;
    }
}

// ==================== 관리자 인증 ====================

/**
 * 관리자 링크 클릭 시 인증 확인
 */
async function handleAdminLinkClick(e) {
    e.preventDefault();

    // 1. 토큰이 유효하면 바로 이동
    if (isAuthTokenValid()) {
        console.log('✅ 유효한 토큰 - 바로 이동');
        window.location.href = 'admin.html';
        return;
    }

    // 2. 토큰이 없거나 만료됨 - 비밀번호 확인
    console.log('🔑 인증 필요 - 모달 표시');
    showAdminAuthModal();
}

/**
 * 관리자 인증 모달 표시
 */
function showAdminAuthModal() {
    const modal = document.getElementById('adminAuthModal');
    modal.style.display = 'flex';
    document.getElementById('adminPassword').focus();
}

/**
 * 관리자 인증 모달 숨기기
 */
function hideAdminAuthModal() {
    const modal = document.getElementById('adminAuthModal');
    modal.style.display = 'none';
    document.getElementById('adminPassword').value = '';
    document.getElementById('adminAuthMessage').textContent = '';
}

/**
 * 관리자 비밀번호 인증 시도
 */
async function attemptAdminAuth() {
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
            messageEl.textContent = '인증 성공! 이동 중...';
            messageEl.className = 'message-area success';

            // 토큰 저장
            setAuthToken();

            // 관리자 페이지로 이동
            setTimeout(() => {
                window.location.href = 'admin.html';
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

// ==================== 로딩 스피너 관리 ====================

/**
 * 로딩 스피너 표시
 */
function showLoadingSpinner(message = '데이터를 불러오는 중...') {
    const loadingDiv = document.getElementById('stats-display');
    loadingDiv.innerHTML = `
        <div class="alert alert-info" style="text-align: center;">
            <div style="display: inline-block; width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #667eea; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 10px;"></div>
            <div>${message}</div>
        </div>
        <style>
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    `;
}

/**
 * 로딩 메시지 업데이트
 */
function updateLoadingSpinner(message) {
    const loadingDiv = document.getElementById('stats-display');
    const messageDiv = loadingDiv.querySelector('div.alert > div:last-child');
    if (messageDiv) {
        messageDiv.textContent = message;
    }
}

/**
 * 로딩 스피너 숨기기
 */
function hideLoadingSpinner() {
    document.getElementById('stats-display').innerHTML = '';
}

/**
 * 백그라운드에서 다른 연도들의 데이터를 미리 로드
 */
async function preloadOtherYears(years) {
    console.log('🚀 백그라운드 프리로딩 시작:', years);

    for (const year of years) {
        try {
            // 이미 캐시된 경우 스킵
            if (allStats[year]) {
                console.log(`✅ ${year}년 데이터는 이미 캐시됨`);
                continue;
            }

            console.log(`📥 ${year}년 데이터 로딩 중...`);
            const response = await requestGas('getStats', { year: year });
            const stats = response.stats;

            // 캐시에 저장
            allStats[year] = stats;
            console.log(`✅ ${year}년 데이터 캐시 완료`);

            // 너무 빠르게 연속 요청하지 않도록 짧은 딜레이
            await new Promise(resolve => setTimeout(resolve, 500));

        } catch (error) {
            console.error(`❌ ${year}년 데이터 프리로딩 실패:`, error);
            // 에러가 나도 계속 진행
        }
    }

    console.log('✅ 모든 연도 데이터 프리로딩 완료');
}

// ==================== 연도 및 데이터 로드 관리 ====================

/**
 * 페이지 로드 시 실행: 사용 가능한 모든 연도를 가져와 탭을 초기화합니다.
 */
async function initStatsPage() {
    try {
        // 로딩 스피너 표시
        showLoadingSpinner('연도 목록을 불러오는 중...');

        // 데이터 로드가 성공하면 컨텐츠 Wrapper를 숨김 상태로 시작
        document.getElementById('stats-content-wrapper').style.display = 'none';

        const response = await requestGas('getAvailableYears');
        const availableYears = response.availableYears;

        if (!Array.isArray(availableYears) || availableYears.length === 0) {
            hideLoadingSpinner();
            document.getElementById('stats-display').innerHTML =
                '<p class="alert alert-warning">출석 기록이 있는 연도가 없습니다. (시트 이름이 출석기록_YYYY 형식인지 확인하세요)</p>';
            return;
        }

        // 1. 연도 탭 생성 및 초기 선택
        initYearTabs(availableYears);
        currentYear = availableYears[0];
        document.getElementById(`year-tab-${currentYear}`).classList.add('active');

        // 2. 카테고리 탭 초기화 및 이벤트 연결
        initCategoryTabs();

        // 3. 현재 연도 데이터 먼저 로드 (빠른 표시)
        updateLoadingSpinner(`${currentYear}년 데이터를 불러오는 중...`);
        await loadStats(currentYear);

        // 4. 로딩 메시지 제거 및 컨텐츠 표시
        hideLoadingSpinner();
        document.getElementById('stats-content-wrapper').style.display = 'block';

        // 5. 🚀 백그라운드에서 다른 연도 데이터 미리 로드
        if (availableYears.length > 1) {
            preloadOtherYears(availableYears.slice(1));
        }

    } catch (error) {
        hideLoadingSpinner();
        document.getElementById('stats-display').innerHTML =
            `<p class="alert alert-danger">연도 정보 로딩에 실패했습니다. (GAS URL 또는 서버 함수 오류): ${error}</p>`;
        console.error("Available Years Load Error:", error);
    }
}

/**
 * 연도 탭 클릭 시 이벤트 핸들러
 */
async function handleYearChange(year) {
    if (year === currentYear) return;

    // UI 변경
    if (currentYear) {
        document.getElementById(`year-tab-${currentYear}`).classList.remove('active');
    }
    document.getElementById(`year-tab-${year}`).classList.add('active');
    currentYear = year;

    // 데이터 로드
    await loadStats(year);
}

/**
 * 특정 연도의 통계 데이터를 서버에서 로드하거나 캐시에서 가져옵니다.
 */
async function loadStats(year) {
    // 1. 캐시된 데이터 확인
    if (allStats[year]) {
        console.log(`✅ ${year}년 데이터 캐시에서 로드`);
        displayStats(allStats[year]);
        hideLoadingSpinner();
        document.getElementById('stats-content-wrapper').style.display = 'block';
        return;
    }

    // 2. 서버에 요청
    try {
        showLoadingSpinner(`${year}년 통계 데이터를 불러오는 중...`);
        document.getElementById('stats-content-wrapper').style.display = 'none';

        const response = await requestGas('getStats', { year: year });
        const stats = response.stats;

        // 데이터 캐시 저장 및 표시
        allStats[year] = stats;
        displayStats(stats);

        hideLoadingSpinner();
        document.getElementById('stats-content-wrapper').style.display = 'block';

    } catch (error) {
        hideLoadingSpinner();
        document.getElementById('stats-display').innerHTML =
            `<p class="alert alert-danger">통계 데이터 로드 실패 (${year}년): ${error}</p>`;
        document.getElementById('stats-content-wrapper').style.display = 'none';
        console.error(`Stats Load Error (${year}):`, error);
    }
}

// ==================== 카테고리 및 필터 관리 ====================

function initCategoryTabs() {
    // 1. 카테고리 탭 이벤트 리스너 연결
    document.querySelectorAll('.category-tab').forEach(button => {
        button.addEventListener('click', function() {
            handleCategoryChange(this.dataset.category);
        });
    });

    // 2. 개인별 통계 필터 및 정렬 이벤트 연결
    document.querySelectorAll('.filter-btn').forEach(button => {
        button.addEventListener('click', function() {
            handlePersonalFilterChange('team', this.dataset.team);
        });
    });

    document.getElementById('sortOption').addEventListener('change', function() {
        handlePersonalFilterChange('sort', this.value);
    });

    // 3. 초기 상태 설정: 팀별 통계 활성화
    handleCategoryChange('team', true); 
}

/**
 * 카테고리 탭 클릭 시 화면 전환
 */
function handleCategoryChange(category, isInit = false) {
    // UI 활성화/비활성화
    document.querySelectorAll('.category-tab').forEach(button => {
        if (button.dataset.category === category) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });

    // 콘텐츠 영역 표시/숨김
    document.getElementById('teamStats').style.display = 'none';
    document.getElementById('personalStats').style.display = 'none';
    document.getElementById('weeklyStats').style.display = 'none';
    document.getElementById('monthTabs').style.display = 'none';
    
    switch (category) {
        case 'team':
            document.getElementById('teamStats').style.display = 'block';
            break;
        case 'personal':
            document.getElementById('personalStats').style.display = 'block';
            // 개인별 통계 표시 시, 필터/정렬 상태에 따라 테이블 다시 그리기
            if (allStats[currentYear]) {
                const teamFilter = document.querySelector('.filter-btn.active').dataset.team;
                const sortOption = document.getElementById('sortOption').value;
                displayPersonalStats(allStats[currentYear].personalStats, teamFilter, sortOption);
            }
            break;
        case 'monthly':
            document.getElementById('weeklyStats').style.display = 'block';
            document.getElementById('monthTabs').style.display = 'flex';
            
            // 월별 탭이 클릭되지 않은 상태라면, 가장 최근 월을 강제 클릭
            if (allStats[currentYear]) {
                const activeMonthTab = document.querySelector('.month-tab.active');
                if (!activeMonthTab || isInit) {
                    const initialMonth = getCurrentMonthFromStats(allStats[currentYear].weeklyStats);
                    if (initialMonth) {
                        // 엘리먼트가 존재하는지 확인 후 클릭
                        document.getElementById(`month-tab-${initialMonth}`)?.click(); 
                    }
                } else if (!isInit) {
                    activeMonthTab.click(); 
                }
            }
            break;
    }
}

/**
 * 개인별 통계 필터/정렬 변경 핸들러
 */
function handlePersonalFilterChange(type, value) {
    if (!allStats[currentYear]) return;

    if (type === 'team') {
        // 팀 필터 UI 변경
        document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`.filter-btn[data-team="${value}"]`).classList.add('active');
    }
    
    // 현재 필터/정렬 값 가져오기
    const teamFilter = document.querySelector('.filter-btn.active').dataset.team;
    const sortOption = document.getElementById('sortOption').value;

    displayPersonalStats(allStats[currentYear].personalStats, teamFilter, sortOption);
}

// ==================== 데이터 표시 및 가공 ====================

/**
 * 불러온 데이터를 바탕으로 통계를 표시합니다. (HTML ID 불일치 오류 수정 완료)
 */
function displayStats(stats) {
    // 탭 및 초기 표시 설정
    initMonthTabs(stats.weeklyStats);
    
    // 개인별 통계 필터 초기값 설정 (필요 시)
    const teamFilter = document.querySelector('.filter-btn.active')?.dataset.team || 'all';
    const sortOption = document.getElementById('sortOption')?.value || 'rate-desc';
    
    // 🚨 수정됨: HTML ID에 맞게 초기화 (personalStats, teamStats, weeklyStats 사용)
    document.getElementById('personalStats').innerHTML = ''; 
    document.getElementById('teamStats').innerHTML = '';     
    document.getElementById('weeklyStats').innerHTML = '';   

    // 개인별 통계 표시 (이 함수 내에서 personalStats 컨테이너에 내용 채움)
    displayPersonalStats(stats.personalStats, teamFilter, sortOption); 

    // 팀별 통계 표시
    displayTeamStats(stats.teamStats);
    
    // 초기 로드 시 팀별 통계 탭이 활성화되도록 설정
    handleCategoryChange('team', true);

    // 기간 정보 업데이트
    const periodElement = document.querySelector('.period');
    if (periodElement) {
        periodElement.textContent = `${stats.targetYear}년 통계 (${stats.totalSaturdays}주 기준)`;
    }

    // HTML 내의 stats-display 영역 초기화 (로딩 메시지 제거)
    document.getElementById('stats-display').innerHTML = '';
    
    // 통계 내용 전체 Wrapper 표시
    document.getElementById('stats-content-wrapper').style.display = 'block'; 
}

function displayPersonalStats(personalStats, teamFilter, sortOption) {
    const container = document.getElementById('personalStats');
    
    // 1. 필터링
    let filteredStats = personalStats;
    if (teamFilter !== 'all') {
        filteredStats = personalStats.filter(p => p.team === teamFilter);
    }
    
    // 2. 정렬
    filteredStats.sort((a, b) => {
        switch (sortOption) {
            case 'rate-asc':
                return a.rate - b.rate;
            case 'name':
                return a.name.localeCompare(b.name);
            case 'count-desc':
                return b.attendanceCount - a.attendanceCount;
            case 'rate-desc':
            default:
                return b.rate - a.rate;
        }
    });

    const targetYear = allStats[currentYear].targetYear;
    const totalSaturdays = allStats[currentYear].totalSaturdays;

    let html = `
        <h4>👤 ${targetYear}년 개인 출석 통계 (${totalSaturdays}주 기준)</h4>
    `;
    
    if (filteredStats.length === 0) {
        html += `<p class="text-secondary">필터링 조건에 맞는 기록이 없습니다.</p>`;
    } else {
        html += `
            <table class="table table-striped table-hover">
                <thead>
                    <tr>
                        <th>순위</th>
                        <th>이름</th>
                        <th>팀</th>
                        <th class="text-end">출석 횟수</th>
                        <th class="text-end">출석률 (%)</th>
                    </tr>
                </thead>
                <tbody>
        `;

        filteredStats.forEach((p, index) => {
            const rateDisplay = p.rate.toFixed(1);
            html += `
                <tr>
                    <td>${index + 1}</td>
                    <td>${p.name}</td>
                    <td><span class="badge bg-primary">${p.team}</span></td>
                    <td class="text-end">${p.attendanceCount} / ${totalSaturdays}</td>
                    <td class="text-end">
                        <span class="fw-bold">${rateDisplay}%</span>
                    </td>
                </tr>
            `;
        });
        html += '</tbody></table>';
    }
    
    // 기존 필터 그룹 DIV를 찾습니다.
    const filterGroupDiv = container.querySelector('.filter-options');
    
    // 컨테이너 전체를 새 내용으로 덮어씁니다.
    container.innerHTML = html;
    
    // 필터 그룹이 존재하면, 새 내용의 맨 위에 다시 넣어줍니다.
    if (filterGroupDiv) {
        container.prepend(filterGroupDiv);
    }
}


function displayTeamStats(teamStats) {
    const container = document.getElementById('teamStats');
    const targetYear = allStats[currentYear].targetYear;

    container.innerHTML = `<h4>🏆 ${targetYear}년 팀별 평균 출석률</h4>`;

    const teams = Object.keys(teamStats).sort();

    let cardsHtml = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-top: 20px;">';

    teams.forEach(team => {
        const stats = teamStats[team];
        const rateDisplay = stats.rate.toFixed(1);
        const countDisplay = stats.count.toFixed(1);

        let bgColor = '';
        if (team === 'A') bgColor = 'bg-success';
        else if (team === 'B') bgColor = 'bg-info';
        else if (team === 'C') bgColor = 'bg-warning';

        cardsHtml += `
            <div class="card text-white ${bgColor}">
                <div class="card-body">
                    <h5 class="card-title">팀 ${team}</h5>
                    <p class="card-text fs-3">${rateDisplay}%</p>
                    <p class="card-text small">평균 출석 횟수: ${countDisplay}회</p>
                </div>
            </div>
        `;
    });

    cardsHtml += '</div>';
    container.innerHTML += cardsHtml;
}

function initYearTabs(years) {
    const yearTabsContainer = document.getElementById('yearTabs');
    yearTabsContainer.innerHTML = ''; 

    years.forEach(year => {
        const button = document.createElement('button');
        button.className = 'tab-btn year-tab';
        button.id = `year-tab-${year}`;
        button.textContent = year;
        button.onclick = () => handleYearChange(year);
        yearTabsContainer.appendChild(button);
    });
}

function initMonthTabs(weeklyStats) {
    const monthTabsContainer = document.getElementById('monthTabs');
    monthTabsContainer.innerHTML = '';
    
    if (!Array.isArray(weeklyStats) || weeklyStats.length === 0) return;
    
    const months = new Set();
    
    weeklyStats.forEach(stat => {
        if (!stat || !stat.fullDate) return; 
        const month = parseInt(stat.fullDate.substring(5, 7));
        if (month >= 1 && month <= 12) {
            months.add(month);
        }
    });
    
    const sortedMonths = Array.from(months).sort((a, b) => a - b);

    sortedMonths.forEach(month => {
        const button = document.createElement('button');
        button.className = 'tab-btn month-tab';
        button.id = `month-tab-${month}`;
        button.textContent = `${month}월`;
        button.onclick = () => {
            document.querySelectorAll('.month-tab').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            filterWeeklyStatsByMonth(month, allStats[currentYear].weeklyStats);
        };
        monthTabsContainer.appendChild(button);
    });
}

function getCurrentMonthFromStats(weeklyStats) {
    if (weeklyStats.length === 0) return null;
    const lastStat = weeklyStats[weeklyStats.length - 1];
    return parseInt(lastStat.fullDate.substring(5, 7));
}

function filterWeeklyStatsByMonth(month, weeklyStats) {
    const container = document.getElementById('weeklyStats');
    
    // 월별 헤더 업데이트 또는 생성
    let header = container.querySelector('h4');
    if (!header) {
        header = document.createElement('h4');
        container.prepend(header);
    }
    header.textContent = `📅 ${month}월 주차별 출석 현황`;
    
    // 테이블 내용을 담을 컨테이너
    let tableContent = container.querySelector('#weekly-table-content');
    if (!tableContent) {
        tableContent = document.createElement('div');
        tableContent.id = 'weekly-table-content';
        container.appendChild(tableContent);
    }
    
    const monthStr = month.toString().padStart(2, '0');
    
    const filteredStats = weeklyStats.filter(stat => {
        return stat.fullDate.substring(5, 7) === monthStr;
    });

    if (filteredStats.length === 0) {
        tableContent.innerHTML = `<p class="text-secondary">${month}월의 출석 기록이 없습니다.</p>`;
        return;
    }

    let html = `
        <table class="table">
            <thead>
                <tr>
                    <th>날짜</th>
                    <th>주차</th>
                    <th>전체 출석</th>
                    <th class="text-center">A팀</th>
                    <th class="text-center">B팀</th>
                    <th class="text-center">C팀</th>
                </tr>
            </thead>
            <tbody>
    `;

    filteredStats.forEach((stat, index) => {
        html += `
            <tr>
                <td>${stat.date}</td>
                <td>${index + 1}주차</td>
                <td><span class="badge bg-dark">${stat.count}명</span></td>
                <td class="text-center">${stat.teamCounts.A}</td>
                <td class="text-center">${stat.teamCounts.B}</td>
                <td class="text-center">${stat.teamCounts.C}</td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    tableContent.innerHTML = html;
}

// ==================== 초기 실행 ====================

document.addEventListener('DOMContentLoaded', () => {
    // 1. 통계 페이지 초기화
    initStatsPage();

    // 2. 관리자 링크 클릭 이벤트
    document.getElementById('adminLink').addEventListener('click', handleAdminLinkClick);

    // 3. 관리자 인증 모달 이벤트
    document.getElementById('adminAuthSubmit').addEventListener('click', attemptAdminAuth);
    document.getElementById('adminAuthCancel').addEventListener('click', hideAdminAuthModal);
    document.getElementById('adminPassword').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            attemptAdminAuth();
        }
    });

    // 4. 새로고침 버튼
    document.getElementById('refreshStatsBtn').addEventListener('click', () => {
        // 캐시된 데이터를 지우고 새로 로드
        allStats = {};
        initStatsPage();
    });
});
