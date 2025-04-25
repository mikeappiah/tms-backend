const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");

class NotificationService {
    constructor() {
        this.sns = new SNSClient({});
        this.sqs = new SQSClient({});
    }

    async sendSnsNotification(topicArn, subject, message, messageAttributes = {}) {
        const params = {
            TopicArn: topicArn,
            Subject: subject,
            Message: JSON.stringify(message),
            MessageAttributes: messageAttributes
        };

        const command = new PublishCommand(params);
        await this.sns.send(command);
    }

    async sendTaskQueue(queueUrl, messageBody, messageGroupId, messageDeduplicationId) {
        const params = {
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify(messageBody),
            MessageGroupId: messageGroupId,
            MessageDeduplicationId: messageDeduplicationId
        };

        const command = new SendMessageCommand(params);
        await this.sqs.send(command);
    }
}

module.exports = NotificationService;