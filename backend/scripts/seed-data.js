/**
 * Seed Data - Thêm dữ liệu mẫu thực tế vào DynamoDB
 * 
 * Chạy: node scripts/seed-data.js
 * Yêu cầu: Đã chạy setup-local-db.js trước
 */

const { DynamoDBClient, PutItemCommand, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { randomUUID } = require('crypto');
require('dotenv').config({ path: '.env.local' });

const ENDPOINT = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';
const TABLE_NAME = process.env.RESULTS_TABLE || 'malware-analysis-results-dev';
const REGION = process.env.AWS_REGION || 'ap-southeast-1';

const client = new DynamoDBClient({
  region: REGION,
  endpoint: ENDPOINT,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'fakeKey',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'fakeSecret',
  },
});

// Dữ liệu mẫu thực tế
const sampleData = [
  {
    fileName: 'setup_crack_v2.1.exe',
    status: 'malware',
    threatLevel: 'critical',
    threatType: 'Trojan.GenericKD.46789',
    fileSize: 2457600,
    hoursAgo: 2,
  },
  {
    fileName: 'report_Q3_2026.pdf',
    status: 'completed',
    threatLevel: 'safe',
    threatType: '',
    fileSize: 1048576,
    hoursAgo: 5,
  },
  {
    fileName: 'invoice_payment.js',
    status: 'malware',
    threatLevel: 'high',
    threatType: 'JS/Downloader.Agent',
    fileSize: 45200,
    hoursAgo: 8,
  },
  {
    fileName: 'windows_update_patch.exe',
    status: 'malware',
    threatLevel: 'critical',
    threatType: 'Ransom.WannaCry.Gen',
    fileSize: 5242880,
    hoursAgo: 12,
  },
  {
    fileName: 'company_logo_final.png',
    status: 'completed',
    threatLevel: 'safe',
    threatType: '',
    fileSize: 524288,
    hoursAgo: 24,
  },
  {
    fileName: 'macro_enabled_doc.docm',
    status: 'malware',
    threatLevel: 'medium',
    threatType: 'VBA/TrojanDownloader',
    fileSize: 312400,
    hoursAgo: 36,
  },
  {
    fileName: 'system_driver_update.dll',
    status: 'scanning',
    threatLevel: 'safe',
    threatType: '',
    fileSize: 1572864,
    hoursAgo: 0.5,
  },
  {
    fileName: 'free_vpn_setup.msi',
    status: 'malware',
    threatLevel: 'high',
    threatType: 'Adware.BrowseFox.Gen',
    fileSize: 8388608,
    hoursAgo: 48,
  },
  {
    fileName: 'backup_script.vbs',
    status: 'pending',
    threatLevel: 'safe',
    threatType: '',
    fileSize: 8900,
    hoursAgo: 0.1,
  },
  {
    fileName: 'meeting_notes.txt',
    status: 'completed',
    threatLevel: 'safe',
    threatType: '',
    fileSize: 2048,
    hoursAgo: 72,
  },
];

function getTimestamp(hoursAgo) {
  const date = new Date();
  date.setHours(date.getHours() - hoursAgo);
  return date.toISOString();
}

async function seedData() {
  console.log(`\n🌱 Đang seed dữ liệu vào bảng "${TABLE_NAME}"...`);
  console.log(`📡 DynamoDB endpoint: ${ENDPOINT}\n`);

  // Kiểm tra xem đã có data chưa
  try {
    const scanResult = await client.send(new ScanCommand({
      TableName: TABLE_NAME,
      Limit: 1,
    }));
    if (scanResult.Items && scanResult.Items.length > 0) {
      console.log(`⚠️  Bảng đã có dữ liệu. Đang thêm dữ liệu mẫu mới...`);
    }
  } catch (err) {
    console.error(`❌ Không thể đọc bảng "${TABLE_NAME}". Hãy chạy: npm run db:setup`);
    process.exit(1);
  }

  let successCount = 0;
  let errorCount = 0;

  for (const sample of sampleData) {
    const fileId = randomUUID();
    const createdAt = getTimestamp(sample.hoursAgo);
    const sanitizedName = sample.fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileKey = `samples/${Date.now()}_${sanitizedName}`;

    const item = {
      TableName: TABLE_NAME,
      Item: {
        fileId: { S: fileId },
        userId: { S: 'local-user' },
        fileName: { S: sample.fileName },
        fileKey: { S: fileKey },
        fileSize: { N: String(sample.fileSize) },
        status: { S: sample.status },
        threatLevel: { S: sample.threatLevel },
        threatType: { S: sample.threatType },
        createdAt: { S: createdAt },
        updatedAt: { S: createdAt },
      },
    };

    try {
      await client.send(new PutItemCommand(item));
      const statusIcon = {
        'completed': '✅',
        'malware': '🔴',
        'scanning': '🔄',
        'pending': '⏳',
      }[sample.status] || '❓';

      console.log(`  ${statusIcon} ${sample.fileName} (${sample.status}, ${sample.threatLevel})`);
      successCount++;
    } catch (err) {
      console.error(`  ❌ Lỗi khi thêm "${sample.fileName}": ${err.message}`);
      errorCount++;
    }
  }

  console.log(`\n📊 Kết quả: ${successCount} thành công, ${errorCount} lỗi`);
  console.log(`\n💡 Tiếp theo, chạy: npm run start:local`);
}

seedData();
