# extract only the STORED (uncompressed) files from a RAR5 archive
import sys,os
sys.path.insert(0,'/home/claude/tools')
def vint(b,i):
    v=0;s=0
    while True:
        c=b[i];i+=1;v|=(c&0x7f)<<s;s+=7
        if not c&0x80: return v,i
src,dst=sys.argv[1],sys.argv[2]; f=open(src,'rb'); f.seek(8); n=0
while True:
    pos=f.tell(); h=f.read(4+16)
    if len(h)<8: break
    hs,i=vint(h,4); f.seek(pos+i); hdr=f.read(hs); typ,j=vint(hdr,0); fl,j=vint(hdr,j); ds=0
    if fl&1: _,j=vint(hdr,j)
    if fl&2: ds,j=vint(hdr,j)
    data_at=f.tell()
    if typ==2:
        ff,j=vint(hdr,j); us,j=vint(hdr,j); at,j=vint(hdr,j)
        if ff&2: j+=4
        if ff&4: j+=4
        ci,j=vint(hdr,j); hos,j=vint(hdr,j); nl,j=vint(hdr,j); name=hdr[j:j+nl].decode('utf8','replace')
        if not ff&1 and ((ci>>7)&7)==0 and ds==us and us>0 and '..' not in name:
            out=os.path.join(dst,name.replace('/','__')); open(out,'wb').write(f.read(ds)); n+=1; print('stored ->',out)
    if typ==5: break
    f.seek(data_at+ds)
print(n,'files')
