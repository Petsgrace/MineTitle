import re

def format_national_id(raw_id: str) -> str:
    """
    Standardize National ID to hyphenated format: XX-XXXXXXX-L-XX
    Handles:
    - 32188288T50 (8 numbers before T) -> 32-188288-T-50
    - 324556233T32 (9 numbers before T) -> 32-4556233-T-32
    
    Args:
        raw_id: Raw string input from user
        
    Returns:
        Formatted National ID string if it looks like an ID, otherwise original string.
    """
    if not raw_id:
        return raw_id
        
    # Remove all non-alphanumeric characters (hyphens, spaces, etc.)
    clean_id = re.sub(r'[^a-zA-Z0-9]', '', raw_id).upper()
    
    # Basic check to see if this is likely a National ID
    # Pattern: 8-12 digits and characters, with exactly one or two letters inside
    # Zimbabwe IDs are typically XX-XXXXXXX-L-XX or similar
    if len(clean_id) < 9 or len(clean_id) > 15:
        return raw_id # Too short or long, likely a standard username
        
    # Find all letters
    letters = re.findall(r'[A-Z]', clean_id)
    if not letters:
        return raw_id # No letters, could be a numeric EC number but not a National ID
        
    # Find the FIRST letter part
    match = re.search(r'([A-Z])', clean_id)
    if not match:
        return clean_id
        
    letter_index = match.start()
    letter = match.group(1)
    
    # Split the clean ID around the letter
    prefix = clean_id[:2]
    middle = clean_id[2:letter_index]
    suffix = clean_id[letter_index+1:]
    
    # Safety Check: If parts are empty or look wrong, don't format
    if not middle or not suffix:
        return raw_id # Likely a staff username like "ADMIN" or "MANAGER"

    # Standardize format: XX-XXXXXXX-L-XX
    return f"{prefix}-{middle}-{letter}-{suffix}"
