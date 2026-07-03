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

    console.log('\n=== USUARIO ===');
    const [user] = await conn.query('SELECT CURRENT_USER() AS u');
    console.log(user[0].u);

    console.log('\n=== PERMISOS ===');
    const [grants] = await conn.query('SHOW GRANTS FOR CURRENT_USER()');
    grants.forEach(r => console.log(Object.values(r)[0]));

    console.log('\n=== BASES DE DATOS ===');
    const [dbs] = await conn.query('SHOW DATABASES');
    dbs.forEach(r => console.log(Object.values(r)[0]));

    console.log('\n=== TODAS LAS TABLAS ACCESIBLES ===');
    const [tables] = await conn.query(
      "SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES ORDER BY TABLE_SCHEMA, TABLE_NAME"
    );
    tables.forEach(r => console.log(`${r.TABLE_SCHEMA}.${r.TABLE_NAME}`));

  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    if (conn) await conn.end();
  }
})();
