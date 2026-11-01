<?php
// api/config/init.php
// Run this script from the browser or CLI to initialize the database

$host = 'localhost';
$username = 'root';
$password = '';

try {
    $conn = new PDO("mysql:host=$host", $username, $password);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Create DB
    $sql = "CREATE DATABASE IF NOT EXISTS title_deeds";
    $conn->exec($sql);
    echo "Database 'title_deeds' ready.\n";
    
    // Switch to title_deeds db
    $conn->exec("USE title_deeds");
    
    // Create users table
    $sql_users = "
    CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role_id VARCHAR(50) NOT NULL,
        department VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )";
    $conn->exec($sql_users);
    echo "Users table ready.\n";
    
    // Create applications table
    $sql_apps = "
    CREATE TABLE IF NOT EXISTS applications (
        id VARCHAR(36) PRIMARY KEY,
        applicant_id VARCHAR(36) NOT NULL,
        current_stage VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (applicant_id) REFERENCES users(id) ON DELETE CASCADE
    )";
    $conn->exec($sql_apps);
    echo "Applications table ready.\n";
    
} catch(PDOException $e) {
    echo "Creation failed: " . $e->getMessage();
}
?>
