/**
 * Setup DynamoDB Local - Tạo bảng malware-analysis-results + users
 * 
 * Chạy: node scripts/setup-local-db.js
 * Yêu cầu: DynamoDB Local đang chạy tại http://localhost:8000
 */

const { DynamoDBClient, CreateTableCommand, ListTablesCommand } = require('@aws-sdk/client-dynamodb');
require('dotenv').config({ path: '.env.local' });

const ENDPOINT = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';
const RESULTS_TABLE = process.env.RESULTS_TABLE || 'malware-analysis-results-dev';
const USERS_TABLE = process.env.USERS_TABLE || 'users-dev';
const REGION = process.env.AWS_REGION || 'ap-southeast-1';

const client = new DynamoDBClient({
  region: REGION,
  endpoint: ENDPOINT,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'fakeKey',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'fakeSecret',
  },
});

async function createTableIfNotExists(tableName, params) {
  try {
    const { TableNames } = await client.send(new ListTablesCommand({}));
    if (TableNames && TableNames.includes(tableName)) {
      console.log(`  ✅ Bảng "${tableName}" đã tồn tại. Bỏ qua.`);
      return false;
    }
  } catch (err) {
    console.error(`❌ Không thể kết nối tới DynamoDB Local tại ${ENDPOINT}`);
    console.error(`   Hãy chắc chắn DynamoDB Local đang chạy:`);
    console.error(`   → npm run db:start`);
    process.exit(1);
  }

  try {
    await client.send(new CreateTableCommand(params));
    console.log(`  ✅ Đã tạo bảng "${tableName}" thành công!`);
    return true;
  } catch (err) {
    console.error(`  ❌ Lỗi khi tạo bảng "${tableName}": ${err.message}`);
    return false;
  }
}

async function setup() {
  console.log(`\n🔧 Đang kết nối tới DynamoDB tại: ${ENDPOINT}\n`);

  // 1. Bảng analysis results
  console.log(`📋 Bảng 1: ${RESULTS_TABLE} (lịch sử quét file)`);
  await createTableIfNotExists(RESULTS_TABLE, {
    TableName: RESULTS_TABLE,
    AttributeDefinitions: [
      { AttributeName: 'fileId', AttributeType: 'S' },
      { AttributeName: 'userId', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'fileId', KeyType: 'HASH' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'userId-index',
        KeySchema: [
          { AttributeName: 'userId', KeyType: 'HASH' },
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
      },
    ],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
  });

  // 2. Bảng users
  console.log(`📋 Bảng 2: ${USERS_TABLE} (tài khoản người dùng)`);
  await createTableIfNotExists(USERS_TABLE, {
    TableName: USERS_TABLE,
    AttributeDefinitions: [
      { AttributeName: 'email', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'email', KeyType: 'HASH' },
    ],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
  });

  console.log(`\n📊 Schema:`);
  console.log(`   ${RESULTS_TABLE}:`);
  console.log(`     - PK: fileId (String)`);
  console.log(`     - GSI: userId-index (userId)`);
  console.log(`   ${USERS_TABLE}:`);
  console.log(`     - PK: email (String)`);
  console.log(`     - Attributes: name, password, sub, confirmed, createdAt`);
  console.log(`\n💡 Tiếp theo, chạy: npm run db:seed`);
}

setup();
