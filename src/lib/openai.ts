export const testOpenAIKey = async () => {
  try {
    const response = await fetch('/.netlify/functions/openai-chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: "Hello, this is a test message to verify the API key."
          }
        ],
        max_tokens: 10
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to test OpenAI API');
    }

    return {
      success: true,
      message: "OpenAI API key is valid and working correctly"
    };
  } catch (error: any) {
    console.error('OpenAI API test error:', error);
    
    if (error.message.includes('invalid_api_key')) {
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

export const createChatCompletion = async (messages: any[], model = "gpt-3.5-turbo", maxTokens = 100) => {
  try {
    const response = await fetch('/.netlify/functions/openai-chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        model,
        max_tokens: maxTokens
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create chat completion');
    }

    return await response.json();
  } catch (error) {
    console.error('Error calling OpenAI:', error);
    throw error;
  }
};
