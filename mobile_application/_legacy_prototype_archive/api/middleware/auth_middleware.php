<?php
// api/middleware/auth_middleware.php
require_once __DIR__ . '/../utils/jwt_helper.php';

function get_authorization_header() {
    $headers = null;
    if (isset($_SERVER['Authorization'])) {
        $headers = trim($_SERVER["Authorization"]);
    } else if (isset($_SERVER['HTTP_AUTHORIZATION'])) { 
        $headers = trim($_SERVER["HTTP_AUTHORIZATION"]);
    } elseif (function_exists('apache_request_headers')) {
        $requestHeaders = apache_request_headers();
        // Server-side fix for IIS
        $requestHeaders = array_combine(array_map('ucwords', array_keys($requestHeaders)), array_values($requestHeaders));
        if (isset($requestHeaders['Authorization'])) {
            $headers = trim($requestHeaders['Authorization']);
        }
    }
    return $headers;
}

function authorize($allowed_roles = []) {
    $auth_header = get_authorization_header();
    
    if (preg_match('/Bearer\s(\S+)/', $auth_header, $matches)) {
        $jwt = $matches[1];
        $decoded = verify_jwt($jwt);
        
        if($decoded && $decoded['exp'] > time()) {
            if(!empty($allowed_roles)) {
                if(in_array($decoded['role_id'], $allowed_roles)) {
                    return $decoded;
                } else {
                    http_response_code(403);
                    echo json_encode(array("message" => "Forbidden: Insufficient role permissions."));
                    exit;
                }
            }
            return $decoded; // Valid JWT and no specific roles required
        }
    }
    
    http_response_code(401);
    echo json_encode(array("message" => "Unauthorized: Invalid or missing token."));
    exit;
}
?>
