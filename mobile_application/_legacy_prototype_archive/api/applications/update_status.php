<?php
// api/applications/update_status.php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: PATCH");

require_once '../config/db.php';
require_once '../middleware/auth_middleware.php';

$user = authorize(['LANDS_ACQ_ROLE', 'ZLC_ROLE', 'LIMS_SURVEYOR_ROLE', 'FINANCE_ROLE', 'ADMIN_ROLE']);
$data = json_decode(file_get_contents("php://input"));

if(!isset($_GET['id']) || empty($data->new_stage)) {
    http_response_code(400);
    echo json_encode(["message" => "Application ID and new_stage required."]);
    exit;
}

$app_id = $_GET['id'];
$new_stage = $data->new_stage;
$status = isset($data->status) ? $data->status : 'APPROVED';

// RBAC validation to ensure step linearity
$valid_transition = false;
if($user['role_id'] === 'LANDS_ACQ_ROLE' && $new_stage === 'VERIFIED') $valid_transition = true;
if($user['role_id'] === 'ZLC_ROLE' && $new_stage === 'ZLC_CLEARED') $valid_transition = true;
if($user['role_id'] === 'LIMS_SURVEYOR_ROLE' && $new_stage === 'SURVEYED') $valid_transition = true;
if($user['role_id'] === 'FINANCE_ROLE' && $new_stage === 'PAID') $valid_transition = true;
if($user['role_id'] === 'ADMIN_ROLE') $valid_transition = true;

if(!$valid_transition) {
    http_response_code(403);
    echo json_encode(["message" => "Your role does not have permission to transition an application to this stage."]);
    exit;
}

try {
    $query = "UPDATE applications SET current_stage = :new_stage, status = :status WHERE id = :id";
    $stmt = $conn->prepare($query);
    $stmt->bindParam(':new_stage', $new_stage);
    $stmt->bindParam(':status', $status);
    $stmt->bindParam(':id', $app_id);
    
    if($stmt->execute()) {
        http_response_code(200);
        echo json_encode(["message" => "Application status updated successfully."]);
    } else {
        http_response_code(503);
        echo json_encode(["message" => "Unable to update application."]);
    }
} catch(PDOException $e) {
    http_response_code(500);
    echo json_encode(["error" => "Update failed: " . $e->getMessage()]);
}
?>
