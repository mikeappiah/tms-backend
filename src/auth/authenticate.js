const AWS = require('aws-sdk');
const cognito = new AWS.CognitoIdentityServiceProvider();

exports.handler = async (event) => {
  try {
    const { username, password } = JSON.parse(event.body);
    const params = {
      AuthFlow: 'USER_SRP_AUTH',
      ClientId: process.env.COGNITO_CLIENT_ID,
      UserPoolId: process.env.COGNITO_USER_POOL_ID,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password
      }
    };

    const response = await cognito.initiateAuth(params).promise();

    if (response.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
      return {
        statusCode: 200,
        body: JSON.stringify({
          challenge: 'NEW_PASSWORD_REQUIRED',
          session: response.Session,
          message: 'New password required'
        })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        idToken: response.AuthenticationResult.IdToken,
        accessToken: response.AuthenticationResult.AccessToken,
        refreshToken: response.AuthenticationResult.RefreshToken
      })
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: error.message })
    };
  }
};