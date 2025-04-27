const AWS = require("aws-sdk");
const ses = new AWS.SES();

function generateSecurePassword() {
    const special = "!@#$%^&*()_+=-";
    const lowercase = "abcdefghijklmnopqrstuvwxyz";
    const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const numbers = "0123456789";

    // Ensuring at least one of each character type
    let password = "";
    password += special.charAt(Math.floor(Math.random() * special.length));
    password += lowercase.charAt(Math.floor(Math.random() * lowercase.length));
    password += uppercase.charAt(Math.floor(Math.random() * uppercase.length));
    password += numbers.charAt(Math.floor(Math.random() * numbers.length));

    const allChars = special + lowercase + uppercase + numbers;
    for (let i = 0; i < 8; i++) {
        password += allChars.charAt(Math.floor(Math.random() * allChars.length));
    }

    return password
        .split("")
        .sort(() => 0.5 - Math.random())
        .join("");
}

const getCookies = (headers) => {
    const cookies = {};
    if (headers.Cookie) {
        const data = headers.Cookie.split("=")[1];
        cookies.session = data;
    }
    return cookies;
};


/**
 * Send welcome email to the newly created user with their credentials
 */
async function sendWelcomeEmail(email, name, tempPassword) {
	const appUrl = process.env.FRONTEND_URL
	
	const emailParams = {
		Destination: {
			ToAddresses: [email]
		},
		Message: {
			Body: {
				Html: {
					Charset: "UTF-8",
					Data: `
						<html>
							<head>
								<style>
									body { font-family: Arial, sans-serif; line-height: 1.6; }
									.container { max-width: 600px; margin: 0 auto; padding: 20px; }
									.button { display: inline-block; background-color: #4CAF50; color: white; padding: 10px 20px; 
												text-decoration: none; border-radius: 5px; margin-top: 20px; }
									.credentials { background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0; }
								</style>
							</head>
							<body>
								<div class="container">
									<h2>Welcome to Task Management System!</h2>
									<p>Hello ${name},</p>
									<p>Your account has been created. Please use the following credentials to log in:</p>
									
									<div class="credentials">
										<p><strong>Email:</strong> ${email}</p>
										<p><strong>Temporary Password:</strong> ${tempPassword}</p>
										<p><em>Note: You will be prompted to change your password upon first login.</em></p>
									</div>
									
									<p>To get started, please click the button below:</p>
									<a href="${appUrl}" class="button">Go to Application</a>
									
									<p>If you have any questions, please contact our support team.</p>
									<p>Thank you,<br>The node.js Team</p>
								</div>
							</body>
						</html>
					`
				},
				Text: {
					Charset: "UTF-8",
					Data: `
						Welcome to Our Application!
						
						Hello ${name},
						
						Your account has been created. Please use the following credentials to log in:
						
						Email: ${email}
						Temporary Password: ${tempPassword}
						
						Note: You will be prompted to change your password upon first login.
						
						To get started, please visit: ${appUrl}
						
						If you have any questions, please contact our support team.
						
						Thank you,
						The node.js Team
					`
				}
			},
			Subject: {
				Charset: "UTF-8",
				Data: "Welcome to Task Management System - Your Account Details"
			}
		},
		Source: process.env.SES_SENDER_EMAIL
	};

	try {
		await ses.sendEmail(emailParams).promise();
		console.log(`Welcome email sent to ${email}`);
	} catch (error) {
		console.error("Error sending welcome email:", error);
		// We don't want to fail the whole user creation process if the email fails
		// but we do want to log the error
	}
}

module.exports = { generateSecurePassword, getCookies, sendWelcomeEmail };
