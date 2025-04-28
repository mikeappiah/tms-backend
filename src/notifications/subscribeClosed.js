const AWS = require("aws-sdk");
const { COMMON } = require("../../utils/constants");

const sns = new AWS.SNS();

exports.handler = async (event) => {
    try {
        // Extract email and userId from the event object
        let email, userId;

        if (typeof event === "object") {
            if (event.email) {
                // Direct object containing email field
                email = event.email;
                userId = event.userId;
            } else if (event.input && typeof event.input === "string") {
                // If input is provided as a JSON string
                const parsed = JSON.parse(event.input);
                email = parsed.email;
                userId = parsed.userId;
            } else if (event.body && typeof event.body === "string") {
                // From API Gateway
                const parsed = JSON.parse(event.body);
                email = parsed.email;
                userId = parsed.userId;
            }
        }

        // Check if email was found
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new Error("Invalid or missing email address in the input");
        }

        // Check if userId was found
        if (!userId) {
            throw new Error("Missing userId in the input");
        }

        // Subscribe to SNS Topic with filter policy that includes both email and userId
        const subscriptionResult = await sns
            .subscribe({
                TopicArn: process.env.CLOSED_TASK_TOPIC,
                Protocol: "email",
                Endpoint: email,
                Attributes: {
                    FilterPolicy: JSON.stringify({
                        email: [email],
                        userId: [userId]
                    })
                }
            })
            .promise();

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: COMMON.SUCCESS_MSG.SUBSCRIBED_CLOSED_NOTIFICATION,
                subscriptionArn: subscriptionResult.SubscriptionArn,
            }),
        };
    } catch (error) {
        console.error("Error subscribing to topic:", error);

        return {
            statusCode: error.statusCode || 500,
            body: JSON.stringify({
                error: error.message || COMMON.ERROR.FAILED_TO_SUBSCRIBE_CLOSED_TASKS_NOTIFICATION,
                details: error.code ? `AWS Error Code: ${error.code}` : undefined,
            }),
        };
    }
};