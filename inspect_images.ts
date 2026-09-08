import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

async function run() {
  const apiKey = process.env.GEMINI_API_KEY || '';
  try {
    const aiInstance = new GoogleGenAI({ apiKey });
    const file = fs.readFileSync('public/images/pareja_overlay_ivory.png');
    
    console.log('Sending pareja_overlay_ivory.png to Gemini...');
    const response = await aiInstance.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        'Analyze this PNG image: "pareja_overlay_ivory.png". Describe what is in the image, whether the background is transparent or black or white, if it is the couple holding hands, and whether it has clean edges / transparency.',
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
