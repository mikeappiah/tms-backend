const AWS = require('aws-sdk');
const cognito = new AWS.CognitoIdentityServiceProvider();
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { v4: uuidv4 } = require('uuid');

exports.handler = async (event) => {
  try {
    // Admin permissions check from token
    const claims = event.requestContext.authorizer.claims;
    const userGroups = claims['cognito:groups'] || [];
    if (!userGroups.includes(process.env.ADMIN_GROUP_NAME)) {
      return {
        statusCode: 403,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Admin access required' })
      };
    }

    const { userId, email, fullName, role } = JSON.parse(event.body);

    // Validate inputs
    if (!userId || !email || !fullName || !role) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Invalid email or role' })
      };
    }

    // Get existing user
    const userResult = await dynamodb.get({
      TableName: process.env.USERS_TABLE,
      Key: { userId }
    }).promise();

    if (!userResult.Item) {
      return {
        statusCode: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'User not found' })
      };
    }

    const user = userResult.Item;

    // Update user in Cognito with the new email and name
    await cognito.adminUpdateUserAttributes({
      UserPoolId: process.env.COGNITO_USER_POOL_ID,
      Username: user.username,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'name', Value: fullName }
      ]
    }).promise();

    // Update user in DynamoDB
    await dynamodb.update({
      TableName: process.env.USERS_TABLE,
      Key: { userId },
      UpdateExpression: 'set #email = :email, #fullName = :fullName, #role = :role',
      ExpressionAttributeNames: {
        '#email': 'email',
        '#fullName': 'fullName',
        '#role': 'role'
      },
      ExpressionAttributeValues: {
        ':email': email,
        ':fullName': fullName,
        ':role': role
      }
    }).promise();

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: 'User updated successfully' })
    };
  } catch (error) {
    console.error('Error editing user:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Error editing user' })
    };
  }
};

