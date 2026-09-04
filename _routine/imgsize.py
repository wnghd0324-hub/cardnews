# 외부 라이브러리 없이 이미지 크기 측정 (JPEG/PNG/GIF)
import struct
def imgsize(path):
    with open(path, 'rb') as f:
        head = f.read(26)
    if head[:8] == b'\x89PNG\r\n\x1a\n':
        w, h = struct.unpack('>II', head[16:24]); return (w, h)
    if head[:2] == b'\xff\xd8':
        with open(path, 'rb') as f:
            f.read(2)
            while True:
                b = f.read(1)
                while b and b != b'\xff': b = f.read(1)
                m = f.read(1)
                while m == b'\xff': m = f.read(1)
                if m in (b'\xc0', b'\xc1', b'\xc2', b'\xc3', b'\xc5', b'\xc6',
                         b'\xc7', b'\xc9', b'\xca', b'\xcb', b'\xcd', b'\xce', b'\xcf'):
                    f.read(3); h, w = struct.unpack('>HH', f.read(4)); return (w, h)
                ln = struct.unpack('>H', f.read(2))[0]; f.read(ln - 2)
    if head[:6] in (b'GIF87a', b'GIF89a'):
        w, h = struct.unpack('<HH', head[6:10]); return (w, h)
    return None
