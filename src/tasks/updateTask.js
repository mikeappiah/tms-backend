const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const sns = new AWS.SNS();

exports.handler = async (event) => {
  try {
    const claims = event.requestContext.authorizer.claims;
    const userId = claims.sub;
    const taskId = event.pathParameters.taskId;
    const { status, comment } = JSON.parse(event.body);

    // Fetch task
    const taskResult = await dynamodb.get({
      TableName: process.env.TASKS_TABLE,
      Key: { taskId }
    }).promise();

    if (!taskResult.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Task not found' })
      };
    }

    if (taskResult.Item.userId !== userId) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Not authorized to update this task' })
      };
    }

    const updateExpression = ['SET'];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    if (status) {
      updateExpression.push('#status = :status');
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[':status'] = status;
      if (status === 'completed') {
        updateExpression.push('completedAt = :completedAt');
        expressionAttributeValues[':completedAt'] = new Date().toISOString();
      }
    }

    if (comment) {
      updateExpression.push('comment = :comment');
      expressionAttributeValues[':comment'] = comment;
    }

    await dynamodb.update({
      TableName: process.env.TASKS_TABLE,
      Key: { taskId },
      UpdateExpression: updateExpression.join(', '),
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    }).promise();

    if (status === 'completed') {
      // Notify admin
      const adminResult = await dynamodb.scan({
        TableName: process.env.USERS_TABLE,
        FilterExpression: '#role = :role',
        ExpressionAttributeNames: { '#role': 'role' },
        ExpressionAttributeValues: { ':role': 'admin' }
      }).promise();

      for (const admin of adminResult.Items) {
        await sns.publish({
          TopicArn: process.env.TASK_COMPLETE_TOPIC,
          Message: `Task "${taskResult.Item.name}" completed by ${userId}`,
          MessageAttributes: {
            email: { DataType: 'String', StringValue: admin.email }
          }
        }).promise();
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Task updated' })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};