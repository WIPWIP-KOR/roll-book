// GAS 코드 2 (Project B: 관리자 전용) Code.gs

// ... (기존의 SPREADSHEET_ID 및 데이터 처리 함수: getLocation, saveLocation, getMembers 등은 여기에 유지) ...

function doGet(e) {
  const page = e.parameter.page;
  
  // 1. 초기 접근 (인증 게이트): page 파라미터가 없으면 auth.html 렌더링
  //    (이 시점에서 Google 인증이 강제됨)
  if (!page) {
    return HtmlService.createTemplateFromFile('auth')
        .evaluate()
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .setTitle('인증 확인');
  } 
  
  // 2. 인증 후 접근 (관리자 페이지): page=admin 파라미터가 있으면 admin.html 렌더링
  else if (page === 'admin') {
    return HtmlService.createTemplateFromFile('admin')
        .evaluate()
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .setTitle('관리자 페이지');
  }

  return HtmlService.createHtmlOutput('<h1>페이지를 찾을 수 없습니다.</h1>');
}