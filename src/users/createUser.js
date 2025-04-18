const AWS = require('aws-sdk');
const cognito = new AWS.CognitoIdentityServiceProvider();
const dynamodb = new AWS.DynamoDB.DocumentClient();
const sfn = new AWS.StepFunctions();

exports.handler = async (event) => {
  try {
    const claims = event.requestContext.authorizer.claims;
    if (claims['custom:role'] !== 'admin') {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Admin access required' })
      };
    }

    const { email, role } = JSON.parse(event.body);
    if (!email || !['admin', 'member'].includes(role)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid email or role' })
      };
    }

    // Create user in Cognito with temporary password
    const user = await cognito.adminCreateUser({
      UserPoolId: process.env.COGNITO_USER_POOL_ID,
      Username: email,
      TemporaryPassword: Math.random().toString(36).slice(-8) + 'Aa1!',
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'role', Value: role },
        { Name: 'email_verified', Value: 'true' }
      ]
    }).promise();

    // Store in UsersTable
    await dynamodb.put({
      TableName: process.env.USERS_TABLE,
      Item: {
        userId: user.User.Username,
        email,
        role
      }
    }).promise();

    // Start Step Function for SNS subscriptions
    await sfn.startExecution({
      stateMachineArn: process.env.SUBSCRIBE_USER_STATE_MACHINE_ARN,
      input: JSON.stringify({ email })
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'User created, temporary password emailed' })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};