"""Native DXF dimensions, without replacing measured values with label text."""
import math
from shapely.geometry import shape


class NativeDimensions:
    def __init__(self,doc,prefix,style=None):
        self.doc=doc;self.msp=doc.modelspace();self.prefix=prefix
        if style:
            self.style=style;return
        self.style='SEHURB_COTAS';n=2
        while self.style in doc.dimstyles:self.style=f'SEHURB_COTAS_{n}';n+=1
        doc.dimstyles.new(self.style,dxfattribs={'dimtxt':.8,'dimasz':.35,'dimgap':.2,'dimexo':.15,'dimexe':.3,'dimtad':1,'dimdec':2,'dimdsep':44,'dimzin':0,'dimpost':'<> m','dimlfac':1,'dimscale':1})
    def layer(self,name):
        name=self.prefix+'_'+name
        if name not in self.doc.layers:self.doc.layers.new(name,dxfattribs={'color':7})
        return name
    def aligned(self,a,b,offset=1.5,layer='COTAS',color=None):
        if math.dist(a[:2],b[:2])<1e-7:return
        attrs={'layer':self.layer(layer)}
        if color:attrs['true_color']=int(color.lstrip('#'),16)
        dim=self.msp.add_aligned_dim(a[:2],b[:2],distance=offset,dimstyle=self.style,override={'dimpost':'<> m'},dxfattribs=attrs)
        # The ezdxf convenience factory creates a rotated linear dimension.
        # Store the native aligned type so CAD grip edits preserve alignment.
        dim.dimension.dxf.dimtype=(dim.dimension.dxf.dimtype & ~15)|1
        dim.render()
        return dim.dimension
    def polygon(self,geometry,layer='COTAS_GLEBAS',inside=False,seen=None,holes=False):
        g=shape(geometry)
        if g.geom_type!='Polygon':
            for p in g.geoms:self.polygon(p.__geo_interface__,layer,inside,seen,holes)
            return
        # Positive offsets are left of directed edge. Keep lot labels inside,
        # gleba labels outside, independently of ring winding.
        for ring,inner in [(g.exterior,inside)]+([(r,not inside) for r in g.interiors] if holes else []):
            offset=(1 if ring.is_ccw else -1)*(1 if inner else -1)*1.5
            for a,b in zip(ring.coords,list(ring.coords)[1:]):
                key=tuple(sorted((tuple(round(v,6) for v in a[:2]),tuple(round(v,6) for v in b[:2]))))
                if seen is not None:
                    if key in seen:continue
                    seen.add(key)
                self.aligned(a,b,offset,layer)
    @staticmethod
    def circle(points):
        if len(points)<3:return None
        a,b,c=points[:3];ux,uy=b[0]-a[0],b[1]-a[1];vx,vy=c[0]-a[0],c[1]-a[1]
        det=2*(ux*vy-uy*vx)
        if abs(det)<1e-9*max(ux*ux+uy*uy,vx*vx+vy*vy,1):return None
        u2=ux*ux+uy*uy;v2=vx*vx+vy*vy
        cx=a[0]+(u2*vy-v2*uy)/det;cy=a[1]+(ux*v2-vx*u2)/det;r=math.hypot(cx-a[0],cy-a[1])
        if r>1e7:return None
        return (cx,cy),r,1 if det>0 else -1
    def path(self,geometry,offset=2):
        coords=list(shape(geometry).coords);i=0
        def on_circle(p,c,r):return abs(math.dist(p,c)-r)<.0001
        while i<len(coords)-1:
            circle=self.circle(coords[i:i+3])
            if circle and i+3<len(coords) and on_circle(coords[i+3],circle[0],circle[1]):
                c,r,sign=circle;j=i+2
                while j+1<len(coords) and on_circle(coords[j+1],c,r):j+=1
                start=math.degrees(math.atan2(coords[i][1]-c[1],coords[i][0]-c[0]));end=math.degrees(math.atan2(coords[j][1]-c[1],coords[j][0]-c[0]))
                if sign<0:start,end=end,start
                dim=self.msp.add_arc_dim_cra(c,r,start,end,distance=offset,dimstyle=self.style,override={'dimpost':'<> m'},dxfattribs={'layer':self.layer('COTAS_ARCOS')})
                dim.render()
                radius=self.msp.add_radius_dim(c,radius=r,angle=start+((end-start)%360)/2,dimstyle=self.style,override={'dimpost':'<> m'},dxfattribs={'layer':self.layer('COTAS_RAIOS')})
                radius.render();i=j
            else:
                j=i+1
                # Merge consecutive collinear chords only; do not label curved
                # length as a straight end-to-end distance.
                while j+1<len(coords):
                    a,b,c=coords[i],coords[j],coords[j+1];dx,dy=b[0]-a[0],b[1]-a[1]
                    if abs(dx*(c[1]-a[1])-dy*(c[0]-a[0]))>1e-7*max(1,math.hypot(dx,dy)):break
                    j+=1
                self.aligned(coords[i],coords[j],offset,'COTAS_VIAS');i=j
    def roads(self,items):
        for item in items:
            if item['kind']!='road':continue
            width=item['width']/2;offset=width+max(item['sidewalkLeft'],item['sidewalkRight'])+2
            self.path(item['derived']['axisGeometry'],offset)
            for value in item['derived'].get('dimensions',[]):
                if value.get('kind')=='curb':self.path(value['geometry'],1)
            axis=shape(item['derived']['axisGeometry']);mid=axis.interpolate(.5,normalized=True)
            a=axis.interpolate(max(0,axis.length/2-.1));b=axis.interpolate(min(axis.length,axis.length/2+.1));length=a.distance(b)
            if length<1e-8:continue
            nx,ny=-(b.y-a.y)/length,(b.x-a.x)/length
            at=lambda t:(mid.x+nx*t,mid.y+ny*t)
            self.aligned(at(-width),at(width),2,'COTAS_SECOES')
            if item['sidewalkLeft']>0:self.aligned(at(width),at(width+item['sidewalkLeft']),2,'COTAS_SECOES')
            if item['sidewalkRight']>0:self.aligned(at(-width-item['sidewalkRight']),at(-width),2,'COTAS_SECOES')
    def independent(self,values):
        for value in values:self.aligned(value['start'],value['end'],value['offset'],'COTAS_INDEPENDENTES',value['color'])
