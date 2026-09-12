import { connect, type Connection, type Transaction } from '@tursodatabase/serverless';
import BetterSqlite3 from 'better-sqlite3';

export type DatabaseRunResult = {
  changes: number;
  lastInsertRowid?: number | bigint;
};

type RemoteDatabase = Connection | Transaction;
type LocalDatabase = BetterSqlite3.Database;

function normalizeRemoteArguments(args: unknown[]): unknown[] {
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  return args;
}

export class AsyncStatement {
  constructor(
    private readonly database: AsyncDatabase,
    private readonly sql: string,
  ) {}

  run(...args: unknown[]): Promise<DatabaseRunResult> {
    return this.database.run(this.sql, ...args);
  }

  get<T = unknown>(...args: unknown[]): Promise<T | undefined> {
    return this.database.get<T>(this.sql, ...args);
  }

  all<T = unknown>(...args: unknown[]): Promise<T[]> {
    return this.database.all<T>(this.sql, ...args);
  }
}

export class AsyncDatabase {
  constructor(
    private readonly backend: LocalDatabase | RemoteDatabase,
    private readonly kind: 'local' | 'remote',
  ) {}

  prepare(sql: string): AsyncStatement {
    return new AsyncStatement(this, sql);
  }

  async run(sql: string, ...args: unknown[]): Promise<DatabaseRunResult> {
    if (this.kind === 'local') {
      return (this.backend as LocalDatabase).prepare(sql).run(...args) as DatabaseRunResult;
    }
    const result = await (this.backend as RemoteDatabase).run(sql, ...normalizeRemoteArguments(args));
    return {
      changes: Number(result.changes ?? result.rowsAffected ?? 0),
      lastInsertRowid: result.lastInsertRowid,
    };
  }

  async get<T = unknown>(sql: string, ...args: unknown[]): Promise<T | undefined> {
    if (this.kind === 'local') {
      return (this.backend as LocalDatabase).prepare(sql).get(...args) as T | undefined;
    }
    return await (this.backend as RemoteDatabase).get(sql, ...normalizeRemoteArguments(args)) as T | undefined;
  }

  async all<T = unknown>(sql: string, ...args: unknown[]): Promise<T[]> {
    if (this.kind === 'local') {
      return (this.backend as LocalDatabase).prepare(sql).all(...args) as T[];
    }
    return await (this.backend as RemoteDatabase).all(sql, ...normalizeRemoteArguments(args)) as T[];
  }

  async exec(sql: string): Promise<void> {
    if (this.kind === 'local') {
      (this.backend as LocalDatabase).exec(sql);
      return;
    }
    const statements = sql.split(';').map((statement) => statement.trim()).filter(Boolean);
    for (const statement of statements) {
      await (this.backend as RemoteDatabase).exec(statement);
    }
  }

  async pragma(pragma: string): Promise<void> {
    if (this.kind === 'local') {
      (this.backend as LocalDatabase).pragma(pragma);
      return;
    }
    await (this.backend as RemoteDatabase).exec(`PRAGMA ${pragma}`);
  }

  transaction<T>(fn: (transaction: AsyncDatabase) => Promise<T> | T): () => Promise<T> {
    if (this.kind === 'local') {
      return async () => {
        const local = this.backend as LocalDatabase;
        local.exec('BEGIN IMMEDIATE');
        try {
          const result = await fn(new AsyncDatabase(local, 'local'));
          local.exec('COMMIT');
          return result;
        } catch (error) {
          local.exec('ROLLBACK');
          throw error;
        }
      };
    }

    const remote = this.backend as Connection;
    const transaction = remote.transactionAsync(async (tx: Transaction) => fn(new AsyncDatabase(tx, 'remote')));
    return transaction.immediate;
  }
}

export function createDatabase(filePath: string): AsyncDatabase {
  const remoteUrl = process.env.TURSO_DATABASE_URL?.trim();
  if (remoteUrl) {
    return new AsyncDatabase(connect({
      url: remoteUrl,
      authToken: process.env.TURSO_AUTH_TOKEN?.trim(),
    }), 'remote');
  }

  return new AsyncDatabase(new BetterSqlite3(filePath), 'local');
}
