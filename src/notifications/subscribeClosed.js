const AWS = require('aws-sdk');
const sns = new AWS.SNS();

exports.handler = async (event) => {
  try {
    const { email } = JSON.parse(event.input);
    await sns.subscribe({
      TopicArn: process.env.CLOSED_TASK_TOPIC,
      Protocol: 'email',
      Endpoint: email
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Subscribed to ClosedTaskNotificationTopic' })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};