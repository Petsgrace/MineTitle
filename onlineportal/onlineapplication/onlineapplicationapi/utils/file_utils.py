"""
File Utilities
Secure filename generation and path partitioning for file uploads.
"""

import os
import uuid


def secure_file_upload_path(instance, filename: str) -> str:
    """
    Generates a secure, randomized storage path for uploaded files.
    
    Structure: uploads/<model_name>/<uuid4>.<extension>
    
    Examples:
      - uploads/titledeedapplication/3a9f8b2c1234456789abcdef01234567.pdf
      - uploads/spousedetail/7b8a9c0d1234456789abcdef01234567.jpg
      
    Args:
        instance: Django model instance (TitleDeedApplication or SpouseDetail)
        filename: Original filename submitted by user
        
    Returns:
        Partitioned secure relative path string
    """
    # Extract file extension safely
    ext = ''
    if '.' in filename:
        ext = filename.rsplit('.', 1)[-1].lower()
    
    # Generate random UUID filename to prevent path traversal and collisions
    secure_filename = f"{uuid.uuid4().hex}"
    if ext:
        secure_filename = f"{secure_filename}.{ext}"
        
    model_folder = instance.__class__.__name__.lower()
    return os.path.join('uploads', model_folder, secure_filename)
