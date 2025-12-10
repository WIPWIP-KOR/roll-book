/**
 * 풋살 동호회 출석 시스템 - Google Apps Script
 * 최종 버전: 연도별 시트 분리, 회원 목록 캐싱, 자동 연도 확장 기능 적용
 */

// ==================== 설정 ====================

const SHEET_NAMES = {
  ATTENDANCE: '출석기록', // (이 이름 뒤에 _YYYY가 붙어 시트가 생성됨)
  MEMBERS: '회원목록',
  LOCATION: '위치설정',
  SETTINGS: '설정' 
};

const PASSWORD_CELL = 'B2'; // 설정 시트에서 비밀번호를 저장할 셀
const REQUIRED_RADIUS = 50; // 50미터
const CACHE_TTL_SECONDS = 21600; // 회원 목록 캐시 만료 시간 (6시간)

// ==================== 메인 함수 ====================

/**
 * GET 요청 처리 (주요 액션 및 통계 연도 처리)
 */
function doGet(e) {
  Logger.log('요청 파라미터(e.parameter): ' + JSON.stringify(e.parameter));
  
  const action = e.parameter.action;
  const callback = e.parameter.callback;

  try {
    switch(action) {
      // 관리자/인증
      case 'checkAdminStatus':
          const statusResult = checkAdminStatus(); 
          return createResponse(true, null, statusResult, callback);
      case 'authenticateAdmin':
          const passwordToCheck = e.parameter.password || "";
          const isAuthenticated = authenticateAdmin(passwordToCheck);
          return createResponse(true, null, { isAuthenticated: isAuthenticated }, callback);
      case 'setAdminPassword':
          const newPassword = e.parameter.newPassword || "";
          const success = setAdminPassword(newPassword);
          return createResponse(true, null, { success: success }, callback);
          
      // 데이터/정보 조회
      case 'getMembers':
        return getMembers(callback);
      case 'getLocation':
        return getLocation(callback);
      case 'getTodayAttendance':
        return getTodayAttendance(callback);
        
      // 💡 연도별 통계 조회 (성능 최적화 적용)
      case 'getStats':
        const targetYear = e.parameter.year;
        const season = e.parameter.season || 'all'; // 전체/상반기/하반기
        return getStats(callback, targetYear, season);
        
      // 💡 통계 페이지 초기 로드 시 필요한 연도 목록 조회
      case 'getAvailableYears':
        return getAvailableYears(callback);
        
      // 데이터 쓰기
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
 * POST 요청 처리 (doGet으로 대부분 통합되었으나 유지)
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

// ==================== 관리자 비밀번호 관리 (기존 로직 유지) ====================

function checkAdminStatus() {
  const sheet = getOrCreateSheet(SHEET_NAMES.SETTINGS); 
  const storedValue = sheet.getRange(PASSWORD_CELL).getValue();
  const storedPassword = String(storedValue || '').trim(); 
  const isSet = storedPassword !== "";
  Logger.log(`Admin password set status: ${isSet}`);
  return { isSet: isSet };
}

function authenticateAdmin(inputPassword) {
  try {
    const sheet = getOrCreateSheet(SHEET_NAMES.SETTINGS); 
    const storedValue = sheet.getRange(PASSWORD_CELL).getValue();
    const storedPassword = String(storedValue || '').trim(); 
    if (storedPassword === "") {
      Logger.log('Authentication attempted, but no password registered. Denied.');
      return false; 
    }
    const isAuthenticated = (inputPassword === storedPassword);
    Logger.log(`Authentication result: ${isAuthenticated}`);
    return isAuthenticated;
  } catch (e) {
    Logger.log('Error in authenticateAdmin: ' + e.toString());
    return false; 
  }
}

function setAdminPassword(newPassword) {
    try {
        const sheet = getOrCreateSheet(SHEET_NAMES.SETTINGS);
        sheet.getRange('A2').setValue('관리자 비밀번호');
        sheet.getRange(PASSWORD_CELL).setValue(newPassword);
        Logger.log(`Admin password updated to: "${newPassword}"`);
        return true;
    } catch (e) {
        Logger.log('Error in setAdminPassword: ' + e.toString());
        return false;
    }
}

// ==================== 출석 처리 (연도별 시트 적용) ====================

function processAttendance(data, e, callback) {
  const { name, team, season, latitude, longitude, userAgent } = data;

  if (!name || !team || !season || !latitude || !longitude) {
    return createResponse(false, '필수 정보가 누락되었습니다.', null, callback);
  }

  if (!['A', 'B', 'C'].includes(team)) {
    return createResponse(false, '올바른 팀을 선택해주세요.', null, callback);
  }

  if (!['상반기', '하반기'].includes(season)) {
    return createResponse(false, '올바른 시즌 정보가 아닙니다.', null, callback);
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

  // 💡 현재 연도 시트만 확인하여 중복 체크
  if (isDuplicateAttendance(name, ipAddress)) {
    return createResponse(false, '이미 오늘 출석하셨습니다.', null, callback);
  }

  // 💡 현재 연도 시트에 기록 (시즌 정보 포함)
  saveAttendanceRecord(name, team, season, latitude, longitude, ipAddress, distance);
  updateMember(name, team, season);

  return createResponse(true, '출석이 완료되었습니다!', null, callback);
}

/**
 * 중복 출석 체크 (현재 연도 시트만 확인)
 */
function isDuplicateAttendance(name, ipAddress) {
  const sheet = getAttendanceSheet(new Date().getFullYear());
  if (!sheet || sheet.getLastRow() <= 1) return false;

  const today = new Date();
  const todayStr = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const rowDate = data[i][0];
    const rowName = data[i][2];
    const rowIP = data[i][8];   // IP주소 컬럼 (시즌 컬럼 추가로 인해 8번째 인덱스)

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
 * 출석 기록 저장 (현재 연도 시트에 저장, 시즌 정보 포함)
 */
function saveAttendanceRecord(name, team, season, latitude, longitude, ipAddress, distance) {
  const currentYear = new Date().getFullYear();
  let sheet = getAttendanceSheet(currentYear);

  if (!sheet) {
      // 시트가 없으면 자동 생성 및 헤더 삽입
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const newSheetName = getAttendanceSheetName(currentYear);
      sheet = ss.insertSheet(newSheetName);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['날짜', '요일', '이름', '팀', '시즌', '출석시간', '위도', '경도', 'IP주소', '거리(m)']);
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
    season,  // 시즌 정보 추가 (상반기/하반기)
    time,
    latitude,
    longitude,
    ipAddress,
    Math.round(distance)
  ]);
}

/**
 * 회원 정보 업데이트 (총 출석수 누적, 시즌별 팀 관리)
 */
function updateMember(name, team, season) {
  const sheet = getOrCreateSheet(SHEET_NAMES.MEMBERS);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['이름', '상반기팀', '하반기팀', '최초등록일', '총출석수']);
  }

  const data = sheet.getDataRange().getValues();
  let found = false;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === name) {
      const currentCount = data[i][4] || 0;
      sheet.getRange(i + 1, 5).setValue(currentCount + 1);

      // 해당 시즌의 팀 정보 업데이트 (빈 값인 경우에만)
      if (season === '상반기' && !data[i][1]) {
        sheet.getRange(i + 1, 2).setValue(team);
      } else if (season === '하반기' && !data[i][2]) {
        sheet.getRange(i + 1, 3).setValue(team);
      }

      // 💡 캐시 무효화: 회원 정보가 변경되었으므로 캐시를 지웁니다.
      CacheService.getScriptCache().remove('ALL_MEMBERS_DATA');

      found = true;
      break;
    }
  }

  if (!found) {
    const now = new Date();
    const date = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');

    // 새 회원 추가 시 현재 시즌에 맞는 팀 정보만 입력
    const firstHalfTeam = (season === '상반기') ? team : '';
    const secondHalfTeam = (season === '하반기') ? team : '';

    sheet.appendRow([name, firstHalfTeam, secondHalfTeam, date, 1]);

    // 💡 캐시 무효화
    CacheService.getScriptCache().remove('ALL_MEMBERS_DATA');
  }
}

// ==================== 위치 관리 (기존 로직 유지) ====================

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

function getLocation(callback) {
  const targetLocation = getTargetLocation();
  if (!targetLocation) {
    return createResponse(false, '저장된 위치가 없습니다.', null, callback);
  }
  return createResponse(true, null, { location: targetLocation }, callback);
}

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

// ==================== 회원 목록 및 통계 (최적화 적용) ====================

/**
 * 회원 목록 조회 및 캐싱 적용 (성능 최적화)
 */
function getMembers(callback) {
  const cache = CacheService.getScriptCache();
  const CACHE_KEY = 'ALL_MEMBERS_DATA';
  
  // 1. 캐시에서 데이터 로드 시도
  let membersJson = cache.get(CACHE_KEY);
  
  if (membersJson) {
      Logger.log('Members data loaded from cache.');
      const members = JSON.parse(membersJson);
      if (callback) {
          return createResponse(true, 'Loaded from cache', { members: members }, callback);
      }
      return members; // 콜백이 없으면 순수 데이터 반환
  }
  
  // 2. 캐시 부재 시 시트에서 로드
  const sheet = getOrCreateSheet(SHEET_NAMES.MEMBERS);
  
  if (sheet.getLastRow() <= 1) {
      if (callback) {
          return createResponse(true, null, { members: [] }, callback);
      }
      return [];
  }

  const data = sheet.getDataRange().getValues();
  const members = [];

  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) {
      members.push({
        name: data[i][0],
        firstHalfTeam: data[i][1],   // 상반기 팀
        secondHalfTeam: data[i][2],  // 하반기 팀
        firstDate: data[i][3],
        attendanceCountTotal: data[i][4] || 0 // 총 출석수
      });
    }
  }

  // 3. 캐시에 저장
  membersJson = JSON.stringify(members);
  cache.put(CACHE_KEY, membersJson, CACHE_TTL_SECONDS);
  Logger.log('Members data loaded from sheet and saved to cache.');

  if (callback) {
      return createResponse(true, null, { members: members }, callback);
  }
  return members;
}

/**
 * 오늘 출석 현황 (현재 연도 시트만 확인)
 */
function getTodayAttendance(callback) {
  const sheet = getAttendanceSheet(new Date().getFullYear()); // 현재 연도 시트
  if (!sheet || sheet.getLastRow() <= 1) {
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
        season: data[i][4],
        time: data[i][5]
      });
    }
  }
  return createResponse(true, null, { attendance: attendance }, callback);
}

/**
 * 전체 통계 (요청된 연도에 대한 데이터만 처리, 시즌 필터링 지원)
 */
function getStats(callback, year, season) {
  const targetYear = parseInt(year);
  if (isNaN(targetYear)) {
      return createResponse(false, '유효한 연도가 지정되지 않았습니다.', null, callback);
  }

  // season: 'all', 'firstHalf', 'secondHalf'
  const seasonFilter = season || 'all';

  // 전체 연도의 토요일 생성
  let saturdays = generateSaturdays(targetYear);

  // 시즌에 따라 토요일 필터링
  if (seasonFilter === 'firstHalf') {
    saturdays = saturdays.filter(sat => {
      const month = sat.getMonth() + 1; // 1~12
      return month >= 1 && month <= 6;
    });
  } else if (seasonFilter === 'secondHalf') {
    saturdays = saturdays.filter(sat => {
      const month = sat.getMonth() + 1; // 1~12
      return month >= 7 && month <= 12;
    });
  }

  const totalSaturdays = saturdays.length;

  // 💡 해당 연도의 출석 기록 시트만 사용
  const attendanceSheet = getAttendanceSheet(targetYear);
  let attendanceData = (attendanceSheet && attendanceSheet.getLastRow() > 1) ?
    attendanceSheet.getDataRange().getValues().slice(1) : [];

  // 시즌 필터링 적용
  if (seasonFilter === 'firstHalf') {
    attendanceData = attendanceData.filter(row => row[4] === '상반기');
  } else if (seasonFilter === 'secondHalf') {
    attendanceData = attendanceData.filter(row => row[4] === '하반기');
  }

  // 💡 캐시된 회원 목록 사용 (성능 최적화)
  const members = getMembers(null);

  // 1. 개인별 통계 계산을 위한 해당 연도 출석 횟수 집계
  const attendanceCountMap = {};
  members.forEach(m => attendanceCountMap[m.name] = 0);

  // 출석 기록 시트 스캔 (해당 연도 데이터만 있으므로 빠름)
  attendanceData.forEach(row => {
    const rowName = row[2];
    if (attendanceCountMap[rowName] !== undefined) {
        attendanceCountMap[rowName]++;
    }
  });

  const personalStats = [];
  members.forEach(member => {
    const attendanceCountInYear = attendanceCountMap[member.name] || 0;
    const rate = totalSaturdays > 0 ? (attendanceCountInYear / totalSaturdays) * 100 : 0;

    // 시즌에 따라 팀 정보 결정
    let teamForSeason;
    if (seasonFilter === 'firstHalf') {
      teamForSeason = member.firstHalfTeam;
    } else if (seasonFilter === 'secondHalf') {
      teamForSeason = member.secondHalfTeam;
    } else {
      // 'all'인 경우 현재 시즌의 팀 사용
      const currentMonth = new Date().getMonth() + 1;
      teamForSeason = (currentMonth >= 1 && currentMonth <= 6) ?
        member.firstHalfTeam : member.secondHalfTeam;
    }

    personalStats.push({
      name: member.name,
      team: teamForSeason,
      attendanceCount: attendanceCountInYear,
      attendanceCountTotal: member.attendanceCountTotal,
      totalSaturdays: totalSaturdays,
      rate: rate
    });
  });

  // 2. 팀별 통계 계산
  const teamStats = {
    A: { count: 0, total: 0, rate: 0 },
    B: { count: 0, total: 0, rate: 0 },
    C: { count: 0, total: 0, rate: 0 }
  };
    Object.keys(teamStats).forEach(team => {
        const teamMembers = personalStats.filter(s => s.team === team);
        const teamMemberCount = teamMembers.length;

        if (teamMemberCount > 0) {
            const totalAttendanceForTeam = teamMembers.reduce((sum, member) => sum + member.attendanceCount, 0);

            teamStats[team].count = totalAttendanceForTeam / teamMemberCount;
            teamStats[team].total = totalSaturdays;
            teamStats[team].rate = (teamStats[team].count / teamStats[team].total) * 100;
        } else {
            teamStats[team].count = 0;
            teamStats[team].total = totalSaturdays;
            teamStats[team].rate = 0;
        }
    });


  // 3. 주차별 통계 계산
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
    const displayDateStr = Utilities.formatDate(sat, Session.getScriptTimeZone(), 'MM/dd'); 
    
    const stats = attendanceByDate[dateStr] || { count: 0, teamCounts: { A: 0, B: 0, C: 0 } };

    weeklyStats.push({
      date: displayDateStr, 
      fullDate: dateStr,    
      week: index + 1,
      count: stats.count,
      teamCounts: stats.teamCounts
    });
  });

  return createResponse(true, null, {
    stats: {
      personalStats: personalStats,
      teamStats: teamStats,
      weeklyStats: weeklyStats,
      targetYear: targetYear 
    }
  }, callback);
}

/**
 * 특정 연도의 토요일만 생성
 */
function generateSaturdays(year) {
  const saturdays = [];
  const start = new Date(year, 0, 1); 
  const end = new Date(year, 11, 31); 

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

/**
 * 💡 새로운 액션: 사용 가능한 모든 연도를 조회
 */
function getAvailableYears(callback) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets();
    const years = new Set();
    const prefix = `${SHEET_NAMES.ATTENDANCE}_`;

    sheets.forEach(sheet => {
        const name = sheet.getName();
        if (name.startsWith(prefix)) {
            const yearStr = name.substring(prefix.length);
            const yearNum = parseInt(yearStr);
            if (!isNaN(yearNum) && yearStr.length === 4) {
                years.add(yearNum);
            }
        }
    });

    const sortedYears = Array.from(years).sort((a, b) => b - a); // 최신 연도부터 정렬

    return createResponse(true, null, { availableYears: sortedYears }, callback);
}


// ==================== 유틸리티 (수정된 시트 로직 반영) ====================

/**
 * 💡 출석 기록 시트 이름 생성 (YYYY 반영)
 */
function getAttendanceSheetName(year) {
    return `${SHEET_NAMES.ATTENDANCE}_${year}`;
}

/**
 * 💡 특정 연도의 출석 시트 가져오기
 */
function getAttendanceSheet(year) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    return ss.getSheetByName(getAttendanceSheetName(year));
}

/**
 * 시트 가져오기 또는 생성 (기본 시트만 처리)
 */
function getOrCreateSheet(sheetName) {
  // 출석 시트 요청은 getAttendanceSheet 함수로 처리해야 함
  if (sheetName.startsWith(SHEET_NAMES.ATTENDANCE)) {
      Logger.log(`Warning: Attempted to use getOrCreateSheet for attendance sheet ${sheetName}. Use getAttendanceSheet.`);
      return null;
  }
    
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

function getDayOfWeek(date) {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return days[date.getDay()];
}

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
