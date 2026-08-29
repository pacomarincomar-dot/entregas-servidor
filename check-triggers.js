require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  let c;
  try {
    c = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: 'nura_comar'
    });

    console.log('\n=== TRIGGERS EN FACCLI ===');
    const [triggers] = await c.query(
      "SELECT TRIGGER_NAME, EVENT_MANIPULATION, ACTION_TIMING, SUBSTR(ACTION_STATEMENT,1,200) AS STMT " +
      "FROM INFORMATION_SCHEMA.TRIGGERS WHERE EVENT_OBJECT_SCHEMA='nura_comar' AND EVENT_OBJECT_TABLE='FACCLI'"
    );
    if (triggers.length === 0) console.log('(ninguno)');
    triggers.forEach(t => console.log(`[${t.ACTION_TIMING} ${t.EVENT_MANIPULATION}] ${t.TRIGGER_NAME}\n${t.STMT}\n`));

    console.log('\n=== GRANTS DE us_comar ===');
    try {
      const [grants] = await c.query("SHOW GRANTS FOR 'us_comar'@'%'");
      grants.forEach(g => console.log(Object.values(g)[0]));
    } catch (e) {
      console.log('No se pudo consultar (sin permisos):', e.message);
    }

    console.log('\n=== INTENTAR GRANT TRIGGER ===');
    try {
      await c.query("GRANT TRIGGER ON nura_comar.* TO 'us_comar'@'%'");
      await c.query('FLUSH PRIVILEGES');
      console.log('GRANT ejecutado correctamente');
    } catch (e) {
      console.log('No se pudo ejecutar el GRANT:', e.message);
    }

  } catch (err) {
    console.error('ERROR de conexion:', err.message);
  } finally {
    if (c) await c.end();
  }
})();
