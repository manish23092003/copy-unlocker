import os
import sys
import zipfile

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUTPUT_ZIP = os.path.join(PROJECT_ROOT, 'copy-unlocker-v1.1.0.zip')

# Strict manifest of required release files relative to project root
REQUIRED_FILES = [
    'manifest.json',
    'background.js',
    'content.js',
    'popup.html',
    'popup.css',
    'popup.js',
    'offscreen.html',
    'offscreen.js',
    'icons/icon16.png',
    'icons/icon32.png',
    'icons/icon48.png',
    'icons/icon128.png',
    'lib/tesseract.min.js',
    'lib/worker.min.js',
    'lib/tesseract-core-lstm.wasm.js',
    'lib/tesseract-core-lstm.wasm',
    'lib/tesseract-core-simd-lstm.wasm.js',
    'lib/tesseract-core-simd-lstm.wasm',
    'lib/tessdata/eng.traineddata'
]

print(f"Building Chrome Web Store Release Package...")
print(f"Project root: {PROJECT_ROOT}")
print(f"Target archive: {OUTPUT_ZIP}\n")

# Verify all required files exist
missing = []
for rel_path in REQUIRED_FILES:
    abs_path = os.path.join(PROJECT_ROOT, rel_path)
    if not os.path.isfile(abs_path):
        missing.append(rel_path)

if missing:
    print(f"ERROR: Missing required files for release package:")
    for m in missing:
        print(f"  - {m}")
    sys.exit(1)

# Remove existing zip if present
if os.path.exists(OUTPUT_ZIP):
    os.remove(OUTPUT_ZIP)

# Build ZIP archive
with zipfile.ZipFile(OUTPUT_ZIP, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
    for rel_path in REQUIRED_FILES:
        abs_path = os.path.join(PROJECT_ROOT, rel_path)
        # Store with forward slashes for cross-platform ZIP standard
        arcname = rel_path.replace(os.sep, '/')
        zf.write(abs_path, arcname=arcname)
        file_size = os.path.getsize(abs_path)
        print(f"  [+] Added: {arcname:36} ({file_size:>10,} bytes)")

print(f"\nArchive created successfully: {OUTPUT_ZIP}")
total_size = os.path.getsize(OUTPUT_ZIP)
print(f"Total ZIP size: {total_size:,} bytes ({total_size / (1024*1024):.2f} MB)\n")

# Validate ZIP archive
print("--- Validating Archive Contents ---")
with zipfile.ZipFile(OUTPUT_ZIP, 'r') as zf:
    namelist = zf.namelist()
    test_result = zf.testzip()
    if test_result is not None:
        print(f"ERROR: Corrupted file detected in zip: {test_result}")
        sys.exit(1)

    # Check root manifest
    if 'manifest.json' not in namelist:
        print("ERROR: manifest.json is NOT at the root of the ZIP!")
        sys.exit(1)

    print("[OK] manifest.json is located at ZIP root")
    print(f"[OK] Archive contains {len(namelist)} verified files")
    print("[OK] CRC-32 integrity checks passed on all entries")

    # Edge Add-ons Partner Center nested compression check
    disallowed_exts = ('.gz', '.zip', '.tar', '.bz2', '.7z', '.rar', '.tgz')
    compressed_entries = [name for name in namelist if name.lower().endswith(disallowed_exts)]
    if compressed_entries:
        print(f"ERROR: Found compressed file(s) that Microsoft Edge Partner Center rejects:")
        for ce in compressed_entries:
            print(f"  - {ce}")
        sys.exit(1)
    
    # Check magic headers of all files to ensure no hidden/renamed compressed archives
    for name in namelist:
        data = zf.read(name)
        if len(data) >= 2 and data[0] == 0x1F and data[1] == 0x8B:
            print(f"ERROR: File {name} has GZIP magic header (0x1F8B)!")
            sys.exit(1)
        if len(data) >= 4 and data[:4] == b'PK\x03\x04':
            print(f"ERROR: File {name} has nested ZIP magic header!")
            sys.exit(1)

    print("[OK] Verified zero nested compressed files (.gz, .zip, etc.) - Edge Partner Center Compliant")

# Also copy/generate copy-unlocker.zip for direct upload
import shutil
EDGE_ZIP = os.path.join(PROJECT_ROOT, 'copy-unlocker.zip')
shutil.copyfile(OUTPUT_ZIP, EDGE_ZIP)
print(f"[OK] Also generated: {EDGE_ZIP} ({os.path.getsize(EDGE_ZIP):,} bytes)")

print("\nRelease ZIP validation SUCCESSFUL for Chrome Web Store and Microsoft Edge Add-ons!")
