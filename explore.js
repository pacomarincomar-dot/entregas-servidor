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
      database: 'nura_comar',
      connectTimeout: 10000
    });

    console.log('\n=== ID_EMP (desde FACCLI) ===');
    const [emp] = await conn.query('SELECT DISTINCT ID_EMP FROM FACCLI LIMIT 5');
    emp.forEach(r => console.log(r.ID_EMP));

    console.log('\n=== ID_EJE actual (desde FACCLI) ===');
    const [eje] = await conn.query('SELECT DISTINCT ID_EJE FROM FACCLI ORDER BY ID_EJE DESC LIMIT 3');
    eje.forEach(r => console.log(r.ID_EJE));

    console.log('\n=== CANALES disponibles ===');
    const [can] = await conn.query('SELECT IDCAN, VCODCAN, VDESCAN FROM CANALESFAC ORDER BY IDCAN');
    can.forEach(r => console.log(`${r.IDCAN} | ${r.VCODCAN} | ${r.VDESCAN}`));

    console.log('\n=== FORMAS DE PAGO mas usadas (FACCLI) ===');
    const [fps] = await conn.query(
      'SELECT IDFPA, COUNT(*) as USOS FROM FACCLI WHERE IDFPA IS NOT NULL GROUP BY IDFPA ORDER BY USOS DESC LIMIT 8'
    );
    fps.forEach(r => console.log(`IDFPA=${r.IDFPA} (${r.USOS} facturas)`));

    console.log('\n=== ALMACENES (IDALM) ===');
    const [alm] = await conn.query(
      'SELECT IDALM, COUNT(*) as USOS FROM FACCLI WHERE IDALM IS NOT NULL GROUP BY IDALM ORDER BY USOS DESC LIMIT 5'
    );
    alm.forEach(r => console.log(`IDALM=${r.IDALM} (${r.USOS} usos)`));

    console.log('\n=== ULTIMA FACTURA FACCLI (para ver formato INUMFAC) ===');
    const [last] = await conn.query(
      'SELECT IDFAC, INUMFAC, FFDOCFAC, VCODCAN, ID_EMP, ID_EJE FROM FACCLI ORDER BY IDFAC DESC LIMIT 3'
    );
    last.forEach(r => console.log(JSON.stringify(r)));

    console.log('\n=== ULTIMO INUMFAC POR CANAL (FACCLI) ===');
    const [series] = await conn.query(
      'SELECT VCODCAN, MAX(CAST(INUMFAC AS UNSIGNED)) as ULTIMO FROM FACCLI GROUP BY VCODCAN ORDER BY VCODCAN'
    );
    series.forEach(r => console.log(`CANAL=${r.VCODCAN} | ULTIMO=${r.ULTIMO}`));

  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    if (conn) await conn.end();
  }
})();
