import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const screenshotsDir = 'tests/screenshots';
const screenshots = fs.readdirSync(screenshotsDir)
  .filter(f => f.endsWith('.png'))
  .sort();

console.log('🔍 Analyzing screenshots with Claude Vision...\n');

for (const screenshot of screenshots) {
  const filepath = path.join(screenshotsDir, screenshot);
  const imageData = fs.readFileSync(filepath).toString('base64');
  
  console.log(`📸 Analyzing: ${screenshot}`);
  
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: imageData,
          },
        },
        {
          type: 'text',
          text: `You are a UI/UX QA expert. Analyze this screenshot of the CareerDNA app and identify ALL visual bugs, layout issues, design problems, and aesthetic inconsistencies.

Look for:
- Text overflow or cutoff
- Misaligned elements
- Inconsistent spacing/padding
- Wrong colors or contrast issues
- Broken layouts or overlapping elements
- Missing elements
- Responsive design problems
- Accessibility issues

List each bug clearly with its location and severity (Critical/High/Medium/Low).`
        }
      ]
    }]
  });
  
  console.log(message.content[0].text);
  console.log('\n' + '='.repeat(80) + '\n');
}

console.log('✅ Analysis complete!');
