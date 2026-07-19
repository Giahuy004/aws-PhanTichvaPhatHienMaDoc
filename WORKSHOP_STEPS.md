# HƯỚNG DẪN DEPLOY BACKEND (THỦ CÔNG - AWS CONSOLE)

## YÊU CẦU GỐC → ĐÃ CHUYỂN SANG NODE.JS

| Yêu cầu gốc (Python) | Chuyển sang |
|---|---|
| `malware_scanner.py` | 8 Lambda Functions (Node.js 18+) |
| URL/File Input | S3 Upload + API Gateway |
| Heuristic scan patterns | Step Functions Workflow |
| Threat level/count | DynamoDB + Frontend polling |

---

## TỔNG QUAN LUỒNG

```
[1] Frontend → POST /upload → API Gateway → Lambda Upload
[2] Lambda Upload → Tạo presigned URL + fileId → Frontend
[3] Frontend → PUT file → S3
[4] S3 Event → Lambda S3Handler
[5] S3Handler → Gửi message → SQS Queue
[6] SQS → Lambda Processor
[7] Processor → Khởi chạy Step Functions
[8] Step Functions: Validate → Analysis → Notify
[9] DynamoDB → Lưu kết quả
[10] Frontend → GET /history → Hiển thị
```

---

## BƯỚC 1: CHUẨN BỊ

### 1.1 Cài đặt
```bash
# Node.js 18+
node --version  # nên là 18.x trở lên

# AWS CLI
aws --version
aws configure
# Nhập: Access Key, Secret Key, Region: ap-southeast-1
```

### 1.2 Clone & Setup
```bash
cd D:\
git clone https://github.com/Giahuy004/aws-PhanTichvaPhatHienMaDoc.git
cd aws-PhanTichvaPhatHienMaDoc
git checkout fe+be
npm install

cd backend
npm install
```

### 1.3 Zip Lambda code
```bash
cd backend
powershell -ExecutionPolicy Bypass -File deploy\zip-lambdas.ps1

# Output: dist/*.zip (8 files)
```

---

## BƯỚC 2: TẠO S3 BUCKET

```
S3 → Create bucket
  Name: malware-analysis-<your-name>-dev
  Region: ap-southeast-1

→ Properties → Versioning: Enable

→ Permissions → CORS → Paste:
```
```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "PUT", "POST"],
        "AllowedOrigins": ["http://localhost:3000"],
        "ExposeHeaders": ["ETag"]
    }
]
```
```

→ Block public access: OFF (hoặc policy cho presigned URL)

→ Save
```

---

## BƯỚC 3: TẠO DYNAMODB TABLE

```
DynamoDB → Create table
  Table name: malware-analysis-results-dev
  Partition key: fileId (String)
  Table class: Standard
  Billing: On-demand

→ Create

→ Create GSI:
  Index name: userId-index
  Partition key: userId (String)
  Sort key: createdAt (String)
  Projected attributes: All

→ Create index
```

---

## BƯỚC 4: TẠO SQS QUEUE

```
SQS → Create queue
  Name: malware-analysis-queue-dev
  Type: Standard
  Configuration:
    Visibility timeout: 6 min
    Message retention: 4 days
    ☑ Use dead-letter queue
    Dead-letter queue: malware-analysis-dlq-dev
    Max receives: 3

→ Create

Tạo DLQ:
  Name: malware-analysis-dlq-dev
  Same config

→ Create
```

**Lưu Queue URL:**
```
https://sqs.ap-southeast-1.amazonaws.com/<account-id>/malware-analysis-queue-dev
```

---

## BƯỚC 5: TẠO IAM ROLES

### 5.1 Role cho Lambda (1 role dùng chung)
```
IAM → Roles → Create role
  Trusted entity: Lambda
  Permissions:
    ☑ AmazonS3FullAccess
    ☑ AmazonDynamoDBFullAccess
    ☑ AmazonSQSFullAccess
    ☑ CloudWatchLogsFullAccess
    ☑ AWSLambdaBasicExecutionRole

  Role name: malware-analysis-lambda-role-dev
→ Create
```

### 5.2 Role cho Step Functions
```
IAM → Roles → Create role
  Trusted entity: Step Functions
  Permissions:
    ☑ AWSLambdaRole
    ☑ AmazonDynamoDBFullAccess
    ☑ CloudWatchLogsFullAccess

  Role name: malware-analysis-stepfunctions-role-dev
→ Create
```

---

## BƯỚC 6: TẠO LAMBDA FUNCTIONS (8 CÁI)

### 6.1 Lambda: upload
```
Lambda → Create function
  Name: malware-analysis-upload-dev
  Runtime: Node.js 22.x
  Role: malware-analysis-lambda-role-dev
  Code: dist/upload.zip

Environment variables:
  RESULTS_TABLE = malware-analysis-results-dev
  S3_BUCKET_NAME = malware-analysis-<your-name>-dev
  STATE_MACHINE_ARN = arn:aws:states:ap-southeast-1:<id>:stateMachine:malware-analysis-workflow-dev

Settings:
  Timeout: 30s
  Memory: 512MB
→ Create
```

### 6.2 Lambda: results
```
Lambda → Create function
  Name: malware-analysis-results-dev
  Runtime: Node.js 22.x
  Role: malware-analysis-lambda-role-dev
  Code: dist/results.zip

Environment variables:
  RESULTS_TABLE = malware-analysis-results-dev

Settings: Timeout 30s, Memory 256MB
→ Create
```

### 6.3 Lambda: history
```
Lambda → Create function
  Name: malware-analysis-history-dev
  Runtime: Node.js 22.x
  Role: malware-analysis-lambda-role-dev
  Code: dist/history.zip

Environment variables:
  RESULTS_TABLE = malware-analysis-results-dev

Settings: Timeout 30s, Memory 256MB
→ Create
```

### 6.4 Lambda: s3Handler
```
Lambda → Create function
  Name: malware-analysis-s3-handler-dev
  Runtime: Node.js 22.x
  Role: malware-analysis-lambda-role-dev
  Code: dist/s3Handler.zip

Environment variables:
  ANALYSIS_QUEUE_URL = https://sqs.ap-southeast-1.amazonaws.com/<id>/malware-analysis-queue-dev
  STATE_MACHINE_ARN = arn:aws:states:ap-southeast-1:<id>:stateMachine:malware-analysis-workflow-dev
  S3_BUCKET_NAME = malware-analysis-<your-name>-dev

Settings: Timeout 30s, Memory 256MB
→ Create
```

### 6.5 Lambda: processor
```
Lambda → Create function
  Name: malware-analysis-processor-dev
  Runtime: Node.js 22.x
  Role: malware-analysis-lambda-role-dev
  Code: dist/processor.zip

Environment variables:
  STATE_MACHINE_ARN = arn:aws:states:ap-southeast-1:<id>:stateMachine:malware-analysis-workflow-dev
  RESULTS_TABLE = malware-analysis-results-dev

Settings: Timeout 60s, Memory 512MB
→ Create
```

### 6.6 Lambda: validateUpload
```
Lambda → Create function
  Name: malware-analysis-validateUpload-dev
  Runtime: Node.js 22.x
  Role: malware-analysis-lambda-role-dev
  Code: dist/validateUpload.zip

Environment variables:
  RESULTS_TABLE = malware-analysis-results-dev
  S3_BUCKET_NAME = malware-analysis-<your-name>-dev

Settings: Timeout 30s, Memory 256MB
→ Create
```

### 6.7 Lambda: runAnalysis
```
Lambda → Create function
  Name: malware-analysis-runAnalysis-dev
  Runtime: Node.js 22.x
  Role: malware-analysis-lambda-role-dev
  Code: dist/runAnalysis.zip

Environment variables:
  S3_BUCKET_NAME = malware-analysis-<your-name>-dev

Settings: Timeout 60s, Memory 512MB
→ Create
```

### 6.8 Lambda: notifyUser
```
Lambda → Create function
  Name: malware-analysis-notifyUser-dev
  Runtime: Node.js 22.x
  Role: malware-analysis-lambda-role-dev
  Code: dist/notifyUser.zip

Settings: Timeout 30s, Memory 256MB
→ Create
```

---

## BƯỚC 7: TẠO STEP FUNCTIONS

```
Step Functions → State machines → Create

Name: malware-analysis-workflow-dev
Type: Standard

Definition → Write your workflow as code:

```json
{
  "Comment": "Malware Analysis Workflow",
  "StartAt": "ValidateUpload",
  "States": {
    "ValidateUpload": {
      "Type": "Task",
      "Resource": "${ValidateFunctionArn}",
      "Next": "RunAnalysis"
    },
    "RunAnalysis": {
      "Type": "Task",
      "Resource": "${RunAnalysisFunctionArn}",
      "Next": "NotifyUser"
    },
    "NotifyUser": {
      "Type": "Task",
      "Resource": "${NotifyFunctionArn}",
      "End": true
    }
  }
}
```

Role: malware-analysis-stepfunctions-role-dev

→ Create

Lưu ARN:
arn:aws:states:ap-southeast-1:<id>:stateMachine:malware-analysis-workflow-dev
```

---

## BƯỚC 8: TẠO API GATEWAY

### 8.1 Create REST API
```
API Gateway → Create API → REST API
  Name: malware-detection-api-dev
  Endpoint type: Regional
→ Create
```

### 8.2 Resource: /upload
```
Actions → Create Resource
  Resource name: upload
  Resource path: /upload
→ Create Resource

Actions → Create Method
  POST
  Integration type: Lambda Function Proxy
  Lambda function: malware-analysis-upload-dev
→ Save

Actions → Enable CORS
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Headers: Content-Type,Authorization
  Access-Control-Allow-Methods: POST,OPTIONS
→ Save
```

### 8.3 Resource: /history
```
Actions → Create Resource
  Resource name: history
  Resource path: /history
→ Create

Actions → Create Method
  GET
  Lambda Function: malware-analysis-history-dev
→ Save

Actions → Enable CORS (same as above)
```

### 8.4 Resource: /get-result/{fileId}
```
Actions → Create Resource
  Resource name: get-result
  Resource path: /get-result/{fileId}
→ Create

Actions → Create Method
  GET
  Lambda Function: malware-analysis-results-dev
→ Save

Actions → Enable CORS
```

### 8.5 Deploy API
```
Actions → Deploy API
  Deployment stage: dev
  Stage description: Development
→ Deploy

Copy Invoke URL:
https://<id>.execute-api.ap-southeast-1.amazonaws.com/dev
```

---

## BƯỚC 9: CẤU HÌNH TRIGGERS

### 9.1 S3 → Lambda (s3Handler)
```
Vào S3 bucket → Properties → Event notifications → Create

  Name: upload-event
  Event types: ☑ All object create events
  Destination: Lambda function
  Lambda function: malware-analysis-s3-handler-dev

→ Save
```

### 9.2 (Optional) EventBridge Pipe cho SQS → Processor
```
EventBridge → Pipes → Create pipe
  Source: SQS malware-analysis-queue-dev
  Target: Lambda malware-analysis-processor-dev
→ Create
```

---

## BƯỚC 10: CẬP NHẬT .ENV

```bash
cd D:\aws-PhanTichvaPhatHienMaDoc
code .env
```

```env
VITE_BACKEND_API_URL=https://<api-id>.execute-api.ap-southeast-1.amazonaws.com/dev
VITE_AWS_REGION=ap-southeast-1
VITE_S3_BUCKET_NAME=malware-analysis-<your-name>-dev
VITE_COGNITO_USER_POOL_ID=ap-southeast-1_xxxxxxx
VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxx
VITE_IDENTITY_POOL_ID=
```

---

## BƯỚC 11: CHẠY TEST

```bash
npm run dev
```

Mở: http://localhost:3000

---

## CHECKLIST

- [ ] aws configure ✅
- [ ] npm install ✅
- [ ] powershell deploy\zip-lambdas.ps1 ✅
- [ ] S3 Bucket + CORS ✅
- [ ] DynamoDB Table + GSI ✅
- [ ] SQS Queue + DLQ ✅
- [ ] IAM Roles (Lambda, Step Functions) ✅
- [ ] 8 Lambda Functions ✅
- [ ] Step Functions ✅
- [ ] API Gateway (3 endpoints) ✅
- [ ] S3 Event → Lambda ✅
- [ ] Update .env ✅
- [ ] npm run dev ✅
- [ ] Test upload + history ✅
