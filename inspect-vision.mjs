
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

async function testVision() {
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey });

  // 1x1 red pixel png
  const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  const testModels = ['gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest'];

  for (const model of testModels) {
    try {
      console.log(`Testing Vision on ${model}...`);
      const res = await ai.models.generateContent({
        model,
        contents: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: tinyPngBase64,
            },
          },
          {
            text: 'What color is this 1x1 image? Answer in one word.',
          },
        ],
      });
      console.log(`✅ Vision ${model} SUCCESS:`, res.text?.trim());
    } catch (e) {
      console.log(`❌ Vision ${model} ERROR:`, e.status || e.code || '', e.message?.slice(0, 100));
    }
  }
}

testVision();
