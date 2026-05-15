const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function checkModels() {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        console.log("Using API Key:", process.env.GEMINI_API_KEY.substring(0, 10) + "...");
        
        const modelsToTry = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"];
        
        for (const modelName of modelsToTry) {
            try {
                console.log(`Testing ${modelName} with v1...`);
                // Move apiVersion here
                const model = genAI.getGenerativeModel({ model: "models/" + modelName }, { apiVersion: 'v1' });
                const result = await model.generateContent("test");
                const response = await result.response;
                console.log(`✅ ${modelName} works!`);
                return;
            } catch (e) {
                console.log(`❌ ${modelName} failed: ${e.message}`);
            }
        }
        
    } catch (error) {
        console.error("Critical Error:", error);
    }
}

checkModels();
