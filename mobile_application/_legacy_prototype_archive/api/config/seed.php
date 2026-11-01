<?php
// api/config/seed.php
require_once 'db.php';

$password_hash = password_hash('password123', PASSWORD_BCRYPT);
$users = [
    ['usr_land1', 'Land Allocator', 'lands@agric.gov.zw', $password_hash, 'LANDS_ACQ_ROLE', 'Allocation'],
    ['usr_zlc1', 'ZLC Officer', 'zlc@agric.gov.zw', $password_hash, 'ZLC_ROLE', 'Commission'],
    ['usr_surv1', 'Surveyor General', 'survey@agric.gov.zw', $password_hash, 'LIMS_SURVEYOR_ROLE', 'Survey'],
    ['usr_fin1', 'Finance Cashier', 'finance@agric.gov.zw', $password_hash, 'FINANCE_ROLE', 'Accounting'],
    ['usr_admin1', 'System Admin', 'admin@agric.gov.zw', $password_hash, 'ADMIN_ROLE', 'Admin']
];

foreach($users as $u) {
    try {
        $stmt = $conn->prepare("INSERT IGNORE INTO users (id, name, email, password_hash, role_id, department) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute($u);
        echo "Inserted {$u[2]}\n";
    } catch(PDOException $e) {
        // Ignore duplicate inserts
    }
}
echo "Seed complete!\n";
?>
