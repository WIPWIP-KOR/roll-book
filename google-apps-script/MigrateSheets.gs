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
  SpreadsheetApp.getUi().alert(`시트 업데이트 완료!\n\n${updatedSheets}개의 출석기록 시트에 시즌 컬럼이 추가되었습니다.\n\n로그를 확인하려면: 보기 > 로그`);
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
    SpreadsheetApp.getUi().alert('회원목록 시트를 찾을 수 없습니다.');
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
    SpreadsheetApp.getUi().alert('회원목록 시트는 이미 업데이트되어 있습니다.');
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
    SpreadsheetApp.getUi().alert('회원목록 시트 업데이트 완료!\n\n기존 팀 정보가 상반기팀과 하반기팀 양쪽에 복사되었습니다.\n필요시 수동으로 조정하세요.');
  } else {
    Logger.log(`⚠️ 예상과 다른 컬럼 구조: ${headers.join(', ')}`);
    SpreadsheetApp.getUi().alert('회원목록 시트의 구조가 예상과 다릅니다.\n로그를 확인하세요: 보기 > 로그');
  }
}

/**
 * 모든 마이그레이션을 한 번에 실행
 */
function runAllMigrations() {
  SpreadsheetApp.getUi().alert('시트 마이그레이션을 시작합니다...');

  // 1. 출석기록 시트에 시즌 컬럼 추가
  migrateAttendanceSheetsAddSeasonColumn();

  // 2. 회원목록 시트 구조 업데이트
  migrateMembersSheetAddSeasonTeams();

  // 캐시 무효화
  CacheService.getScriptCache().remove('ALL_MEMBERS_DATA');

  Logger.log('\n✅ 모든 마이그레이션 완료!');
  SpreadsheetApp.getUi().alert('모든 마이그레이션이 완료되었습니다!\n\n페이지를 새로고침하여 확인하세요.');
}
