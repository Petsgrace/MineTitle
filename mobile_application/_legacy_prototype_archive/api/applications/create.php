<?php
// api/applications/create.php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");

require_once '../config/db.php';
require_once '../middleware/auth_middleware.php';

$user = authorize(['FARMER_ROLE', 'ADMIN_ROLE']);

$data = json_decode(file_get_contents("php://input"));

try {
    $id = uniqid('app_', true);
    $current_stage = 'SUBMITTED';
    $status = 'PENDING';
    
    $query = "INSERT INTO applications (id, applicant_id, current_stage, status) VALUES (:id, :applicant_id, :current_stage, :status)";
    $stmt = $conn->prepare($query);
    $stmt->bindParam(':id', $id);
    $stmt->bindParam(':applicant_id', $user['id']);
    $stmt->bindParam(':current_stage', $current_stage);
    $stmt->bindParam(':status', $status);
    
    if($stmt->execute()) {
        http_response_code(201);
        echo json_encode(array("message" => "Application successfully submitted.", "application_id" => $id));
    } else {
        http_response_code(503);
        echo json_encode(array("message" => "Unable to submit application."));
    }
} catch(PDOException $e) {
    http_response_code(500);
    echo json_encode(array("error" => "Submission failed: " . $e->getMessage()));
}
?>
