document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const imagePreview = document.getElementById('image-preview');
    const promptInput = document.getElementById('prompt-input');
    const generateBtn = document.getElementById('generate-btn');
    const resultSection = document.getElementById('result-section');
    const postTitle = document.getElementById('post-title');
    const postContent = document.getElementById('post-content');
    const postBtn = document.getElementById('post-btn');
    const loader = document.getElementById('loader');

    let selectedFiles = [];

    function handleFiles(files) {
        selectedFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
        
        if (selectedFiles.length === 0) {
            alert('이미지 파일만 업로드 가능합니다.');
            return;
        }

        imagePreview.innerHTML = '';
        selectedFiles.forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const div = document.createElement('div');
                div.className = 'preview-item';
                div.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
                imagePreview.appendChild(div);
            };
            reader.readAsDataURL(file);
        });

        imagePreview.classList.remove('hidden');
        document.querySelector('.upload-box').classList.add('hidden');
    }

    // Handle Upload Click
    dropZone.addEventListener('click', () => fileInput.click());

    // Drag & Drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('active');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('active');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('active');
        if (e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFiles(e.target.files);
        }
    });

    let generatedImages = [];

    // Generate Post
    generateBtn.addEventListener('click', async () => {
        const prompt = promptInput.value.trim();
        if (!prompt) {
            alert('블로그에 담고 싶은 내용을 적어주세요.');
            return;
        }

        loader.classList.remove('hidden');

        try {
            const formData = new FormData();
            formData.append('prompt', prompt);
            selectedFiles.forEach(file => {
                formData.append('images', file);
            });

            const response = await fetch('/api/generate', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                generatedImages = data.images; // 이미지 목록 저장
                postTitle.value = data.title;
                postContent.innerHTML = data.content.replace(/\n/g, '<br>');
                resultSection.classList.remove('hidden');
                resultSection.scrollIntoView({ behavior: 'smooth' });
            } else {
                alert('생성 중 오류가 발생했습니다: ' + data.error);
            }
        } catch (error) {
            console.error('Error:', error);
            alert('서버 연결에 실패했습니다.');
        } finally {
            loader.classList.add('hidden');
        }
    });

    // Post to Naver
    postBtn.addEventListener('click', async () => {
        const title = postTitle.value;
        const content = postContent.innerText;

        loader.classList.remove('hidden');
        document.querySelector('#loader p').innerText = '네이버 블로그에 포스팅 중...';

        try {
            const response = await fetch('/api/post', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, content, images: generatedImages })
            });

            const data = await response.json();

            if (data.success) {
                alert('블로그에 사진과 글 입력이 완료되었습니다! 브라우저 창에서 발행 버튼을 눌러주세요.');
            } else {
                alert('포스팅 실패: ' + data.error);
            }
        } catch (error) {
            console.error('Error:', error);
            alert('포스팅 중 서버 오류가 발생했습니다.');
        } finally {
            loader.classList.add('hidden');
            document.querySelector('#loader p').innerText = 'AI가 멋진 글을 작성 중입니다...';
        }
    });
});
