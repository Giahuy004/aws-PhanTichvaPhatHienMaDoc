# Hướng Dẫn Cài Đặt AWS CLI

## 1. Cài đặt AWS CLI v2

### Windows
1. Tải AWS CLI MSI Installer:
   - Link: https://awscli.amazonaws.com/AWSCLIV2.msi
2. Chạy file MSI và làm theo hướng dẫn
3. Mở PowerShell/CMD mới và kiểm tra:
   ```powershell
   aws --version
   # Kết quả: aws-cli/2.x.x Python/3.x.x Windows/...
   ```

### macOS
```bash
curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
sudo installer -pkg AWSCLIV2.pkg -target /
```

### Linux
```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

---

## 2. Tạo IAM User trên AWS Console

1. Đăng nhập AWS Console: https://console.aws.amazon.com
2. Vào **IAM** → **Users** → **Create user**
3. Điền thông tin:
   - **User name**: `malware-detection-dev`
   - ✅ Provide user access to the AWS Management Console (tùy chọn)
4. **Set permissions** → **Attach policies directly**:
   - Chọn `AmazonDynamoDBFullAccess`
   - Chọn `AmazonS3FullAccess`
   - Chọn `AWSLambda_FullAccess` (nếu deploy Lambda)
   - Chọn `AmazonSQSFullAccess` (nếu dùng SQS)
   - Hoặc đơn giản: `AdministratorAccess` (cho dev, **KHÔNG dùng cho production**)
5. **Create user** → **Create access key**:
   - Use case: **Command Line Interface (CLI)**
   - ✅ Confirmation
   - **LƯU LẠI Access Key và Secret Key** (chỉ hiển thị 1 lần!)

---

## 3. Cấu hình AWS CLI

Mở Terminal/PowerShell và chạy:

```powershell
aws configure
```

Nhập thông tin:
```
AWS Access Key ID [None]: AKIAIOSFODNN7EXAMPLE
AWS Secret Access Key [None]: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
Default region name [None]: ap-southeast-1
Default output format [None]: json
```

⚠️ **Thay thế** `AKIAIOSFODNN7EXAMPLE` và `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` bằng Access Key và Secret Key thực của bạn!

---

## 4. Verify cấu hình

Chạy lệnh kiểm tra:

```powershell
# Kiểm tra danh tính
aws sts get-caller-identity

# Kết quả mong đợi:
# {
#     "UserId": "AIDAI...",
#     "Account": "123456789012",
#     "Arn": "arn:aws:iam::123456789012:user/malware-detection-dev"
# }
```

```powershell
# Kiểm tra DynamoDB
aws dynamodb list-tables --region ap-southeast-1

# Kết quả mong đợi:
# {
#     "TableNames": []
# }
```

---

## 5. Tạo DynamoDB Table trên AWS

Sau khi cấu hình xong, chạy script:

```bash
cd backend
npm run db:create-aws
```

Hoặc dùng AWS CLI trực tiếp:

```powershell
aws dynamodb create-table `
  --table-name malware-analysis-results-dev `
  --attribute-definitions `
    AttributeName=fileId,AttributeType=S `
    AttributeName=userId,AttributeType=S `
  --key-schema `
    AttributeName=fileId,KeyType=HASH `
  --global-secondary-indexes `
    "[{\"IndexName\":\"userId-index\",\"KeySchema\":[{\"AttributeName\":\"userId\",\"KeyType\":\"HASH\"}],\"Projection\":{\"ProjectionType\":\"ALL\"}}]" `
  --billing-mode PAY_PER_REQUEST `
  --region ap-southeast-1
```

---

## Lưu ý bảo mật

⚠️ **QUAN TRỌNG**:
- **KHÔNG BAO GIỜ** commit Access Key/Secret Key lên Git
- Thêm vào `.gitignore`:
  ```
  .env
  .env.local
  ```
- Dùng **IAM Roles** cho production thay vì Access Key
- Xóa Access Key khi không cần thiết nữa
- Bật **MFA** cho IAM user
