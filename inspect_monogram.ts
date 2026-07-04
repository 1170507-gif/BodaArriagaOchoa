import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

async function run() {
  const apiKey = process.env.GEMINI_API_KEY || '';
  try {
    const aiInstance = new GoogleGenAI({ apiKey });
    const file = fs.readFileSync('public/images/monograma.jpg');
    
    const response = await aiInstance.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        'Analyze this image: "monograma.jpg". Tell me what it contains in detail.',
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: file.toString('base64')
          }
        }
      ]
    });

    console.log('=== Monograma Analysis ===');
    console.log(response.text);
  } catch (error) {
    console.error('Error running script:', error);
  }
}

run();
