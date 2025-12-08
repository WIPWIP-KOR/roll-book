function doGet(e){
  const action=e.parameter.action;
  if(action==='getLocation'){
    const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('위치설정');
    const lat=sheet.getRange('B1').getValue();
    const lng=sheet.getRange('B2').getValue();
    const name=sheet.getRange('B3').getValue();
    return ContentService.createTextOutput(JSON.stringify({
      success:true,
      location:{latitude:lat,longitude:lng,name:name}
    })).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(JSON.stringify({success:false,message:'알 수 없는 액션'})).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e){
  try{
    const params=JSON.parse(e.postData.contents);
    if(params.action==='saveLocation') return saveLocation(params);
    return createResponse(false,'알 수 없는 액션');
  }catch(err){
    return createResponse(false,'서버 오류: '+err.message);
  }
}

function saveLocation(params){
  try{
    const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('위치설정');
    const lat=parseFloat(params.latitude);
    const lng=parseFloat(params.longitude);
    const name=params.name;
    if(isNaN(lat)||isNaN(lng)) return createResponse(false,'위도/경도 올바르지 않음');
    if(!name) return createResponse(false,'장소 이름 필요');
    sheet.getRange('B1').setValue(lat);
    sheet.getRange('B2').setValue(lng);
    sheet.getRange('B3').setValue(name);
    return createResponse(true,'위치 저장 성공');
  }catch(err){
    return createResponse(false,'위치 저장 실패: '+err.message);
  }
}

function createResponse(success,message){
  return ContentService.createTextOutput(JSON.stringify({success:success,message:message})).setMimeType(ContentService.MimeType.JSON);
}