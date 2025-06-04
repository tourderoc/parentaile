import OpenAI from 'openai';

export const testOpenAIKey = async () => {
  try {
    const openai = new OpenAI({
      apiKey: import.meta.env.VITE_OPENAI_API_KEY,
      dangerouslyAllowBrowser: true
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: "Hello, this is a test message to verify the API key."
        }
      ],
      max_tokens: 10
    });

    return {
      success: true,
      message: "OpenAI API key is valid and working correctly"
    };
  } catch (error: any) {
    console.error('OpenAI API test error:', error);
    
    if (error.code === 'invalid_api_key') {
      return {
        success: false,
        message: "Invalid API key provided"
      };
    }
    
    return {
      success: false,
      message: error.message || "An error occurred while testing the API key"
    };
  }
};