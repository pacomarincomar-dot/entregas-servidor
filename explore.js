require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  let conn;
  try {
    conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      connectTimeout: 10000
    });

    console.log('\n=== TABLAS FAC / TIC / TICKET / FACTURA ===');
    const [tables] = await conn.query(
      `SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = 'nura_comar'
         AND (TABLE_NAME LIKE '%FAC%' OR TABLE_NAME LIKE '%TIC%' OR TABLE_NAME LIKE '%TICKET%' OR TABLE_NAME LIKE '%FACTURA%')
         AND TABLE_NAME NOT LIKE 'VW_%'
       ORDER BY TABLE_NAME`
    );
    tables.forEach(r => console.log(`${r.TABLE_TYPE} - ${r.TABLE_NAME}`));

    console.log('\n=== VISTAS FAC / TIC / TICKET / FACTURA ===');
    const [views] = await conn.query(
      `SELECT TABLE_NAME
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = 'nura_comar'
         AND (TABLE_NAME LIKE '%FAC%' OR TABLE_NAME LIKE '%TIC%' OR TABLE_NAME LIKE '%TICKET%' OR TABLE_NAME LIKE '%FACTURA%')
         AND TABLE_NAME LIKE 'VW_%'
       ORDER BY TABLE_NAME`
    );
    views.forEach(r => console.log(r.TABLE_NAME));

    // Mostrar columnas de cada tabla base encontrada
    if (tables.length > 0) {
      for (const t of tables) {
        console.log(`\n=== COLUMNAS: ${t.TABLE_NAME} ===`);
        const [cols] = await conn.query(
          `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, EXTRA
           FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = 'nura_comar' AND TABLE_NAME = ?
           ORDER BY ORDINAL_POSITION`,
          [t.TABLE_NAME]
        );
        cols.forEach(c => console.log(`  ${c.COLUMN_NAME} (${c.DATA_TYPE}) ${c.COLUMN_KEY} ${c.EXTRA}`));
      }
    }

  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    if (conn) await conn.end();
  }
})();
