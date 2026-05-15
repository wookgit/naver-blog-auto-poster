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
            images.forEach((img, index) => {
                parts.push({
                    inlineData: {
                        data: fs.readFileSync(img.path).toString('base64'),
                        mimeType: img.mimetype
                    }
                });
            });
            promptText += `\n제공된 ${images.length}장의 이미지를 분석해서 각 사진에 어울리는 위치에 [IMAGE_1] 표시를, 관련 장소가 있다면 [PLACE: 장소명] 표시를 넣어 글을 작성해줘.`;
        }

        const result = await model.generateContent(parts);
        const response = await result.response;
        const text = response.text();

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
