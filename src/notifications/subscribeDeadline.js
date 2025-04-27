const AWS = require("aws-sdk");
const COMMON = require("../../utils/constants");
const sns = new AWS.SNS();

exports.handler = async (event) => {
    try {
        // Extract email from the event object directly
        let email;

        if (typeof event === "object") {
            if (event.email) {
                // Direct object containing email field
                email = event.email;
            } else if (event.input && typeof event.input === "string") {
                // If input is provided as a JSON string (uncommon case)
                const parsed = JSON.parse(event.input);
                email = parsed.email;
            } else if (event.body && typeof event.body === "string") {
                // From API Gateway
                const parsed = JSON.parse(event.body);
                email = parsed.email;
            }
        }

        // Check if email was found
        if (!email) {
            throw new Error("No email address found in the input");
        }

        // Subscribe to SNS Topic
        const subscriptionResult = await sns
            .subscribe({
                TopicArn: process.env.TASK_DEADLINE_TOPIC,
                Protocol: "email",
                Endpoint: email,
            })
            .promise();

        return {
            statusCode: COMMON.STATUS_CODES.OK,
            body: JSON.stringify({
                message: COMMON.SUCCESS_MSG.SUBSCRIBED_TASK_DEADLINE_NOTIFICATION,
                subscriptionArn: subscriptionResult.SubscriptionArn,
            }),
        };
    } catch (error) {
        console.error("Error subscribing to topic:", error);

        return {
            statusCode: error.statusCode || 500,
            body: JSON.stringify({
                error: error.message || COMMON.ERROR.FAILED_TO_SUBSCRIBE_TASK_DEADLINE_NOTIFICATION,
                details: error.code ? `AWS Error Code: ${error.code}` : undefined,
            }),
        };
    }
};
