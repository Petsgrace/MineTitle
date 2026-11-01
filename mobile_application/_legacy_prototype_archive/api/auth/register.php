<?php
// api/auth/register.php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

require_once '../config/db.php';
require_once '../utils/jwt_helper.php';

$data = json_decode(file_get_contents("php://input"));

if(!empty($data->name) && !empty($data->email) && !empty($data->password) && !empty($data->role_id)) {
    try {
        $id = uniqid('usr_', true);
        $password_hash = password_hash($data->password, PASSWORD_BCRYPT);
        
        $query = "INSERT INTO users (id, name, email, password_hash, role_id, department) VALUES (:id, :name, :email, :password_hash, :role_id, :department)";
        
        $stmt = $conn->prepare($query);
        $stmt->bindParam(':id', $id);
        $stmt->bindParam(':name', $data->name);
        $stmt->bindParam(':email', $data->email);
        $stmt->bindParam(':password_hash', $password_hash);
        $stmt->bindParam(':role_id', $data->role_id);
        
        $department = isset($data->department) ? $data->department : null;
        $stmt->bindParam(':department', $department);
        
        if($stmt->execute()) {
            http_response_code(201);
            echo json_encode(array("message" => "User was registered."));
        } else {
            http_response_code(503);
            echo json_encode(array("message" => "Unable to register the user."));
        }
    } catch(PDOException $e) {
        http_response_code(400);
        echo json_encode(array("error" => "Registration failed. Email might already exist."));
    }
} else {
    http_response_code(400);
    echo json_encode(array("message" => "Unable to register user. Data is incomplete."));
}
?>
