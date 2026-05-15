# 🤖 네이버 블로그 AI 자동 포스팅 서비스

이 프로젝트는 **Gemini AI**를 사용하여 블로그 콘텐츠를 생성하고, **Playwright** 브라우저 자동화 기술을 통해 네이버 블로그에 사진, 지도와 함께 글을 자동으로 입력해 주는 서비스입니다.

## 주요 기능
- **AI 콘텐츠 생성**: 사진과 간단한 키워드를 분석하여 제목 및 본문을 자동 작성 (Gemini 2.5 Flash 사용)
- **다중 이미지 지원**: 여러 장의 사진을 한꺼번에 분석하고 업로드
- **맥락 기반 이미지 배치**: 글의 흐름에 맞는 위치에 사진 자동 삽입
- **자동 지도(장소) 삽입**: AI가 제안한 장소를 네이버 지도에서 검색하여 자동으로 삽입
- **브라우저 자동화**: API 제한 없이 실제 브라우저를 제어하여 포스팅 과정 수행

## 시작하기 전에
- **Node.js**가 설치되어 있어야 합니다.
- **Google AI Studio**에서 Gemini API 키를 발급받아야 합니다.

## 설치 및 설정

1. **저장소 복제 및 패키지 설치**
   ```bash
   git clone https://github.com/wookgit/naver-blog-auto-poster.git
   cd naver-blog-auto-poster
   npm install
   ```

2. **브라우저 구성 요소 설치**
   ```bash
   npx playwright install chromium
   ```

3. **환경 변수 설정 (`.env`)**
   프로젝트 루트 폴더에 `.env` 파일을 생성하고 아래 내용을 입력합니다.
   ```env
   GEMINI_API_KEY=your_gemini_api_key
   NAVER_ID=your_naver_id
   PORT=3000
   ```

## 사용 방법

1. **서버 실행**
   ```bash
   npm run dev
   ```

2. **서비스 접속**
   브라우저에서 `http://localhost:3000`에 접속합니다.

3. **포스팅 과정**
   - 사진들을 업로드하고 원하는 주제를 입력한 뒤 **[생성하기]**를 누릅니다.
   - AI가 작성한 내용을 확인하고 **[포스팅하기]**를 누릅니다.
   - 자동으로 열리는 브라우저 창에서 **네이버 로그인을 완료**합니다.
   - 프로그램이 글, 사진, 지도를 모두 입력할 때까지 잠시 기다립니다.
   - 입력이 완료되면 내용을 최종 확인하고 **[발행]** 버튼을 직접 누릅니다.

## 기술 스택
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla JS)
- **Backend**: Node.js, Express
- **AI**: Google Generative AI (Gemini)
- **Automation**: Playwright

## 주의 사항
- 본 프로그램은 교육 및 개인용 도구로 제작되었습니다.
- 네이버 서비스 이용 약관을 준수해야 하며, 과도한 자동 포스팅은 계정 제한의 원인이 될 수 있습니다.
