import { createReadStream, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, statSync } from 'node:fs';
import { copyFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HOST = process.env.CONTROL_HOST || '127.0.0.1';
const PORT = Number(process.env.CONTROL_PORT || '3100');
const APP_DIR = process.env.APP_DIR || '/app';
const CONTROL_AUTH = process.env.CONTROL_PLANE_AUTH || 'lcxkjvoaisjeflaiksdjlfkcxjvija';

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function text(res, status, body) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(body);
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited ${code}: ${stderr || stdout}`));
      }
    });
  });
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

function databasePath() {
  const databaseURL = process.env.DATABASE_URL || 'file:/app/db/custom.db';
  if (databaseURL.startsWith('file:')) {
    const raw = databaseURL.slice('file:'.length);
    return path.isAbsolute(raw) ? raw : path.resolve(APP_DIR, raw);
  }
  return path.join(APP_DIR, 'db', 'custom.db');
}

function quoteIdentifier(name) {
  return `"${String(name).replaceAll('"', '""')}"`;
}

async function sqliteJSON(dbPath, sql) {
  const { stdout } = await run('sqlite3', ['-json', dbPath, sql]);
  const trimmed = stdout.trim();
  return trimmed ? JSON.parse(trimmed) : [];
}

async function listTables(dbPath) {
  return sqliteJSON(
    dbPath,
    "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );
}

async function handleDBMeta(res) {
  const dbPath = databasePath();
  if (!existsSync(dbPath)) {
    json(res, 404, { success: false, error: 'database not found', path: dbPath });
    return;
  }
  const info = statSync(dbPath);
  json(res, 200, {
    success: true,
    path: dbPath,
    size: info.size,
    mtime: info.mtime.toISOString(),
  });
}

async function handleDBTables(res) {
  const dbPath = databasePath();
  if (!existsSync(dbPath)) {
    json(res, 404, { success: false, error: 'database not found', path: dbPath });
    return;
  }
  json(res, 200, { success: true, path: dbPath, tables: await listTables(dbPath) });
}

async function handleDBTable(req, res, tableName) {
  const dbPath = databasePath();
  if (!existsSync(dbPath)) {
    json(res, 404, { success: false, error: 'database not found', path: dbPath });
    return;
  }

  const tables = await listTables(dbPath);
  if (!tables.some(item => item.name === tableName)) {
    json(res, 404, { success: false, error: 'table not found', table: tableName });
    return;
  }

  const url = new URL(req.url, 'http://127.0.0.1');
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || '100'), 1), 500);
  const offset = Math.max(Number(url.searchParams.get('offset') || '0'), 0);
  const table = quoteIdentifier(tableName);
  const columns = await sqliteJSON(dbPath, `PRAGMA table_info(${table})`);
  const countRows = await sqliteJSON(dbPath, `SELECT COUNT(*) AS count FROM ${table}`);
  const rows = await sqliteJSON(dbPath, `SELECT * FROM ${table} LIMIT ${limit} OFFSET ${offset}`);
  json(res, 200, {
    success: true,
    table: tableName,
    columns,
    rows,
    total: countRows?.[0]?.count ?? 0,
    limit,
    offset,
  });
}

async function handleDBDownload(res) {
  const dbPath = databasePath();
  if (!existsSync(dbPath)) {
    json(res, 404, { success: false, error: 'database not found', path: dbPath });
    return;
  }
  const tmpRoot = mkdtempSync(path.join(tmpdir(), 'runner-db-'));
  const backupPath = path.join(tmpRoot, 'custom.db');
  try {
    await run('sqlite3', [dbPath, `.backup '${backupPath.replaceAll("'", "''")}'`]);
  } catch {
    await copyFile(dbPath, backupPath);
  }
  const info = statSync(backupPath);
  res.writeHead(200, {
    'content-type': 'application/octet-stream',
    'content-length': info.size,
    'content-disposition': 'attachment; filename="custom.db"',
  });
  createReadStream(backupPath)
    .on('close', () => rmSync(tmpRoot, { recursive: true, force: true }))
    .pipe(res);
}

async function createArchive() {
  const archiveDir = path.resolve(process.env.PRESTOP_ARCHIVE_DIR || APP_DIR);
  if (!existsSync(archiveDir)) {
    throw new Error(`archive dir not found: ${archiveDir}`);
  }
  const archivePath = process.env.TARBAR_NAME
    || (process.env.BUILD_ID ? `/home/dist/build_fullstack_${process.env.BUILD_ID}.tar.gz` : '');
  if (!archivePath) {
    throw new Error('TARBAR_NAME or BUILD_ID is required');
  }
  const resolvedArchivePath = path.resolve(archivePath);
  mkdirSync(path.dirname(resolvedArchivePath), { recursive: true });
  const tmpArchivePath = `${resolvedArchivePath}.tmp-${process.pid}-${Date.now()}`;
  const tmpRoot = mkdtempSync(path.join(tmpdir(), 'runner-prestop-'));
  const tmpApp = path.join(tmpRoot, 'app');
  try {
    mkdirSync(tmpApp, { recursive: true });
    await run('sh', ['-c', `tar -cf - --exclude=./db/custom.db -C ${shellQuote(archiveDir)} . | tar -xf - -C ${shellQuote(tmpApp)}`]);

    const dbPath = databasePath();
    const resolvedDB = path.resolve(dbPath);
    if (existsSync(resolvedDB) && (resolvedDB === archiveDir || resolvedDB.startsWith(path.resolve(archiveDir) + path.sep))) {
      const relativeDB = path.relative(APP_DIR, resolvedDB);
      const backupPath = path.join(tmpApp, relativeDB);
      mkdirSync(path.dirname(backupPath), { recursive: true });
      try {
        await run('sqlite3', [resolvedDB, `.backup '${backupPath.replaceAll("'", "''")}'`]);
      } catch {
        await copyFile(resolvedDB, backupPath);
      }
    }

    await run('tar', ['-czf', tmpArchivePath, '-C', tmpApp, '.']);
    const srcSize = statSync(tmpArchivePath).size;
    if (srcSize <= 0) {
      throw new Error('archive produced empty file');
    }
    renameSync(tmpArchivePath, resolvedArchivePath);
    return { archiveDir, archivePath: resolvedArchivePath, size: srcSize };
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
    rmSync(tmpArchivePath, { force: true });
  }
}

function requireAuth(req, res) {
  if (req.headers['x-auth'] === CONTROL_AUTH) {
    return true;
  }
  if (req.url?.startsWith('/pre-stop') && String(req.headers['x-fc-instance-lifecycle-pre-stop-handler'] || '').toLowerCase() === 'true') {
    return true;
  }
  json(res, 401, { success: false, error: 'unauthorized' });
  return false;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/ping') {
      text(res, 200, 'pong');
      return;
    }
    if (!requireAuth(req, res)) {
      return;
    }
    if (url.pathname === '/pre-stop') {
      json(res, 200, { success: true, ...(await createArchive()) });
      return;
    }
    if (url.pathname === '/db/meta') {
      await handleDBMeta(res);
      return;
    }
    if (url.pathname === '/db/tables') {
      await handleDBTables(res);
      return;
    }
    if (url.pathname.startsWith('/db/tables/')) {
      const tableName = decodeURIComponent(url.pathname.slice('/db/tables/'.length));
      await handleDBTable(req, res, tableName);
      return;
    }
    if (url.pathname === '/db/download') {
      await handleDBDownload(res);
      return;
    }
    json(res, 404, { success: false, error: 'not found' });
  } catch (error) {
    json(res, 500, { success: false, error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`runner control server listening on http://${HOST}:${PORT}`);
});
