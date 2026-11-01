<?php
// api/auth/login.php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

require_once '../config/db.php';
require_once '../utils/jwt_helper.php';

$data = json_decode(file_get_contents("php://input"));

if(!empty($data->email) && !empty($data->password)) {
    $query = "SELECT id, name, email, password_hash, role_id, department FROM users WHERE email = :email LIMIT 0,1";
    $stmt = $conn->prepare($query);
    $stmt->bindParam(':email', $data->email);
    $stmt->execute();
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if($user && password_verify($data->password, $user['password_hash'])) {
        $token_payload = [
            "id" => $user['id'],
            "email" => $user['email'],
            "role_id" => $user['role_id'],
            "department" => $user['department'],
            "exp" => time() + (86400 * 7) // 7 days
        ];
        
        $jwt = create_jwt($token_payload);
        
        http_response_code(200);
        echo json_encode(
            array(
                "message" => "Successful login.",
                "jwt" => $jwt,
                "user" => [
                    "id" => $user['id'],
                    "name" => $user['name'],
                    "role_id" => $user['role_id'],
                    "department" => $user['department']
                ]
            )
        );
    } else {
        http_response_code(401);
        echo json_encode(array("message" => "Login failed. Incorrect credentials."));
    }
} else {
    http_response_code(400);
    echo json_encode(array("message" => "Please provide email and password."));
}
?>
