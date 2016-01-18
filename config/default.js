module.exports = {
  "HOST_IP": "192.168.99.100",
  "API_URL": "http://localhost:3500",
  "APP_DEFAULTS": {
    "TIMEOUT": 3000,
    "HTTP_PORT": 8080
  },
  "AMQP_URL": "amqp://guest:guest@localhost:5672",
  "SUBMISSION_QUEUE_NAME": "submissions",
  "MAX_PARALLEL_TESTS": 1,
  "LOG_LEVEL": "debug",
  "UNIQUE_STRING_LENGTH": 20,
  "AWS_ACCESS_KEY": process.env.AWS_ACCESS_KEY,
  "AWS_SECRET_KEY": process.env.AWS_SECRET_KEY,
  "S3_BUCKET": "restcoder-logs",
  "AWS_REGION": "eu-central-1"
};