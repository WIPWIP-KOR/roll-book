/**
 * 풋살 동호회 출석 시스템 - Google Apps Script
 */

// ==================== 설정 ====================

const SHEET_NAMES = {
  ATTENDANCE: '출석기록',
  MEMBERS: '회원목록',
  LOCATION: '위치설정',
  SATURDAYS: '토요일일정',
  SETTINGS: '설정' 
};

const PASSWORD_CELL = 'B1'; // 설정 시트에서 비밀번호를 저장할 셀
const REQUIRED_RADIUS = 50; // 50미터

// ==================== 메인 함수 ====================

/**
 * GET 요청 처리 (GitHub Pages와 통신을 위해 모든 액션을 처리)
 */
function doGet(e) {
  Logger.log('요청 파라미터(e.parameter): ' + JSON.stringify(e.parameter));
  
  const action = e.parameter.action;
  const callback = e.parameter.callback;

  try {
    switch(action) {
      
      // 관리자 인증 상태 확인 (초기 진입 시 팝업 유무 결정)
      case 'checkAdminStatus':
          const statusResult = checkAdminStatus(); 
          return createResponse(true, null, statusResult, callback);

      // 관리자 비밀번호를 입력받아 인증 시도
      case 'authenticateAdmin':
          const passwordToCheck = e.parameter.password || "";
          const isAuthenticated = authenticateAdmin(passwordToCheck);
          return createResponse(true, null, { isAuthenticated: isAuthenticated }, callback);

      // 관리자 비밀번호 설정/변경/해제 기능
      case 'setAdminPassword':
          const newPassword = e.parameter.newPassword || "";
          const success = setAdminPassword(newPassword);
          return createResponse(true, null, { success: success }, callback);
          
      case 'getMembers':
        return getMembers(callback);
      case 'getLocation':
        return getLocation(callback);
      case 'getTodayAttendance':
        return getTodayAttendance(callback);
      case 'getStats':
        return getStats(callback);
      case 'saveLocation':
        const dataFromParams = {
          action: 'saveLocation',
          latitude: e.parameter.latitude,
          longitude: e.parameter.longitude,
          name: e.parameter.name
        };
        return saveLocation(dataFromParams, callback);
      case 'attend':
        return processAttendance(e.parameter, e, callback);
      default:
        return createResponse(false, 'Invalid action', null, callback);
    }
  } catch (error) {
    return createResponse(false, error.toString(), null, callback);
  }
}

/**
 * POST 요청 처리 (현재 프로젝트에서는 대부분 doGet으로 통합됨)
 */
function doPost(e) {
  let callback = e.parameter.callback;

  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action || e.parameter.action;

    switch(action) {
      case 'attend':
        return processAttendance(data, e, callback);
      case 'saveLocation':
        return saveLocation(data, callback);
      default:
        return createResponse(false, 'Invalid action', null, callback);
    }
  } catch (error) {
    return createResponse(false, error.toString(), null, callback);
  }
}

// ==================== 관리자 비밀번호 관리 ====================

/**
 * 관리자 비밀번호의 설정 상태만 확인하여 클라이언트에게 알립니다.
 * @returns {{isSet: boolean}} - 비밀번호 설정 여부
 */
function checkAdminStatus() {
  const sheet = getOrCreateSheet(SHEET_NAMES.SETTINGS); 
  const storedValue = sheet.getRange(PASSWORD_CELL).getValue();
  const storedPassword = String(storedValue || '').trim(); 
    
  const isSet = storedPassword !== "";
  
  Logger.log(`Admin password set status: ${isSet}`);
  return { isSet: isSet };
}

/**
 * 클라이언트에서 입력된 비밀번호를 확인하는 함수 
 * @param {string} inputPassword - 사용자가 입력한 비밀번호
 * @returns {boolean} - 인증 성공 여부 (true/false)
 */
function authenticateAdmin(inputPassword) {
  try {
    const sheet = getOrCreateSheet(SHEET_NAMES.SETTINGS); 
    const storedValue = sheet.getRange(PASSWORD_CELL).getValue();
    const storedPassword = String(storedValue || '').trim(); 
    
    // 비밀번호가 미등록 상태라면 인증 시도 실패 처리
    if (storedPassword === "") {
      Logger.log('Authentication attempted, but no password registered. Denied.');
      return false; 
    }
    
    // 등록된 비밀번호와 비교
    const isAuthenticated = (inputPassword === storedPassword);
    
    Logger.log(`Authentication result: ${isAuthenticated}`);
    return isAuthenticated;

  } catch (e) {
    Logger.log('Error in authenticateAdmin: ' + e.toString());
    return false; 
  }
}

/**
 * 관리자 페이지에서 비밀번호를 설정/변경/해제하는 함수
 * @param {string} newPassword - 새로 설정할 4자리 비밀번호 (빈 문자열 가능)
 * @returns {boolean} - 저장 성공 여부 (true/false)
 */
function setAdminPassword(newPassword) {
    if (newPassword !== "" && (typeof newPassword !== 'string' || newPassword.length !== 4 || isNaN(newPassword))) {
        Logger.log('Invalid new password format.');
        return false;
    }
  
    try {
        const sheet = getOrCreateSheet(SHEET_NAMES.SETTINGS);
        sheet.getRange(PASSWORD_CELL).setValue(newPassword);
        
        Logger.log(`Admin password updated to: "${newPassword}"`);
        return true;
    } catch (e) {
        Logger.log('Error in setAdminPassword: ' + e.toString());
        return false;
    }
}


// ==================== 출석 처리 ====================
// (이하 출석 처리, 위치 관리, 회원 관리, 통계, 유틸리티 함수는 변동 없음)

/**
 * 출석 처리
 */
function processAttendance(data, e, callback) {
  const { name, team, latitude, longitude, userAgent } = data;

  if (!name || !team || !latitude || !longitude) {
    return createResponse(false, '필수 정보가 누락되었습니다.', null, callback);
  }

  if (!['A', 'B', 'C'].includes(team)) {
    return createResponse(false, '올바른 팀을 선택해주세요.', null, callback);
  }

  const targetLocation = getTargetLocation();
  if (!targetLocation) {
    return createResponse(false, '출석 위치가 설정되지 않았습니다. 관리자에게 문의하세요.', null, callback);
  }

  const distance = calculateDistance(
    latitude, longitude,
    targetLocation.latitude, targetLocation.longitude
  );

  if (distance > REQUIRED_RADIUS) {
    return createResponse(false, `출석 불가 지역입니다. (${Math.round(distance)}m 떨어짐)`, null, callback);
  }

  const ipAddress = getClientIP(e);

  if (isDuplicateAttendance(name, ipAddress)) {
    return createResponse(false, '이미 오늘 출석하셨습니다.', null, callback);
  }

  saveAttendanceRecord(name, team, latitude, longitude, ipAddress, distance);
  updateMember(name, team);

  return createResponse(true, '출석이 완료되었습니다!', null, callback);
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
    const rowName = data[i][2]; 
    const rowIP = data[i][7];   

    if (!rowDate) continue;

    const rowDateStr = Utilities.formatDate(new Date(rowDate), Session.getScriptTimeZone(), 'yyyy-MM-dd');

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

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['날짜', '요일', '이름', '팀', '출석시간', '위도', '경도', 'IP주소', '거리(m)']);
  }

  const now = new Date();
  const date = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const time = Utilities.formatDate(now, Session.getScriptTimeZone(), 'HH:mm:ss');
  const dayOfWeek = getDayOfWeek(now); 

  sheet.appendRow([
    date,
    dayOfWeek, 
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

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['이름', '팀', '최초등록일', '총출석수']);
  }

  const data = sheet.getDataRange().getValues();
  let found = false;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === name) {
      const currentCount = data[i][3] || 0;
      sheet.getRange(i + 1, 4).setValue(currentCount + 1);
      found = true;
      break;
    }
  }

  if (!found) {
    const now = new Date();
    const date = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    sheet.appendRow([name, team, date, 1]);
  }
}

// ==================== 위치 관리 ====================

/**
 * 위치 저장 (doGet/doPost 모두에서 호출 가능)
 */
function saveLocation(data, callback) {
  const { latitude, longitude, name } = data;

  if (!latitude || !longitude || !name) {
    return createResponse(false, '필수 정보가 누락되었습니다.', null, callback);
  }

  const sheet = getOrCreateSheet(SHEET_NAMES.LOCATION);

  sheet.clear();
  sheet.appendRow(['항목', '값']);
  sheet.appendRow(['위도', latitude]);
  sheet.appendRow(['경도', longitude]);
  sheet.appendRow(['장소명', name]);

  return createResponse(true, '위치가 저장되었습니다.', null, callback);
}

/**
 * 위치 조회
 */
function getLocation(callback) {
  const targetLocation = getTargetLocation();

  if (!targetLocation) {
    return createResponse(false, '저장된 위치가 없습니다.', null, callback);
  }

  return createResponse(true, null, { location: targetLocation }, callback);
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
function getMembers(callback) {
  const sheet = getOrCreateSheet(SHEET_NAMES.MEMBERS);

  if (sheet.getLastRow() <= 1) {
    return createResponse(true, null, { members: [] }, callback);
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

  return createResponse(true, null, { members: members }, callback);
}

// ==================== 통계 ====================

/**
 * 오늘 출석 현황
 */
function getTodayAttendance(callback) {
  const sheet = getOrCreateSheet(SHEET_NAMES.ATTENDANCE);

  if (sheet.getLastRow() <= 1) {
    return createResponse(true, null, { attendance: [] }, callback);
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
        name: data[i][2], 
        team: data[i][3], 
        time: data[i][4]  
      });
    }
  }

  return createResponse(true, null, { attendance: attendance }, callback);
}

/**
 * 전체 통계
 */
function getStats(callback) {
  const saturdays = generateSaturdays();
  const totalSaturdays = saturdays.length;

  const attendanceSheet = getOrCreateSheet(SHEET_NAMES.ATTENDANCE);
  const attendanceData = attendanceSheet.getLastRow() > 1 ?
    attendanceSheet.getDataRange().getValues().slice(1) : [];

  const membersSheet = getOrCreateSheet(SHEET_NAMES.MEMBERS);
  const membersData = membersSheet.getLastRow() > 1 ?
    membersSheet.getDataRange().getValues().slice(1) : [];

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

  const weeklyStats = [];
  const attendanceByDate = {};

  attendanceData.forEach(row => {
    const date = row[0];
    if (!date) return;

    const dateStr = Utilities.formatDate(new Date(date), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const team = row[3]; 

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
  }, callback);
}

/**
 * 2025-01 ~ 2026-12 사이의 모든 토요일 생성 (통계용)
 */
function generateSaturdays() {
  const saturdays = [];
  const start = new Date(2025, 0, 1); 
  const end = new Date(2026, 11, 31); 

  let current = new Date(start);

  while (current.getDay() !== 6) {
    current.setDate(current.getDate() + 1);
  }

  while (current <= end) {
    saturdays.push(new Date(current));
    current.setDate(current.getDate() + 7);
  }

  return saturdays;
}

// ==================== 유틸리티 ====================

/**
 * 요일 계산 함수 (일월화수목금토 반환)
 */
function getDayOfWeek(date) {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return days[date.getDay()];
}

/**
 * 시트 가져오기 또는 생성
 */
function getOrCreateSheet(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (sheetName === SHEET_NAMES.SETTINGS && sheet.getLastRow() === 0) {
        sheet.appendRow(['항목', '값']);
    }
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
 * JSON 응답 생성 (JSONP 방식으로 CORS 문제 해결)
 */
function createResponse(success, message, data, callback) {
  const response = {
    success: success,
    message: message || (success ? 'Success' : 'Error')
  };

  if (data) {
    Object.assign(response, data);
  }

  const json = JSON.stringify(response);

  if (callback) {
    return ContentService
      .createTextOutput(`${callback}(${json})`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
