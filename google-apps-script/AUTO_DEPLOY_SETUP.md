# GAS 자동배포 설정 가이드 (clasp + GitHub Actions)

`google-apps-script/Code.gs` 를 수정해 `main`에 머지하면, GitHub Actions가
자동으로 Apps Script 프로젝트에 코드를 푸시하고 **기존 배포 URL을 그대로 유지한 채**
재배포합니다. 즉, 더 이상 "복사 → 붙여넣기 → 수동 재배포"를 할 필요가 없습니다.

> 최초 1회 설정만 수동으로 하면 됩니다. (이 중 `clasp login`은 본인 구글 계정으로
> 직접 해야 하므로 대신 해드릴 수 없습니다.)

---

## 한 번만 하는 설정

### 1. clasp 설치 (워크플로와 동일 버전으로 고정)

```bash
npm install -g @google/clasp@2.4.2
```

### 2. 구글 계정 로그인

```bash
clasp login
```

브라우저가 열리면 **스프레드시트를 소유한 구글 계정**으로 로그인 후 권한을 허용합니다.
완료되면 홈 디렉터리에 `~/.clasprc.json` (인증 정보)이 생성됩니다.

### 3. Apps Script API 켜기

https://script.google.com/home/usersettings 접속 →
**"Google Apps Script API"** 를 **사용(On)** 으로 변경.

### 4. Script ID 확인 후 `.clasp.json`에 입력

Apps Script 편집기 → **프로젝트 설정(⚙️)** → **"스크립트 ID"** 복사.
저장소 루트의 `.clasp.json` 에서 `PUT_YOUR_SCRIPT_ID_HERE` 를 그 값으로 교체합니다.

```json
{
  "scriptId": "여기에_복사한_스크립트_ID",
  "rootDir": "google-apps-script"
}
```

### 5. (권장) 기존 매니페스트 동기화

저장소의 `google-apps-script/appsscript.json` 은 기본값으로 채워둔 것입니다.
**현재 프로젝트의 실제 설정**(시간대, 웹앱 접근 권한 등)과 맞추려면 한 번 pull 하세요:

```bash
clasp pull          # 실제 appsscript.json / Code.gs 를 내려받아 덮어씀
git diff            # 바뀐 내용 확인
```

차이가 있으면 내려받은 내용을 커밋하면 됩니다. (특히 `timeZone`, `webapp.access`)

### 6. 배포 ID 확인

```bash
clasp deployments
```

출력된 배포 ID 목록을, 워크플로(`.github/workflows/deploy-gas.yml`)의
`Redeploy ...` step에 적힌 두 ID와 비교하세요.
- 목록에 없는 ID가 워크플로에 있으면 → 해당 step을 수정/삭제
- 목록에 있는데 워크플로에 없으면 → step 추가
(현재 워크플로에는 프론트엔드가 사용하는 두 배포 URL의 ID가 들어 있습니다.)

### 7. GitHub Secret 등록

GitHub 저장소 → **Settings → Secrets and variables → Actions → New repository secret**

- 이름: `CLASPRC_JSON`
- 값: 로컬 `~/.clasprc.json` 파일의 **전체 내용**을 그대로 복사해 붙여넣기
  - macOS: `cat ~/.clasprc.json | pbcopy`
  - Linux: `cat ~/.clasprc.json`
  - Windows(PowerShell): `Get-Content $HOME\.clasprc.json | Set-Clipboard`

---

## 동작 방식

- `google-apps-script/**` 또는 `.clasp.json` 변경이 `main`에 들어오면 워크플로가 실행됩니다.
- `clasp push` → 코드 업로드, `clasp deploy -i <배포ID>` → **같은 URL 유지** 재배포.
- 수동 실행도 가능: **Actions 탭 → "Deploy Apps Script (GAS)" → Run workflow**.

## 처음 한 번은 수동 실행으로 검증

설정을 마친 뒤 **Actions 탭에서 수동 실행(Run workflow)** 해 초록색으로 통과하는지 확인하세요.
실패 로그에 따라 흔한 원인은 다음과 같습니다.

| 증상 | 원인 / 해결 |
|------|-------------|
| `User has not enabled the Apps Script API` | 3번(API 켜기) 안 함 |
| `Could not read API credentials` / 401 | `CLASPRC_JSON` 시크릿 누락/오타, 또는 clasp 버전 불일치 |
| `Script ID ... not found` | `.clasp.json` 의 scriptId 오류 |
| `deployment ... not found` | 6번 배포 ID 불일치 → 워크플로의 `-i` 값 수정 |
| 웹앱이 로그인 요구로 바뀜 | `appsscript.json` 의 `webapp.access` 가 `ANYONE_ANONYMOUS` 인지 확인 |

## 주의

- `~/.clasprc.json` 에는 구글 인증 토큰이 들어 있습니다. **절대 저장소에 커밋하지 마세요.**
  (이미 `.gitignore`에 추가되어 있습니다.) 노출되면 즉시 `clasp logout` 후 재로그인하세요.
- 토큰이 만료/폐기되면 워크플로가 401로 실패합니다. 그럴 땐 로컬에서 `clasp login` 을
  다시 한 뒤 `CLASPRC_JSON` 시크릿을 갱신하면 됩니다.
