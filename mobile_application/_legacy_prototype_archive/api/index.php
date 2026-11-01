<?php
// api/index.php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

echo json_encode(array("message" => "Welcome to the Title Deeds System API."));
?>
