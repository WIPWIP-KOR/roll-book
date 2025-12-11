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
let currentSeason = 'all'; // 'all', 'firstHalf', 'secondHalf'
let allStats = {}; // { '2025_all': {personal: [...], ...}, '2025_firstHalf': {...}, ... }

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
 * 로딩 오버레이 표시
 */
function showLoadingSpinner(message = '데이터를 불러오는 중...') {
    const overlay = document.getElementById('loadingOverlay');
    const messageEl = document.getElementById('loadingMessage');
    if (messageEl) {
        messageEl.textContent = message;
    }
    if (overlay) {
        overlay.style.display = 'flex';
    }
}

/**
 * 로딩 메시지 업데이트
 */
function updateLoadingSpinner(message) {
    const messageEl = document.getElementById('loadingMessage');
    if (messageEl) {
        messageEl.textContent = message;
    }
}

/**
 * 로딩 오버레이 숨기기
 */
function hideLoadingSpinner() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

/**
 * 백그라운드에서 다른 연도들의 데이터를 미리 로드
 * ⚠️ 드롭다운 방식으로 변경되어 더 이상 사용하지 않음 (온디맨드 로딩)
 */
/*
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
*/

// ==================== 연도 및 데이터 로드 관리 ====================

/**
 * 페이지 로드 시 실행: 사용 가능한 모든 연도를 가져와 탭을 초기화합니다. - 캐싱 적용
 */
async function initStatsPage() {
    try {
        // 로딩 스피너 표시
        showLoadingSpinner('연도 목록을 불러오는 중...');

        // 데이터 로드가 성공하면 컨텐츠 Wrapper를 숨김 상태로 시작
        document.getElementById('stats-content-wrapper').style.display = 'none';

        // 1. 캐시에서 연도 목록 확인
        let availableYears = CacheManager.get(CacheManager.KEYS.AVAILABLE_YEARS);

        if (!availableYears) {
            console.log('📡 연도 목록 서버에서 로드 중...');
            const response = await requestGas('getAvailableYears');
            availableYears = response.availableYears;

            // 캐시에 저장 (1시간 TTL)
            CacheManager.set(CacheManager.KEYS.AVAILABLE_YEARS, availableYears);
        } else {
            console.log('✅ 연도 목록 캐시에서 로드');
        }

        if (!Array.isArray(availableYears) || availableYears.length === 0) {
            updateLoadingSpinner('⚠️ 출석 기록이 있는 연도가 없습니다. (시트 이름이 출석기록_YYYY 형식인지 확인하세요)');
            console.warn('사용 가능한 연도가 없습니다.');
            return;
        }

        // 1. 올해 연도 설정 (현재 연도가 목록에 있으면 사용, 없으면 첫 번째 연도)
        const today = new Date();
        const thisYear = today.getFullYear();
        currentYear = availableYears.includes(thisYear) ? thisYear : availableYears[0];

        // 2. 연도 드롭다운 생성 및 초기 선택
        initYearDropdown(availableYears, currentYear);

        // 2-1. 시즌 드롭다운 초기화
        initSeasonDropdown();

        // 3. 올해 데이터만 로드 (백그라운드 프리로드 제거)
        updateLoadingSpinner(`${currentYear}년 데이터를 불러오는 중...`);
        await loadStats(currentYear, currentSeason);

        // 4. 로딩 메시지 제거 및 컨텐츠 표시
        hideLoadingSpinner();
        document.getElementById('stats-content-wrapper').style.display = 'block';

    } catch (error) {
        updateLoadingSpinner(`❌ 연도 정보 로딩에 실패했습니다. 페이지를 새로고침하세요.`);
        console.error("Available Years Load Error:", error);
    }
}

/**
 * 연도 드롭다운 변경 시 이벤트 핸들러
 */
async function handleYearChange(year) {
    if (year === currentYear) return;

    currentYear = year;

    // 로딩 표시
    const seasonText = currentSeason === 'firstHalf' ? '상반기' : currentSeason === 'secondHalf' ? '하반기' : '전체';
    showLoadingSpinner(`${year}년 ${seasonText} 데이터를 불러오는 중...`);

    // 데이터 로드 (현재 시즌 유지)
    await loadStats(year, currentSeason);

    // 로딩 숨김
    hideLoadingSpinner();
}

/**
 * 시즌 드롭다운 변경 시 이벤트 핸들러
 */
async function handleSeasonChange(season) {
    if (season === currentSeason) return;

    currentSeason = season;

    // 로딩 표시
    const seasonText = season === 'firstHalf' ? '상반기' : season === 'secondHalf' ? '하반기' : '전체';
    showLoadingSpinner(`${currentYear}년 ${seasonText} 데이터를 불러오는 중...`);

    // 데이터 로드 (현재 연도 유지)
    await loadStats(currentYear, season);

    // 로딩 숨김
    hideLoadingSpinner();
}

/**
 * 특정 연도의 통계 데이터를 서버에서 로드하거나 캐시에서 가져옵니다. - 개선된 캐싱
 */
async function loadStats(year, season = 'all') {
    const cacheKeyStr = `${year}_${season}`;

    // 1. 메모리 캐시 확인 (allStats)
    if (allStats[cacheKeyStr]) {
        console.log(`✅ ${year}년 ${season} 데이터 메모리 캐시에서 로드`);
        displayStats(allStats[cacheKeyStr]);
        hideLoadingSpinner();
        document.getElementById('stats-content-wrapper').style.display = 'block';
        return;
    }

    // 2. localStorage 캐시 확인
    const cacheKey = `${CacheManager.KEYS.STATS}_${cacheKeyStr}`;
    const cached = CacheManager.get(cacheKey);

    if (cached) {
        console.log(`✅ ${year}년 ${season} 데이터 localStorage에서 로드`);
        allStats[cacheKeyStr] = cached;
        displayStats(cached);
        hideLoadingSpinner();
        document.getElementById('stats-content-wrapper').style.display = 'block';
        return;
    }

    // 3. 서버에 요청
    try {
        const seasonText = season === 'firstHalf' ? '상반기' : season === 'secondHalf' ? '하반기' : '전체';
        showLoadingSpinner(`${year}년 ${seasonText} 통계 데이터를 불러오는 중...`);
        document.getElementById('stats-content-wrapper').style.display = 'none';

        console.log(`📡 ${year}년 ${season} 데이터 서버에서 로드 중...`);
        const response = await requestGas('getStats', { year: year, season: season });
        const stats = response.stats;

        // 메모리 캐시 저장
        allStats[cacheKeyStr] = stats;

        // localStorage 캐시 저장 (30분 TTL)
        CacheManager.set(cacheKey, stats);

        displayStats(stats);

        hideLoadingSpinner();
        document.getElementById('stats-content-wrapper').style.display = 'block';

    } catch (error) {
        updateLoadingSpinner(`❌ ${year}년 통계 데이터 로드 실패. 페이지를 새로고침하세요.`);
        document.getElementById('stats-content-wrapper').style.display = 'none';
        console.error(`Stats Load Error (${year}, ${season}):`, error);
    }
}

// ==================== 카테고리 및 필터 관리 ====================

/**
 * 카테고리 탭 이벤트 리스너 설정 (한 번만 호출)
 */
function setupCategoryTabListeners() {
    // 카테고리 탭 이벤트 리스너 연결
    document.querySelectorAll('.category-tab').forEach(button => {
        button.addEventListener('click', function() {
            handleCategoryChange(this.dataset.category);
        });
    });

    // 개인별 통계 필터 및 정렬 이벤트 연결
    document.querySelectorAll('.filter-btn').forEach(button => {
        button.addEventListener('click', function() {
            handlePersonalFilterChange('team', this.dataset.team);
        });
    });

    document.getElementById('sortOption').addEventListener('change', function() {
        handlePersonalFilterChange('sort', this.value);
    });
}

/**
 * 카테고리 탭 클릭 시 화면 전환
 */
function handleCategoryChange(category) {
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
            const cacheKeyStr1 = `${currentYear}_${currentSeason}`;
            if (allStats[cacheKeyStr1]) {
                const teamFilter = document.querySelector('.filter-btn.active').dataset.team;
                const sortOption = document.getElementById('sortOption').value;
                displayPersonalStats(allStats[cacheKeyStr1].personalStats, teamFilter, sortOption);
            }
            break;
        case 'monthly':
            document.getElementById('weeklyStats').style.display = 'block';
            document.getElementById('monthTabs').style.display = 'flex';
            const cacheKeyStr2 = `${currentYear}_${currentSeason}`;
            if (allStats[cacheKeyStr2]) {
                const activeMonthTab = document.querySelector('.month-tab.active');
                if (!activeMonthTab) {
                    const initialMonth = getCurrentMonthFromStats(allStats[cacheKeyStr2].weeklyStats);
                    if (initialMonth) {
                        document.getElementById(`month-tab-${initialMonth}`)?.click();
                    }
                }
            }
            break;
    }
}

/**
 * 개인별 통계 필터/정렬 변경 핸들러
 */
function handlePersonalFilterChange(type, value) {
    const cacheKeyStr = `${currentYear}_${currentSeason}`;
    if (!allStats[cacheKeyStr]) return;

    if (type === 'team') {
        // 팀 필터 UI 변경
        document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`.filter-btn[data-team="${value}"]`).classList.add('active');
    }

    // 현재 필터/정렬 값 가져오기
    const teamFilter = document.querySelector('.filter-btn.active').dataset.team;
    const sortOption = document.getElementById('sortOption').value;

    displayPersonalStats(allStats[cacheKeyStr].personalStats, teamFilter, sortOption);
}

// ==================== 데이터 표시 및 가공 ====================

/**
 * 불러온 데이터를 바탕으로 통계를 표시합니다. (HTML ID 불일치 오류 수정 완료)
 */
function displayStats(stats) {
    // 월별 탭 초기화
    initMonthTabs(stats.weeklyStats);

    // 개인별 통계 필터 초기값 설정
    const teamFilter = document.querySelector('.filter-btn.active')?.dataset.team || 'all';
    const sortOption = document.getElementById('sortOption')?.value || 'rate-desc';

    // 팀별 통계 표시
    displayTeamStats(stats.teamStats);
    displayPersonalStats(stats.personalStats, teamFilter, sortOption);

    // 기간 정보 업데이트
    const periodElement = document.querySelector('.period');
    if (periodElement) {
        periodElement.textContent = `${stats.targetYear}년 통계 (${stats.totalSaturdays}주 기준)`;
    }

    // 초기 탭 상태: 팀별 통계 활성화
    handleCategoryChange('team');

    // 통계 내용 전체 Wrapper 표시
    document.getElementById('stats-content-wrapper').style.display = 'block';
}

function displayPersonalStats(personalStats, teamFilter, sortOption) {
    const container = document.getElementById('personalStatsContent');
    if (!container) return;

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

    const cacheKeyStr = `${currentYear}_${currentSeason}`;
    const statsData = allStats[cacheKeyStr];
    const targetYear = statsData ? statsData.targetYear : currentYear;
    const totalSaturdays = statsData ? statsData.totalSaturdays : 0;

    let html = '';

    if (filteredStats.length === 0) {
        html += `<p class="text-secondary">필터링 조건에 맞는 기록이 없습니다.</p>`;
    } else {
        html += `
            <h4 style="margin: 20px 0 15px 0; color: #333;">👤 ${targetYear}년 개인 출석 통계 (${totalSaturdays}주 기준)</h4>
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

    container.innerHTML = html;
}


function displayTeamStats(teamStats) {
    const container = document.getElementById('teamStatsContent');
    if (!container) return;

    // 현재 연도+시즌 조합으로 캐시 키 생성
    const cacheKeyStr = `${currentYear}_${currentSeason}`;
    const targetYear = allStats[cacheKeyStr] ? allStats[cacheKeyStr].targetYear : currentYear;

    // 팀별 통계를 배열로 변환하고 출석률 기준 정렬
    const teamArray = Object.keys(teamStats).map(team => ({
        team: team,
        rate: teamStats[team].rate,
        count: teamStats[team].count,
        total: teamStats[team].total
    })).sort((a, b) => b.rate - a.rate); // 출석률 높은 순

    let html = `<h4 style="margin: 20px 0 15px 0; color: #333;">🏆 ${targetYear}년 팀 출석 순위</h4>`;
    html += '<div style="padding: 0 20px 20px 20px;">';
    html += `
        <table class="table table-striped table-hover">
            <thead>
                <tr>
                    <th style="width: 80px;">순위</th>
                    <th>팀</th>
                    <th class="text-end">평균 출석률</th>
                    <th class="text-end">평균 출석 횟수</th>
                </tr>
            </thead>
            <tbody>
    `;

    teamArray.forEach((teamData, index) => {
        const rank = index + 1;
        const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
        const rateDisplay = teamData.rate.toFixed(1);
        const countDisplay = teamData.count.toFixed(1);

        html += `
            <tr>
                <td style="font-size: 1.2em;">${rankEmoji}</td>
                <td><strong>팀 ${teamData.team}</strong></td>
                <td class="text-end"><span class="fw-bold">${rateDisplay}%</span></td>
                <td class="text-end">${countDisplay}회 / ${teamData.total}회</td>
            </tr>
        `;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
}

/**
 * 연도 드롭다운을 초기화합니다 (탭 대신 드롭다운 사용)
 */
function initYearDropdown(years, selectedYear) {
    const yearSelect = document.getElementById('yearSelect');
    yearSelect.innerHTML = '';

    years.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        if (year === selectedYear) {
            option.selected = true;
        }
        yearSelect.appendChild(option);
    });

    // 드롭다운 변경 이벤트 리스너
    yearSelect.addEventListener('change', async (e) => {
        const newYear = parseInt(e.target.value);
        await handleYearChange(newYear);
    });
}

/**
 * 시즌 드롭다운을 초기화합니다
 */
function initSeasonDropdown() {
    const seasonSelect = document.getElementById('seasonSelect');

    // 드롭다운 변경 이벤트 리스너
    seasonSelect.addEventListener('change', async (e) => {
        const newSeason = e.target.value;
        await handleSeasonChange(newSeason);
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
            const cacheKeyStr = `${currentYear}_${currentSeason}`;
            if (allStats[cacheKeyStr]) {
                filterWeeklyStatsByMonth(month, allStats[cacheKeyStr].weeklyStats);
            }
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
    const container = document.getElementById('weeklyStatsContent');
    if (!container) return;

    const monthStr = month.toString().padStart(2, '0');

    const filteredStats = weeklyStats.filter(stat => {
        return stat.fullDate.substring(5, 7) === monthStr;
    });

    if (filteredStats.length === 0) {
        container.innerHTML = `<p class="text-secondary">${month}월의 출석 기록이 없습니다.</p>`;
        return;
    }

    let html = `
        <h4 style="margin: 20px 0 15px 0; color: #333;">📅 ${month}월 주차별 출석 현황</h4>
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
                <td><a href="#" class="attendance-detail-link" data-date="${stat.fullDate}" style="text-decoration: none;"><span class="badge bg-dark">${stat.count}명</span></a></td>
                <td class="text-center">${stat.teamCounts.A}</td>
                <td class="text-center">${stat.teamCounts.B}</td>
                <td class="text-center">${stat.teamCounts.C}</td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    // 출석 인원 클릭 이벤트 리스너 추가
    container.querySelectorAll('.attendance-detail-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const date = e.currentTarget.dataset.date;
            showAttendanceDetail(date);
        });
    });
}

// ==================== 출석 상세 정보 모달 ====================

/**
 * 시간을 HH:MM 형식으로 변환
 */
function formatTimeHHMM(timeStr) {
    if (!timeStr) return '';

    // "HH:MM:SS" 형식에서 HH:MM만 추출
    const timeParts = timeStr.split(':');
    if (timeParts.length >= 2) {
        return `${timeParts[0]}:${timeParts[1]}`;
    }

    return timeStr; // 형식이 다르면 원본 반환
}

/**
 * 특정 날짜의 출석 상세 정보를 표시하는 모달을 엽니다
 */
async function showAttendanceDetail(date) {
    const modal = document.getElementById('attendanceDetailModal');
    const modalBody = document.getElementById('attendanceDetailBody');
    const modalTitle = document.getElementById('attendanceDetailTitle');

    // 모달 제목 설정
    const dateDisplay = date.substring(5); // YYYY-MM-DD에서 MM-DD만 추출
    modalTitle.textContent = `${dateDisplay} 출석 명단`;

    // 로딩 표시
    modalBody.innerHTML = '<p style="text-align: center; padding: 20px;">불러오는 중...</p>';
    modal.style.display = 'flex';

    try {
        // 서버에서 해당 날짜의 출석 상세 정보 가져오기
        const response = await requestGas('getAttendanceDetailByDate', { date: date });

        if (response.success && response.attendance) {
            displayAttendanceDetailList(response.attendance);
        } else {
            modalBody.innerHTML = '<p style="text-align: center; color: #999;">출석 기록이 없습니다.</p>';
        }
    } catch (error) {
        console.error('출석 상세 정보 로드 실패:', error);
        modalBody.innerHTML = '<p style="text-align: center; color: #c62828;">데이터를 불러오는데 실패했습니다.</p>';
    }
}

/**
 * 출석 상세 명단을 모달에 표시합니다 (출석 시간 순으로 정렬)
 */
function displayAttendanceDetailList(attendance) {
    const modalBody = document.getElementById('attendanceDetailBody');

    if (attendance.length === 0) {
        modalBody.innerHTML = '<p style="text-align: center; color: #999;">출석 기록이 없습니다.</p>';
        return;
    }

    // 출석 시간 순으로 정렬 (오름차순)
    attendance.sort((a, b) => {
        if (!a.time || !b.time) return 0;
        return a.time.localeCompare(b.time);
    });

    let html = `
        <table class="table table-hover" style="margin-bottom: 0;">
            <thead>
                <tr>
                    <th style="width: 50px;">순서</th>
                    <th>이름</th>
                    <th>팀</th>
                    <th class="text-end">출석 시간</th>
                </tr>
            </thead>
            <tbody>
    `;

    attendance.forEach((record, index) => {
        html += `
            <tr>
                <td>${index + 1}</td>
                <td><strong>${record.name}</strong></td>
                <td><span class="badge bg-primary">${record.team}팀</span></td>
                <td class="text-end">${formatTimeHHMM(record.time)}</td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    html += `<p style="text-align: center; color: #666; margin-top: 15px; margin-bottom: 0;">총 ${attendance.length}명 출석</p>`;

    modalBody.innerHTML = html;
}

/**
 * 출석 상세 모달을 닫습니다
 */
function hideAttendanceDetailModal() {
    const modal = document.getElementById('attendanceDetailModal');
    modal.style.display = 'none';
}

// ==================== 초기 실행 ====================

document.addEventListener('DOMContentLoaded', () => {
    // 1. 카테고리 탭 이벤트 리스너 설정 (한 번만)
    setupCategoryTabListeners();

    // 2. 통계 페이지 초기화
    initStatsPage();

    // 3. 관리자 링크 클릭 이벤트 (존재하는 경우에만)
    const adminLink = document.getElementById('adminLink');
    if (adminLink) {
        adminLink.addEventListener('click', handleAdminLinkClick);
    }

    // 4. 관리자 인증 모달 이벤트 (존재하는 경우에만)
    const adminAuthSubmit = document.getElementById('adminAuthSubmit');
    const adminAuthCancel = document.getElementById('adminAuthCancel');
    const adminPassword = document.getElementById('adminPassword');

    if (adminAuthSubmit) {
        adminAuthSubmit.addEventListener('click', attemptAdminAuth);
    }
    if (adminAuthCancel) {
        adminAuthCancel.addEventListener('click', hideAdminAuthModal);
    }
    if (adminPassword) {
        adminPassword.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                attemptAdminAuth();
            }
        });
    }

    // 5. 출석 상세 모달 이벤트 (존재하는 경우에만)
    const attendanceDetailClose = document.getElementById('attendanceDetailClose');
    if (attendanceDetailClose) {
        attendanceDetailClose.addEventListener('click', hideAttendanceDetailModal);
    }

});
