/**
 * 풋살 동호회 출석 시스템 - 통계 페이지 (stats.js)
 * * 기능:
 * 1. GAS 서버에서 개인별, 팀별, 주차별 통계 데이터를 로드 및 표시
 * 2. 동적 연도 탭을 생성하고 연도별 데이터를 필터링
 * 3. 월별 탭을 통해 주차별 데이터를 필터링
 */

// Google Apps Script 배포 URL로 변경해야 합니다.
const GAS_URL = 'YOUR_DEPLOYED_GOOGLE_APPS_SCRIPT_URL_HERE'; 

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


// ==================== 연도 및 데이터 로드 관리 ====================

// 전역 변수로 현재 선택된 연도와 통계 데이터를 저장합니다.
let currentYear = null; 
let allStats = {}; // { 2025: {personal: [...], ...}, 2026: {...} }

/**
 * 페이지 로드 시 실행: 사용 가능한 모든 연도를 가져와 탭을 초기화합니다.
 */
async function initStatsPage() {
    try {
        const response = await requestGas('getAvailableYears');
        const availableYears = response.availableYears;
        
        if (availableYears.length === 0) {
            document.getElementById('stats-container').innerHTML = 
                '<p class="alert alert-warning">출석 기록이 있는 연도가 없습니다.</p>';
            return;
        }

        // 연도 탭 생성 및 클릭 이벤트 연결
        initYearTabs(availableYears);

        // 가장 최근 연도의 데이터 로드
        currentYear = availableYears[0];
        document.getElementById(`year-tab-${currentYear}`).classList.add('active');
        await loadStats(currentYear);

    } catch (error) {
        document.getElementById('stats-container').innerHTML = 
            `<p class="alert alert-danger">연도 정보 로딩에 실패했습니다: ${error}</p>`;
        console.error("Available Years Load Error:", error);
    }
}

/**
 * 연도 탭을 동적으로 생성합니다.
 * @param {Array<number>} years - 사용 가능한 연도 목록
 */
function initYearTabs(years) {
    const yearTabsContainer = document.getElementById('yearTabs');
    yearTabsContainer.innerHTML = ''; // 기존 내용 초기화

    years.forEach(year => {
        const button = document.createElement('button');
        button.className = 'btn btn-outline-primary me-2';
        button.id = `year-tab-${year}`;
        button.textContent = year;
        button.onclick = () => handleYearChange(year);
        yearTabsContainer.appendChild(button);
    });
}

/**
 * 연도 탭 클릭 시 이벤트 핸들러
 * @param {number} year - 클릭된 연도
 */
async function handleYearChange(year) {
    if (year === currentYear) return;

    // UI에서 기존 연도 탭 비활성화 및 새 연도 탭 활성화
    if (currentYear) {
        document.getElementById(`year-tab-${currentYear}`).classList.remove('active');
    }
    document.getElementById(`year-tab-${year}`).classList.add('active');
    currentYear = year;

    await loadStats(year);
}

/**
 * 특정 연도의 통계 데이터를 서버에서 로드하거나 캐시에서 가져옵니다. (성능 최적화 적용)
 * @param {number} year - 로드할 연도
 */
async function loadStats(year) {
    const loadingDiv = document.getElementById('stats-display');
    loadingDiv.innerHTML = '<div class="alert alert-info">통계 데이터를 불러오는 중...</div>';
    
    // 1. 이미 캐시된 데이터가 있으면 바로 표시 (클라이언트 측 캐싱)
    if (allStats[year]) {
        displayStats(allStats[year]);
        return;
    }

    // 2. 서버에 요청 (성능 최적화: 연도별 데이터만 요청)
    try {
        const response = await requestGas('getStats', { year: year });
        const stats = response.stats;
        
        // 데이터 캐시 저장 및 표시
        allStats[year] = stats;
        displayStats(stats);

    } catch (error) {
        loadingDiv.innerHTML = `<p class="alert alert-danger">통계 데이터 로드 실패 (${year}년): ${error}</p>`;
        console.error(`Stats Load Error (${year}):`, error);
    }
}


// ==================== 데이터 표시 ====================

/**
 * 불러온 데이터를 바탕으로 통계를 표시합니다.
 * @param {object} stats - 서버에서 받은 통계 데이터 객체
 */
function displayStats(stats) {
    // 탭 및 초기 표시 설정
    initMonthTabs(stats.weeklyStats);
    
    // 기본으로 현재 월의 데이터 표시 (성능 최적화)
    const currentMonth = new Date().getMonth() + 1;
    const initialMonth = getCurrentMonthFromStats(stats.weeklyStats) || currentMonth;
    
    // 모든 섹션을 초기화
    document.getElementById('personal-stats').innerHTML = '';
    document.getElementById('team-stats').innerHTML = '';
    document.getElementById('weekly-stats-container').innerHTML = '';

    // 개인별 통계 표시
    displayPersonalStats(stats.personalStats, stats.targetYear, stats.totalSaturdays);

    // 팀별 통계 표시
    displayTeamStats(stats.teamStats);
    
    // 주차별 통계는 월별 탭에서 처리
    filterWeeklyStatsByMonth(initialMonth, stats.weeklyStats);
    
    // 월별 탭 UI 활성화 (가장 최근 월)
    document.querySelector('.month-tab.active')?.classList.remove('active');
    document.getElementById(`month-tab-${initialMonth}`).classList.add('active');
}

/**
 * 개인별 통계를 테이블로 표시합니다.
 */
function displayPersonalStats(personalStats, year, totalSaturdays) {
    const container = document.getElementById('personal-stats');
    container.innerHTML = `<h4>${year}년 개인 출석 통계 (${totalSaturdays}주 기준)</h4>`;
    
    if (personalStats.length === 0) {
        container.innerHTML += '<p class="text-secondary">개인 출석 기록이 없습니다.</p>';
        return;
    }

    // 출석률(rate) 기준으로 내림차순 정렬
    personalStats.sort((a, b) => b.rate - a.rate);

    let html = `
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

    personalStats.forEach((p, index) => {
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
    container.innerHTML += html;
}

/**
 * 팀별 통계를 카드 형태로 표시합니다.
 */
function displayTeamStats(teamStats) {
    const container = document.getElementById('team-stats');
    container.innerHTML = '<h4>팀별 평균 출석률</h4><div class="row">';
    
    const teams = Object.keys(teamStats).sort();

    teams.forEach(team => {
        const stats = teamStats[team];
        const rateDisplay = stats.rate.toFixed(1);
        const countDisplay = stats.count.toFixed(1);
        
        let bgColor = '';
        if (team === 'A') bgColor = 'bg-success';
        else if (team === 'B') bgColor = 'bg-info';
        else if (team === 'C') bgColor = 'bg-warning';

        container.innerHTML += `
            <div class="col-md-4 mb-3">
                <div class="card text-white ${bgColor}">
                    <div class="card-body">
                        <h5 class="card-title">팀 ${team}</h5>
                        <p class="card-text fs-3">${rateDisplay}%</p>
                        <p class="card-text small">평균 출석 횟수: ${countDisplay}회</p>
                    </div>
                </div>
            </div>
        `;
    });
    container.innerHTML += '</div>';
}

// ==================== 월별 필터링 ====================

/**
 * 주차별 통계를 바탕으로 월 탭을 동적으로 생성합니다.
 */
function initMonthTabs(weeklyStats) {
    const monthTabsContainer = document.getElementById('monthTabs');
    monthTabsContainer.innerHTML = '';
    
    const months = new Set();
    
    weeklyStats.forEach(stat => {
        // fullDate는 'yyyy-MM-dd' 형식입니다.
        const month = parseInt(stat.fullDate.substring(5, 7));
        if (month >= 1 && month <= 12) {
            months.add(month);
        }
    });
    
    const sortedMonths = Array.from(months).sort((a, b) => b - a); // 최신 월부터 정렬

    sortedMonths.forEach(month => {
        const button = document.createElement('button');
        button.className = 'month-tab btn btn-outline-secondary me-2';
        button.id = `month-tab-${month}`;
        button.textContent = `${month}월`;
        button.onclick = () => {
            // UI 활성화 변경
            document.querySelectorAll('.month-tab').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // 데이터 필터링 및 표시
            filterWeeklyStatsByMonth(month, allStats[currentYear].weeklyStats);
        };
        monthTabsContainer.appendChild(button);
    });
}

/**
 * 주차별 통계에서 현재 연도의 가장 최근 월을 반환합니다.
 */
function getCurrentMonthFromStats(weeklyStats) {
    if (weeklyStats.length === 0) return null;
    
    // weeklyStats는 시간순 정렬되어 있으므로 마지막 항목이 가장 최근입니다.
    const lastStat = weeklyStats[weeklyStats.length - 1];
    return parseInt(lastStat.fullDate.substring(5, 7));
}

/**
 * 월별로 주차별 통계를 필터링하여 테이블로 표시합니다.
 * @param {number} month - 필터링할 월 (1-12)
 * @param {Array<object>} weeklyStats - 해당 연도의 전체 주차별 통계
 */
function filterWeeklyStatsByMonth(month, weeklyStats) {
    const container = document.getElementById('weekly-stats-container');
    container.innerHTML = `<h4>${month}월 주차별 출석 현황</h4>`;
    
    const monthStr = month.toString().padStart(2, '0');
    
    const filteredStats = weeklyStats.filter(stat => {
        return stat.fullDate.substring(5, 7) === monthStr;
    });

    if (filteredStats.length === 0) {
        container.innerHTML += `<p class="text-secondary">${month}월의 출석 기록이 없습니다.</p>`;
        return;
    }

    let html = `
        <table class="table table-bordered table-sm">
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

    filteredStats.forEach(stat => {
        html += `
            <tr>
                <td>${stat.date}</td>
                <td>${stat.week}주차</td>
                <td><span class="badge bg-dark">${stat.count}명</span></td>
                <td class="text-center">${stat.teamCounts.A}</td>
                <td class="text-center">${stat.teamCounts.B}</td>
                <td class="text-center">${stat.teamCounts.C}</td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    container.innerHTML += html;
}


// ==================== 초기 실행 ====================

document.addEventListener('DOMContentLoaded', initStatsPage);
