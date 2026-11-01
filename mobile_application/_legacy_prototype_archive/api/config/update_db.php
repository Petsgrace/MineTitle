<?php
require_once 'db.php';
try {
    $conn->exec("ALTER TABLE applications ADD COLUMN document_url VARCHAR(255) NULL");
    $conn->exec("ALTER TABLE applications ADD COLUMN deed_url VARCHAR(255) NULL");
    $conn->exec("ALTER TABLE applications ADD COLUMN payment_status VARCHAR(50) DEFAULT 'UNPAID'");
    echo "Database columns updated successfully.\n";
} catch(PDOException $e) {
    echo "Note: " . $e->getMessage() . "\n";
}
?>
