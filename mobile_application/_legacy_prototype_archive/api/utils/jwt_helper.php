<?php
// api/utils/jwt_helper.php
// Generates and validats JWTs securely

function create_jwt($payload, $secret = 'super_secret_jwt_title_deeds_key') {
    $header = json_encode(['typ' => 'JWT', 'alg' => 'HS256']);
    $payload = json_encode($payload);

    $base64UrlHeader = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($header));
    $base64UrlPayload = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($payload));

    $signature = hash_hmac('sha256', $base64UrlHeader . "." . $base64UrlPayload, $secret, true);
    $base64UrlSignature = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($signature));

    return $base64UrlHeader . "." . $base64UrlPayload . "." . $base64UrlSignature;
}

function verify_jwt($jwt, $secret = 'super_secret_jwt_title_deeds_key') {
    $tokenParts = explode('.', $jwt);
    if(count($tokenParts) != 3) return false;
    
    $header = $tokenParts[0];
    $payload = $tokenParts[1];
    $signature_provided = $tokenParts[2];

    $signature = hash_hmac('sha256', $header . "." . $payload, $secret, true);
    $base64UrlSignature = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($signature));

    if ($base64UrlSignature === $signature_provided) {
        return json_decode(base64_decode(str_replace(['-', '_'], ['+', '/'], $payload)), true);
    } else {
        return false;
    }
}
?>
