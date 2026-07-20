/**
 * Create DynamoDB Table on AWS - Tạo bảng thực trên AWS
 * 
 * Chạy: node scripts/create-dynamodb-table.js
 * Yêu cầu: AWS CLI đã cấu hình (aws configure)
 * 
 * Bảng sẽ dùng PAY_PER_REQUEST billing (không cần provision capacity)
 */

const { DynamoDBClient, CreateTableCommand, ListTablesCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');

// Dùng credentials từ AWS CLI profile (~/.aws/credentials)
const REGION = process.env.AWS_REGION || 'ap-southeast-1';
const ENV = process.env.ENVIRONMENT || 'dev';
const TABLE_NAME = `malware-analysis-results-${ENV}`;

const client = new DynamoDBClient({
  region: REGION,
  // Sẽ tự động dùng credentials từ AWS CLI
});

async function createTable() {
  console.log(`\n🌐 Tạo bảng DynamoDB trên AWS thực...`);
  console.log(`📋 Tên bảng: ${TABLE_NAME}`);
  console.log(`🌏 Region: ${REGION}`);
  console.log(`🏷️  Environment: ${ENV}\n`);

  // Kiểm tra bảng đã tồn tại chưa
  try {
    const { TableNames } = await client.send(new ListTablesCommand({}));
    if (TableNames && TableNames.includes(TABLE_NAME)) {
      console.log(`⚠️  Bảng "${TABLE_NAME}" đã tồn tại trên AWS.`);
      
      // Hiển thị thông tin bảng
      const { Table } = await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
      console.log(`\n📊 Thông tin bảng:`);
      console.log(`   - Status: ${Table.TableStatus}`);
      console.log(`   - Item Count: ${Table.ItemCount}`);
      console.log(`   - Table Size: ${Table.TableSizeBytes} bytes`);
      console.log(`   - ARN: ${Table.TableArn}`);
      return;
    }
  } catch (err) {
    if (err.name === 'CredentialsProviderError' || err.message.includes('Could not load credentials')) {
      console.error(`❌ Không tìm thấy AWS credentials!`);
      console.error(`   Chạy: aws configure`);
      console.error(`   Xem hướng dẫn: AWS_CLI_SETUP.md`);
      process.exit(1);
    }
    // Lỗi khác thì tiếp tục thử tạo
    console.warn(`⚠️  Không thể list tables: ${err.message}. Đang thử tạo...`);
  }

  // Tạo bảng với PAY_PER_REQUEST (không cần quản lý capacity)
  const params = {
    TableName: TABLE_NAME,
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
        Projection: {
          ProjectionType: 'ALL',
        },
      },
    ],
    BillingMode: 'PAY_PER_REQUEST',
    SSESpecification: {
      Enabled: true,
      SSEType: 'AES256',
    },
    Tags: [
      { Key: 'Project', Value: 'MalwareDetection' },
      { Key: 'Environment', Value: ENV },
      { Key: 'ManagedBy', Value: 'script' },
    ],
  };

  try {
    const result = await client.send(new CreateTableCommand(params));
    console.log(`✅ Đã tạo bảng "${TABLE_NAME}" trên AWS thành công!`);
    console.log(`\n📊 Thông tin:`);
    console.log(`   - Status: ${result.TableDescription.TableStatus}`);
    console.log(`   - ARN: ${result.TableDescription.TableArn}`);
    console.log(`\n📌 Cập nhật file .env của frontend:`);
    console.log(`   VITE_DYNAMODB_TABLE=${TABLE_NAME}`);
    console.log(`\n💡 Bảng sẽ active trong vài giây. Kiểm tra trên AWS Console:`);
    console.log(`   → https://console.aws.amazon.com/dynamodbv2/home?region=${REGION}#table?name=${TABLE_NAME}`);
  } catch (err) {
    console.error(`❌ Lỗi khi tạo bảng: ${err.message}`);
    if (err.name === 'AccessDeniedException') {
      console.error(`   IAM user của bạn cần quyền: dynamodb:CreateTable`);
    }
    process.exit(1);
  }
}

createTable();
