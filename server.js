const express = require('express');
const multer = require('multer');
const dotenv = require('dotenv');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));

// 임시 폴더 생성
const tempDir = path.join(__dirname, 'temp_uploads');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, tempDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, { apiVersion: 'v1' });

// 503 에러 자동 재시도 함수
const delay = (ms) => new Promise(res => setTimeout(res, ms));
async function generateWithRetry(model, parts, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await model.generateContent(parts);
        } catch (error) {
            if (error.message.includes('503') || error.status === 503 || error.message.includes('high demand')) {
                console.warn(`\n[API 경고] 구글 API 서버 트래픽이 많습니다 (503). ${i + 1}/${maxRetries}회 재시도 중... (3초 대기)`);
                if (i === maxRetries - 1) throw error;
                await delay(3000);
            } else {
                throw error;
            }
        }
    }
}

// 블로그 생성 API
app.post('/api/generate', upload.array('images'), async (req, res) => {
    try {
        const { prompt } = req.body;
        const images = req.files;

        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        let promptText = `
        다음 내용을 바탕으로 네이버 블로그 포스팅을 한국어로 작성해줘.
        형식은 제목과 본문으로 나누어줘.
        본문은 독자의 흥미를 끌 수 있도록 친근하고 정보가 풍부하게 작성해줘.
        적절한 해시태그도 포함해줘.
        
        **작성 가이드:**
        1. #, **, >와 같은 마크다운 기호는 절대 사용하지 마세요.
        2. 소제목은 [소제목] 또는 📍, ✅와 같은 이모지를 사용하여 본문과 확실히 구분되게 작성하세요.
        3. 문단 사이에는 충분한 줄바꿈을 넣어 가독성을 높여주세요.
        4. **사진 배치**: 제공된 사진들을 글의 맥락에 맞게 배치해주세요. 사진이 들어갈 자리에 반드시 [IMAGE_1], [IMAGE_2]와 같이 표시를 남겨주세요.
        5. **지도(장소) 배치**: 글의 주제와 관련된 특정 장소가 있다면 글 중간에 [PLACE: 장소명] 형식으로 표시를 남겨주세요. (예: 맛집이나 카페 이름 등)
        
        사용자 요청: ${prompt}
        `;

        const parts = [promptText];
        
        if (images && images.length > 0) {
            let gifCount = 0;
            images.forEach((img) => {
                if (img.mimetype === 'image/gif') {
                    gifCount++;
                } else {
                    parts.push({
                        inlineData: {
                            data: fs.readFileSync(img.path).toString('base64'),
                            mimeType: img.mimetype
                        }
                    });
                }
            });
            
            promptText += `\n총 ${images.length}개의 파일(사진 및 움짤)이 제공되었습니다. (움짤 ${gifCount}개 포함)`;
            promptText += `\n제공된 파일이 적절히 배치되도록 본문에 [IMAGE_1]부터 [IMAGE_${images.length}]까지 순서대로 표시를 남겨주세요. (움짤은 분석하지 않고 건너뛰었으니, 글 흐름상 자연스러운 곳에 배치해주세요.)`;
            promptText += `\n관련 장소가 있다면 [PLACE: 장소명] 표시도 함께 넣어 글을 작성해줘.`;
            
            // parts 배열의 첫 번째 요소인 텍스트 부분을 업데이트된 promptText로 교체
            parts[0] = promptText;
        }

        const result = await generateWithRetry(model, parts);
        const response = await result.response;
        const text = response.text();

        if (response.usageMetadata) {
            console.log(`\n📊 [토큰 사용량 - 초기 생성]`);
            console.log(`- 입력 토큰: ${response.usageMetadata.promptTokenCount}`);
            console.log(`- 출력 토큰: ${response.usageMetadata.candidatesTokenCount}`);
            console.log(`- 총 사용량: ${response.usageMetadata.totalTokenCount}\n`);
        }

        const lines = text.split('\n');
        const title = lines[0].replace('제목:', '').replace('##', '').trim();
        const content = lines.slice(1).join('\n').trim();

        const imageUrls = images.map(img => img.filename);

        res.json({ success: true, title, content, images: imageUrls });
    } catch (error) {
        console.error('Gemini Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 피드백 기반 글 수정 API
app.post('/api/refine', async (req, res) => {
    try {
        const { title, content, feedback } = req.body;
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const promptText = `
        당신은 네이버 블로그 포스팅 전문가입니다.
        현재 작성된 블로그 초안은 다음과 같습니다:
        
        제목: ${title}
        본문:
        ${content}
        
        사용자의 수정 요청: "${feedback}"
        
        위 요청을 반영하여 초안을 자연스럽게 수정해주세요.
        
        **수정 필수 규칙:**
        1. [IMAGE_n]이나 [PLACE: 장소명] 같은 기존의 위치 표시 태그는 **절대 지우지 말고**, 문맥에 맞게 본문에 그대로 남겨두세요. (매우 중요)
        2. #, **, >와 같은 마크다운 기호는 절대 사용하지 마세요.
        3. 소제목은 [소제목] 또는 📍, ✅와 같은 이모지를 사용하세요.
        4. 결과는 첫 줄에 '제목: (수정된 제목)'을 쓰고, 다음 줄부터 본문을 작성해주세요.
        `;

        const result = await generateWithRetry(model, promptText);
        const response = await result.response;
        const text = response.text();

        if (response.usageMetadata) {
            console.log(`\n📊 [토큰 사용량 - 피드백 수정]`);
            console.log(`- 입력 토큰: ${response.usageMetadata.promptTokenCount}`);
            console.log(`- 출력 토큰: ${response.usageMetadata.candidatesTokenCount}`);
            console.log(`- 총 사용량: ${response.usageMetadata.totalTokenCount}\n`);
        }

        const lines = text.split('\n');
        const newTitle = lines[0].replace('제목:', '').replace('##', '').trim();
        const newContent = lines.slice(1).join('\n').trim();

        res.json({ success: true, title: newTitle, content: newContent });
    } catch (error) {
        console.error('Refine Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 브라우저 자동화 포스팅 API
app.post('/api/post', async (req, res) => {
    let browserContext;
    try {
        let { title, content, images } = req.body;
        const naverId = process.env.NAVER_ID;

        content = content.replace(/<br\s*\/?>/gi, '\n');

        if (!naverId) {
            throw new Error('.env 파일에 NAVER_ID가 설정되지 않았습니다.');
        }

        const userDataDir = path.join(__dirname, '.playwright-data');
        browserContext = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            args: ['--start-maximized']
        });

        const page = await browserContext.newPage();
        page.setDefaultTimeout(60000);
        
        const writeUrl = `https://blog.naver.com/${naverId}/postwrite`;
        await page.goto(writeUrl);

        if (page.url().includes('nid.naver.com')) {
            console.log('네이버 로그인이 필요합니다.');
            await page.waitForURL(url => url.toString().includes('postwrite'), { timeout: 300000 });
        }

        await page.waitForSelector('.se-help-guide-close-button', { timeout: 10000 }).catch(() => {});
        await page.click('.se-help-guide-close-button').catch(() => {});

        const contentSelector = '.se-content, .se-main-container, [contenteditable="true"]';

        // 1. 제목 입력
        console.log('제목 입력 중...');
        const titleSelector = '.se-title-text, .se-placeholder.__se_placeholder, textarea.se-ff-nanumgothic';
        await page.waitForSelector(titleSelector);
        await page.click(titleSelector);
        await page.keyboard.type(title);
        await page.keyboard.press('Enter');
        await page.keyboard.press('Tab');

        // 2. 본문/이미지/지도 교차 입력
        console.log('내용 입력 시작...');
        
        // [IMAGE_n] 또는 [PLACE:장소] 패턴으로 나눕니다.
        const sections = content.split(/(\[IMAGE_\d+\]|\[PLACE:[^\]]+\])/g);
        
        for (const section of sections) {
            const imageMatch = section.match(/\[IMAGE_(\d+)\]/);
            const placeMatch = section.match(/\[PLACE:\s*(.+?)\]/);
            
            if (imageMatch) {
                // 이미지 업로드
                const imageIndex = parseInt(imageMatch[1]) - 1;
                if (images && images[imageIndex]) {
                    console.log(`${imageIndex + 1}번째 이미지 업로드...`);
                    const filePath = path.join(tempDir, images[imageIndex]);
                    const [fileChooser] = await Promise.all([
                        page.waitForEvent('filechooser'),
                        page.click('.se-toolbar-button-image, .se-image-toolbar-button')
                    ]);
                    await fileChooser.setFiles(filePath);
                    await page.waitForTimeout(3000);
                    await page.click(contentSelector).catch(() => {});
                    await page.keyboard.press('End');
                    await page.keyboard.press('Enter');
                }
            } else if (placeMatch) {
                // 장소(지도) 추가
                const placeName = placeMatch[1];
                console.log(`장소 추가 중: ${placeName}`);
                try {
                    // 장소 버튼 클릭
                    await page.click('.se-toolbar-button-location, button:has-text("장소")');
                    await page.waitForSelector('.se-popup-place-search-input, input[placeholder*="장소"]');
                    await page.fill('.se-popup-place-search-input, input[placeholder*="장소"]', placeName);
                    await page.keyboard.press('Enter');
                    
                    // 첫 번째 검색 결과 클릭
                    await page.waitForSelector('.se-place-search-item, .se-popup-place-search-result-list li');
                    await page.click('.se-place-search-item, .se-popup-place-search-result-list li:first-child');
                    
                    // 확인 버튼 클릭
                    await page.click('.se-popup-place-footer-button-confirm, button:has-text("확인")');
                    await page.waitForTimeout(2000);
                    
                    await page.click(contentSelector).catch(() => {});
                    await page.keyboard.press('End');
                    await page.keyboard.press('Enter');
                } catch (e) {
                    console.log(`장소(${placeName}) 추가 실패:`, e.message);
                }
            } else if (section.trim()) {
                // 텍스트 입력
                await page.keyboard.type(section, { delay: 5 });
                await page.keyboard.press('Enter');
            }
        }

        res.json({ success: true, message: '글, 사진, 지도가 모두 입력되었습니다!' });

    } catch (error) {
        console.error('Automation Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(port, () => {
    console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
});
