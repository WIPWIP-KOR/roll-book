# 🚀 배포 가이드

풋살 동호회 출석부를 완전 무료로 배포하는 단계별 가이드입니다.

## 📋 준비물

- Google 계정
- GitHub 계정 (선택사항, GitHub Pages 사용 시)

---

## 1️⃣ Google Apps Script 배포 (백엔드)

### 단계 1: Google Sheets 생성

1. https://sheets.google.com 접속
2. **빈 스프레드시트** 클릭
3. 제목을 "풋살 출석부"로 변경

### 단계 2: Apps Script 설정

1. 상단 메뉴에서 **확장 프로그램** > **Apps Script** 클릭
2. 새 프로젝트 이름을 "풋살출석시스템"으로 변경
3. 기본 코드 전체 삭제
4. `google-apps-script/Code.gs` 파일 내용 복사 & 붙여넣기
5. **저장** 버튼 클릭 (💾 아이콘 또는 Ctrl+S)

### 단계 3: 웹 앱으로 배포

1. 우측 상단의 **배포** > **새 배포** 클릭
2. 설정 변경:
   - ⚙️ **유형 선택** 클릭 > **웹 앱** 선택
   - **설명**: "풋살 출석 시스템 v1.0"
   - **다음 계정으로 실행**: **나**
   - **액세스 권한**: **모든 사용자** ⚠️ 중요!
3. **배포** 클릭
4. 권한 승인:
   - **액세스 권한 부여** 클릭
   - Google 계정 선택
   - "Google에서 확인하지 않은 앱" 경고가 뜨면:
     - **고급** 클릭
     - **[프로젝트명](안전하지 않은 페이지)로 이동** 클릭
     - **허용** 클릭
5. **웹 앱 URL 복사**
   - 형식: `https://script.google.com/macros/s/AKfyc...../exec`
   - 이 URL을 메모장에 저장! 🔖

### 단계 4: URL 테스트

1. 복사한 URL을 브라우저 새 탭에 붙여넣기
2. 다음과 같은 응답이 나오면 성공:
   ```json
   {"success":false,"message":"Invalid action"}
   ```

---

## 2️⃣ 프론트엔드 설정

### JavaScript 파일 수정

다음 3개 파일에서 `GAS_URL`을 복사한 웹 앱 URL로 변경:

#### `js/attendance.js`

```javascript
const CONFIG = {
    GAS_URL: 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec', // 여기 변경!
    REQUIRED_RADIUS: 50
};
```

#### `js/admin.js`

```javascript
const CONFIG = {
    GAS_URL: 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec', // 여기 변경!
    ATTENDANCE_URL: window.location.origin + '/index.html'
};
```

#### `js/stats.js`

```javascript
const CONFIG = {
    GAS_URL: 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec' // 여기 변경!
};
```

---

## 3️⃣ GitHub Pages 배포 (프론트엔드)

### 방법 A: GitHub 웹 인터페이스 (쉬움)

1. https://github.com 로그인
2. **New repository** 클릭
3. 설정:
   - Repository name: `futsal-attendance`
   - Public 선택
   - **Create repository** 클릭
4. **uploading an existing file** 클릭
5. 다음 파일들을 드래그 & 드롭:
   - `index.html`
   - `admin.html`
   - `stats.html`
   - `css/` 폴더
   - `js/` 폴더
6. **Commit changes** 클릭
7. **Settings** 탭 클릭
8. 좌측 메뉴에서 **Pages** 클릭
9. **Source**를 `main` 브랜치로 변경
10. **Save** 클릭
11. 배포 완료! (URL이 표시됨)
    - 예: `https://username.github.io/futsal-attendance/`

### 방법 B: Git 명령어 (개발자용)

```bash
# 모든 파일 추가
git add .

# 커밋
git commit -m "풋살 출석 시스템 초기 배포"

# 브랜치에 푸시
git push -u origin claude/futsal-attendance-system-01HzuAjoKF2wp9MhHCT3BeFG
```

그 후 GitHub 웹사이트에서 Settings > Pages 설정

---

## 4️⃣ 첫 설정

### 관리자 페이지 접속

1. 배포된 URL에 `/admin.html` 추가
   - 예: `https://username.github.io/futsal-attendance/admin.html`
2. 관리자 페이지 접속

### 출석 위치 설정

**옵션 1: 현재 위치 사용**
1. **내 현재 위치 가져오기** 버튼 클릭
2. 위치 정보 권한 허용
3. 자동으로 위도/경도 입력됨
4. 장소 이름 입력 (예: "올림픽공원 풋살장")
5. **위치 저장** 클릭

**옵션 2: 수동 입력**
1. Google Maps에서 풋살장 검색
2. 우클릭 > 좌표 복사
3. 위도/경도 직접 입력
4. 장소 이름 입력
5. **위치 저장** 클릭

### QR 코드 생성

1. **QR 코드 생성** 버튼 클릭
2. QR 코드 이미지 자동 생성됨
3. **QR 코드 다운로드** 클릭
4. 이미지 저장 (`futsal-attendance-qr.png`)

### QR 코드 활용

- **인쇄**: A4 용지에 크게 인쇄하여 풋살장 입구에 부착
- **디지털**: 단체 채팅방에 공유
- **모바일**: 휴대폰에 저장 후 현장에서 보여주기

---

## 5️⃣ 테스트

### 출석 테스트

1. QR 코드 스캔 (또는 `index.html` 직접 접속)
2. 이름 입력: "홍길동"
3. 팀 선택: "A팀"
4. 위치 정보 권한 허용
5. **출석하기** 버튼 클릭
6. "✅ 홍길동님 출석 완료!" 메시지 확인

### Google Sheets 확인

1. Google Sheets 열기
2. 자동 생성된 시트들 확인:
   - **출석기록**: 방금 출석한 기록 확인
   - **회원목록**: "홍길동" 추가됨
   - **위치설정**: 저장한 위치 정보

### 통계 페이지 확인

1. `stats.html` 접속
2. 팀별/개인별 출석률 확인

---

## 6️⃣ 공유

### 회원들에게 안내

다음 내용을 단체 채팅방에 공유하세요:

```
⚽ 풋살 동호회 출석 시스템 안내

📱 출석 방법:
1. 아래 QR 코드 스캔
2. 이름 + 팀 입력 (처음만)
3. 위치 정보 권한 허용
4. 출석하기 버튼 클릭

📍 주의사항:
- 풋살장 50m 이내에서만 출석 가능
- 토요일만 출석 가능
- 중복 출석 불가

📊 출석률 확인:
https://username.github.io/futsal-attendance/stats.html

[QR 코드 이미지]
```

---

## 🔄 업데이트 방법

### 프론트엔드 수정 시

1. HTML/CSS/JS 파일 수정
2. GitHub에 업로드 (파일 덮어쓰기)
3. 5-10분 후 반영됨

### Google Apps Script 수정 시

1. Apps Script 편집기에서 코드 수정
2. **저장** (Ctrl+S)
3. ⚠️ **중요**: 새 배포 생성 필요!
   - **배포** > **배포 관리**
   - ✏️ **편집** (연필 아이콘)
   - **버전**: **새 버전**
   - **배포** 클릭
4. URL은 그대로 유지됨 (변경 불필요)

---

## ⚙️ 고급 설정

### CORS 문제 해결

Google Apps Script는 자동으로 CORS를 허용하므로 별도 설정 불필요합니다.

### HTTPS 강제

GitHub Pages는 자동으로 HTTPS를 제공합니다.

### 커스텀 도메인 사용

1. GitHub Pages Settings에서 Custom domain 설정
2. DNS에 CNAME 레코드 추가
3. 자세한 내용: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site

---

## 🆘 문제 해결

### "Invalid action" 에러

- `GAS_URL`이 올바르게 설정되었는지 확인
- URL 끝에 `/exec`가 있는지 확인

### "출석 위치가 설정되지 않았습니다"

- 관리자 페이지에서 위치를 먼저 설정하세요

### "출석은 토요일만 가능합니다"

- 코드에서 요일 제한을 변경하거나 토요일에 다시 시도하세요

### GitHub Pages가 작동 안 함

- Settings > Pages에서 Source가 올바르게 설정되었는지 확인
- 배포에는 몇 분이 걸릴 수 있습니다

### Apps Script 권한 오류

- 배포 시 "모든 사용자" 권한을 선택했는지 확인
- 새 배포를 생성해보세요

---

## 📞 도움이 필요하신가요?

- Google Sheets 문제: Google Workspace 고객센터
- GitHub Pages 문제: GitHub Docs
- 코드 관련 문제: GitHub Issues 탭

---

**축하합니다! 🎉**

풋살 동호회 출석 시스템이 완전 무료로 배포되었습니다!
