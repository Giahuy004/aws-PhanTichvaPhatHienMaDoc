/**
 * Delete DynamoDB Local Table - Xóa bảng để reset
 * 
 * Chạy: node scripts/delete-local-db.js
 */

const { DynamoDBClient, DeleteTableCommand, ListTablesCommand } = require('@aws-sdk/client-dynamodb');
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

async function deleteTable() {
  console.log(`\n🗑️  Đang xóa bảng "${TABLE_NAME}"...`);

  // Kiểm tra bảng có tồn tại không
  try {
    const { TableNames } = await client.send(new ListTablesCommand({}));
    if (!TableNames || !TableNames.includes(TABLE_NAME)) {
      console.log(`⚠️  Bảng "${TABLE_NAME}" không tồn tại. Không cần xóa.`);
      return;
    }
  } catch (err) {
    console.error(`❌ Không thể kết nối tới DynamoDB Local tại ${ENDPOINT}`);
    process.exit(1);
  }

  try {
    await client.send(new DeleteTableCommand({ TableName: TABLE_NAME }));
    console.log(`✅ Đã xóa bảng "${TABLE_NAME}" thành công!`);
  } catch (err) {
    console.error(`❌ Lỗi khi xóa bảng: ${err.message}`);
    process.exit(1);
  }
}

deleteTable();
