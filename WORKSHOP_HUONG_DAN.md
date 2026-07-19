# PHÂN CÔNG VIỆC & HƯỚNG DẪN TỪNG BƯỚC

## BẢNG PHÂN CÔNG

| Thành viên | Việc được giao | AWS Services |
|---|---|---|
| **Giahuy (BE)** | Backend Serverless (Lambda, API Gateway, SQS, Step Functions, DynamoDB) | Lambda, API Gateway, SQS, Step Functions, DynamoDB |
| **Tumy (FE)** | Frontend (React, Cognito Auth, S3 Upload) | Cognito, S3 |

---

## TỔNG QUAN KIẾN TRÚC HỆ THỐNG

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React + Vite)                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Login    │  │ Register │  │ Dashboard    │  │ FileUpload   │ │
│  │ (Cognito)│  │ (Cognito)│  │ (History)    │  │ (S3)        │ │
│  └────┬─────┘  └────┬─────┘  └──────┬───────┘  └──────┬───────┘ │
│       └──────────────┴──────────────┴─────────────────┘        │
│                              │                                  │
│                    ┌─────────▼──────────┐                       │
│                    │ backendApi.ts     │                        │
│                    │ (API Gateway)     │                        │
│                    └─────────┬──────────┘                       │
└──────────────────────────────┼──────────────────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │            AWS CLOUD                      │
         │                                           │
         │  ┌──────────────────────────┐             │
         │  │   API Gateway (REST)     │             │
         │  │  POST /upload             │             │
         │  │  GET /get-result/{fileId} │             │
         │  │  GET /history             │             │
         │  └──────────┬───────────────┘             │
         │             │                             │
         │  ┌──────────▼───────────────┐             │
         │  │   Lambda Functions       │             │
         │  │  upload                  │             │
         │  │  results                 │             │
         │  │  history                 │             │
         │  │  s3Handler (S3 Event)    │             │
         │  │  processor (SQS Event)    │             │
         │  │  validateUpload           │             │
         │  │  runAnalysis             │             │
         │  │  notifyUser              │             │
         │  └──────────┬───────────────┘             │
         │             │                             │
         │  ┌──────────▼───────────────┐             │
         │  │ Step Functions Workflow  │             │
         │  │ (Validate → Analyze →    │             │
         │  │  Notify)                 │             │
         │  └──────────┬───────────────┘             │
         │             │                             │
         │  ┌──────────▼───────┐  ┌──────────────────▼──┐
         │  │    S3 Bucket     │  │     SQS Queue       │
         │  │ (malware samples)│  │ (analysis queue)   │
         │  └──────────────────┘  └──────────┬─────────┘
         │                                    │
         │  ┌──────────────────────────────────▼──────┐
         │  │          DynamoDB Table                  │
         │  │    (fileId, userId, status,             │
         │  │     threatLevel, results)              │
         │  └─────────────────────────────────────────┘
         │                                           │
         │  ┌──────────────────────────────────────────┐
         │  │   Amazon Cognito                         │
         │  │  (User Pool, Auth, Email Verification)  │
         │  └──────────────────────────────────────────┘
         └─────────────────────────────────────────────────┘
```

---

## BƯỚC 1: CÀI ĐẶT MÔI TRƯỜNG & CLONE PROJECT

**Mục tiêu:** Clone source code từ GitHub, cài đặt dependencies.

### Hướng dẫn:

```
1. Mở terminal, clone repository:
   git clone https://github.com/Giahuy004/aws-PhanTichvaPhatHienMaDoc.git

2. Di chuyển vào thư mục:
   cd aws-PhanTichvaPhatHienMaDoc

3. Checkout branch fe+be (chứa toàn bộ code):
   git checkout fe+be

4. Cài đặt dependencies:
   cd backend && npm install
   cd .. && npm install
```

### Kết quả mong đợi:
- Thư mục `backend/` chứa SAM template + 8 Lambda functions
- Thư mục `src/` chứa React frontend với Cognito + S3

---

## BƯỚC 2: CẤU HÌNH AWS COGNITO (Frontend)

**Mục tiêu:** Tạo User Pool để xác thực người dùng.

### Hướng dẫn chi tiết:

```
1. Đăng nhập AWS Console → Services → Cognito

2. Click "Create user pool"
   - Pool name: MalwareDetectionUsers
   - Provider type: AWS Cognito default
   - Allow email: ✅
   - Required attributes: email, name

3. Configure password policy:
   - Minimum length: 8
   - Require uppercase: ✅
   - Require lowercase: ✅
   - Require numbers: ✅
   - Require special characters: ✅

4. Configure sign-up experience:
   - ✅ Allow email aliases
   - Require email verification: ✅

5. App integration:
   - Domain name: tạo domain riêng
   - User pool client: tạo app client
   - ⚠️ BỎ TICK "Generate client secret"
     (client secret KHÔNG cần cho frontend)

6. Review và Create → Lấy:
   - User Pool ID: ap-southeast-1_XXXXXXXXX
   - App Client ID: xxxxxxxxxxxxxxxxxxxxxxxxxx
```

### File liên quan trong project:
- `src/services/cognitoService.ts` - Gọi Cognito SDK
- `src/contexts/AuthContext.tsx` - Quản lý auth state
- `src/pages/auth/LoginPage.tsx` - Trang đăng nhập
- `src/pages/auth/RegisterPage.tsx` - Trang đăng ký

---

## BƯỚC 3: CẤU HÌNH AWS S3 (Frontend & Backend)

**Mục tiêu:** Tạo S3 bucket để lưu trữ file malware.

### Hướng dẫn chi tiết:

```
1. AWS Console → Services → S3 → Create bucket

2. Bucket configuration:
   - Bucket name: malware-analysis-<your-name>
   - Region: Asia Pacific (Singapore) - ap-southeast-1
   - Enable versioning: ✅
   - Enable server-side encryption: ✅ (AES256)
   - Block all public access: ✅

3. CORS Configuration (Properties → CORS):
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
        "AllowedOrigins": ["http://localhost:3000"],
        "ExposeHeaders": ["ETag"]
    }
]

4. IAM Policy cho upload (tạo mới IAM Role):
{
    "Version": "2012-10-17",
    "Statement": [{
        "Sid": "AllowS3Upload",
        "Effect": "Allow",
        "Action": ["s3:PutObject", "s3:GetObject",
                   "s3:DeleteObject", "s3:ListBucket"],
        "Resource": [
            "arn:aws:s3:::your-bucket-name",
            "arn:aws:s3:::your-bucket-name/*"
        ]
    }]
}
```

### File liên quan:
- `src/services/s3Service.ts` - Upload/presigned URL
- `backend/src/functions/upload/app.js` - Backend tạo presigned URL

---

## BƯỚC 4: CẤU HÌNH CREDENTIALS (.env)

**Mục tiêu:** Điền thông tin AWS vào file môi trường.

### Hướng dẫn:

```bash
cp .env.example .env
```

### Nội dung file `.env`:

```env
# Backend API
VITE_BACKEND_API_URL=https://<api-id>.execute-api.ap-southeast-1.amazonaws.com/dev

# AWS Region
VITE_AWS_REGION=ap-southeast-1

# Cognito
VITE_COGNITO_USER_POOL_ID=ap-southeast-1_xxxxxxxxx
VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx

# S3
VITE_S3_BUCKET_NAME=malware-analysis-<your-name>

# Identity Pool
VITE_IDENTITY_POOL_ID=ap-southeast-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### File liên quan:
- `src/config/aws.ts` - Load biến môi trường

---

## BƯỚC 5: DEPLOY BACKEND (SAM)

**Mục tiêu:** Triển khai backend serverless lên AWS.

### Hướng dẫn chi tiết:

```bash
# 1. Cài đặt AWS SAM CLI (nếu chưa có)
# macOS: brew install aws-sam-cli
# Windows: tải từ https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html

# 2. Cấu hình AWS credentials
aws configure

# 3. Build SAM template
cd backend
sam build

# 4. Deploy (lần đầu cần --guided để cấu hình)
sam deploy --guided

# Các thông số khi deploy:
# - Stack Name: malware-detection-backend
# - Environment: dev
# - S3BucketName: malware-analysis-<your-name>
# - Allow SAM CLI IAM role creation: YES
# - Disable rollback: NO
```

### Kết quả sau deploy:
```
Outputs:
  ApiUrl: https://<api-id>.execute-api.ap-southeast-1.amazonaws.com/dev
  S3Bucket: malware-analysis-<your-name>-dev
  AnalysisQueueUrl: https://sqs.ap-southeast-1.amazonaws.com/...
  ResultsTable: malware-analysis-results-dev
```

### AWS Resources được tạo:
| Service | Tên resource |
|---|---|
| API Gateway | `malware-detection-api-dev` |
| Lambda | `malware-analysis-upload-dev` |
| Lambda | `malware-analysis-results-dev` |
| Lambda | `malware-analysis-history-dev` |
| Lambda | `malware-analysis-s3-handler-dev` |
| Lambda | `malware-analysis-processor-dev` |
| Lambda | `malware-analysis-validate-dev` |
| Lambda | `malware-analysis-run-dev` |
| Lambda | `malware-analysis-notify-dev` |
| S3 | `malware-analysis-<name>-dev` |
| SQS | `malware-analysis-queue-dev` |
| DynamoDB | `malware-analysis-results-dev` |
| Step Functions | `malware-analysis-workflow-dev` |

---

## BƯỚC 6: CHẠY FRONTEND

**Mục tiêu:** Khởi chạy ứng dụng web trên localhost.

### Hướng dẫn:

```bash
# Từ thư mục gốc project
npm install
npm run dev

# Mở trình duyệt: http://localhost:3000
```

### Các trang chính:
| Route | Chức năng |
|---|---|
| `/login` | Đăng nhập với Cognito |
| `/register` | Đăng ký tài khoản |
| `/dashboard` | Dashboard + upload file |
| `/forgot-password` | Quên mật khẩu |

---

## BƯỚC 7: TEST LUỒNG HOÀN CHỈNH

### Luồng 1: Đăng ký & Đăng nhập
```
1. Truy cập http://localhost:3000/register
2. Điền: email, password, name
3. Nhấn Register → nhận email verification code
4. Điền code → xác nhận tài khoản
5. Redirect sang /login
6. Đăng nhập → vào Dashboard
```

### Luồng 2: Upload & Phân tích malware
```
1. Từ Dashboard, chọn file malware mẫu (.exe, .dll, .bat, .ps1)
2. Nhấn Upload
3. Frontend gọi POST /upload → nhận presigned URL
4. Frontend PUT file lên S3
5. S3 Event Lambda tự động kích hoạt
6. Step Functions workflow chạy:
   ValidateUpload → RunAnalysis → NotifyUser
7. Dashboard polling GET /history mỗi 5 giây
8. Kết quả hiển thị: threatLevel (safe/low/medium/high/critical)
```

---

## CẤU TRÚC FILE TRONG PROJECT

```
aws-PhanTichvaPhatHienMaDoc/
│
├── src/                          # Frontend (React)
│   ├── App.tsx                   # Router + Auth layout
│   ├── main.tsx                  # Entry point
│   ├── index.css                 # Tailwind styles
│   ├── config/
│   │   └── aws.ts                # AWS config từ .env
│   ├── contexts/
│   │   └── AuthContext.tsx       # Auth state management
│   ├── services/
│   │   ├── backendApi.ts         # Gọi API Gateway
│   │   ├── cognitoService.ts     # Cognito SDK (SignUp, SignIn...)
│   │   ├── s3Service.ts          # S3 presigned URL + upload
│   │   └── tokenService.ts       # Token management
│   ├── components/
│   │   └── FileUpload.tsx        # Upload UI + progress
│   └── pages/
│       ├── DashboardPage.tsx      # Dashboard + history
│       └── auth/
│           ├── LoginPage.tsx
│           ├── RegisterPage.tsx
│           └── ForgotPasswordPage.tsx
│
├── backend/                      # Backend (AWS SAM)
│   ├── template.yaml             # SAM template (IaC)
│   ├── samconfig.toml            # SAM deploy config
│   ├── package.json
│   ├── src/
│   │   ├── functions/
│   │   │   ├── upload/
│   │   │   │   └── app.js        # POST /upload
│   │   │   ├── results/
│   │   │   │   └── app.js        # GET /get-result/{fileId}
│   │   │   ├── history/
│   │   │   │   └── app.js        # GET /history
│   │   │   ├── s3Handler/
│   │   │   │   └── app.js        # S3 Event trigger
│   │   │   ├── processor/
│   │   │   │   └── app.js        # SQS Queue consumer
│   │   │   ├── validateUpload/
│   │   │   │   └── app.js        # Step Functions step
│   │   │   ├── runAnalysis/
│   │   │   │   └── app.js        # Step Functions step
│   │   │   └── notifyUser/
│   │   │       └── app.js        # Step Functions step
│   │   └── statemachine/
│   │       └── analysis-workflow.asl.json  # Step Functions
│   ├── deploy/
│   │   └── zip-lambdas.ps1       # PowerShell deploy script
│   └── test-api.ps1              # Test API endpoints
│
├── AWS_SETUP_GUIDE.md            # Hướng dẫn setup AWS
├── INTEGRATION.md                # Tài liệu tích hợp
└── README.md                     # Project overview
```

---

## CÁC LỖI THƯỜNG GẶP

| Lỗi | Nguyên nhân | Cách sửa |
|---|---|---|
| CORS error khi upload | CORS chưa đúng | Kiểm tra CORS trong S3 bucket |
| "User not confirmed" | Email chưa verify | Check email, nhập verification code |
| 401 Unauthorized | Token hết hạn | Refresh token hoặc đăng nhập lại |
| SAM deploy failed | Thiếu IAM permissions | Kiểm tra AWS credentials + IAM role |
| Presigned URL expired | Quá 1 giờ | Lambda tạo URL với `expiresIn: 3600` |

---

## CHECKLIST HOÀN THÀNH WORKSHOP

- [ ] Clone project từ GitHub
- [ ] Checkout branch fe+be
- [ ] Cài đặt dependencies (npm install)
- [ ] Tạo Cognito User Pool + lấy Pool ID, Client ID
- [ ] Tạo S3 Bucket + CORS + IAM Policy
- [ ] Tạo Identity Pool (optional)
- [ ] Cấu hình file `.env`
- [ ] Deploy backend bằng SAM CLI
- [ ] Lấy API Gateway URL từ CloudFormation output
- [ ] Cập nhật `VITE_BACKEND_API_URL` vào `.env`
- [ ] Chạy frontend: `npm run dev`
- [ ] Test đăng ký → nhận email → xác nhận
- [ ] Test đăng nhập → vào Dashboard
- [ ] Test upload file → nhận kết quả phân tích

---

## LIÊN HỆ & HỖ TRỢ

- GitHub: https://github.com/Giahuy004/aws-PhanTichvaPhatHienMaDoc
- Branch: `fe+be`
- AWS Region: ap-southeast-1 (Singapore)
