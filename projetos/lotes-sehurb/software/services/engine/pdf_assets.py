"""Bounded ephemeral PDF assets: no base64 document and no eager page gallery."""
from collections import OrderedDict
from dataclasses import dataclass,field
from io import BytesIO
import secrets,threading,time
from pypdf import PdfReader
from .store import DomainError

PDFIUM_LOCK=threading.Lock()

@dataclass
class Asset:
    project:str
    pdf:bytes
    map:bytes
    framing:dict
    count:int
    expires:float
    filename:str
    pages:OrderedDict=field(default_factory=OrderedDict)

class PdfAssets:
    def __init__(self,limit=3,max_bytes=64*1024*1024,ttl=1800,clock=time.monotonic):
        self.items=OrderedDict();self.lock=threading.RLock();self.limit=limit;self.max_bytes=max_bytes;self.ttl=ttl;self.clock=clock
    def _prune(self):
        for key in list(self.items):
            if self.items[key].expires<self.clock():del self.items[key]
    def put(self,project,pdf,map_image,framing,filename):
        count=len(PdfReader(BytesIO(pdf)).pages);size=len(pdf)+len(map_image)
        if size>self.max_bytes:raise DomainError('O PDF ultrapassou o limite da prévia. Reduza o enquadramento ou as bases visíveis.')
        with self.lock:
            self._prune()
            while self.items and (len(self.items)>=self.limit or sum(len(v.pdf)+len(v.map) for v in self.items.values())+size>self.max_bytes):self.items.popitem(last=False)
            token=secrets.token_urlsafe(24);self.items[token]=Asset(project,pdf,map_image,framing,count,self.clock()+self.ttl,filename)
        base=f'/api/projects/{project}/pdf-previews/{token}'
        return {'pdfUrl':base+'/document.pdf','previewUrl':base+'/pages/0.jpg','previews':[base+f'/pages/{i}.jpg' for i in range(count)],'mapPreviewUrl':base+'/map.png','pageCount':count,'framing':framing}
    def get(self,project,token):
        with self.lock:
            self._prune();entry=self.items.get(token)
            if not entry or entry.project!=project:raise DomainError('A prévia expirou. Gere o PDF novamente.',404)
            entry.expires=self.clock()+self.ttl;self.items.move_to_end(token);return entry
    def page(self,project,token,index):
        entry=self.get(project,token)
        if not 0<=index<entry.count:raise DomainError('Folha não encontrada.',404)
        # PDFium is not thread-safe. Render only the requested page and retain two.
        with PDFIUM_LOCK:
            if index in entry.pages:return entry.pages[index]
            import pypdfium2
            with pypdfium2.PdfDocument(entry.pdf) as document:
                page=document[index]
                try:
                    bitmap=page.render(scale=1.2)
                    try:
                        output=BytesIO();bitmap.to_pil().convert('RGB').save(output,format='JPEG',quality=88);value=output.getvalue()
                    finally:bitmap.close()
                finally:page.close()
            entry.pages[index]=value
            while len(entry.pages)>2:entry.pages.popitem(last=False)
            return value

assets=PdfAssets()
