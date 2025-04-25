# Task Management System - Backend

A serverless backend for a Task Management System built with AWS Lambda, API Gateway, Cognito, and DynamoDB.

## Project Overview

This backend system provides a secure and scalable API for managing tasks, users, and authentication. The architecture leverages AWS serverless services for high availability and cost-effectiveness.

### Key Features

- User authentication and authorization via AWS Cognito
- Task management with CRUD operations
- User management with role-based access controls (admin/member)
- Secure password handling and reset flows
- Notifications via AWS SNS

## Setup Instructions

### Prerequisites

- Node.js v14.x or later
- AWS CLI configured with appropriate credentials
- An AWS account with access to Lambda, API Gateway, Cognito, DynamoDB, and SNS

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-organization/tms-backend.git
   cd tms-backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create necessary AWS resources (if not already created):
   - Cognito User Pool and App Client
   - DynamoDB Tables
   - SNS Topics for notifications

4. Configure environment variables:
   ```bash
   # Create a .env file with your environment-specific values
   COGNITO_USER_POOL_ID=us-east-1_xxxxxxxx
   COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
   USERS_TABLE=tms-users
   ADMIN_GROUP_NAME=Admins
   MEMBER_GROUP_NAME=Members
   SUBSCRIBE_USER_STATE_MACHINE_ARN=arn:aws:states:region:account-id:stateMachine:name
   ENVIRONMENT=dev
   ```

5. Deploy the application (using your preferred deployment method, e.g., AWS SAM, Serverless Framework, or AWS CDK)

## Development Guide

### Project Structure

```
src/
├── auth/               # Authentication-related functions
├── users/              # User management functions
├── tasks/              # Task management functions
└── utils/              # Shared utilities and constants
```

### Running Locally

For testing functions locally:

```bash
# Run a specific function
node src/path/to/function.js
```

### Commit Convention

This project follows the [Conventional Commits](https://www.conventionalcommits.org/) specification for commit messages to maintain a clear history and automate version management.

#### Commit Types

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only changes
- **style**: Changes that do not affect the meaning of the code (formatting, etc.)
- **refactor**: Code changes that neither fix a bug nor add a feature
- **test**: Adding or correcting tests
- **chore**: Changes to the build process or auxiliary tools

#### Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

#### Examples

```bash
git commit -m "feat: implement user registration flow"
git commit -m "fix(auth): resolve token validation issue"
git commit -m "docs: update API documentation"
```

### Development Tools and Configuration

#### Code Quality Tools

The project uses the following tools to maintain code quality:

1. **Husky**: For git hooks
2. **Commitlint**: (Recommended) Helps you follow conventional commit messages for better readability and automation
3. **ESLint/Prettier**: (Recommended) For code style enforcement

#### IDE Recommendations

For VS Code users, install these extensions for a better development experience:

- ESLint
- Prettier
- AWS Toolkit
- Conventional Commits

Create a `.vscode/settings.json` file with:

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  // Optionally enable commitlint if you want commit message linting
  // "commitlint.enable": true,
  // "commitlint.rules": "@commitlint/config-conventional"
  // The following settings are recommended for a consistent workflow
}
```

## Deployment

The application is designed to be deployed as Lambda functions with API Gateway. Detailed deployment instructions will vary based on your chosen infrastructure-as-code tool (AWS SAM, Serverless Framework, etc.).

## Contributing

1. Create a feature branch from `main`
2. Make your changes following the coding standards
3. Ensure all tests pass
4. Submit a pull request with a clear description of changes

## License

ISC
