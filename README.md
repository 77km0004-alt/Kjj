# Vela Chat — Android / AI Chat App

참고 이미지 기반의 모바일 캐챗 UI입니다.

## 모델 방식

### 1. OpenRouter 통합 API
설정 → 모델 추론 → 모델 추가에서 `OpenRouter 통합 API`를 선택합니다.

- Base URL: `https://openrouter.ai/api/v1`
- API Key: 본인의 OpenRouter 키
- Model ID: `openrouter/free` 또는 원하는 OpenRouter 모델 slug

OpenRouter는 단일 API로 여러 모델을 사용할 수 있고, `openrouter/free`는 당시 이용 가능한 무료 모델을 자동 선택하는 무료 라우터입니다. 무료 모델은 별도의 rate limit이 적용될 수 있습니다.

### 2. API 키 없는 무료 온디바이스 AI
기본 모델을 `무료 온디바이스 AI`로 두었습니다.

- Transformers.js + ONNX Runtime WASM
- `HuggingFaceTB/SmolLM2-135M-Instruct`
- API Key 없음
- 서버에서 추론하지 않고 기기에서 실행
- 첫 실행 시 모델 파일을 내려받아 캐시
- 이후 캐시가 남아 있으면 모델 추론 자체에는 API가 필요하지 않음

Transformers.js는 브라우저에서 서버 없이 모델을 실행할 수 있고, WASM CPU 추론을 지원합니다. SmolLM2-135M-Instruct는 Transformers.js용 사용 예가 제공되는 소형 텍스트 생성 모델입니다.

## Android APK 빌드

이 프로젝트에는 Capacitor 기반 Android 패키징 설정과 GitHub Actions 빌드 워크플로가 들어 있습니다.

로컬:

```bash
npm install
npm run build
npx cap add android
npx cap sync android
cd android
./gradlew assembleDebug
```

생성 APK:

`android/app/build/outputs/apk/debug/app-debug.apk`

GitHub에서는 `.github/workflows/android-apk.yml`의 `workflow_dispatch`를 실행하면 APK가 Actions artifact로 생성됩니다.

## 중요

OpenRouter API Key를 앱의 localStorage에 저장하는 방식은 개인용 프로토타입에 맞춘 것입니다. 공개 배포 서비스라면 서버 측 키 관리가 더 안전합니다.

온디바이스 모델은 'API 없이 무료'이지만 모델 파일을 처음 내려받는 과정에는 인터넷 연결이 필요합니다. 모델이 캐시된 뒤의 추론은 로컬에서 수행됩니다.
