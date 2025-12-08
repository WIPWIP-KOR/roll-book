/**
 * 풋살 동호회 출석 시스템 - Google Apps Script
 *
 * 사용 방법:
 * 1. Google Sheets 새 스프레드시트 생성
 * 2. 확장 프로그램 > Apps Script 메뉴 선택
 * 3. 이 코드를 붙여넣기
 * 4. 배포 > 새 배포 > 유형: 웹 앱 선택
 * 5. 실행 권한: 나 / 액세스 권한: 모든 사용자
 * 6. 배포 후 웹 앱 URL 복사하여 프론트엔드 CONFIG.GAS_URL에 설정
 */

// ==================== 설정 ====================

const SHEET_NAMES = {
  ATTENDANCE: '출석기록',
  MEMBERS: '회원목록',
  LOCATION: '위치설정',
  SATURDAYS: '토요일일정'
};

const REQUIRED_RADIUS = 50; // 50미터

// ==================== 메인 함수 ====================

/**
 * GET 요청 처리
 */
function doGet(e) {
  const action = e.parameter.action;

  try {
    switch(action) {
      case 'getMembers':
        return getMembers();
      case 'getLocation':
        return getLocation();
      case 'getTodayAttendance':
        return getTodayAttendance();
      case 'getStats':
        return getStats();
      case 'saveLocation':
        return saveLocation(e);
      default:
        return createResponse(false, 'Invalid action');
    }
  } catch (error) {
    return createResponse(false, error.toString());
  }
}

/**
 * POST 요청 처리
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    switch(action) {
      case 'attend':
        return processAttendance(data, e);
      
      default:
        return createResponse(false, 'Invalid action');
    }
  } catch (error) {
    return createResponse(false, error.toString());
  }
}

// ==================== 출석 처리 ====================

/**
 * 출석 처리
 */
function processAttendance(data, e) {
  const { name, team, latitude, longitude, userAgent } = data;

  // 입력 검증
  if (!name || !team || !latitude || !longitude) {
    return createResponse(false, '필수 정보가 누락되었습니다.');
  }

  // 팀 검증
  if (!['A', 'B', 'C'].includes(team)) {
    return createResponse(false, '올바른 팀을 선택해주세요.');
  }

  // 토요일 확인
  const now = new Date();
  if (now.getDay() !== 6) {
    return createResponse(false, '출석은 토요일만 가능합니다.');
  }

  // 위치 확인
  const targetLocation = getTargetLocation();
  if (!targetLocation) {
    return createResponse(false, '출석 위치가 설정되지 않았습니다. 관리자에게 문의하세요.');
  }

  const distance = calculateDistance(
    latitude, longitude,
    targetLocation.latitude, targetLocation.longitude
  );

  if (distance > REQUIRED_RADIUS) {
    return createResponse(false, `출석 불가 지역입니다. (${Math.round(distance)}m 떨어짐)`);
  }

  // IP 주소 추출
  const ipAddress = getClientIP(e);

  // 중복 출석 체크
  if (isDuplicateAttendance(name, ipAddress)) {
    return createResponse(false, '이미 오늘 출석하셨습니다.');
  }

  // 출석 기록 저장
  saveAttendanceRecord(name, team, latitude, longitude, ipAddress, distance);

  // 회원 정보 업데이트
  updateMember(name, team);

  return createResponse(true, '출석이 완료되었습니다!');
}

/**
 * 중복 출석 체크
 */
function isDuplicateAttendance(name, ipAddress) {
  const sheet = getOrCreateSheet(SHEET_NAMES.ATTENDANCE);
  const today = new Date();
  const todayStr = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const rowDate = data[i][0];
    const rowName = data[i][1];
    const rowIP = data[i][6];

    if (!rowDate) continue;

    const rowDateStr = Utilities.formatDate(new Date(rowDate), Session.getScriptTimeZone(), 'yyyy-MM-dd');

    // 같은 날짜에 같은 이름 또는 같은 IP
    if (rowDateStr === todayStr) {
      if (rowName === name || rowIP === ipAddress) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 출석 기록 저장
 */
function saveAttendanceRecord(name, team, latitude, longitude, ipAddress, distance) {
  const sheet = getOrCreateSheet(SHEET_NAMES.ATTENDANCE);

  // 헤더가 없으면 추가
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['날짜', '이름', '팀', '출석시간', '위도', '경도', 'IP주소', '거리(m)']);
  }

  const now = new Date();
  const date = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const time = Utilities.formatDate(now, Session.getScriptTimeZone(), 'HH:mm:ss');

  sheet.appendRow([
    date,
    name,
    team,
    time,
    latitude,
    longitude,
    ipAddress,
    Math.round(distance)
  ]);
}

/**
 * 회원 정보 업데이트
 */
function updateMember(name, team) {
  const sheet = getOrCreateSheet(SHEET_NAMES.MEMBERS);

  // 헤더가 없으면 추가
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['이름', '팀', '최초등록일', '총출석수']);
  }

  const data = sheet.getDataRange().getValues();
  let found = false;

  // 기존 회원 찾기
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === name) {
      // 출석 수 증가
      const currentCount = data[i][3] || 0;
      sheet.getRange(i + 1, 4).setValue(currentCount + 1);
      found = true;
      break;
    }
  }

  // 새 회원 추가
  if (!found) {
    const now = new Date();
    const date = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    sheet.appendRow([name, team, date, 1]);
  }
}

// ==================== 위치 관리 ====================

/**
 * 위치 저장
 */
function saveLocation(data) {
   var lat = data.parameter.latitude;
      var lng = data.parameter.longitude;
      var name = data.parameter.name;

      // 스프레드시트에 저장 (Config 시트에 단일 설정으로 저장)
      if (SPREADSHEET_ID && SPREADSHEET_ID !== 'YOUR_SPREADSHEET_ID') {
        var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
        var sheet = ss.getSheetByName(CONFIG_SHEET_NAME);
        if (!sheet) {
          sheet = ss.insertSheet(CONFIG_SHEET_NAME);
          sheet.clear();
          sheet.appendRow(['key','value']);
        }

        // name, latitude, longitude를 각각의 키로 저장/업데이트
        setConfigValue(sheet, 'location_name', name);
        setConfigValue(sheet, 'location_latitude', lat);
        setConfigValue(sheet, 'location_longitude', lng);

        result = { success: true };
      } else {
        // SPREADSHEET_ID 미설정 시에는 결과만 반환
        result = { success: true, warning: 'SPREADSHEET_ID not set. Data not persisted.' };
      }
}

/**
 * 위치 조회
 */
function getLocation() {
  const targetLocation = getTargetLocation();

  if (!targetLocation) {
    return createResponse(false, '저장된 위치가 없습니다.');
  }

  return createResponse(true, null, { location: targetLocation });
}

/**
 * 목표 위치 가져오기
 */
function getTargetLocation() {
  const sheet = getOrCreateSheet(SHEET_NAMES.LOCATION);

  if (sheet.getLastRow() < 2) {
    return null;
  }

  const data = sheet.getDataRange().getValues();

  return {
    latitude: parseFloat(data[1][1]),
    longitude: parseFloat(data[2][1]),
    name: data[3][1]
  };
}

// ==================== 회원 관리 ====================

/**
 * 회원 목록 조회
 */
function getMembers() {
  const sheet = getOrCreateSheet(SHEET_NAMES.MEMBERS);

  if (sheet.getLastRow() <= 1) {
    return createResponse(true, null, { members: [] });
  }

  const data = sheet.getDataRange().getValues();
  const members = [];

  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) {
      members.push({
        name: data[i][0],
        team: data[i][1],
        firstDate: data[i][2],
        attendanceCount: data[i][3] || 0
      });
    }
  }

  return createResponse(true, null, { members: members });
}

// ==================== 통계 ====================

/**
 * 오늘 출석 현황
 */
function getTodayAttendance() {
  const sheet = getOrCreateSheet(SHEET_NAMES.ATTENDANCE);

  if (sheet.getLastRow() <= 1) {
    return createResponse(true, null, { attendance: [] });
  }

  const today = new Date();
  const todayStr = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  const data = sheet.getDataRange().getValues();
  const attendance = [];

  for (let i = 1; i < data.length; i++) {
    const rowDate = data[i][0];

    if (!rowDate) continue;

    const rowDateStr = Utilities.formatDate(new Date(rowDate), Session.getScriptTimeZone(), 'yyyy-MM-dd');

    if (rowDateStr === todayStr) {
      attendance.push({
        name: data[i][1],
        team: data[i][2],
        time: data[i][3]
      });
    }
  }

  return createResponse(true, null, { attendance: attendance });
}

/**
 * 전체 통계
 */
function getStats() {
  // 토요일 목록 생성 (2025-01 ~ 2026-12)
  const saturdays = generateSaturdays();
  const totalSaturdays = saturdays.length;

  // 출석 기록 가져오기
  const attendanceSheet = getOrCreateSheet(SHEET_NAMES.ATTENDANCE);
  const attendanceData = attendanceSheet.getLastRow() > 1 ?
    attendanceSheet.getDataRange().getValues().slice(1) : [];

  // 회원 목록 가져오기
  const membersSheet = getOrCreateSheet(SHEET_NAMES.MEMBERS);
  const membersData = membersSheet.getLastRow() > 1 ?
    membersSheet.getDataRange().getValues().slice(1) : [];

  // 개인별 통계 계산
  const personalStats = [];

  membersData.forEach(member => {
    const name = member[0];
    const team = member[1];
    const attendanceCount = member[3] || 0;
    const rate = totalSaturdays > 0 ? (attendanceCount / totalSaturdays) * 100 : 0;

    personalStats.push({
      name: name,
      team: team,
      attendanceCount: attendanceCount,
      totalSaturdays: totalSaturdays,
      rate: rate
    });
  });

  // 팀별 통계 계산
  const teamStats = {
    A: { count: 0, total: 0, rate: 0 },
    B: { count: 0, total: 0, rate: 0 },
    C: { count: 0, total: 0, rate: 0 }
  };

  personalStats.forEach(stat => {
    if (teamStats[stat.team]) {
      teamStats[stat.team].count += stat.attendanceCount;
      teamStats[stat.team].total += stat.totalSaturdays;
    }
  });

  Object.keys(teamStats).forEach(team => {
    const teamMemberCount = personalStats.filter(s => s.team === team).length;
    if (teamMemberCount > 0 && teamStats[team].total > 0) {
      teamStats[team].count = teamStats[team].count / teamMemberCount;
      teamStats[team].total = totalSaturdays;
      teamStats[team].rate = (teamStats[team].count / teamStats[team].total) * 100;
    }
  });

  // 주차별 통계
  const weeklyStats = [];
  const attendanceByDate = {};

  attendanceData.forEach(row => {
    const date = row[0];
    if (!date) return;

    const dateStr = Utilities.formatDate(new Date(date), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const team = row[2];

    if (!attendanceByDate[dateStr]) {
      attendanceByDate[dateStr] = {
        count: 0,
        teamCounts: { A: 0, B: 0, C: 0 }
      };
    }

    attendanceByDate[dateStr].count++;
    if (attendanceByDate[dateStr].teamCounts[team] !== undefined) {
      attendanceByDate[dateStr].teamCounts[team]++;
    }
  });

  saturdays.forEach((sat, index) => {
    const dateStr = Utilities.formatDate(sat, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const stats = attendanceByDate[dateStr] || { count: 0, teamCounts: { A: 0, B: 0, C: 0 } };

    weeklyStats.push({
      date: dateStr,
      week: index + 1,
      count: stats.count,
      teamCounts: stats.teamCounts
    });
  });

  return createResponse(true, null, {
    stats: {
      personalStats: personalStats,
      teamStats: teamStats,
      weeklyStats: weeklyStats
    }
  });
}

/**
 * 2025-01 ~ 2026-12 사이의 모든 토요일 생성
 */
function generateSaturdays() {
  const saturdays = [];
  const start = new Date(2025, 0, 1); // 2025-01-01
  const end = new Date(2026, 11, 31); // 2026-12-31

  let current = new Date(start);

  // 첫 토요일 찾기
  while (current.getDay() !== 6) {
    current.setDate(current.getDate() + 1);
  }

  // 모든 토요일 추가
  while (current <= end) {
    saturdays.push(new Date(current));
    current.setDate(current.getDate() + 7);
  }

  return saturdays;
}

// ==================== 유틸리티 ====================

/**
 * 시트 가져오기 또는 생성
 */
function getOrCreateSheet(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  return sheet;
}

/**
 * 두 좌표 간 거리 계산 (Haversine 공식)
 */
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

/**
 * 클라이언트 IP 주소 추출
 */
function getClientIP(e) {
  try {
    // Apps Script에서는 직접 IP를 가져올 수 없으므로
    // 헤더 정보 조합으로 대체
    const headers = JSON.stringify(e);
    return Utilities.computeDigest(
      Utilities.DigestAlgorithm.MD5,
      headers,
      Utilities.Charset.UTF_8
    ).map(byte => (byte & 0xFF).toString(16).padStart(2, '0')).join('').substring(0, 16);
  } catch (error) {
    return 'unknown';
  }
}

/**
 * JSON 응답 생성
 */
function createResponse(success, message, data) {
  const response = {
    success: success,
    message: message || (success ? 'Success' : 'Error')
  };

  if (data) {
    Object.assign(response, data);
  }

  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

function setConfigValue(sheet, key, value) {
  var data = sheet.getDataRange().getValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i+1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}

function getConfigValue(sheet, key) {
  var data = sheet.getDataRange().getValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] === key) {
      return data[i][1];
    }
  }
  return '';
}
