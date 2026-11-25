import ctypes, os, sys
# Extract an archive with the system libarchive via ctypes (no rar tool installed). Untrusted input: guards against traversal/symlinks.
src, dst, mode = sys.argv[1], sys.argv[2], (sys.argv[3] if len(sys.argv) > 3 else 'list')
prefixes = sys.argv[4:]
lib = ctypes.CDLL('libarchive.so.13')
lib.archive_read_new.restype = ctypes.c_void_p
lib.archive_error_string.restype = ctypes.c_char_p
lib.archive_entry_pathname.restype = ctypes.c_char_p
lib.archive_entry_size.restype = ctypes.c_int64
lib.archive_entry_filetype.restype = ctypes.c_uint
for f in ('archive_read_support_format_all', 'archive_read_support_filter_all'): getattr(lib, f).argtypes = [ctypes.c_void_p]
lib.archive_read_open_filename.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_size_t]
lib.archive_read_next_header.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p)]
lib.archive_read_data.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_size_t]
lib.archive_read_data.restype = ctypes.c_ssize_t
lib.archive_entry_pathname.argtypes = [ctypes.c_void_p]; lib.archive_entry_size.argtypes = [ctypes.c_void_p]; lib.archive_entry_filetype.argtypes = [ctypes.c_void_p]
a = lib.archive_read_new(); lib.archive_read_support_format_all(a); lib.archive_read_support_filter_all(a)
if lib.archive_read_open_filename(a, src.encode(), 1 << 20) != 0: sys.exit('open failed: ' + str(lib.archive_error_string(a)))
ent = ctypes.c_void_p(); buf = ctypes.create_string_buffer(1 << 20); n = 0; total = 0
root = os.path.realpath(dst); os.makedirs(root, exist_ok=True)
while lib.archive_read_next_header(a, ctypes.byref(ent)) == 0:
    name = lib.archive_entry_pathname(ent).decode('utf-8', 'replace'); size = lib.archive_entry_size(ent); ft = lib.archive_entry_filetype(ent) & 0o170000
    n += 1; total += max(0, size)
    if mode == 'list':
        print(f'{size:>12}  {"d" if ft == 0o040000 else "-"}  {name}'); continue
    if prefixes and not any(name.startswith(p) for p in prefixes): continue
    parts = [p for p in name.replace('\\', '/').split('/') if p not in ('', '.')]
    if '..' in parts or name.startswith('/'): print('SKIP unsafe path', name); continue
    out = os.path.realpath(os.path.join(root, *parts))
    if not out.startswith(root + os.sep): print('SKIP escape', name); continue
    if ft == 0o040000: os.makedirs(out, exist_ok=True); continue
    if ft != 0o100000: print('SKIP non-regular', name); continue
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'wb') as f:
        while True:
            r = lib.archive_read_data(a, buf, len(buf))
            if r <= 0: break
            f.write(buf.raw[:r])
print(f'{n} entries, {total/1e6:.1f} MB uncompressed', file=sys.stderr)
