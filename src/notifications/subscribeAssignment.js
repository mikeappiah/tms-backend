const AWS = require('aws-sdk');
const sns = new AWS.SNS();

exports.handler = async (event) => {
  console.log('Subscribe Assignment Function invoked with:', JSON.stringify(event));
  
  try {
    // Extract email from the event object directly
    let email;
    
    if (typeof event === 'object') {
      if (event.email) {
        // Direct object containing email field
        email = event.email;
      } else if (event.input && typeof event.input === 'string') {
        // If input is provided as a JSON string (uncommon case though)
        const parsed = JSON.parse(event.input);
        email = parsed.email;
      } else if (event.body && typeof event.body === 'string') {
        // From API Gateway
        const parsed = JSON.parse(event.body);
        email = parsed.email;
      }
    }
    
    // Check if email was found
    if (!email) {
      console.error('No email found in the event:', event);
      throw new Error('No email address found in the input');
    }
    
    console.log(`Subscribing email ${email} to topic ${process.env.TASK_ASSIGNMENT_TOPIC}`);
    
    // Subscribe to SNS Topic
    const subscriptionResult = await sns.subscribe({
      TopicArn: process.env.TASK_ASSIGNMENT_TOPIC, 
      Protocol: 'email',
      Endpoint: email
    }).promise();
    
    console.log('Subscription successful:', subscriptionResult);
    
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Successfully subscribed to task assignment notifications',
        subscriptionArn: subscriptionResult.SubscriptionArn
      })
    };
  } catch (error) {
    console.error('Error subscribing to topic:', error);
    
    return {
      statusCode: error.statusCode || 500,
      body: JSON.stringify({ 
        error: error.message || 'Failed to subscribe to task assignment notifications',
        details: error.code ? `AWS Error Code: ${error.code}` : undefined
      })
    };
  }
};