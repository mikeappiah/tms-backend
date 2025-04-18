const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const sqs = new AWS.SQS();
const { v4: uuidv4 } = require('uuid');

exports.handler = async (event) => {
  try {
    const claims = event.requestContext.authorizer.claims;
    if (claims['custom:role'] !== 'admin') {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Admin access required' })
      };
    }

    const { name, description, deadline, userId } = JSON.parse(event.body);
    if (!name || !description || !deadline || !userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    const taskId = uuidv4();
    const task = {
      taskId,
      name,
      description,
      status: 'open',
      deadline,
      userId,
      comment: '',
      completedAt: null
    };

    await dynamodb.put({
      TableName: process.env.TASKS_TABLE,
      Item: task
    }).promise();

    await sqs.sendMessage({
      QueueUrl: process.env.TASK_QUEUE,
      MessageBody: JSON.stringify({ taskId, userId }),
      MessageGroupId: taskId
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Task created', taskId })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};