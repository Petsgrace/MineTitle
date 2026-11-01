"""
Upload Validators
Application-level validation for uploaded documents.
Enforces file size caps and strict extension/MIME restrictions.
"""

from django.core.exceptions import ValidationError

# Maximum allowed file size in MB
MAX_FILE_SIZE_MB = 10

# Allowed file extensions and corresponding MIME types
ALLOWED_EXTENSIONS = {'pdf', 'jpg', 'jpeg', 'png'}

ALLOWED_MIME_TYPES = {
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/pjpeg',
}


def validate_uploaded_file(file_obj):
    """
    Validates uploaded file size and extension/MIME header.
    
    Args:
        file_obj: UploadedFile instance from Django form/serializer
        
    Raises:
        ValidationError: If file exceeds size cap or has unauthorized format
    """
    if not file_obj:
        return
        
    # 1. Size Validation
    max_bytes = MAX_FILE_SIZE_MB * 1024 * 1024
    if file_obj.size > max_bytes:
        raise ValidationError(
            f"File size ({file_obj.size / (1024 * 1024):.1f}MB) exceeds the maximum allowed limit of {MAX_FILE_SIZE_MB}MB."
        )
        
    # 2. Extension Validation
    filename = getattr(file_obj, 'name', '')
    ext = ''
    if '.' in filename:
        ext = filename.rsplit('.', 1)[-1].lower()
        
    if ext not in ALLOWED_EXTENSIONS:
        allowed_str = ', '.join(sorted(ALLOWED_EXTENSIONS)).upper()
        raise ValidationError(
            f"Invalid file format '.{ext}'. Allowed formats: {allowed_str}."
        )
        
    # 3. Content Type (MIME) Header Check
    content_type = getattr(file_obj, 'content_type', '').lower()
    if content_type and content_type not in ALLOWED_MIME_TYPES:
        allowed_str = ', '.join(sorted(ALLOWED_EXTENSIONS)).upper()
        raise ValidationError(
            f"Invalid file type '{content_type}'. Allowed formats: {allowed_str}."
        )
