const CONFIG = {
    // ⚠️⚠️⚠️ 여기를 실제 Google Apps Script 배포 URL로 변경하세요 ⚠️⚠️⚠️
    GAS_URL: 'https://script.google.com/macros/s/YOUR_ACTUAL_SCRIPT_ID/exec'
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