const AWS = require('aws-sdk');
const cognito = new AWS.CognitoIdentityServiceProvider();

exports.handler = async (event) => {
  try {
    const { username, session, newPassword } = JSON.parse(event.body);
    const params = {
      ChallengeName: 'NEW_PASSWORD_REQUIRED',
      ClientId: process.env.COGNITO_CLIENT_ID,
      UserPoolId: process.env.COGNITO_USER_POOL_ID,
      ChallengeResponses: {
        USERNAME: username,
        NEW_PASSWORD: newPassword
      },
      Session: session
    };

    const response = await cognito.respondToAuthChallenge(params).promise();

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