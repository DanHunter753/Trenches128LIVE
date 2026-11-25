# list a RAR4/RAR5 archive's entries and compression methods (no extraction)
import sys,struct
def vint(b,i):
    v=0;s=0
    while True:
        c=b[i];i+=1;v|=(c&0x7f)<<s;s+=7
        if not c&0x80: return v,i
def rar5(f):
    f.seek(8); out=[]
    while True:
        h=f.read(4+3)
        if len(h)<7: break
        f.seek(-3,1); hb=f.read(3); hs,i=vint(hb,0); f.seek(-3+i,1)
        hdr=f.read(hs); typ,j=vint(hdr,0); fl,j=vint(hdr,j); ex=ds=0
        if fl&1: ex,j=vint(hdr,j)
        if fl&2: ds,j=vint(hdr,j)
        if typ==2:
            ff,j=vint(hdr,j); us,j=vint(hdr,j); at,j=vint(hdr,j)
            if ff&2: j+=4
            if ff&4: j+=4
            ci,j=vint(hdr,j); hos,j=vint(hdr,j); nl,j=vint(hdr,j); name=hdr[j:j+nl].decode('utf8','replace')
            out.append((name,(ci>>7)&7,ds,us,ff&1))
        if typ==5: break
        f.seek(ds,1)
    return out
def rar4(f):
    f.seek(7); out=[]
    while True:
        h=f.read(7)
        if len(h)<7: break
        crc,typ,fl,hs=struct.unpack('<HBHH',h); rest=f.read(hs-7)
        add=0
        if typ==0x74:
            ps,us,os_,fc,ft,ver,meth,nl,at=struct.unpack('<IIBIIBBHI',rest[:25]); add=ps
            name=rest[25+(8 if fl&0x100 else 0):25+(8 if fl&0x100 else 0)+nl].decode('latin1')
            out.append((name,meth-0x30,ps,us,0))
        elif fl&0x8000: add=struct.unpack('<I',rest[:4])[0]
        if typ==0x7b: break
        f.seek(add,1)
    return out
f=open(sys.argv[1],'rb'); sig=f.read(8)
ents=rar5(f) if sig==b'Rar!\x1a\x07\x01\x00' else rar4(f)
print('RAR5' if sig.startswith(b'Rar!\x1a\x07\x01') else 'RAR4', len(ents),'entries')
from collections import Counter
print('methods (0=store):',Counter(m for _,m,_,_,_ in ents))
for e in ents[:int(sys.argv[2]) if len(sys.argv)>2 else 40]: print(e)
