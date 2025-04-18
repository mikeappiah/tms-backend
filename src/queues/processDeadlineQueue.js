const AWS = require('aws-sdk');
const sfn = new AWS.StepFunctions();

exports.handler = async (event) => {
  try {
    for (const record of event.Records) {
      const { taskId, userId } = JSON.parse(record.body);

      await sfn.startExecution({
        stateMachineArn: process.env.PROCESS_DEADLINE_STATE_MACHINE_ARN,
        input: JSON.stringify({ taskId, userId })
      }).promise();
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Processed deadline queue' })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};