/**
 * 풋살 동호회 출석 시스템 - Google Apps Script
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
 * GET 요청 처리 (수정됨: saveLocation, attend 액션 추가)
 */
function doGet(e) {
  // 💡💡💡 디버깅용 로그 추가: 요청 파라미터를 확인하여 문제 진단 💡💡💡
  Logger.log('요청 파라미터(e.parameter): ' + JSON.stringify(e.parameter));
  // 💡💡💡 로그 추가 끝 💡💡💡

  const action = e.parameter.action;
  const callback = e.parameter.callback;

  try {
    switch(action) {
      case 'getMembers':
        return getMembers(callback);
      case 'getLocation':
        return getLocation(callback);
      case 'getTodayAttendance':
        return getTodayAttendance(callback);
      case 'getStats':
        return getStats(callback);
      case 'saveLocation':
        // JSONP(GET) 요청은 POST 데이터를 쿼리 파라미터로 보냅니다.
        const dataFromParams = {
          action: 'saveLocation',
          latitude: e.parameter.latitude,
          longitude: e.parameter.longitude,
          name: e.parameter.name
        };
        return saveLocation(dataFromParams, callback);
      case 'attend': // ✅ 핵심 수정: attend 액션을 doGet에서 처리합니다.
        // 클라이언트가 JSONP(GET)으로 보낸 모든 데이터는 e.parameter에 담겨 옵니다.
        // processAttendance 함수가 기대하는 data 객체로 e.parameter를 그대로 전달합니다.
        return processAttendance(e.parameter, e, callback);
      default:
        return createResponse(false, 'Invalid action', null, callback);
    }
  } catch (error) {
    return createResponse(false, error.toString(), null, callback);
  }
}

/**
 * POST 요청 처리
 */
function doPost(e) {
  let callback = e.parameter.callback;

  try {
    // JSONP를 쓰지 않고 순수 POST 요청을 보낸 경우에만 이 코드가 실행됩니다.
    // 현재 프론트엔드는 JSONP(GET)을 사용하므로, 이 부분은 거의 사용되지 않습니다.
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

// ==================== 출석 처리 ====================

/**
 * 출석 처리
 */
function processAttendance(data, e, callback) {
  const { name, team, latitude, longitude, userAgent } = data;

  // 입력 검증
  if (!name || !team || !latitude || !longitude) {
    return createResponse(false, '필수 정보가 누락되었습니다.', null, callback);
  }

  // 팀 검증
  if (!['A', 'B', 'C'].includes(team)) {
    return createResponse(false, '올바른 팀을 선택해주세요.', null, callback);
  }

  // 토요일 확인
  const now = new Date();
  if (now.getDay() !== 6) {
    return createResponse(false, '출석은 토요일만 가능합니다.', null, callback);
  }

  // 위치 확인
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

  // IP 주소 추출
  const ipAddress = getClientIP(e);

  // 중복 출석 체크
  if (isDuplicateAttendance(name, ipAddress)) {
    return createResponse(false, '이미 오늘 출석하셨습니다.', null, callback);
  }

  // 출석 기록 저장
  saveAttendanceRecord(name, team, latitude, longitude, ipAddress, distance);

  // 회원 정보 업데이트
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
 * 출석 기록