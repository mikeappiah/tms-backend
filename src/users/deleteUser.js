const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async event => {
  const { userId } = JSON.parse(event.body);

  if (!userId) {
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'userId is required' })
    };
  }

  try {
    // Delete user from DynamoDB
    await dynamodb.delete({
      TableName: process.env.USERS_TABLE,
      Key: { userId }
    }).promise();

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: 'User deleted successfully' })
    };
  } catch (error) {
    console.error('Error deleting user:', error);

    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Internal Server Error' })
    };
  }
};



