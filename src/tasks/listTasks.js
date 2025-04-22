const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const cognito = new AWS.CognitoIdentityServiceProvider();

exports.handler = async (event) => {
  try {
    const claims = event.requestContext.authorizer.claims;
    console.log("CLAIMS OUTPUT: ", claims);
    
    const userId = claims.sub;
    const username = claims['cognito:username'] || claims.email || claims.sub;
    
    // Check if admin
    const userGroups = claims['cognito:groups'] || [];
    const isAdmin = userGroups.includes(process.env.ADMIN_GROUP_NAME);
    
    let result;
    
    // Admin can see all tasks
    if (isAdmin) {
      console.log("Admin user - retrieving all tasks");
      result = await dynamodb.scan({
        TableName: process.env.TASKS_TABLE
      }).promise();
    } else {
      // Regular users can only see their assigned tasks
      console.log(`Regular user - fetching tasks for userId: ${userId} and username: ${username}`);
      
      // Try to find tasks by Cognito sub ID
      let subIdResult = await dynamodb.scan({
        TableName: process.env.TASKS_TABLE,
        FilterExpression: 'userId = :uid',
        ExpressionAttributeValues: {
          ':uid': userId
        }
      }).promise();
      
      // If no results, try by username
      if (!subIdResult.Items || subIdResult.Items.length === 0) {
        console.log(`No tasks found with Cognito ID, trying with username: ${username}`);
        
        const usernameResult = await dynamodb.scan({
          TableName: process.env.TASKS_TABLE,
          FilterExpression: 'userId = :username',
          ExpressionAttributeValues: {
            ':username': username
          }
        }).promise();
        
        if (usernameResult.Items && usernameResult.Items.length > 0) {
          console.log(`Found ${usernameResult.Items.length} tasks using username`);
          result = usernameResult;
        } else {
          // If still no results, try a more flexible search
          console.log("Trying flexible search for userId");
          
          // Get all items and filter client-side as a last resort
          const allItems = await dynamodb.scan({
            TableName: process.env.TASKS_TABLE
          }).promise();
          
          // Log some sample userIds to help diagnose
          if (allItems.Items && allItems.Items.length > 0) {
            console.log("Sample userIds in database:", 
              allItems.Items.slice(0, 3).map(item => item.userId));
          }
          
          result = { Items: [] };
        }
      } else {
        result = subIdResult;
      }
      
      console.log(`Found ${result.Items.length} tasks for user`);
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Tasks retrieved successfully',
        tasks: result.Items
      })
    };
  } catch (error) {
    console.error('List tasks error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        code: error.code || 'InternalServerError',
        message: error.message
      })
    };
  }
};