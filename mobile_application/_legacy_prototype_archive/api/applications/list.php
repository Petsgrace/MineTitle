<?php
// api/applications/list.php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET");

require_once '../config/db.php';
require_once '../middleware/auth_middleware.php';

$user = authorize();

try {
    $query = "SELECT a.id, a.applicant_id, a.current_stage, a.status, a.created_at, u.name as applicant_name FROM applications a JOIN users u ON a.applicant_id = u.id";
    
    switch($user['role_id']) {
        case 'FARMER_ROLE':
            $query .= " WHERE a.applicant_id = :user_id";
            $stmt = $conn->prepare($query);
            $stmt->bindParam(':user_id', $user['id']);
            break;
        case 'LANDS_ACQ_ROLE':
            $query .= " WHERE a.current_stage = 'SUBMITTED'";
            $stmt = $conn->prepare($query);
            break;
        case 'ZLC_ROLE':
            $query .= " WHERE a.current_stage = 'VERIFIED'";
            $stmt = $conn->prepare($query);
            break;
        case 'LIMS_SURVEYOR_ROLE':
            $query .= " WHERE a.current_stage = 'ZLC_CLEARED'";
            $stmt = $conn->prepare($query);
            break;
        case 'FINANCE_ROLE':
            $query .= " WHERE a.current_stage = 'SURVEYED'";
            $stmt = $conn->prepare($query);
            break;
        case 'ADMIN_ROLE':
            $stmt = $conn->prepare($query);
            break;
        default:
            http_response_code(403);
            echo json_encode(["message" => "No specific access defined."]);
            exit;
    }
    
    $stmt->execute();
    $applications = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    http_response_code(200);
    echo json_encode(array("count" => count($applications), "data" => $applications));
} catch(PDOException $e) {
    http_response_code(500);
    echo json_encode(array("error" => "Database error: " . $e->getMessage()));
}
?>
