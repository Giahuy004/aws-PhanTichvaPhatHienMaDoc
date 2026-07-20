/**
 * Local API Server - Chạy Lambda functions locally với Express
 * 
 * Chạy: node scripts/start-local-api.js
 * Yêu cầu: DynamoDB Local đang chạy, đã setup bảng và seed data
 * 
 * Endpoints:
 *   POST /auth/register    → Đăng ký tài khoản (lưu vào DynamoDB)
 *   POST /auth/confirm     → Xác nhận email
 *   POST /auth/login       → Đăng nhập
 *   POST /auth/forgot-password → Quên mật khẩu
 *   POST /auth/reset-password  → Reset mật khẩu
 *   POST /upload           → Tạo record mới + trả presigned URL (giả lập)
 *   GET  /get-result/:fileId → Lấy kết quả phân tích theo fileId
 *   GET  /history           → Lấy lịch sử phân tích của user
 */

const express = require('express');
const cors = require('cors');
const { DynamoDBClient, PutItemCommand, GetItemCommand, QueryCommand, ScanCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { randomUUID } = require('crypto');
const crypto = require('crypto');
require('dotenv').config({ path: '.env.local' });

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const ENDPOINT = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';
const TABLE_NAME = process.env.RESULTS_TABLE || 'malware-analysis-results-dev';
const USERS_TABLE = process.env.USERS_TABLE || 'users-dev';
const REGION = process.env.AWS_REGION || 'ap-southeast-1';

const dynamoDBClient = new DynamoDBClient({
  region: REGION,
  endpoint: ENDPOINT,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'fakeKey',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'fakeSecret',
  },
});

// ============================================================
// Helpers
// ============================================================

// Hash password đơn giản (local dev only - production dùng bcrypt)
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Unmarshal DynamoDB item
const unmarshalValue = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if ('S' in value) return value.S;
  if ('N' in value) return Number(value.N);
  if ('BOOL' in value) return value.BOOL;
  if ('NULL' in value) return null;
  if (Array.isArray(value.L)) return value.L.map(unmarshalValue);
  if (value.M) {
    const obj = {};
    for (const [k, v] of Object.entries(value.M)) obj[k] = unmarshalValue(v);
    return obj;
  }
  return value;
};

const unmarshalItem = (item) => {
  const result = {};
  for (const [k, v] of Object.entries(item)) {
    result[k] = unmarshalValue(v);
  }
  return result;
};

// Map DynamoDB item to frontend model
const mapToFrontend = (item) => {
  let status = item.status;
  if (status === 'queued' || status === 'received') status = 'pending';

  return {
    id: item.fileId || item.id,
    fileId: item.fileId,
    fileName: item.fileName || '',
    status: status,
    uploadTime: item.createdAt || item.uploadTime || new Date().toISOString(),
    threatLevel: item.threatLevel || 'safe',
    threatType: item.threatType || '',
    fileSize: item.fileSize || 0,
  };
};

// Extract userId from JWT token (simplified)
const extractUserId = (req) => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return 'local-user';

  try {
    const token = authHeader.slice('Bearer '.length);
    const payload = token.split('.')[1];
    if (!payload) return 'local-user';
    const decoded = JSON.parse(Buffer.from(payload + '==', 'base64').toString('utf8'));
    return decoded.sub || decoded.username || decoded.email || 'local-user';
  } catch {
    return 'local-user';
  }
};

// ============================================================
// AUTH ROUTES - Lưu user vào DynamoDB thật
// ============================================================

// POST /auth/register - Đăng ký tài khoản
app.post('/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin' });
    }

    // Kiểm tra email đã tồn tại chưa
    const existing = await dynamoDBClient.send(new GetItemCommand({
      TableName: USERS_TABLE,
      Key: { email: { S: email } },
    }));

    if (existing.Item) {
      return res.status(409).json({ message: 'Email đã được đăng ký' });
    }

    const sub = `user-${randomUUID()}`;
    const now = new Date().toISOString();

    // Lưu user vào DynamoDB
    await dynamoDBClient.send(new PutItemCommand({
      TableName: USERS_TABLE,
      Item: {
        email: { S: email },
        password: { S: hashPassword(password) },
        name: { S: name },
        sub: { S: sub },
        confirmed: { BOOL: false },
        createdAt: { S: now },
        updatedAt: { S: now },
      },
    }));

    console.log(`✅ Đăng ký: ${name} (${email}) → DynamoDB [${USERS_TABLE}]`);

    res.status(201).json({
      message: 'Đăng ký thành công! Vui lòng xác nhận email.',
      userSub: sub,
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
});

// POST /auth/confirm - Xác nhận email
app.post('/auth/confirm', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ message: 'Thiếu email hoặc mã xác nhận' });
    }

    // Kiểm tra user tồn tại
    const result = await dynamoDBClient.send(new GetItemCommand({
      TableName: USERS_TABLE,
      Key: { email: { S: email } },
    }));

    if (!result.Item) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản' });
    }

    // Local mode: chấp nhận bất kỳ mã nào >= 4 ký tự
    if (code.length < 4) {
      return res.status(400).json({ message: 'Mã xác nhận không hợp lệ' });
    }

    // Cập nhật confirmed = true
    await dynamoDBClient.send(new UpdateItemCommand({
      TableName: USERS_TABLE,
      Key: { email: { S: email } },
      UpdateExpression: 'SET confirmed = :confirmed, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':confirmed': { BOOL: true },
        ':updatedAt': { S: new Date().toISOString() },
      },
    }));

    console.log(`✅ Xác nhận email: ${email} → confirmed=true`);

    res.json({ message: 'Xác nhận email thành công!' });
  } catch (error) {
    console.error('Confirm error:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
});

// POST /auth/login - Đăng nhập
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Vui lòng nhập email và mật khẩu' });
    }

    // Tìm user trong DynamoDB
    const result = await dynamoDBClient.send(new GetItemCommand({
      TableName: USERS_TABLE,
      Key: { email: { S: email } },
    }));

    if (!result.Item) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng' });
    }

    const user = unmarshalItem(result.Item);

    // Kiểm tra password
    if (user.password !== hashPassword(password)) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng' });
    }

    // Kiểm tra confirmed
    if (!user.confirmed) {
      return res.status(403).json({ message: 'Tài khoản chưa được xác nhận. Vui lòng xác nhận email.' });
    }

    console.log(`✅ Đăng nhập: ${user.name} (${email})`);

    res.json({
      message: 'Đăng nhập thành công!',
      user: {
        email: user.email,
        name: user.name,
        sub: user.sub,
        emailVerified: true,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
});

// POST /auth/forgot-password - Quên mật khẩu
app.post('/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    const result = await dynamoDBClient.send(new GetItemCommand({
      TableName: USERS_TABLE,
      Key: { email: { S: email } },
    }));

    if (!result.Item) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản với email này' });
    }

    console.log(`📧 Forgot password: ${email} (local mode - nhập bất kỳ 6 số)`);

    res.json({ message: 'Mã reset password đã được gửi (local: nhập bất kỳ 6 số)' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
});

// POST /auth/reset-password - Reset mật khẩu
app.post('/auth/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ message: 'Thiếu thông tin' });
    }

    const result = await dynamoDBClient.send(new GetItemCommand({
      TableName: USERS_TABLE,
      Key: { email: { S: email } },
    }));

    if (!result.Item) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản' });
    }

    await dynamoDBClient.send(new UpdateItemCommand({
      TableName: USERS_TABLE,
      Key: { email: { S: email } },
      UpdateExpression: 'SET password = :password, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':password': { S: hashPassword(newPassword) },
        ':updatedAt': { S: new Date().toISOString() },
      },
    }));

    console.log(`✅ Reset password: ${email}`);

    res.json({ message: 'Reset mật khẩu thành công!' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
});

// GET /auth/users - Xem danh sách users (debug)
app.get('/auth/users', async (req, res) => {
  try {
    const result = await dynamoDBClient.send(new ScanCommand({
      TableName: USERS_TABLE,
    }));

    const users = (result.Items || []).map(item => {
      const u = unmarshalItem(item);
      return {
        email: u.email,
        name: u.name,
        sub: u.sub,
        confirmed: u.confirmed,
        createdAt: u.createdAt,
      };
    });

    res.json({ users, count: users.length });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
});

// ============================================================
// MALWARE ANALYSIS ROUTES
// ============================================================

// POST /upload - Tạo upload mới
app.post('/upload', async (req, res) => {
  try {
    const { fileName, fileSize } = req.body;

    if (!fileName) {
      return res.status(400).json({ message: 'Missing required field: fileName' });
    }

    const fileId = randomUUID();
    const userId = extractUserId(req);
    const now = new Date().toISOString();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileKey = `samples/${Date.now()}_${sanitizedFileName}`;

    // Lưu record vào DynamoDB
    await dynamoDBClient.send(new PutItemCommand({
      TableName: TABLE_NAME,
      Item: {
        fileId: { S: fileId },
        userId: { S: userId },
        fileName: { S: fileName },
        fileKey: { S: fileKey },
        fileSize: { N: String(fileSize || 0) },
        status: { S: 'pending' },
        threatLevel: { S: 'safe' },
        threatType: { S: '' },
        createdAt: { S: now },
        updatedAt: { S: now },
      },
    }));

    console.log(`📤 Upload: ${fileName} → fileId: ${fileId}`);

    const uploadUrl = `http://localhost:${PORT}/fake-s3-upload/${fileKey}`;

    res.json({
      message: 'Upload initiated successfully',
      fileId,
      uploadUrl,
      expiresIn: 3600,
    });

    // Giả lập quá trình scan sau 3 giây
    setTimeout(async () => {
      try {
        await dynamoDBClient.send(new PutItemCommand({
          TableName: TABLE_NAME,
          Item: {
            fileId: { S: fileId },
            userId: { S: userId },
            fileName: { S: fileName },
            fileKey: { S: fileKey },
            fileSize: { N: String(fileSize || 0) },
            status: { S: 'scanning' },
            threatLevel: { S: 'safe' },
            threatType: { S: '' },
            createdAt: { S: now },
            updatedAt: { S: new Date().toISOString() },
          },
        }));
        console.log(`🔄 Scanning: ${fileName}`);

        setTimeout(async () => {
          const isMalware = Math.random() < 0.3;
          const threatLevels = ['low', 'medium', 'high', 'critical'];
          const threatTypes = ['Trojan.GenericKD', 'JS/Downloader.Agent', 'VBA/TrojanDownloader', 'Adware.BrowseFox', 'Ransom.WannaCry'];

          const finalStatus = isMalware ? 'malware' : 'completed';
          const finalThreatLevel = isMalware ? threatLevels[Math.floor(Math.random() * threatLevels.length)] : 'safe';
          const finalThreatType = isMalware ? threatTypes[Math.floor(Math.random() * threatTypes.length)] : '';

          await dynamoDBClient.send(new PutItemCommand({
            TableName: TABLE_NAME,
            Item: {
              fileId: { S: fileId },
              userId: { S: userId },
              fileName: { S: fileName },
              fileKey: { S: fileKey },
              fileSize: { N: String(fileSize || 0) },
              status: { S: finalStatus },
              threatLevel: { S: finalThreatLevel },
              threatType: { S: finalThreatType },
              createdAt: { S: now },
              updatedAt: { S: new Date().toISOString() },
            },
          }));

          const icon = isMalware ? '🔴' : '✅';
          console.log(`${icon} Scan complete: ${fileName} → ${finalStatus} (${finalThreatLevel})`);
        }, 5000);
      } catch (err) {
        console.error(`❌ Scan simulation error: ${err.message}`);
      }
    }, 3000);

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Fake S3 upload endpoint
app.put('/fake-s3-upload/*', (req, res) => {
  console.log(`📁 Fake S3 upload received: ${req.params[0]}`);
  res.status(200).json({ message: 'File uploaded (simulated)' });
});

// GET /get-result/:fileId
app.get('/get-result/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    if (!fileId) {
      return res.status(400).json({ message: 'Missing fileId' });
    }

    const result = await dynamoDBClient.send(new GetItemCommand({
      TableName: TABLE_NAME,
      Key: { fileId: { S: fileId } },
    }));

    if (!result.Item) {
      return res.status(404).json({ message: 'Analysis not found' });
    }

    const raw = unmarshalItem(result.Item);
    res.json(mapToFrontend(raw));
  } catch (error) {
    console.error('Get result error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// GET /history
app.get('/history', async (req, res) => {
  try {
    const userId = extractUserId(req);
    let items = [];

    try {
      const result = await dynamoDBClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'userId-index',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: { ':userId': { S: userId } },
        ScanIndexForward: false,
      }));
      items = result.Items || [];
    } catch (queryErr) {
      console.warn('Query by userId failed, falling back to scan:', queryErr.message);
      const result = await dynamoDBClient.send(new ScanCommand({ TableName: TABLE_NAME }));
      items = result.Items || [];
    }

    const mappedItems = items.map((item) => mapToFrontend(unmarshalItem(item)));
    mappedItems.sort((a, b) => new Date(b.uploadTime).getTime() - new Date(a.uploadTime).getTime());

    res.json({ items: mappedItems, count: mappedItems.length });
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    dynamodb: ENDPOINT,
    tables: { results: TABLE_NAME, users: USERS_TABLE },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// Start Server
// ============================================================
app.listen(PORT, () => {
  console.log(`\n🚀 Local API Server đang chạy tại: http://localhost:${PORT}`);
  console.log(`📡 DynamoDB endpoint: ${ENDPOINT}`);
  console.log(`📋 Tables: ${TABLE_NAME}, ${USERS_TABLE}`);
  console.log(`\n📌 Auth Endpoints:`);
  console.log(`   POST http://localhost:${PORT}/auth/register`);
  console.log(`   POST http://localhost:${PORT}/auth/confirm`);
  console.log(`   POST http://localhost:${PORT}/auth/login`);
  console.log(`   GET  http://localhost:${PORT}/auth/users (debug)`);
  console.log(`\n📌 Analysis Endpoints:`);
  console.log(`   POST http://localhost:${PORT}/upload`);
  console.log(`   GET  http://localhost:${PORT}/get-result/:fileId`);
  console.log(`   GET  http://localhost:${PORT}/history`);
  console.log(`   GET  http://localhost:${PORT}/health`);
  console.log(`\n💡 Frontend: VITE_BACKEND_API_URL=http://localhost:${PORT}\n`);
});
