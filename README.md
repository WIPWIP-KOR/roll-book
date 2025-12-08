# ⚽ 풋살 동호회 출석부

QR코드와 GPS 위치 기반 출석 체크 시스템

## 📋 주요 기능

- **QR 코드 기반 출석**: QR 코드 스캔으로 간편한 웹 접속
- **GPS 위치 인증**: 지정된 위치에서 50m 이내일 때만 출석 인정
- **자동 회원 관리**: 첫 방문 시 이름/팀 입력 → 이후 선택만으로 출석
- **중복 방지**: IP 기반으로 당일 중복 출석 차단
- **구글 시트 연동**: 모든 출석 데이터 자동 저장
- **통계 대시보드**: 개인별/팀별 출석률 실시간 확인

## 🛠 기술 스택

- **프론트엔드**: HTML, CSS, JavaScript (순수)
- **백엔드**: Google Apps Script
- **데이터베이스**: Google Sheets
- **호스팅**: GitHub Pages / Netlify (무료)
- **서버**: 없음 (완전 서버리스)

## 📁 프로젝트 구조

```
roll-book/
├── index.html              # 출석 페이지
├── admin.html              # 관리자 페이지
├── stats.html              # 통계 페이지
├── css/
│   └── style.css          # 스타일시트 (모바일 최적화)
├── js/
│   ├── attendance.js      # 출석 로직
│   ├── admin.js           # 관리자 기능
│   └── stats.js           # 통계 계산
└── google-apps-script/
    └── Code.gs            # 백엔드 로직
```

## 🚀 배포 가이드

### 1단계: Google Sheets 설정

1. [Google Sheets](https://sheets.google.com) 접속
2. 새 스프레드시트 생성 (예: "풋살 출석부")
3. **확장 프로그램** > **Apps Script** 클릭
4. `google-apps-script/Code.gs` 파일의 내용 전체 복사 & 붙여넣기
5. **저장** (Ctrl+S)
6. **배포** > **새 배포** 클릭
7. 설정:
   - **유형 선택**: 웹 앱
   - **실행 권한**: 나
   - **액세스 권한**: **모든 사용자**
8. **배포** 클릭
9. **웹 앱 URL 복사** (예: `https://script.google.com/macros/s/...`)

### 2단계: 프론트엔드 설정

1. `js/attendance.js` 파일 열기
2. 1번 줄의 `GAS_URL` 값을 복사한 웹 앱 URL로 변경:
   ```javascript
   GAS_URL: 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec'
   ```

3. `js/admin.js` 파일 열기
4. 동일하게 `GAS_URL` 변경

5. `js/stats.js` 파일 열기
6. 동일하게 `GAS_URL` 변경

### 3단계: GitHub Pages 배포

#### 방법 1: GitHub 웹 인터페이스

1. GitHub 저장소 생성
2. 모든 파일 업로드
3. **Settings** > **Pages**
4. **Source**: `main` 브랜치 선택
5. **Save** 클릭
6. 배포 URL 확인 (예: `https://username.github.io/roll-book/`)

#### 방법 2: Git 명령어

```bash
git add .
git commit -m "Initial commit"
git push -u origin claude/futsal-attendance-system-01HzuAjoKF2wp9MhHCT3BeFG
```

그 후 GitHub Settings에서 Pages 설정

### 4단계: QR 코드 생성

1. 배포된 URL 접속 (예: `https://username.github.io/roll-book/admin.html`)
2. 관리자 페이지에서:
   - 출석 장소 위치 설정 (위도/경도)
   - QR 코드 생성 버튼 클릭
   - QR 코드 다운로드
3. QR 코드를 인쇄하거나 디지털로 공유

## 📖 사용 방법

### 관리자

1. **admin.html** 접속
2. **출석 위치 설정**:
   - 현재 위치 가져오기 버튼 클릭
   - 또는 직접 위도/경도 입력
   - 장소 이름 입력 후 저장
3. **QR 코드 생성**:
   - QR 코드 생성 버튼 클릭
   - 다운로드하여 출석 장소에 비치
4. **출석 현황 확인**:
   - 오늘 출석한 회원 실시간 확인
   - 회원 목록 관리

### 회원 (출석)

1. QR 코드 스캔 → 출석 페이지 접속
2. **첫 출석**:
   - 이름 입력
   - 팀 선택 (A/B/C)
   - 위치 정보 권한 허용
   - 출석하기 버튼 클릭
3. **재출석**:
   - 저장된 이름 목록에서 선택
   - 위치 정보 자동 확인
   - 출석하기 버튼 클릭

### 통계 확인

1. **stats.html** 접속
2. 확인 가능한 정보:
   - 팀별 평균 출석률
   - 개인별 출석률 (필터링/정렬 가능)
   - 주차별 출석 현황

## 📊 구글 시트 구조

배포 후 자동으로 다음 시트들이 생성됩니다:

### 출석기록
| 날짜 | 이름 | 팀 | 출석시간 | 위도 | 경도 | IP주소 | 거리(m) |
|------|------|-----|----------|------|------|---------|---------|

### 회원목록
| 이름 | 팀 | 최초등록일 | 총출석수 |
|------|-----|-----------|----------|

### 위치설정
| 항목 | 값 |
|------|-----|
| 위도 | 37.xxxx |
| 경도 | 126.xxxx |
| 장소명 | 서울 풋살장 |

## ⚙️ 설정 변경

### 출석 거리 제한 변경

`google-apps-script/Code.gs` 파일:

```javascript
const REQUIRED_RADIUS = 50; // 50미터 → 원하는 거리로 변경
```

### 출석 가능 요일 변경

`google-apps-script/Code.gs` 파일의 `processAttendance` 함수:

```javascript
// 토요일 확인
const now = new Date();
if (now.getDay() !== 6) {  // 6 = 토요일, 0 = 일요일, 1 = 월요일...
  return createResponse(false, '출석은 토요일만 가능합니다.');
}
```

### 팀 추가/변경

1. `index.html`, `admin.html` 파일에서 팀 선택 옵션 수정
2. `google-apps-script/Code.gs`에서 팀 검증 배열 수정:
   ```javascript
   if (!['A', 'B', 'C', 'D'].includes(team)) {  // D팀 추가
   ```

## 🔒 보안 및 제한사항

### IP 기반 중복 방지의 한계

- Google Apps Script는 실제 클라이언트 IP를 직접 가져올 수 없음
- 현재는 요청 헤더의 해시값으로 대체
- 같은 기기에서는 중복 출석 방지 가능
- 다른 기기에서는 같은 사람도 출석 가능 (이름 중복 체크로 1차 방어)

### 개선 방안

더 강력한 중복 방지가 필요하다면:
1. 로컬스토리지 체크 추가 (현재 구현됨)
2. 사용자 인증 시스템 추가 (Google 로그인 등)
3. 관리자가 수동으로 중복 제거

## 📱 모바일 최적화

- 반응형 디자인 적용
- 모바일에서 최적화된 UI/UX
- 터치 친화적인 버튼 크기
- GPS 정확도 높음 (enableHighAccuracy: true)

## 🆘 문제 해결

### 위치 정보를 가져올 수 없어요

- 브라우저 설정에서 위치 정보 권한 허용 확인
- HTTPS 연결 확인 (GitHub Pages는 자동 HTTPS)
- GPS가 켜져 있는지 확인

### 출석이 안돼요

- 위치가 50m 이내인지 확인
- 토요일인지 확인
- 이미 오늘 출석했는지 확인
- 관리자가 위치를 설정했는지 확인

### Google Apps Script URL을 못 찾겠어요

1. Google Sheets > 확장 프로그램 > Apps Script
2. 배포 > 배포 관리
3. 현재 배포 URL 복사

### 변경사항이 반영 안돼요

1. **프론트엔드 수정 시**: 브라우저 캐시 삭제 (Ctrl+Shift+R)
2. **Apps Script 수정 시**: 새 배포 생성 (기존 배포는 캐시됨)

## 💡 추가 개선 아이디어

- [ ] 출석 시 사진 촬영 기능
- [ ] 이메일/문자 알림
- [ ] 출석 리마인더
- [ ] 엑셀 내보내기 기능
- [ ] 관리자 비밀번호 설정
- [ ] 다크 모드 지원
- [ ] PWA (앱처럼 설치 가능)

## 📄 라이선스

MIT License - 자유롭게 사용하세요!

## 🤝 기여

이슈나 개선 사항이 있다면 PR 환영합니다!

---

**만든이**: Claude
**버전**: 1.0.0
**마지막 업데이트**: 2024-12-08
