<?php
// nura-export.php — Exportar tickets de caja a FACCLI de NuraGestion (serie TK)
// Tablas: FACCLI + FACCLI_LIN + FACCLI_COB

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['ok' => false, 'error' => 'Metodo no permitido']);
    exit;
}

// ===== CONFIGURACION NURA =====
define('NURA_HOST',  'het20.dns-applinet.es');
define('NURA_PORT',  3306);
define('NURA_USER',  'ext_comar_inf');
define('NURA_PASS',  'K7m-Rp2x-Vq9Lt-Nd4Wb-Zs6c');
define('NURA_DB',    'nura_comar');

define('CANAL',     'TK');
define('ID_EJE',    2026);
define('IDALM',     13);
define('ID_EMP',    1);
define('IDFPA',     149);
define('VCODFPA',   'CON');
define('VCODCLI',   '000655');
define('VNCOMCLI',  'CLIENTE DE CONTADO');
define('VNFISCLI',  'CLIENTE DE CONTADO');
define('VCODARTI',  'VARIOSA');
define('VDESARTI',  'Venta por mostrador varios');
define('IDARTI',    28893);
define('IVA_PCT',   21.0);
define('IDCON_CTR', 396);           // FACCLI / TK / 2026

$input = json_decode(file_get_contents('php://input'), true);
if (!$input) {
    echo json_encode(['ok' => false, 'error' => 'JSON invalido']);
    exit;
}

// Detectar formato del payload:
// Nuevo: {registrosCaja: [{facturas: [{numero, importe, productos},...]},...]}
// Viejo: {accion, facturas: [{numNura, total, productos},...]}
$isNewFormat = isset($input['registrosCaja']);

if ($isNewFormat) {
    $accion        = 'exportar';
    $facturasInput = [];
    foreach ($input['registrosCaja'] as $registro) {
        foreach ($registro['facturas'] ?? [] as $fac) {
            $facturasInput[] = $fac;
        }
    }
} else {
    $accion        = $input['accion']   ?? '';
    $facturasInput = $input['facturas'] ?? [];
}

if (empty($facturasInput) && $accion !== 'check') {
    echo json_encode(['ok' => false, 'error' => 'Sin facturas']);
    exit;
}

// ===== CONEXION =====
try {
    $pdo = new PDO(
        "mysql:host=" . NURA_HOST . ";port=" . NURA_PORT . ";dbname=" . NURA_DB . ";charset=utf8",
        NURA_USER,
        NURA_PASS,
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_TIMEOUT            => 10,
        ]
    );
} catch (PDOException $e) {
    echo json_encode(['ok' => false, 'error' => 'Error conexion Nura: ' . $e->getMessage()]);
    exit;
}

// ===== CHECK =====
if ($accion === 'check') {
    $stmt = $pdo->prepare("SELECT MAX(CAST(INUMFAC AS UNSIGNED)) AS ULTIMO FROM FACCLI WHERE VCODCAN = ?");
    $stmt->execute([CANAL]);
    $row    = $stmt->fetch();
    $ultimo = intval($row['ULTIMO'] ?? 0);
    echo json_encode(['ok' => true, 'canal' => CANAL, 'ultimo' => $ultimo, 'siguiente' => $ultimo + 1]);
    exit;
}

// ===== EXPORTAR =====
if ($accion !== 'exportar') {
    echo json_encode(['ok' => false, 'error' => 'Accion desconocida: ' . $accion]);
    exit;
}

$insertadas = [];
$pdo->beginTransaction();

try {
    // Bloquear y obtener el ultimo INUMFAC para evitar duplicados concurrentes
    $stmt = $pdo->prepare("SELECT MAX(CAST(INUMFAC AS UNSIGNED)) AS ULTIMO FROM FACCLI WHERE VCODCAN = ? FOR UPDATE");
    $stmt->execute([CANAL]);
    $row     = $stmt->fetch();
    $autoNum = intval($row['ULTIMO'] ?? 0);

    // En formato viejo: verificar que ninguna factura exista ya
    if (!$isNewFormat) {
        foreach ($facturasInput as $fac) {
            $numNura = str_pad($fac['numNura'] ?? 0, 9, '0', STR_PAD_LEFT);
            $check   = $pdo->prepare("SELECT COUNT(*) AS N FROM FACCLI WHERE INUMFAC = ? AND VCODCAN = ?");
            $check->execute([$numNura, CANAL]);
            $existe  = intval($check->fetch()['N'] ?? 0);
            if ($existe > 0) {
                throw new Exception("La factura " . CANAL . "-" . $numNura . " ya existe. Abortando.");
            }
        }
    }

    // Agrupar por fecha para horas progresivas de caja
    $porFecha = [];
    foreach ($facturasInput as $fac) {
        $f = $fac['fecha'] ?? date('Y-m-d');
        if (preg_match('/^(\d{2})\/(\d{2})\/(\d{4})$/', $f, $m)) {
            $f = "{$m[3]}-{$m[2]}-{$m[1]}";
        }
        $porFecha[$f][] = $fac;
    }
    ksort($porFecha);

    $ultimoNum = 0;

    foreach ($porFecha as $fecha => $facsDelDia) {
        $hora   = 9;
        $minuto = 0;

        foreach ($facsDelDia as $fac) {
            if ($isNewFormat) {
                $numNura = ++$autoNum;
                $total   = round(floatval($fac['importe'] ?? 0));
            } else {
                $numNura = intval($fac['numNura'] ?? 0);
                $total   = round(floatval($fac['total']   ?? 0));
            }

            $inumfac  = str_pad($numNura, 9, '0', STR_PAD_LEFT);
            $productos = $fac['productos'] ?? [];

            // 2 decimales: base + IVA = total exacto
            $base     = round($total / (1 + IVA_PCT / 100), 2);
            $cuotaIVA = round($total - $base, 2);

            // Hora progresiva por ticket (09:00, 09:05, 09:10...)
            $horaStr = sprintf('%02d:%02d:00', $hora, $minuto);
            $minuto += 5;
            if ($minuto >= 60) { $minuto -= 60; $hora++; }
            if ($hora >= 21)   { $hora = 9; }

            // ===== INSERT FACCLI =====
            $stmtCab = $pdo->prepare("INSERT INTO FACCLI (
                ID_EMP, ID_PROCESS, VCODCAN, INUMFAC,
                FFDOCFAC, FFENTFAC, VCODCLI, VNCOMCLI, VNFISCLI,
                DIMP1FAC, DPIVA1FAC, DIIVA1FAC, DTOTALFAC,
                DSUMA_IMPONIBLES, DBASE_TOTAL, DBASE_IRPF,
                VESTADOCOB, VESTADO, VCODFPA, IDFPA, IDALM,
                VREGIMEN_IVA, VFUENTE
            ) VALUES (
                :idemp, 1004, :canal, :inumfac,
                :fecha, :fecha, :codcli, :vncomcli, :vnfiscli,
                :base, :ivapct, :ivacuota, :total,
                :base, :total, :base,
                'CO', 'CERR', :vcodfpa, :idfpa, :idalm,
                'GE', 'directo'
            )");
            $stmtCab->execute([
                ':idemp'    => ID_EMP,
                ':canal'    => CANAL,
                ':inumfac'  => $inumfac,
                ':fecha'    => $fecha,
                ':codcli'   => VCODCLI,
                ':vncomcli' => VNCOMCLI,
                ':vnfiscli' => VNFISCLI,
                ':base'     => $base,
                ':ivapct'   => IVA_PCT,
                ':ivacuota' => $cuotaIVA,
                ':total'    => $total,
                ':vcodfpa'  => VCODFPA,
                ':idfpa'    => IDFPA,
                ':idalm'    => IDALM,
            ]);

            $idFac = $pdo->lastInsertId();
            if ($numNura > $ultimoNum) $ultimoNum = $numNura;

            // Descripcion: nombre(s) real(es) del producto concatenados
            if (!empty($productos)) {
                $nombres = [];
                foreach ($productos as $p) {
                    $n = trim($p['nombre'] ?? '');
                    if ($n !== '') $nombres[] = $n;
                }
                $desc = mb_substr(implode(' / ', $nombres) ?: VDESARTI, 0, 120);
            } else {
                $desc = VDESARTI;
            }

            // ===== INSERT FACCLI_LIN =====
            // DPRUFACD     = precio unitario neto (sin IVA)
            // DPRUFACD_IVA = precio unitario con IVA (Nura muestra este)
            // DTOTFACD     = total linea sin IVA
            // DTOTFACD_IVA = total linea con IVA (Nura muestra este)
            $stmtLin = $pdo->prepare("INSERT INTO FACCLI_LIN (
                IDFAC, VCODARTI, VDESARTI, DCANTIDAD,
                DPRUFACD, DPRUFACD_NETO, DPRUFACD_IVA, DPIVAFACD,
                IDARTI, DTOTFACD, DTOTFACD_IVA, IORDFACD, VTIPOLINEA
            ) VALUES (
                :idfac, :codarti, :desarti, 1,
                :base, :base, :total, :ivapct,
                :idarti, :base, :total, 1, 'ARTI'
            )");
            $stmtLin->execute([
                ':idfac'   => $idFac,
                ':codarti' => VCODARTI,
                ':desarti' => $desc,
                ':base'    => $base,
                ':total'   => $total,
                ':ivapct'  => IVA_PCT,
                ':idarti'  => IDARTI,
            ]);

            // ===== INSERT FACCLI_COB =====
            // IDVEN es nullable; el importe se gestiona via vencimientos externos
            $stmtCob = $pdo->prepare("INSERT INTO FACCLI_COB (
                IDFAC, VTIPCOB, FFECCOB, IDFPA
            ) VALUES (
                :idfac, 'CO', :fecha, :idfpa
            )");
            $stmtCob->execute([
                ':idfac' => $idFac,
                ':fecha' => $fecha,
                ':idfpa' => IDFPA,
            ]);

            $insertadas[] = [
                'idfac'   => $idFac,
                'inumfac' => CANAL . '-' . $inumfac,
                'fecha'   => $fecha,
                'total'   => $total,
            ];
        }
    }

    // Actualizar contador en tabla CONTADORES
    if ($ultimoNum > 0) {
        $stmtCtr = $pdo->prepare("UPDATE CONTADORES SET IVALCON = ? WHERE IDCON = ?");
        $stmtCtr->execute([$ultimoNum, IDCON_CTR]);
    }

    $pdo->commit();

    echo json_encode([
        'ok'         => true,
        'insertadas' => count($insertadas),
        'facturas'   => $insertadas,
    ]);

} catch (Exception $e) {
    $pdo->rollBack();
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
}
