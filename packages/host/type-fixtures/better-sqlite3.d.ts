/** Minimal ambient types matching `@types/better-sqlite3` for `Database.Database` usage. */
declare module 'better-sqlite3' {
  namespace BetterSqlite3 {
    interface Statement {
      get(...params: unknown[]): unknown;
      run(...params: unknown[]): unknown;
      all(...params: unknown[]): unknown[];
    }

    interface Database {
      prepare(sql: string): Statement;
      close(): void;
    }

    interface DatabaseConstructor {
      new (...args: unknown[]): Database;
      prototype: Database;
    }
  }

  namespace Database {
    type Database = BetterSqlite3.Database;
    type Statement = BetterSqlite3.Statement;
  }

  const Database: BetterSqlite3.DatabaseConstructor;
  export = Database;
}
