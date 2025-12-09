// ====================================================================
// stats.js (클라이언트 측 JavaScript) - JSONP 인증 로직 적용 버전
// ====================================================================

const CONFIG = {
    // ⚠️⚠️⚠️ 여기를 실제 Google Apps Script 배포 URL로 변경하세요 ⚠️⚠️⚠️
    GAS_URL: 'https://script.google.com/macros/s/AKfycbxjmvZWEErrnhyGtgyhrpBAoy8lF_Cw7V9bJNgTBCRQKeFrkROu-tp43uAcSEu9VxBd/exec', // 나중에 변경 필요
};

const teamStatsDiv = document.getElementById('teamStats');
const personalStatsDiv = document.getElementById('personalStats');
const weeklyStatsDiv = document.getElementById('weeklyStats');
const sortOption = document.getElementById('sortOption');
const refreshStatsBtn = document.getElementById('refreshStatsBtn');
let allStatsData = null; // 원본 데이터를 저장할 변수

document.addEventListener('DOMContentLoaded', () => {
    // 💡 jQuery 로드 여부 확인
    if (typeof jQuery === 'undefined') {
        showMessage('오류: jQuery 라이브러리가 로드되지 않았습니다.', 'error');
        return;
    }

    loadStats();

    // 이벤트 리스너
    document.querySelectorAll('.filter-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            displayPersonalStats(allStatsData.personalStats);
        });
    });

    sortOption.addEventListener('change', () => {
        displayPersonalStats(allStatsData.personalStats);
    });

    refreshStatsBtn.addEventListener('click', loadStats);
});

// 통계 데이터 로드 (GET 요청, $.ajax 사용)
function loadStats() {
    refreshStatsBtn.disabled = true;
    teamStatsDiv.innerHTML = '<p class="loading">데이터를 불러오는 중...</p>';
    personalStatsDiv.innerHTML = '<p class="loading">데이터를 불러오는 중...</p>';
    weeklyStatsDiv.innerHTML = '<p class="loading">데이터를 불러오는 중...</p>';

    $.ajax({
        url: `${CONFIG.GAS_URL}?action=getStats`,
        dataType: 'jsonp', // CORS 우회
        success: function(data) {
            if (data.success && data.stats) {
                allStatsData = data.stats;
                displayTeamStats(allStatsData.teamStats);
                displayPersonalStats(allStatsData.personalStats);
                displayWeeklyStats(allStatsData.weeklyStats);
            } else {
                const msg = data.message || '통계 데이터 로딩에 실패했습니다.';
                teamStatsDiv.innerHTML = `<p style="color: red;">${msg}</p>`;
                personalStatsDiv.innerHTML = `<p style="color: red;">${msg}</p>`;
                weeklyStatsDiv.innerHTML = `<p style="color: red;">${msg}</p>`;
            }
        },
        error: function(jqXHR, textStatus, errorThrown) {
            const msg = `데이터 로딩 중 네트워크 오류가 발생했습니다. (${textStatus})`;
            console.error(msg, errorThrown);
            teamStatsDiv.innerHTML = `<p style="color: red;">${msg}</p>`;
            personalStatsDiv.innerHTML = `<p style="color: red;">${msg}</p>`;
            weeklyStatsDiv.innerHTML = `<p style="color: red;">${msg}</p>`;
        },
        complete: function() {
            refreshStatsBtn.disabled = false;
        }
    });
}

// 팀별 통계 표시
function displayTeamStats(stats) {
    teamStatsDiv.innerHTML = '';
    const teams = ['A', 'B', 'C'];

    teams.forEach(team => {
        const teamData = stats[team];
        const rate = (teamData.rate || 0).toFixed(1);
        const count = Math.round(teamData.count);

        const item = document.createElement('div');
        item.className = 'stat-item team-item';
        item.innerHTML = `
            <div class="team-name">${team}팀</div>
            <div class="team-rate">${rate}%</div>
            <div class="team-count">(${count}/${teamData.total}회 평균 출석)</div>
            <div class="progress-bar-container">
                <div class="progress-bar" style="width: ${rate}%;"></div>
            </div>
        `;
        teamStatsDiv.appendChild(item);
    });
}

// 개인별 통계 표시
function displayPersonalStats(personalStats) {
    if (!personalStats || personalStats.length === 0) {
        personalStatsDiv.innerHTML = '<p>등록된 회원 및 통계가 없습니다.</p>';
        return;
    }

    const selectedTeam = document.querySelector('.filter-btn.active').dataset.team;
    const sortValue = sortOption.value;

    let filteredStats = personalStats.filter(stat => selectedTeam === 'all' || stat.team === selectedTeam);

    // 정렬 로직
    filteredStats.sort((a, b) => {
        if (sortValue === 'rate-desc') return (b.rate || 0) - (a.rate || 0);
        if (sortValue === 'rate-asc') return (a.rate || 0) - (b.rate || 0);
        if (sortValue === 'count-desc') return (b.attendanceCount || 0) - (a.attendanceCount || 0);
        if (sortValue === 'name') return a.name.localeCompare(b.name);
        return 0;
    });

    personalStatsDiv.innerHTML = '';
    
    filteredStats.forEach(stat => {
        const rate = (stat.rate || 0).toFixed(1);
        
        const item = document.createElement('div');
        item.className = `stat-item personal-item team-${stat.team.toLowerCase()}`;
        item.innerHTML = `
            <div class="person-info">
                <strong>${stat.name}</strong> (${stat.team}팀)
            </div>
            <div class="person-rate">${rate}%</div>
            <div class="person-count">(${stat.attendanceCount}/${stat.totalSaturdays}회 출석)</div>
            <div class="progress-bar-container">
                <div class="progress-bar" style="width: ${rate}%;"></div>
            </div>
        `;
        personalStatsDiv.appendChild(item);
    });
}

// 주차별 통계 표시
function displayWeeklyStats(weeklyStats) {
    if (!weeklyStats || weeklyStats.length === 0) {
        weeklyStatsDiv.innerHTML = '<p>주차별 통계 데이터가 없습니다.</p>';
        return;
    }

    weeklyStatsDiv.innerHTML = '';
    
    // 최근 10주만 표시 (스크롤 가능하게)
    const recentWeeks = weeklyStats.slice(-10).reverse();

    recentWeeks.forEach(week => {
        const total = week.teamCounts.A + week.teamCounts.B + week.teamCounts.C;
        
        if (total === 0) return; // 출석이 없으면 표시하지 않음

        const item = document.createElement('div');
        item.className = 'stat-item weekly-item';
        item.innerHTML = `
            <div class="week-header">
                <strong>${week.date}</strong> (총 ${week.count}명 출석)
            </div>
            <div class="team-details">
                A팀: ${week.teamCounts.A}명 | B팀: ${week.teamCounts.B}명 | C팀: ${week.teamCounts.C}명
            </div>
        `;
        weeklyStatsDiv.appendChild(item);
    });
}

// 메시지 표시 (임시)
function showMessage(text, type) {
    console.log(`[${type.toUpperCase()}] ${text}`);
}

// =================================================================
// ✨ 관리자 페이지 접근 인증 로직 (AJAX / JSONP 방식으로 통일)
// =================================================================

document.addEventListener('DOMContentLoaded', () => {
    const adminLink = document.querySelector('a[href="admin.html"]');

    if (adminLink) {
        adminLink.addEventListener('click', function(e) {
            e.preventDefault(); // 기본 링크 이동 방지
            
            // 1. 관리자 인증 상태 확인 시작
            checkAdminStatusForNavigation();
        });
    }
});

/**
 * 💥 JSONP: 관리자 비밀번호 설정 상태를 확인하는 함수 (Code.gs의 checkAdminStatus 호출)
 * - 이 함수는 stats.html에서 admin.html로 이동할 때만 사용됩니다.
 */
function checkAdminStatusForNavigation() {
    $.ajax({
        url: `${CONFIG.GAS_URL}?action=checkAdminStatus`,
        dataType: 'jsonp',
        success: function(response) {
            if (response.success && response.isSet !== undefined) {
                handleAdminStatusForNavigation(response);
            } else {
                alert("인증 상태를 불러오지 못했습니다. 서버 상태를 확인하세요.");
            }
        },
        error: function() {
            alert("Apps Script 통신 오류: 관리자 인증 상태를 확인할 수 없습니다.");
        }
    });
}

/**
 * 관리자 인증 상태에 따라 페이지 이동 방식을 결정합니다.
 * @param {{isSet: boolean}} result - 비밀번호 설정 여부
 */
function handleAdminStatusForNavigation(result) {
    if (result.isSet === false) {
        // 💥 비밀번호가 미설정 상태: 바로 이동
        window.location.href = "admin.html";
    } else {
        // 비밀번호가 설정되어 있음: 팝업을 띄워 인증을 시도
        showPasswordPromptForNavigation();
    }
}

/**
 * 비밀번호가 설정되어 있을 때 팝업을 띄우고 인증을 시도합니다.
 */
function showPasswordPromptForNavigation() {
    const password = prompt("관리자 페이지로 이동하려면 4자리 비밀번호를 입력하세요.");

    if (password !== null) {
        // ✨✨✨ JSONP: authenticateAdmin 호출 ✨✨✨
        authenticateAdminForNavigation(password.trim()); 
    } else {
        alert("관리자 페이지 이동이 취소되었습니다.");
    }
}

/**
 * 💥 JSONP: 사용자 입력 비밀번호를 서버로 보내 인증 시도 (Code.gs의 authenticateAdmin 호출)
 */
function authenticateAdminForNavigation(password) {
    const encodedPassword = encodeURIComponent(password);
    const gasUrl = `${CONFIG.GAS_URL}?action=authenticateAdmin&password=${encodedPassword}`;
    
    $.ajax({
        url: gasUrl,
        dataType: 'jsonp',
        success: function(response) {
            if (response.success && response.isAuthenticated) {
                window.location.href = "admin.html"; // 인증 성공 시 이동
            } else {
                alert("비밀번호가 일치하지 않습니다. 다시 시도해 주세요.");
                // 인증 실패 시 다시 팝업을 띄우지 않고, 사용자가 다시 버튼을 누르도록 유도
            }
        },
        error: function() {
             alert("인증 시스템 오류: 서버와 통신할 수 없습니다.");
        }
    });
}
