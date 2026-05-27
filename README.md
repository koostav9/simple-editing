# Simple Video Editor

간단한 타임라인 기반의 영상 편집 및 내보내기 기능이 포함된 Electron + React 어플리케이션입니다.

## Windows 환경에서 실행 및 빌드하는 방법

### 1. 사전 요구 사항 (Prerequisites)
- **Node.js**: [공식 홈페이지](https://nodejs.org/)에서 Node.js를 다운로드하여 설치하세요. (LTS 버전 권장, v18 이상)
- **Git** (선택 사항): 코드를 클론하기 위해 필요할 수 있습니다.

*참고: 영상 처리 및 렌더링을 위한 `ffmpeg`, `ffprobe` 바이너리는 npm 패키지 내부에 포함되어 있어 Windows 시스템에 별도로 설치하지 않아도 됩니다.*

### 2. 프로젝트 설정 및 패키지 설치
Windows 터미널(명령 프롬프트 `cmd` 또는 PowerShell)을 열고 프로젝트 폴더로 이동한 후, 다음 명령어를 실행하여 필요한 패키지를 설치합니다.

```bash
npm install
```

### 3. 개발 모드로 실행하기 (Development)
이 프로젝트는 프론트엔드 개발 서버로 Vite를 사용하고, 데스크톱 윈도우를 띄우기 위해 Electron을 사용합니다.
개발 모드로 실시간 코드 변경 사항을 확인하며 실행하려면 **두 개의 터미널**이 필요합니다.

**터미널 1 (Vite 개발 서버 실행):**
```bash
npm run dev
```
이 터미널은 끄지 말고 그대로 유지합니다.

**터미널 2 (Electron 앱 띄우기):**
새로운 터미널 창을 열고, 프로젝트 경로에서 다음 명령어를 실행합니다.
```bash
npm run electron:dev
```
실행이 완료되면 Video Editor 프로그램 창이 열립니다.

### 4. 프로덕션 빌드 (Windows 설치용 .exe 생성)
Windows에서 클릭만으로 설치 및 실행할 수 있는 `.exe` 배포 파일을 만들려면 아래 명령어를 실행하세요.

```bash
npm run electron:build
```
- 내부적으로 Vite 프로덕션 빌드(`npm run build`)가 수행된 후, `electron-builder`가 패키징을 진행합니다.
- 빌드가 완료되면 프로젝트 루트 하위의 `dist-electron` 폴더에 `SimpleVideoEditor Setup X.X.X.exe` 파일이 생성됩니다.
- 생성된 exe 파일을 더블 클릭하여 프로그램을 설치 및 단독 실행할 수 있습니다.

---

## 주요 기능 및 사용법
1. **미디어 불러오기**: 좌측 상단의 `미디어 추가` 버튼을 클릭하여 동영상(MP4 등) 및 오디오(MP3, WAV) 파일을 추가합니다.
2. **타임라인 배치**: 미디어 패널(Media Bin)에 추가된 클립을 클릭하면 타임라인의 빈 공간에 자동으로 순서대로 배치됩니다. 
   - 동영상은 윗부분 비디오 트랙(V)에, 오디오는 아랫부분 오디오 트랙(A)에 배치됩니다.
3. **클립 편집 (트림 및 이동)**: 타임라인에 배치된 클립의 양끝을 마우스로 잡아당겨 길이를 자르거나 늘리고, 클립 몸통을 드래그하여 원하는 시간대로 이동시킬 수 있습니다.
4. **미리보기**: 키보드의 `Spacebar` 또는 화면 중앙의 재생 버튼을 눌러 현재 타임라인의 작업물을 실시간으로 미리볼 수 있습니다.
5. **영상 내보내기 (Export)**: 우측 상단의 `내보내기` 버튼을 눌러 최종 편집된 타임라인을 하나의 `.mp4` 파일로 렌더링하고 저장할 수 있습니다.

## 기술 스택
- **프론트엔드**: React, Vite, Lucide React (아이콘 세트)
- **앱 플랫폼**: Electron, Node.js
- **미디어 렌더링 엔진**: FFmpeg (내장 `@ffmpeg-installer/ffmpeg`, `@ffprobe-installer/ffprobe`)

---

## 트러블슈팅 (문제 해결)

### 🚨 `ENOENT: no such file or directory, open '...electron\path.txt'` (-4058 에러)
Windows 환경에서 프로젝트를 새로 다운로드(클론)하고 `npm install`을 진행할 때, 네트워크 문제나 캐시 오류로 인해 Electron 실행에 필요한 바이너리 파일(`path.txt` 포함)이 정상적으로 받아지지 않는 고질적인 문제가 있습니다.

**해결 방법 1: 기존 캐시 삭제 후 재설치 (기본)**
터미널(명령 프롬프트 또는 PowerShell)에서 다음 명령어를 실행하여 꼬여있는 캐시와 모듈을 완전히 지우고 재설치해 주세요.
- **PowerShell**: `Remove-Item -Recurse -Force node_modules\electron` 이후 `npm install`
- **명령 프롬프트(cmd) / Git Bash**: `rmdir /s /q node_modules\electron` (cmd) 또는 `rm -rf node_modules/electron` (bash) 이후 `npm install`

**해결 방법 2: 수동으로 Electron 설치 스크립트 실행 (해결 방법 1이 안 될 경우)**
단순히 `npm install`을 다시 해도 `path.txt`가 생기지 않는다면, 백그라운드에서 다운로드가 조용히 실패하고 있을 확률이 높습니다. 이럴 때는 설치 스크립트를 직접 실행하면 에러 원인을 파악하거나 강제로 설치할 수 있습니다.
```cmd
node node_modules\electron\install.js
```
이 명령어를 실행하면 Electron 바이너리 다운로드 진행률이 표시되며, 정상적으로 완료되면 `path.txt`가 생성됩니다.

**해결 방법 3: Electron 글로벌 캐시 삭제**
다운로드 중 파일이 손상된 채로 PC에 영구 캐시되어 계속 설치가 실패하는 경우가 있습니다. 
1. 파일 탐색기를 열고 주소창에 `%LOCALAPPDATA%\electron\Cache` 를 입력하여 이동합니다. (보통 `C:\Users\사용자이름\AppData\Local\electron\Cache`)
2. 해당 폴더 안의 내용물을 **모두 삭제**합니다.
3. 프로젝트 폴더로 돌아와 다시 `npm install`을 실행합니다.

위 과정을 거치면 정상적으로 `path.txt`가 생성되고 `npm run electron:dev`가 실행될 것입니다.
