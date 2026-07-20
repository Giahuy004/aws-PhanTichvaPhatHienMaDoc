/**
 * Download & Start DynamoDB Local - Tự động tải và chạy DynamoDB Local
 * 
 * Chạy: node scripts/start-dynamodb-local.js
 * Yêu cầu: Java 8+ (đã kiểm tra: Java 23 có sẵn)
 * 
 * Script sẽ:
 * 1. Tải DynamoDB Local JAR từ AWS (nếu chưa có)
 * 2. Giải nén
 * 3. Chạy DynamoDB Local tại http://localhost:8000
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const DYNAMODB_DIR = path.join(__dirname, '..', '.dynamodb-local');
const JAR_PATH = path.join(DYNAMODB_DIR, 'DynamoDBLocal.jar');
const DOWNLOAD_URL = 'https://d1ni2b6xgvw0s0.cloudfront.net/v2.x/dynamodb_local_latest.zip';
const ZIP_PATH = path.join(DYNAMODB_DIR, 'dynamodb_local.zip');
const PORT = 8000;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`📥 Đang tải DynamoDB Local từ AWS...`);
    console.log(`   URL: ${url}`);
    
    const file = fs.createWriteStream(dest);
    
    const request = (url) => {
      https.get(url, (response) => {
        // Handle redirect
        if (response.statusCode === 301 || response.statusCode === 302) {
          request(response.headers.location);
          return;
        }
        
        if (response.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${response.statusCode}`));
          return;
        }

        const totalSize = parseInt(response.headers['content-length'] || '0', 10);
        let downloaded = 0;

        response.on('data', (chunk) => {
          downloaded += chunk.length;
          if (totalSize > 0) {
            const pct = Math.round((downloaded / totalSize) * 100);
            process.stdout.write(`\r   Tiến trình: ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)} MB)`);
          }
        });

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log(`\n✅ Tải xong!`);
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    };
    
    request(url);
  });
}

function extractZip(zipPath, destDir) {
  console.log(`📦 Đang giải nén...`);
  
  // Dùng PowerShell Expand-Archive trên Windows
  try {
    execSync(
      `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`,
      { stdio: 'pipe' }
    );
    console.log(`✅ Giải nén thành công!`);
  } catch (err) {
    // Fallback: thử dùng jar command
    try {
      execSync(`jar xf "${zipPath}"`, { cwd: destDir, stdio: 'pipe' });
      console.log(`✅ Giải nén thành công (jar)!`);
    } catch {
      throw new Error(`Không thể giải nén: ${err.message}`);
    }
  }
}

async function startDynamoDB() {
  ensureDir(DYNAMODB_DIR);

  // Tải nếu chưa có JAR
  if (!fs.existsSync(JAR_PATH)) {
    console.log(`\n⚠️  DynamoDB Local chưa được tải.`);
    
    try {
      await downloadFile(DOWNLOAD_URL, ZIP_PATH);
      extractZip(ZIP_PATH, DYNAMODB_DIR);
      
      // Cleanup zip
      if (fs.existsSync(ZIP_PATH)) {
        fs.unlinkSync(ZIP_PATH);
      }
    } catch (err) {
      console.error(`\n❌ Không thể tải DynamoDB Local: ${err.message}`);
      console.error(`\n💡 Tải thủ công:`);
      console.error(`   1. Truy cập: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.DownloadingAndRunning.html`);
      console.error(`   2. Tải file ZIP`);
      console.error(`   3. Giải nén vào: ${DYNAMODB_DIR}`);
      process.exit(1);
    }
  }

  if (!fs.existsSync(JAR_PATH)) {
    console.error(`❌ Không tìm thấy DynamoDBLocal.jar tại: ${JAR_PATH}`);
    console.error(`   Hãy tải lại: xóa thư mục ${DYNAMODB_DIR} và chạy lại script.`);
    process.exit(1);
  }

  // Chạy DynamoDB Local
  console.log(`\n🚀 Đang khởi động DynamoDB Local...`);
  console.log(`   Port: ${PORT}`);
  console.log(`   JAR: ${JAR_PATH}\n`);

  const libPath = path.join(DYNAMODB_DIR, 'DynamoDBLocal_lib');
  
  const proc = spawn('java', [
    `-Djava.library.path=${libPath}`,
    '-jar', JAR_PATH,
    '-sharedDb',
    '-port', String(PORT),
  ], {
    cwd: DYNAMODB_DIR,
    stdio: 'inherit',
  });

  proc.on('error', (err) => {
    console.error(`❌ Không thể chạy DynamoDB Local: ${err.message}`);
    console.error(`   Kiểm tra Java: java -version`);
    process.exit(1);
  });

  proc.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`\n❌ DynamoDB Local dừng với code: ${code}`);
      if (code === 1) {
        console.error(`   Port ${PORT} có thể đang bị sử dụng.`);
        console.error(`   Thử: netstat -ano | findstr :${PORT}`);
      }
    }
  });

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    console.log(`\n🛑 Đang dừng DynamoDB Local...`);
    proc.kill();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    proc.kill();
    process.exit(0);
  });

  // Đợi DynamoDB sẵn sàng
  await new Promise((resolve) => setTimeout(resolve, 2000));
  console.log(`\n✅ DynamoDB Local đang chạy tại: http://localhost:${PORT}`);
  console.log(`\n💡 Mở terminal mới và chạy:`);
  console.log(`   cd backend`);
  console.log(`   npm run db:setup    # Tạo bảng`);
  console.log(`   npm run db:seed     # Seed dữ liệu`);
  console.log(`   npm run start:local # Chạy API server\n`);
}

startDynamoDB();
