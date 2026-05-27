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

이 에러가 발생했다면 터미널(명령 프롬프트 또는 PowerShell)에서 다음 명령어를 실행하여 꼬여있는 캐시와 모듈을 완전히 지우고 재설치해 주세요.

**PowerShell을 사용할 경우:**
```powershell
Remove-Item -Recurse -Force node_modules\electron
npm install
```

**일반 명령 프롬프트(cmd) 또는 Git Bash를 사용할 경우:**
```bash
rm -rf node_modules/electron
npm install
```

위 명령어 실행이 완료되면 다시 `npm run electron:dev`를 입력해 정상적으로 켜지는지 확인하시면 됩니다.
