<?php
// nura-delete.php - Consulta y borrado de FACCLI serie TK en NuraGestion
// SOLO para corregir envios erroneos. Requiere clave de seguridad.
// USO: GET  ?clave=COMAR2026&accion=listar
//      GET  ?clave=COMAR2026&accion=borrar&mes=2026-04
//      GET  ?clave=COMAR2026&accion=borrar&mes=2026-04&confirmar=si
//      GET  ?clave=COMAR2026&accion=estructura&tabla=FACCLI
//      GET  ?clave=COMAR2026&accion=datos&tabla=FACCLI&filtro=VCODCAN=TK&limite=2
//      GET  ?clave=COMAR2026&accion=tablas

define('CLAVE_ACCESO', 'COMAR2026');

header('Content-Type: text/plain; charset=utf-8');

if (($_GET['clave'] ?? '') !== CLAVE_ACCESO) {
    http_response_code(403);
    echo "Acceso denegado.\n";
    exit;
}

define('NURA_HOST',  'het20.dns-applinet.es');
define('NURA_PORT',  3306);
define('NURA_USER',  'ext_comar_inf');
define('NURA_PASS',  'K7m-Rp2x-Vq9Lt-Nd4Wb-Zs6c');
define('NURA_DB',    'nura_comar');
define('CANAL',      'TK');
define('IDCON_CTR',  396);          // FACCLI / TK / 2026

try {
    $pdo = new PDO(
        "mysql:host=" . NURA_HOST . ";port=" . NURA_PORT . ";dbname=" . NURA_DB . ";charset=utf8",
        NURA_USER,
        NURA_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 10]
    );
} catch (PDOException $e) {
    echo "ERROR conexion: " . $e->getMessage() . "\n";
    exit;
}

$accion = $_GET['accion'] ?? 'listar';

// ===== LISTAR =====
if ($accion === 'listar') {
    echo "=== FACTURAS FACCLI (canal " . CANAL . ") ===\n\n";
    $stmt = $pdo->query("
        SELECT
            LEFT(FFDOCFAC, 7)              AS mes,
            MIN(CAST(INUMFAC AS UNSIGNED)) AS desde,
            MAX(CAST(INUMFAC AS UNSIGNED)) AS hasta,
            COUNT(*)                        AS total,
            SUM(DTOTALFAC)                  AS importe
        FROM FACCLI
        WHERE VCODCAN = '" . CANAL . "'
        GROUP BY LEFT(FFDOCFAC, 7)
        ORDER BY mes
    ");
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if (empty($rows)) {
        echo "No hay registros.\n";
    } else {
        printf("%-10s  %-9s  %-9s  %5s  %10s\n", 'MES', 'DESDE', 'HASTA', 'TOTAL', 'IMPORTE');
        echo str_repeat('-', 55) . "\n";
        foreach ($rows as $r) {
            printf("%-10s  %-9s  %-9s  %5d  %10.2f\n",
                $r['mes'], $r['desde'], $r['hasta'], $r['total'], $r['importe']);
        }
    }

    $ctr = $pdo->query("SELECT IVALCON FROM CONTADORES WHERE IDCON = " . IDCON_CTR)->fetch();
    echo "\nContador CONTADORES (IDCON=" . IDCON_CTR . "): " . ($ctr['IVALCON'] ?? 'no encontrado') . "\n";
    echo "\nPara borrar un mes: ?clave=COMAR2026&accion=borrar&mes=2026-04\n";
    exit;
}

// ===== VER DATOS DE TABLA =====
if ($accion === 'datos') {
    $tabla  = $_GET['tabla']  ?? '';
    $limite = intval($_GET['limite'] ?? 20);
    $offset = intval($_GET['offset'] ?? 0);
    $filtro = $_GET['filtro'] ?? '';
    if (!preg_match('/^[A-Z0-9_]+$/i', $tabla)) {
        echo "ERROR: nombre de tabla invalido\n"; exit;
    }
    $where = '';
    if ($filtro !== '' && preg_match('/^([A-Z0-9_]+)=([\w\-]+)$/i', $filtro, $fm)) {
        $where = "WHERE `{$fm[1]}` = '{$fm[2]}'";
    }
    echo "=== DATOS DE $tabla $where (max $limite, offset $offset) ===\n\n";
    try {
        $stmt = $pdo->query("SELECT * FROM `$tabla` $where LIMIT $limite OFFSET $offset");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        if (empty($rows)) { echo "Sin registros.\n"; exit; }
        foreach ($rows as $i => $row) {
            echo "--- Fila " . ($i + 1 + $offset) . " ---\n";
            foreach ($row as $k => $v) {
                printf("  %-35s = %s\n", $k, $v);
            }
            echo "\n";
        }
    } catch (Exception $e) {
        echo "ERROR: " . $e->getMessage() . "\n";
    }
    exit;
}

// ===== LISTAR TABLAS =====
if ($accion === 'tablas') {
    echo "=== TABLAS EN LA BASE DE DATOS nura_comar ===\n\n";
    $stmt = $pdo->query("SHOW TABLES");
    foreach ($stmt->fetchAll(PDO::FETCH_NUM) as $row) {
        echo $row[0] . "\n";
    }
    exit;
}

// ===== ESTRUCTURA TABLA =====
if ($accion === 'estructura') {
    $tabla = $_GET['tabla'] ?? 'FACCLI';
    echo "=== COLUMNAS DE $tabla ===\n\n";
    $stmt = $pdo->query("DESCRIBE `$tabla`");
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $col) {
        printf("%-30s %-25s %s\n", $col['Field'], $col['Type'], $col['Null'] === 'NO' ? 'NOT NULL' : '');
    }

    // Mostrar un registro de ejemplo del canal TK
    if (in_array($tabla, ['FACCLI', 'FACCLI_LIN', 'FACCLI_COB'])) {
        echo "\n=== ULTIMO REGISTRO TK DE $tabla ===\n\n";
        try {
            if ($tabla === 'FACCLI') {
                $idFac = $pdo->query("SELECT MAX(IDFAC) FROM FACCLI WHERE VCODCAN = '" . CANAL . "'")->fetchColumn();
            } else {
                $idFac = $pdo->query("SELECT MAX(f.IDFAC) FROM FACCLI f WHERE f.VCODCAN = '" . CANAL . "'")->fetchColumn();
            }
            if ($idFac) {
                $stmt = $pdo->query("SELECT * FROM `$tabla` WHERE IDFAC = $idFac LIMIT 3");
                foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                    foreach ($row as $k => $v) {
                        printf("  %-30s = %s\n", $k, $v);
                    }
                    echo "\n";
                }
            } else {
                echo "  Sin registros TK aun.\n";
            }
        } catch (Exception $e) {
            echo "  (sin datos de ejemplo: " . $e->getMessage() . ")\n";
        }
    }
    exit;
}

// ===== BORRAR =====
if ($accion === 'borrar') {
    $mes = $_GET['mes'] ?? '';
    if (!preg_match('/^\d{4}-\d{2}$/', $mes)) {
        echo "ERROR: parametro 'mes' incorrecto. Formato: 2026-04\n";
        exit;
    }

    $confirmar = ($_GET['confirmar'] ?? '') === 'si';

    // Buscar las facturas del mes
    $stmt = $pdo->prepare("
        SELECT IDFAC, INUMFAC, FFDOCFAC, DTOTALFAC
        FROM FACCLI
        WHERE VCODCAN = ? AND LEFT(FFDOCFAC, 7) = ?
        ORDER BY CAST(INUMFAC AS UNSIGNED)
    ");
    $stmt->execute([CANAL, $mes]);
    $facturas = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($facturas)) {
        echo "No hay facturas para el mes $mes en canal " . CANAL . ".\n";
        exit;
    }

    $ids     = array_column($facturas, 'IDFAC');
    $primero = $facturas[0];
    $ultimo  = end($facturas);

    echo "=== BORRAR FACCLI MES $mes (canal " . CANAL . ") ===\n\n";
    echo "Registros encontrados: " . count($facturas) . "\n";
    echo "Rango INUMFAC: " . $primero['INUMFAC'] . " a " . $ultimo['INUMFAC'] . "\n";
    echo "Importe total: " . array_sum(array_column($facturas, 'DTOTALFAC')) . " EUR\n\n";

    if (!$confirmar) {
        echo "** SIMULACION (sin borrar nada) **\n\n";
        echo "Para borrar de verdad anade: &confirmar=si\n";
        echo "URL completa:\n";
        echo "  ?clave=COMAR2026&accion=borrar&mes=$mes&confirmar=si\n";
        exit;
    }

    // Borrar en transaccion
    $pdo->beginTransaction();
    try {
        $in = implode(',', array_map('intval', $ids));

        $c1 = $pdo->exec("DELETE FROM FACCLI_COB WHERE IDFAC IN ($in)");
        $c2 = $pdo->exec("DELETE FROM FACCLI_LIN WHERE IDFAC IN ($in)");
        $c3 = $pdo->exec("DELETE FROM FACCLI     WHERE IDFAC IN ($in)");

        // Recalcular el contador al maximo que quede
        $row    = $pdo->query("SELECT MAX(CAST(INUMFAC AS UNSIGNED)) AS M FROM FACCLI WHERE VCODCAN = '" . CANAL . "'")->fetch();
        $newMax = intval($row['M'] ?? 0);
        $pdo->exec("UPDATE CONTADORES SET IVALCON = $newMax WHERE IDCON = " . IDCON_CTR);

        $pdo->commit();

        echo "BORRADO COMPLETADO:\n";
        echo "  FACCLI_COB: $c1 filas borradas\n";
        echo "  FACCLI_LIN: $c2 filas borradas\n";
        echo "  FACCLI:     $c3 filas borradas\n";
        echo "  Contador CONTADORES actualizado a: $newMax\n";
    } catch (Exception $e) {
        $pdo->rollBack();
        echo "ERROR (rollback): " . $e->getMessage() . "\n";
    }
    exit;
}

echo "Accion desconocida. Usa: listar | borrar | estructura | datos | tablas\n";
