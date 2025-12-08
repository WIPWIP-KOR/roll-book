// 설정
const CONFIG = {
    GAS_URL: 'https://script.google.com/macros/s/AKfycbz0qh_mWTEP3uvTeMzq4ZK7L56tu1eFcJWKP7mNZsOhRwAcu_qoDQqzWgHBD3YhZymr/exec' // 나중에 변경 필요
};

// 전역 변수
let allStats = null;
let currentFilter = 'all';
let currentSort = 'rate-desc';

// DOM 요소
const teamStats = document.getElementById('teamStats');
const personalStats = document.getElementById('personalStats');
const weeklyStats = document.getElementById('weeklyStats');
const refreshStatsBtn = document.getElementById('refreshStatsBtn');
const filterBtns = document.querySelectorAll('.filter-btn');
const sortOption = document.getElementById('sortOption');

// 초기화
document.addEventListener('DOMContentLoaded', () => {
    // 통계 데이터 불러오기
    loadStats();

    // 이벤트 리스너
    refreshStatsBtn.addEventListener('click', loadStats);

    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.dataset.team;
            renderPersonalStats();
        });
    });

    sortOption.addEventListener('change', (e) => {
        currentSort = e.target.value;
        renderPersonalStats();
    });
});

// 통계 데이터 불러오기
async function loadStats() {
    teamStats.innerHTML = '<p class="loading">데이터를 불러오는 중</p>';
    personalStats.innerHTML = '<p class="loading">데이터를 불러오는 중</p>';
    weeklyStats.innerHTML = '<p class="loading">데이터를 불러오는 중</p>';

    try {
        const response = await fetch(`${CONFIG.GAS_URL}?action=getStats`);
        const data = await response.json();

        if (data.success && data.stats) {
            allStats = data.stats;
            renderTeamStats();
            renderPersonalStats();
            renderWeeklyStats();
        } else {
            teamStats.innerHTML = '<p style="color: red;">데이터를 불러오는데 실패했습니다.</p>';
            personalStats.innerHTML = '<p style="color: red;">데이터를 불러오는데 실패했습니다.</p>';
            weeklyStats.innerHTML = '<p style="color: red;">데이터를 불러오는데 실패했습니다.</p>';
        }
    } catch (error) {
        console.error('통계 로딩 실패:', error);
        teamStats.innerHTML = '<p style="color: red;">데이터를 불러오는데 실패했습니다.</p>';
        personalStats.innerHTML = '<p style="color: red;">데이터를 불러오는데 실패했습니다.</p>';
        weeklyStats.innerHTML = '<p style="color: red;">데이터를 불러오는데 실패했습니다.</p>';
    }
}

// 팀별 출석률 렌더링
function renderTeamStats() {
    if (!allStats || !allStats.teamStats) {
        teamStats.innerHTML = '<p>팀별 통계가 없습니다.</p>';
        return;
    }

    teamStats.innerHTML = '';

    const teams = ['A', 'B', 'C'];

    teams.forEach(team => {
        const stats = allStats.teamStats[team] || { rate: 0, count: 0, total: 0 };

        const card = document.createElement('div');
        card.className = 'team-card';
        card.innerHTML = `
            <h3>${team}팀</h3>
            <div class="rate">${stats.rate.toFixed(1)}%</div>
            <div class="count">평균 출석 ${stats.count}/${stats.total}회</div>
        `;
        teamStats.appendChild(card);
    });
}

// 개인별 출석률 렌더링
function renderPersonalStats() {
    if (!allStats || !allStats.personalStats) {
        personalStats.innerHTML = '<p>개인별 통계가 없습니다.</p>';
        return;
    }

    let stats = allStats.personalStats;

    // 팀 필터 적용
    if (currentFilter !== 'all') {
        stats = stats.filter(s => s.team === currentFilter);
    }

    // 정렬 적용
    stats = sortStats(stats, currentSort);

    // 테이블 생성
    personalStats.innerHTML = '';

    if (stats.length === 0) {
        personalStats.innerHTML = '<p>해당하는 통계가 없습니다.</p>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'stats-table';

    // 헤더
    table.innerHTML = `
        <thead>
            <tr>
                <th>순위</th>
                <th>이름</th>
                <th>팀</th>
                <th>출석</th>
                <th>출석률</th>
                <th>진행률</th>
            </tr>
        </thead>
        <tbody id="statsTableBody"></tbody>
    `;

    personalStats.appendChild(table);

    const tbody = document.getElementById('statsTableBody');

    stats.forEach((stat, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td><strong>${stat.name}</strong></td>
            <td>${stat.team}팀</td>
            <td>${stat.attendanceCount}/${stat.totalSaturdays}회</td>
            <td><strong>${stat.rate.toFixed(1)}%</strong></td>
            <td>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${stat.rate}%"></div>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// 통계 정렬
function sortStats(stats, sortType) {
    const sorted = [...stats];

    switch(sortType) {
        case 'rate-desc':
            sorted.sort((a, b) => b.rate - a.rate);
            break;
        case 'rate-asc':
            sorted.sort((a, b) => a.rate - b.rate);
            break;
        case 'name':
            sorted.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'count-desc':
            sorted.sort((a, b) => b.attendanceCount - a.attendanceCount);
            break;
    }

    return sorted;
}

// 주차별 출석 현황 렌더링
function renderWeeklyStats() {
    if (!allStats || !allStats.weeklyStats) {
        weeklyStats.innerHTML = '<p>주차별 통계가 없습니다.</p>';
        return;
    }

    weeklyStats.innerHTML = '';

    if (allStats.weeklyStats.length === 0) {
        weeklyStats.innerHTML = '<p>아직 출석 기록이 없습니다.</p>';
        return;
    }

    // 최근 순으로 정렬
    const sorted = [...allStats.weeklyStats].sort((a, b) =>
        new Date(b.date) - new Date(a.date)
    );

    sorted.forEach(week => {
        const item = document.createElement('div');
        item.className = 'week-item';

        const date = new Date(week.date);
        const formattedDate = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;

        item.innerHTML = `
            <div class="date">📅 ${formattedDate} (${week.week}주차)</div>
            <div class="attendance-count">
                총 ${week.count}명 출석
                ${week.teamCounts ? ` | A팀: ${week.teamCounts.A || 0}명, B팀: ${week.teamCounts.B || 0}명, C팀: ${week.teamCounts.C || 0}명` : ''}
            </div>
        `;
        weeklyStats.appendChild(item);
    });
}
