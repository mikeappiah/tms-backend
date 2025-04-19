const AWS = require('aws-sdk');
const cognito = new AWS.CognitoIdentityServiceProvider();

exports.handler = async (event) => {
  try {
    const { username, password } = JSON.parse(event.body);
    
    // Use ADMIN_USER_PASSWORD_AUTH flow
    const params = {
      AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
      ClientId: process.env.COGNITO_CLIENT_ID,
      UserPoolId: process.env.COGNITO_USER_POOL_ID,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password
      }
    };

    const response = await cognito.adminInitiateAuth(params).promise();

    // Handle password challenge if user needs to change password
    if (response.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          challenge: 'NEW_PASSWORD_REQUIRED',
          session: response.Session,
          message: 'New password required'
        })
      };
    }

    // Return tokens on successful authentication
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        idToken: response.AuthenticationResult.IdToken,
        accessToken: response.AuthenticationResult.AccessToken,
        refreshToken: response.AuthenticationResult.RefreshToken,
        expiresIn: response.AuthenticationResult.ExpiresIn,
        tokenType: response.AuthenticationResult.TokenType
      })
    };
  } catch (error) {
    console.error('Authentication error:', error);
    
    // Return appropriate error message based on the error type
    let statusCode = 400;
    let errorMessage = error.message;
    
    if (error.code === 'UserNotFoundException' || error.code === 'NotAuthorizedException') {
      statusCode = 401;
      errorMessage = 'Invalid username or password';
    } else if (error.code === 'UserNotConfirmedException') {
      statusCode = 403;
      errorMessage = 'User is not confirmed';
    } else if (error.code === 'PasswordResetRequiredException') {
      statusCode = 403;
      errorMessage = 'Password reset required';
    }
    
    return {
      statusCode,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: errorMessage,
        code: error.code || 'UnknownError'
      })
    };
  }
};