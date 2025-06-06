import { createChatCompletion } from './lib/openai';

const testOpenAIKey = async () => {
  console.log('%c OpenAI API Key Test ', 'background: #000; color: #fff; padding: 2px 6px; border-radius: 4px;');
  console.log('Starting API test...');

  try {
    console.log('Making test request to OpenAI API via Netlify function...');
    
    const completion = await createChatCompletion([
      {
        role: "user",
        content: "Say hello"
      }
    ], "gpt-3.5-turbo", 10);

    console.log('%c ✅ SUCCESS ', 'background: #4CAF50; color: #fff; padding: 2px 6px; border-radius: 4px;');
    console.log('API Response:', completion.choices[0].message);
    console.log('API Key is valid and working correctly');
    
    return completion;
  } catch (error: any) {
    console.log('%c ❌ ERROR ', 'background: #f44336; color: #fff; padding: 2px 6px; border-radius: 4px;');
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      type: error.type,
      stack: error.stack
    });
    throw error;
  }
};

// Run the test immediately
console.log('='.repeat(50));
testOpenAIKey().catch(error => {
  console.log('Test completed with errors');
  console.log('='.repeat(50));
});
