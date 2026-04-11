const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

/**
 * 与 Next 一致：先读 .env，再读 .env.local（后者覆盖前者）
 * 不引入 dotenv 依赖，仅解析 KEY=VALUE 行
 */
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.join(projectRoot, '.env'));
loadEnvFile(path.join(projectRoot, '.env.local'));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    '❌ 未设置 DATABASE_URL。请在项目根目录的 .env 或 .env.local 中配置，例如：\n' +
      '   DATABASE_URL=postgresql://user:pass@host:port/dbname'
  );
  process.exit(1);
}

// 从环境变量读取数据库配置（与 Next / Drizzle 使用同一套 .env.local）
const pool = new Pool({
  connectionString: databaseUrl,
});

async function runMigration(migrationFileName) {
  const client = await pool.connect();
  try {
    console.log('🚀 开始运行数据库迁移...\n');

    // 读取迁移文件
    const migrationFile = path.join(__dirname, '../drizzle', migrationFileName);
    
    if (!fs.existsSync(migrationFile)) {
      console.error(`❌ 迁移文件不存在: ${migrationFile}`);
      process.exit(1);
    }
    
    const migrationSQL = fs.readFileSync(migrationFile, 'utf8');

    console.log(`📝 执行迁移文件: ${migrationFileName}`);
    console.log('='.repeat(60));
    console.log(migrationSQL);
    console.log('='.repeat(60));
    
    // 执行迁移
    await client.query(migrationSQL);
    console.log('\n✅ 迁移成功完成！\n');

    // 显示所有表
    const tables = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    
    console.log('📋 当前数据库中的表:');
    tables.rows.forEach(row => {
      console.log(`  - ${row.tablename}`);
    });

  } catch (err) {
    console.error('❌ 迁移失败:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// 获取命令行参数
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('用法: node scripts/migrate.js <迁移文件名>');
  console.log('示例: node scripts/migrate.js 0022_add_subscription_system.sql');
  console.log('\n可用的迁移文件:');
  
  const drizzleDir = path.join(__dirname, '../drizzle');
  const files = fs.readdirSync(drizzleDir)
    .filter(f => f.endsWith('.sql'))
    .sort();
  
  files.forEach(f => console.log(`  - ${f}`));
  process.exit(0);
}

runMigration(args[0]);



