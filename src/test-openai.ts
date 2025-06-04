import OpenAI from 'openai';

const testOpenAIKey = async () => {
  console.log('%c OpenAI API Key Test ', 'background: #000; color: #fff; padding: 2px 6px; border-radius: 4px;');
  console.log('Starting API test...');

  try {
    if (!import.meta.env.VITE_OPENAI_API_KEY) {
      throw new Error('API key is not defined in environment variables');
    }

    console.log('API Key found in environment variables');
    console.log('Initializing OpenAI client...');

    const openai = new OpenAI({
      apiKey: import.meta.env.VITE_OPENAI_API_KEY,
      dangerouslyAllowBrowser: true
    });

    console.log('Making test request to OpenAI API...');
    
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: "Say hello"
        }
      ],
      max_tokens: 10
    });

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