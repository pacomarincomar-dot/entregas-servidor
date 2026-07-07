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

    console.log('\n=== ID_EMP (empresa) ===');
    const [emp] = await conn.query('SELECT DISTINCT ID_EMP FROM FACCLISIM LIMIT 5');
    emp.forEach(r => console.log(r.ID_EMP));

    console.log('\n=== ID_EJE (ejercicios) ===');
    const [eje] = await conn.query('SELECT DISTINCT ID_EJE FROM FACCLISIM ORDER BY ID_EJE DESC LIMIT 5');
    eje.forEach(r => console.log(r.ID_EJE));

    console.log('\n=== CANALES (VCODCAN) ===');
    const [can] = await conn.query('SELECT DISTINCT VCODCAN FROM FACCLISIM ORDER BY VCODCAN LIMIT 10');
    can.forEach(r => console.log(r.VCODCAN));

    console.log('\n=== ULTIMA FACTURA SIMPLIFICADA ===');
    const [last] = await conn.query('SELECT IDFAC, INUMFAC, FFDOCFAC, VCODCAN, ID_EMP, ID_EJE FROM FACCLISIM ORDER BY IDFAC DESC LIMIT 3');
    last.forEach(r => console.log(JSON.stringify(r)));

    console.log('\n=== FORMAS DE PAGO (IDFPA) ===');
    const [fps] = await conn.query('SELECT IDFPA, COUNT(*) as USOS FROM FACCLISIM_COB GROUP BY IDFPA ORDER BY USOS DESC LIMIT 5');
    fps.forEach(r => console.log(`IDFPA=${r.IDFPA} (usado ${r.USOS} veces)`));

  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    if (conn) await conn.end();
  }
})();
