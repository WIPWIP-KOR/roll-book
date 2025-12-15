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
      case 'saveAttendanceTime':
          const startTime = e.parameter.startTime;
          const lateTime = e.parameter.lateTime;
          const saveTimeSuccess = saveAttendanceTime(startTime, lateTime);
          return createResponse(saveTimeSuccess, saveTimeSuccess ? null : 'Failed to save attendance time', null, callback);
      case 'getAttendanceTime':
          return getAttendanceTime(callback);
      case 'saveAttendanceDays':
          const days = e.parameter.days;
          const saveDaysSuccess = saveAttendanceDays(days);
          return createResponse(saveDaysSuccess, saveDaysSuccess ? null : 'Failed to save attendance days', null, callback);
      case 'getAttendanceDays':
          return getAttendanceDays(callback);
      case 'recalculateLateStatus':
          return recalculateLateStatus(callback);

      // 데이터/정보 조회
      case 'getMembers':
        return getMembers(callback);
      case 'getLocation':
        return getLocation(callback);
      case 'getTodayAttendance':
        return getTodayAttendance(callback);
      case 'getLastWeekAttendance':
        return getLastWeekAttendance(callback);
      case 'getAttendanceDetailByDate':
        const dateParam = e.parameter.date;
        return getAttendanceDetailByDate(callback, dateParam);
        
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

/**
 * 출석 시간 설정 저장
 */
function saveAttendanceTime(startTime, lateTime) {
    try {
        const sheet = getOrCreateSheet(SHEET_NAMES.SETTINGS);

        // 출석 시작 시간 저장
        let startRow = findSettingRow(sheet, '출석 시작 시간');
        if (!startRow) {
            sheet.appendRow(['출석 시작 시간', startTime]);
        } else {
            sheet.getRange(startRow, 2).setValue(startTime);
        }

        // 지각 기준 시간 저장
        let lateRow = findSettingRow(sheet, '지각 기준 시간');
        if (!lateRow) {
            sheet.appendRow(['지각 기준 시간', lateTime]);
        } else {
            sheet.getRange(lateRow, 2).setValue(lateTime);
        }

        Logger.log(`Attendance time saved: start=${startTime}, late=${lateTime}`);
        return true;
    } catch (e) {
        Logger.log('Error in saveAttendanceTime: ' + e.toString());
        return false;
    }
}

/**
 * 출석 시간 설정 불러오기
 */
function getAttendanceTime(callback) {
    try {
        const sheet = getOrCreateSheet(SHEET_NAMES.SETTINGS);

        const startRow = findSettingRow(sheet, '출석 시작 시간');
        const lateRow = findSettingRow(sheet, '지각 기준 시간');

        let startTime = startRow ? sheet.getRange(startRow, 2).getValue() : null;
        let lateTime = lateRow ? sheet.getRange(lateRow, 2).getValue() : null;

        // Date 객체인 경우 HH:mm 형식 문자열로 변환
        if (startTime instanceof Date) {
            startTime = Utilities.formatDate(startTime, Session.getScriptTimeZone(), 'HH:mm');
        }
        if (lateTime instanceof Date) {
            lateTime = Utilities.formatDate(lateTime, Session.getScriptTimeZone(), 'HH:mm');
        }

        return createResponse(true, null, {
            attendanceTime: {
                startTime: startTime,
                lateTime: lateTime
            }
        }, callback);
    } catch (e) {
        Logger.log('Error in getAttendanceTime: ' + e.toString());
        return createResponse(false, e.toString(), null, callback);
    }
}

/**
 * 설정 시트에서 특정 항목의 행 번호 찾기
 */
function findSettingRow(sheet, itemName) {
    const data = sheet.getDataRange().getValues();
    for (let i = 0; i < data.length; i++) {
        if (data[i][0] === itemName) {
            return i + 1; // 행 번호는 1부터 시작
        }
    }
    return null;
}

/**
 * 출석 가능 요일 설정 저장
 */
function saveAttendanceDays(daysString) {
    try {
        const sheet = getOrCreateSheet(SHEET_NAMES.SETTINGS);
        let row = findSettingRow(sheet, '출석 가능 요일');

        if (!row) {
            sheet.appendRow(['출석 가능 요일', daysString]);
        } else {
            sheet.getRange(row, 2).setValue(daysString);
        }

        Logger.log(`Attendance days saved: ${daysString}`);
        return true;
    } catch (e) {
        Logger.log('Error in saveAttendanceDays: ' + e.toString());
        return false;
    }
}

/**
 * 출석 가능 요일 설정 불러오기
 */
function getAttendanceDays(callback) {
    try {
        const sheet = getOrCreateSheet(SHEET_NAMES.SETTINGS);
        const row = findSettingRow(sheet, '출석 가능 요일');
        const daysValue = row ? sheet.getRange(row, 2).getValue() : '';

        // 문자열로 강제 변환 (숫자로 저장된 경우 대비)
        const days = daysValue ? String(daysValue) : '';

        return createResponse(true, null, {
            attendanceDays: days
        }, callback);
    } catch (e) {
        Logger.log('Error in getAttendanceDays: ' + e.toString());
        return createResponse(false, e.toString(), null, callback);
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

  // 💡 요일 검증
  const allowedDays = getAllowedDays();
  if (allowedDays.length > 0) {
    const today = new Date();
    const currentDay = today.getDay(); // 0~6

    if (!allowedDays.includes(currentDay)) {
      const dayNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
      const allowedDayNames = allowedDays.map(d => dayNames[d]).join(', ');
      return createResponse(false,
        `출석은 ${allowedDayNames}만 가능합니다.`,
        null, callback);
    }
  }

  // 💡 지각 판정 로직
  const lateStatus = checkLateStatus();

  // 출석 시작 시간 이전이면 출석 불가
  if (lateStatus.beforeStart) {
    return createResponse(false, `출석 시간이 아닙니다. ${lateStatus.startTime} 이후에 출석해주세요.`, null, callback);
  }

  // 💡 현재 연도 시트에 기록 (시즌 정보 및 지각 여부 포함)
  saveAttendanceRecord(name, team, season, latitude, longitude, ipAddress, distance, lateStatus.isLate);
  updateMember(name, team, season);

  // 지각 여부에 따라 다른 메시지 반환
  if (lateStatus.isLate) {
    const funnyMessages = [
      '⏰ 어머나! 늦었네요! 뛰어오셨어요? 😅',
      '🐢 지각! 천천히 오셨군요~ 다음엔 더 일찍!',
      '😅 지각이에요! 시간 확인 필수!',
      '🕐 늦었어요! 하지만 출석은 인정!',
      '⏱️ 지각! 다음엔 알람 맞춰두세요~ ⏰',
      '🏃 조금만 더 일찍 오셨으면...! 지각이에요!'
    ];
    const randomMessage = funnyMessages[Math.floor(Math.random() * funnyMessages.length)];
    return createResponse(true, randomMessage, { isLate: true }, callback);
  }

  return createResponse(true, '✅ 출석이 완료되었습니다!', { isLate: false }, callback);
}

/**
 * 시간 문자열을 분 단위로 변환 (HH:mm → 분)
 */
function timeToMinutes(timeStr) {
  if (!timeStr) return null;

  // 문자열로 변환 (숫자나 다른 타입이 들어올 경우 대비)
  const str = String(timeStr).trim();

  // HH:mm 형식 파싱
  const parts = str.split(':');
  if (parts.length !== 2) return null;

  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);

  if (isNaN(hours) || isNaN(minutes)) return null;

  return hours * 60 + minutes;
}

/**
 * 지각 여부 판정
 */
function checkLateStatus() {
  const sheet = getOrCreateSheet(SHEET_NAMES.SETTINGS);
  const startRow = findSettingRow(sheet, '출석 시작 시간');
  const lateRow = findSettingRow(sheet, '지각 기준 시간');

  // 설정이 없으면 지각 판정 안 함
  if (!startRow || !lateRow) {
    return { isLate: false, beforeStart: false, startTime: null };
  }

  let startTime = sheet.getRange(startRow, 2).getValue();
  let lateTime = sheet.getRange(lateRow, 2).getValue();

  // Date 객체인 경우 HH:mm 형식 문자열로 변환
  if (startTime instanceof Date) {
    startTime = Utilities.formatDate(startTime, Session.getScriptTimeZone(), 'HH:mm');
  }
  if (lateTime instanceof Date) {
    lateTime = Utilities.formatDate(lateTime, Session.getScriptTimeZone(), 'HH:mm');
  }

  if (!startTime || !lateTime) {
    return { isLate: false, beforeStart: false, startTime: null };
  }

  const now = new Date();
  const currentTime = Utilities.formatDate(now, Session.getScriptTimeZone(), 'HH:mm');

  // 문자열을 분 단위로 변환하여 비교
  const currentMinutes = timeToMinutes(currentTime);
  const startMinutes = timeToMinutes(startTime);
  const lateMinutes = timeToMinutes(lateTime);

  // 변환 실패 시 지각 판정 안 함
  if (currentMinutes === null || startMinutes === null || lateMinutes === null) {
    Logger.log('시간 변환 실패: current=' + currentTime + ', start=' + startTime + ', late=' + lateTime);
    return { isLate: false, beforeStart: false, startTime: null };
  }

  // 출석 시작 시간 이전인지 확인
  if (currentMinutes < startMinutes) {
    return { isLate: false, beforeStart: true, startTime: startTime };
  }

  // 지각 기준 시간 이후인지 확인 (같거나 크면 지각)
  const isLate = currentMinutes >= lateMinutes;

  Logger.log('지각 판정: 현재=' + currentTime + '(' + currentMinutes + '분), 지각기준=' + lateTime + '(' + lateMinutes + '분), 결과=' + (isLate ? '지각' : '정상'));

  return { isLate: isLate, beforeStart: false, startTime: startTime };
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
 * 출석 기록 저장 (현재 연도 시트에 저장, 시즌 정보 및 지각 여부 포함)
 */
function saveAttendanceRecord(name, team, season, latitude, longitude, ipAddress, distance, isLate) {
  const currentYear = new Date().getFullYear();
  let sheet = getAttendanceSheet(currentYear);

  if (!sheet) {
      // 시트가 없으면 자동 생성 및 헤더 삽입
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const newSheetName = getAttendanceSheetName(currentYear);
      sheet = ss.insertSheet(newSheetName);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['날짜', '요일', '이름', '팀', '시즌', '출석시간', '지각여부', '위도', '경도', 'IP주소', '거리(m)']);
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
    isLate ? '지각' : '정상',  // 지각 여부
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
        time: data[i][5],
        isLate: data[i][6] === '지각' // 지각 여부 추가
      });
    }
  }
  return createResponse(true, null, { attendance: attendance }, callback);
}

/**
 * 지난주 출석 현황 (가장 최근 지나간 토요일 기록)
 */
function getLastWeekAttendance(callback) {
  // 가장 최근 지나간 토요일 날짜 계산
  const today = new Date();
  const currentDay = today.getDay(); // 0(일) ~ 6(토)

  // 가장 최근 지나간 토요일까지의 일수 계산
  // 일요일(0)이면 1일 전(어제), 월요일(1)이면 2일 전, ..., 토요일(6)이면 7일 전
  let daysToLastSaturday;
  if (currentDay === 6) {
    // 오늘이 토요일이면 지난주 토요일은 7일 전
    daysToLastSaturday = 7;
  } else {
    // 그 외의 경우: 가장 최근 지나간 토요일
    daysToLastSaturday = currentDay + 1;
  }

  const lastSaturday = new Date(today);
  lastSaturday.setDate(today.getDate() - daysToLastSaturday);
  const lastSaturdayStr = Utilities.formatDate(lastSaturday, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  // 해당 연도의 시트 가져오기
  const year = lastSaturday.getFullYear();
  const sheet = getAttendanceSheet(year);

  if (!sheet || sheet.getLastRow() <= 1) {
    return createResponse(true, null, { attendance: [], date: lastSaturdayStr }, callback);
  }

  const data = sheet.getDataRange().getValues();
  const attendance = [];

  for (let i = 1; i < data.length; i++) {
    const rowDate = data[i][0];
    if (!rowDate) continue;
    const rowDateStr = Utilities.formatDate(new Date(rowDate), Session.getScriptTimeZone(), 'yyyy-MM-dd');

    if (rowDateStr === lastSaturdayStr) {
      attendance.push({
        name: data[i][2],
        team: data[i][3],
        season: data[i][4],
        time: data[i][5],
        isLate: data[i][6] === '지각' // 지각 여부 추가
      });
    }
  }

  return createResponse(true, null, { attendance: attendance, date: lastSaturdayStr }, callback);
}

/**
 * 특정 날짜의 출석 상세 정보를 가져옵니다
 * @param {string} callback - JSONP 콜백 함수명
 * @param {string} dateParam - 조회할 날짜 (YYYY-MM-DD 형식)
 */
function getAttendanceDetailByDate(callback, dateParam) {
  if (!dateParam) {
    return createResponse(false, '날짜가 지정되지 않았습니다.', null, callback);
  }

  // 날짜 파라미터에서 연도 추출
  const year = parseInt(dateParam.substring(0, 4));

  const sheet = getAttendanceSheet(year);
  if (!sheet || sheet.getLastRow() <= 1) {
    return createResponse(true, null, { attendance: [] }, callback);
  }

  const data = sheet.getDataRange().getValues();
  const attendance = [];

  for (let i = 1; i < data.length; i++) {
    const rowDate = data[i][0];
    if (!rowDate) continue;
    const rowDateStr = Utilities.formatDate(new Date(rowDate), Session.getScriptTimeZone(), 'yyyy-MM-dd');

    if (rowDateStr === dateParam) {
      attendance.push({
        name: data[i][2],
        team: data[i][3],
        season: data[i][4],
        time: data[i][5],
        isLate: data[i][6] === '지각' // 지각 여부 추가
      });
    }
  }

  return createResponse(true, null, { attendance: attendance }, callback);
}

/**
 * 통계용 원본 데이터 반환 (클라이언트에서 집계 처리)
 * 성능 최적화: Apps Script에서는 데이터 읽기만, 집계는 클라이언트에서 처리
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

  // 💡 해당 연도의 출석 기록 시트만 사용
  const attendanceSheet = getAttendanceSheet(targetYear);
  let attendanceData = (attendanceSheet && attendanceSheet.getLastRow() > 1) ?
    attendanceSheet.getDataRange().getValues().slice(1) : [];

  // 시즌 필터링 적용 (기존 데이터 호환성 고려)
  if (seasonFilter === 'firstHalf') {
    attendanceData = attendanceData.filter(row => {
      const recordSeason = row[4]; // 시즌 컬럼
      // 시즌 정보가 있으면 그것을 사용, 없으면 날짜로 판단
      if (recordSeason && recordSeason !== '') {
        return recordSeason === '상반기';
      } else {
        // 시즌 정보가 없는 기존 데이터는 날짜로 판단
        const date = row[0];
        if (!date) return false;
        const month = new Date(date).getMonth() + 1; // 1~12
        return month >= 1 && month <= 6;
      }
    });
  } else if (seasonFilter === 'secondHalf') {
    attendanceData = attendanceData.filter(row => {
      const recordSeason = row[4]; // 시즌 컬럼
      // 시즌 정보가 있으면 그것을 사용, 없으면 날짜로 판단
      if (recordSeason && recordSeason !== '') {
        return recordSeason === '하반기';
      } else {
        // 시즌 정보가 없는 기존 데이터는 날짜로 판단
        const date = row[0];
        if (!date) return false;
        const month = new Date(date).getMonth() + 1; // 1~12
        return month >= 7 && month <= 12;
      }
    });
  }

  // 💡 원본 데이터를 JSON 친화적인 형태로 변환 (민감 정보 제외)
  // 필요한 컬럼만: 날짜, 이름, 팀, 시즌, 시간, 지각여부
  const rawAttendance = attendanceData.map(row => {
    return {
      date: Utilities.formatDate(new Date(row[0]), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      dayOfWeek: row[1],
      name: row[2],
      team: row[3],
      season: row[4],
      time: row[5] ? Utilities.formatDate(new Date(row[5]), Session.getScriptTimeZone(), 'HH:mm:ss') : '',
      isLate: row[6] === '지각'
    };
  });

  // 💡 회원 목록 (캐시 사용)
  const members = getMembers(null);

  // 💡 토요일 목록을 날짜 문자열로 변환
  const saturdayDates = saturdays.map(sat =>
    Utilities.formatDate(sat, Session.getScriptTimeZone(), 'yyyy-MM-dd')
  );

  // 클라이언트로 원본 데이터 전송
  return createResponse(true, null, {
    rawData: {
      attendance: rawAttendance,
      members: members,
      saturdays: saturdayDates,
      targetYear: targetYear,
      season: seasonFilter
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

/**
 * 출석 가능 요일 목록 가져오기
 */
function getAllowedDays() {
    try {
        const sheet = getOrCreateSheet(SHEET_NAMES.SETTINGS);
        const row = findSettingRow(sheet, '출석 가능 요일');

        if (!row) return []; // 설정이 없으면 모든 요일 허용

        const daysValue = sheet.getRange(row, 2).getValue();
        if (!daysValue || daysValue === '') return [];

        // 문자열로 강제 변환 후 처리 (숫자로 저장된 경우 대비)
        const daysString = String(daysValue);
        return daysString.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d));
    } catch (e) {
        Logger.log('Error in getAllowedDays: ' + e.toString());
        return []; // 오류 시 모든 요일 허용
    }
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

// ==================== 시트 마이그레이션 함수 ====================

/**
 * 기존 시트에 시즌 컬럼을 추가하는 마이그레이션 스크립트
 * Google Apps Script 편집기에서 이 함수를 한 번 실행하세요.
 */
function migrateAttendanceSheetsAddSeasonColumn() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();

  let updatedSheets = 0;

  sheets.forEach(sheet => {
    const sheetName = sheet.getName();

    // 출석기록_YYYY 형식의 시트만 처리
    if (sheetName.startsWith('출석기록_')) {
      Logger.log(`처리 중: ${sheetName}`);

      const lastRow = sheet.getLastRow();

      if (lastRow === 0) {
        Logger.log(`  → 빈 시트, 건너뜀`);
        return;
      }

      // 헤더 확인
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

      // 이미 시즌 컬럼이 있는지 확인
      if (headers.includes('시즌')) {
        Logger.log(`  → 이미 시즌 컬럼이 있습니다`);
        return;
      }

      // 기대하는 컬럼 구조: [날짜, 요일, 이름, 팀, 출석시간, 위도, 경도, IP주소, 거리]
      // 새 구조: [날짜, 요일, 이름, 팀, 시즌, 출석시간, 위도, 경도, IP주소, 거리]

      if (headers[0] === '날짜' && headers[3] === '팀') {
        Logger.log(`  → 시즌 컬럼 추가 중...`);

        // E열(5번째)에 새 컬럼 삽입
        sheet.insertColumnAfter(4); // D열(팀) 다음에 삽입

        // 헤더 업데이트
        sheet.getRange(1, 5).setValue('시즌');

        // 기존 데이터에 시즌 정보 자동 채우기 (날짜 기반)
        if (lastRow > 1) {
          for (let row = 2; row <= lastRow; row++) {
            const date = sheet.getRange(row, 1).getValue(); // A열: 날짜

            if (date) {
              const month = new Date(date).getMonth() + 1; // 1~12
              const season = (month >= 1 && month <= 6) ? '상반기' : '하반기';
              sheet.getRange(row, 5).setValue(season); // E열: 시즌
            }
          }
          Logger.log(`  → ${lastRow - 1}개 레코드에 시즌 정보 자동 입력 완료`);
        }

        updatedSheets++;
        Logger.log(`  ✅ ${sheetName} 업데이트 완료`);
      } else {
        Logger.log(`  ⚠️ 예상과 다른 컬럼 구조: ${headers.join(', ')}`);
      }
    }
  });

  Logger.log(`\n총 ${updatedSheets}개 시트 업데이트 완료`);
  Logger.log(`✅ 시트 업데이트 완료! ${updatedSheets}개의 출석기록 시트에 시즌 컬럼이 추가되었습니다.`);
}

/**
 * 회원목록 시트를 새 구조로 업데이트하는 마이그레이션 스크립트
 * 기존: [이름, 팀, 최초등록일, 총출석수]
 * 새: [이름, 상반기팀, 하반기팀, 최초등록일, 총출석수]
 */
function migrateMembersSheetAddSeasonTeams() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('회원목록');

  if (!sheet) {
    Logger.log('❌ 회원목록 시트를 찾을 수 없습니다.');
    return;
  }

  Logger.log('회원목록 시트 처리 중...');

  const lastRow = sheet.getLastRow();

  if (lastRow === 0) {
    Logger.log('빈 시트입니다.');
    return;
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  // 이미 업데이트되었는지 확인
  if (headers[1] === '상반기팀' && headers[2] === '하반기팀') {
    Logger.log('이미 시즌별 팀 구조로 업데이트되어 있습니다.');
    return;
  }

  // 기존 구조 확인: [이름, 팀, 최초등록일, 총출석수]
  if (headers[0] === '이름' && headers[1] === '팀') {
    Logger.log('시즌별 팀 컬럼 추가 중...');

    // B열 다음에 컬럼 삽입 (하반기팀)
    sheet.insertColumnAfter(2);

    // 헤더 업데이트
    sheet.getRange(1, 2).setValue('상반기팀');
    sheet.getRange(1, 3).setValue('하반기팀');

    // 기존 팀 데이터를 상반기팀과 하반기팀 양쪽에 복사
    if (lastRow > 1) {
      for (let row = 2; row <= lastRow; row++) {
        const team = sheet.getRange(row, 2).getValue(); // 상반기팀 (기존 팀 데이터)
        sheet.getRange(row, 3).setValue(team); // 하반기팀에도 동일하게 복사
      }
      Logger.log(`${lastRow - 1}개 회원의 팀 정보 복사 완료`);
    }

    Logger.log('✅ 회원목록 시트 업데이트 완료');
    Logger.log('기존 팀 정보가 상반기팀과 하반기팀 양쪽에 복사되었습니다. 필요시 수동으로 조정하세요.');
  } else {
    Logger.log(`⚠️ 예상과 다른 컬럼 구조: ${headers.join(', ')}`);
  }
}

/**
 * 기존 출석기록 시트에 지각여부 컬럼 추가하는 마이그레이션 스크립트
 */
function migrateAttendanceSheetsAddLateColumn() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  const settingsSheet = getOrCreateSheet(SHEET_NAMES.SETTINGS);

  let updatedSheets = 0;

  // 출석 시간 설정 가져오기 (있는 경우에만 지각 판정)
  const startRow = findSettingRow(settingsSheet, '출석 시작 시간');
  const lateRow = findSettingRow(settingsSheet, '지각 기준 시간');
  const startTime = startRow ? settingsSheet.getRange(startRow, 2).getValue() : null;
  const lateTime = lateRow ? settingsSheet.getRange(lateRow, 2).getValue() : null;
  const hasTimeSetting = startTime && lateTime;

  sheets.forEach(sheet => {
    const sheetName = sheet.getName();

    // 출석기록_YYYY 형식의 시트만 처리
    if (sheetName.startsWith('출석기록_')) {
      Logger.log(`처리 중: ${sheetName}`);

      const lastRow = sheet.getLastRow();

      if (lastRow === 0) {
        Logger.log(`  → 빈 시트, 건너뜀`);
        return;
      }

      // 헤더 확인
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

      // 이미 지각여부 컬럼이 있는지 확인
      if (headers.includes('지각여부')) {
        Logger.log(`  → 이미 지각여부 컬럼이 있습니다`);
        return;
      }

      // 현재 구조: [날짜, 요일, 이름, 팀, 시즌, 출석시간, 위도, 경도, IP주소, 거리]
      // 새 구조: [날짜, 요일, 이름, 팀, 시즌, 출석시간, 지각여부, 위도, 경도, IP주소, 거리]

      if (headers[0] === '날짜' && headers[5] === '출석시간') {
        Logger.log(`  → 지각여부 컬럼 추가 중...`);

        // F열(6번째, 출석시간) 다음에 새 컬럼 삽입
        sheet.insertColumnAfter(6);

        // 헤더 업데이트
        sheet.getRange(1, 7).setValue('지각여부');

        // 기존 데이터에 지각 정보 자동 채우기
        if (lastRow > 1) {
          for (let row = 2; row <= lastRow; row++) {
            const attendanceTime = sheet.getRange(row, 6).getValue(); // F열: 출석시간

            if (attendanceTime && hasTimeSetting) {
              // 출석 시간을 HH:mm 형식으로 변환
              const timeStr = Utilities.formatDate(new Date(attendanceTime), Session.getScriptTimeZone(), 'HH:mm');

              // 지각 여부 판정
              const isLate = timeStr >= lateTime;
              sheet.getRange(row, 7).setValue(isLate ? '지각' : '정상'); // G열: 지각여부
            } else {
              // 시간 설정이 없거나 출석시간 데이터가 없으면 기본값 '정상'
              sheet.getRange(row, 7).setValue('정상');
            }
          }
          Logger.log(`  → ${lastRow - 1}개 레코드에 지각 정보 자동 입력 완료`);
        }

        updatedSheets++;
        Logger.log(`  ✅ ${sheetName} 업데이트 완료`);
      } else {
        Logger.log(`  ⚠️ 예상과 다른 컬럼 구조: ${headers.join(', ')}`);
      }
    }
  });

  Logger.log(`\n총 ${updatedSheets}개 시트 업데이트 완료`);
  Logger.log(`✅ 시트 업데이트 완료! ${updatedSheets}개의 출석기록 시트에 지각여부 컬럼이 추가되었습니다.`);
}

/**
 * 모든 마이그레이션을 한 번에 실행
 * Google Apps Script 편집기에서 이 함수를 실행하세요.
 */
function runAllMigrations() {
  Logger.log('🚀 시트 마이그레이션을 시작합니다...\n');

  // 1. 출석기록 시트에 시즌 컬럼 추가
  migrateAttendanceSheetsAddSeasonColumn();

  // 2. 회원목록 시트 구조 업데이트
  migrateMembersSheetAddSeasonTeams();

  // 3. 출석기록 시트에 지각여부 컬럼 추가
  migrateAttendanceSheetsAddLateColumn();

  // 캐시 무효화
  CacheService.getScriptCache().remove('ALL_MEMBERS_DATA');

  Logger.log('\n✅ 모든 마이그레이션 완료!');
  Logger.log('페이지를 새로고침하여 확인하세요.');
}

/**
 * 기존 출석 기록의 지각 여부를 재계산하여 업데이트
 * Google Apps Script 편집기에서 이 함수를 실행하거나 관리자 페이지에서 호출하세요.
 */
function recalculateLateStatus(callback) {
  try {
    // 지각 기준 시간 가져오기
    const sheet = getOrCreateSheet(SHEET_NAMES.SETTINGS);
    const lateRow = findSettingRow(sheet, '지각 기준 시간');

    if (!lateRow) {
      const message = '⚠️ 지각 기준 시간이 설정되지 않았습니다. 먼저 출석 시간을 설정해주세요.';
      Logger.log(message);
      return createResponse(false, message, null, callback);
    }

    let lateTime = sheet.getRange(lateRow, 2).getValue();

    // Date 객체인 경우 HH:mm 형식 문자열로 변환
    if (lateTime instanceof Date) {
      lateTime = Utilities.formatDate(lateTime, Session.getScriptTimeZone(), 'HH:mm');
    }

    if (!lateTime) {
      const message = '⚠️ 지각 기준 시간이 비어있습니다.';
      Logger.log(message);
      return createResponse(false, message, null, callback);
    }

    Logger.log('지각 기준 시간: ' + lateTime);

    // 모든 연도의 출석 기록 시트 찾기
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const allSheets = ss.getSheets();
    const attendanceSheets = allSheets.filter(s => s.getName().startsWith(SHEET_NAMES.ATTENDANCE + '_'));

    if (attendanceSheets.length === 0) {
      const message = '📋 처리할 출석 기록이 없습니다.';
      Logger.log(message);
      return createResponse(true, message, { updatedCount: 0 }, callback);
    }

    let totalUpdated = 0;
    let totalProcessed = 0;

    // 각 시트 처리
    attendanceSheets.forEach(attendanceSheet => {
      Logger.log('\n📊 처리 중: ' + attendanceSheet.getName());

      const lastRow = attendanceSheet.getLastRow();
      if (lastRow <= 1) {
        Logger.log('  데이터 없음 (헤더만 존재)');
        return; // 다음 시트로
      }

      const data = attendanceSheet.getDataRange().getValues();

      // 헤더 확인 (출석시간과 지각여부 컬럼 위치 찾기)
      const headers = data[0];
      const timeColIndex = headers.indexOf('출석시간');
      const lateColIndex = headers.indexOf('지각여부');

      if (timeColIndex === -1 || lateColIndex === -1) {
        Logger.log('  ⚠️ 필요한 컬럼을 찾을 수 없습니다.');
        return;
      }

      // 데이터 행 처리 (1부터 시작 - 0은 헤더)
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        let attendanceTime = row[timeColIndex];
        const currentLateStatus = row[lateColIndex];

        if (!attendanceTime) continue;

        totalProcessed++;

        // 출석시간을 HH:mm 형식으로 변환
        let timeStr = '';
        if (attendanceTime instanceof Date) {
          timeStr = Utilities.formatDate(attendanceTime, Session.getScriptTimeZone(), 'HH:mm');
        } else if (typeof attendanceTime === 'string') {
          // HH:mm:ss 형식에서 HH:mm만 추출
          const timeParts = attendanceTime.split(':');
          if (timeParts.length >= 2) {
            timeStr = timeParts[0].padStart(2, '0') + ':' + timeParts[1];
          }
        }

        if (!timeStr) continue;

        // 지각 여부 계산
        const shouldBeLate = timeStr >= lateTime;
        const newLateStatus = shouldBeLate ? '지각' : '정상';

        // 현재 값과 다르면 업데이트
        if (currentLateStatus !== newLateStatus) {
          attendanceSheet.getRange(i + 1, lateColIndex + 1).setValue(newLateStatus);
          totalUpdated++;
          Logger.log(`  행 ${i + 1}: ${timeStr} -> ${newLateStatus} (이전: ${currentLateStatus})`);
        }
      }
    });

    const message = `✅ 재계산 완료!\n총 ${totalProcessed}개 기록 중 ${totalUpdated}개 업데이트됨`;
    Logger.log('\n' + message);

    return createResponse(true, message, {
      totalProcessed: totalProcessed,
      updatedCount: totalUpdated
    }, callback);

  } catch (e) {
    const errorMsg = '❌ 오류 발생: ' + e.toString();
    Logger.log(errorMsg);
    return createResponse(false, errorMsg, null, callback);
  }
}
