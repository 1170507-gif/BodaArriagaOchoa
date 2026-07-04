import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

async function run() {
  const apiKey = process.env.GEMINI_API_KEY || '';
  try {
    const aiInstance = new GoogleGenAI({ apiKey });
    const file = fs.readFileSync('public/images/imagen_07.png');
    
    console.log('Sending the newly generated transparent PNG to Gemini...');
    const response = await aiInstance.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        'Analyze this PNG image: "imagen_07.png". Check if the white/light-grey background has been successfully removed and if it is truly transparent now, or if there is still a solid background or nasty halos. Describe how it looks.',
        {
          inlineData: {
            mimeType: 'image/png',
            data: file.toString('base64')
          }
        }
      ]
    });

    console.log('=== Transparency Analysis ===');
    console.log(response.text);
  } catch (error) {
    console.error('Error running script:', error);
  }
}

run();
